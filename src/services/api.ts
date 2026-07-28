import axios, {AxiosError, AxiosInstance} from 'axios';
import {API_BASE_URL} from '../config/api';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {'Content-Type': 'application/json'},
  // 304 is a normal, expected outcome of a conditional GET (see the ETag
  // cache below) — without this axios treats anything outside 2xx as an
  // error and the response interceptor never sees it.
  validateStatus: status => (status >= 200 && status < 300) || status === 304,
});

// Conditional-GET cache: remembers the last ETag + body per GET endpoint
// (keyed by URL + query params) so repeat polls can send `If-None-Match`.
// When the server replies 304 (nothing changed since that ETag), the
// response has no body — swap in the last body we already have instead of
// returning empty data. This is what actually turns the server's ETag
// support into a bandwidth saving; without a client deliberately doing this,
// generic HTTP clients on React Native don't do it for you.
const etagCache = new Map<string, {etag: string; data: unknown}>();

function conditionalGetKey(config: {method?: string; url?: string; params?: unknown}): string | null {
  if ((config.method ?? 'get').toLowerCase() !== 'get') return null;
  return `${config.url ?? ''}?${JSON.stringify(config.params ?? {})}`;
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called by AuthContext whenever the session token changes (login/restore/logout). */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called once by AuthContext to force a logout when any request comes back 401. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

client.interceptors.request.use(config => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  const key = conditionalGetKey(config);
  const cached = key ? etagCache.get(key) : undefined;
  if (cached) {
    config.headers = config.headers ?? {};
    config.headers['If-None-Match'] = cached.etag;
  }
  return config;
});

client.interceptors.response.use(
  res => {
    const key = conditionalGetKey(res.config);
    if (!key) return res;

    if (res.status === 304) {
      // Nothing changed since our last ETag — reuse the body we already
      // have instead of the empty one a 304 carries.
      const cached = etagCache.get(key);
      if (cached) res.data = cached.data;
      return res;
    }

    const etag = res.headers?.etag ?? res.headers?.ETag;
    if (etag) etagCache.set(key, {etag, data: res.data});
    return res;
  },
  (error: AxiosError<{error?: {message?: string}}>) => {
    const status = error.response?.status;
    const isLoginCall = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLoginCall) {
      onUnauthorized?.();
    }
    const message = error.response?.data?.error?.message ?? error.message ?? 'Network error';
    return Promise.reject(new Error(message));
  },
);

// ── Auth ─────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    client.post('/auth/login', {username, password}).then(r => r.data as {token: string; user: any}),
  me: () => client.get('/auth/me').then(r => r.data.user),
};

// ── Users ────────────────────────────────────────────────────────────────
export const usersApi = {
  lookupByCardCode: (code: string) =>
    client.get(`/users/by-card/${code}`).then(r => r.data.user),
  updateMe: (patch: {carNumber?: string; phone?: string}) =>
    client.patch('/users/me', patch).then(r => r.data.user),
};

// ── Tasks ────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (params?: {doctorId?: string; driverId?: string; status?: string; type?: string}) =>
    client.get('/tasks', {params}).then(r => r.data.tasks),
  get: (id: string) => client.get(`/tasks/${id}`).then(r => r.data.task),
  create: (data: {type: 'park' | 'retrieve'; doctorId: string; carNumber: string; slotId?: string; destinationLat?: number; destinationLng?: number}) =>
    client.post('/tasks', data).then(r => r.data.task),
  requestRetrieval: (data: {eta?: number; destinationLat?: number; destinationLng?: number}) =>
    client.post('/tasks/request-retrieval', data).then(r => r.data.task),
  assignDriver: (id: string, driverId: string) =>
    client.patch(`/tasks/${id}/assign`, {driverId}).then(r => r.data.task),
  keyCollected: (id: string) =>
    client.patch(`/tasks/${id}/key-collected`).then(r => r.data.task),
  inTransit: (id: string) =>
    client.patch(`/tasks/${id}/in-transit`).then(r => r.data.task),
  park: (id: string, slotId: string) =>
    client.patch(`/tasks/${id}/park`, {slotId}).then(r => r.data.task),
  retrieve: (id: string) =>
    client.patch(`/tasks/${id}/retrieve`).then(r => r.data.task),
  updateLocation: (id: string, lat: number, lng: number) =>
    client.patch(`/tasks/${id}/location`, {lat, lng}).then(r => r.data.task),
};

// ── Drivers ──────────────────────────────────────────────────────────────
export const driversApi = {
  list: (params?: {status?: string}) =>
    client.get('/drivers', {params}).then(r => r.data.drivers),
  setStatus: (id: string, status: 'available' | 'busy' | 'off') =>
    client.patch(`/drivers/${id}/status`, {status}).then(r => r.data.driver),
};

// ── Slots ────────────────────────────────────────────────────────────────
export const slotsApi = {
  list: (params?: {status?: string; block?: string}) =>
    client.get('/slots', {params}).then(r => r.data.slots),
  occupancy: () => client.get('/slots/occupancy').then(r => r.data),
};

// ── Visitors ─────────────────────────────────────────────────────────────
export const visitorsApi = {
  list: () => client.get('/visitors').then(r => r.data.visitors),
  create: (data: {name: string; carNumber: string; mobile: string}) =>
    client.post('/visitors', data).then(r => r.data.visitor),
  update: (id: string, patch: Record<string, unknown>) =>
    client.patch(`/visitors/${id}`, patch).then(r => r.data.visitor),
  assignDriver: (id: string, driverId: string) =>
    client.patch(`/visitors/${id}/assign`, {driverId}).then(r => r.data.visitor),
  park: (id: string, slotId: string) =>
    client.patch(`/visitors/${id}/park`, {slotId}).then(r => r.data.visitor),
  assignRetrievalDriver: (id: string, driverId: string) =>
    client.patch(`/visitors/${id}/assign-retrieval`, {driverId}).then(r => r.data.visitor),
  retrieve: (id: string) =>
    client.patch(`/visitors/${id}/retrieve`).then(r => r.data.visitor),
};

// ── Notifications ────────────────────────────────────────────────────────
export const notificationsApi = {
  list: () => client.get('/notifications').then(r => r.data.notifications),
  push: (data: {targetRole: string; targetId?: string; title: string; body: string; type?: string}) =>
    client.post('/notifications', data).then(r => r.data.notification),
  markRead: (id: string) =>
    client.patch(`/notifications/${id}/read`).then(r => r.data.notification),
};

// ── Attendance ───────────────────────────────────────────────────────────
export const attendanceApi = {
  checkIn: (gate?: string) => client.post('/attendance/check-in', {gate}).then(r => r.data.attendance),
  checkOut: () => client.post('/attendance/check-out').then(r => r.data.attendance),
  myHistory: (limit?: number) =>
    client.get('/attendance/me', {params: {limit}}).then(r => r.data.attendance),
};

// ── Admin ────────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard: () => client.get('/admin/dashboard').then(r => r.data),
  listUsers: () => client.get('/admin/users').then(r => r.data.users),
  createUser: (data: {
    employeeId: string; name: string; role: 'doctor' | 'staff' | 'valet' | 'driver' | 'admin';
    password: string; department?: string; cardCode?: string; phone?: string; carNumber?: string;
  }) => client.post('/admin/users', data).then(r => r.data.user),
  updateUser: (id: string, patch: {
    name?: string; role?: 'doctor' | 'staff' | 'valet' | 'driver' | 'admin';
    department?: string; cardCode?: string; phone?: string; carNumber?: string;
  }) => client.patch(`/admin/users/${id}`, patch).then(r => r.data.user),
  resetPassword: (id: string, password: string) =>
    client.patch(`/admin/users/${id}/password`, {password}).then(r => r.data),
  deleteUser: (id: string) => client.delete(`/admin/users/${id}`).then(() => undefined),
  attendanceToday: () => client.get('/admin/attendance/today').then(r => r.data.attendance),
  attendanceMonthly: (month: string) =>
    client.get('/admin/attendance/monthly', {params: {month}}).then(r => r.data as {
      month: string;
      users: {userId: string; name: string; role: string; employeeId: string; days: {date: string; checkIn: string | null; checkOut: string | null; vehiclesHandled: number}[]}[];
    }),
};

// ── App version / updates ───────────────────────────────────────────────
export const appApi = {
  checkVersion: (): Promise<{latestVersionCode: number; latestVersionName: string; apkUrl: string; notes?: string}> =>
    client.get('/app/version').then(r => r.data),
};

export default client;
