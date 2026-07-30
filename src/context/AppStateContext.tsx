import React, {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {Platform, PermissionsAndroid} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {displayNotification, ringAssignmentAlarm, stopAssignmentAlarm} from '../services/notifications';
import {tasksApi, driversApi, slotsApi, visitorsApi, notificationsApi, arrivalsApi, getAuthToken} from '../services/api';
import {connectSocket, disconnectSocket, emitDriverLocation} from '../services/socket';
import {initPushMessaging} from '../services/pushMessaging';
import {getCurrentPositionSafe} from '../utils/location';
import {useAuth} from './AuthContext';

export type DriverStatus = 'available' | 'busy' | 'off';
export type TaskType = 'park' | 'retrieve';
export type TaskStatus = 'requested' | 'assigned' | 'key_collected' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
export type SlotStatus = 'free' | 'occupied' | 'reserved';

export interface Driver {
  id: number;
  name: string;
  phone: string;
  status: DriverStatus;
  currentTaskId?: number;
  // Jobs completed today — used to suggest the least-busy available driver
  // in the valet's assign picker (every job fully occupies a driver, so
  // this is a more useful fairness signal than "active count", which is
  // always 0 for anyone actually available to pick).
  completedToday?: number;
}

export interface ParkingTask {
  id: number;
  type: TaskType;
  doctorId: number;
  doctorName: string;
  carNumber: string;
  slotId?: string; // ParkingSlot's id stays a human-readable code, e.g. "A-001"
  driverId?: number;
  driverName?: string;
  status: TaskStatus;
  requestedAt?: number;
  assignedAt?: number;
  acceptedAt?: number; // driver's explicit accept — see accept watchdog flow
  keyCollectedAt?: number;
  completedAt?: number;
  eta?: number; // minutes
  trackingProgress?: number; // 0-1
  driverLat?: number;
  driverLng?: number;
  locationUpdatedAt?: number;
  driverStartLat?: number;
  driverStartLng?: number;
  destinationLat?: number;
  destinationLng?: number;
}

export interface ParkingSlot {
  id: string; // human-readable code, e.g. "A-001" — not a surrogate key
  block: string;
  number: number;
  status: SlotStatus;
  taskId?: number;
  carNumber?: string;
  doctorId?: number;
}

export interface Visitor {
  id: number;
  name: string;
  carNumber?: string; // optional — plate may not be available at intake
  mobile: string;
  vehicleType: 'car' | 'bike';
  slotId?: string; // ParkingSlot's id stays a human-readable code
  driverId?: number;
  driverName?: string;
  status: 'parked' | 'pending' | 'delivered' | 'retrieved' | 'cancelled';
  retrievalRequested: boolean;
  // Assignment/accept handshake — see backend visitor.service.js. Both
  // clear again if the driver rejects or the 60s accept timeout fires.
  driverAssignedAt?: number;
  acceptedAt?: number;
  // Set once the driver confirms they've collected the vehicle from the
  // valet counter — distinguishes "assigned, not yet in hand" from
  // "driving it to park" while status is still 'pending' either way.
  pickedUpAt?: number;
  cancelledAt?: number;
  cancelReason?: 'no_show' | 'valet_cancelled' | 'parking_failed';
  token: string;
  // Opaque, unguessable — this is what the public WhatsApp tracking link
  // uses (/track/<publicToken>), never the numeric `id` (sequential ids
  // would make every other patient's tracking page enumerable).
  publicToken: string;
  createdAt: number;
  trackingProgress?: number;
}

// Doctor/staff "I'm on my way" notice — valet-facing only (see
// arrivalNotice.service.js on the backend for why this isn't a ParkingTask).
export interface ArrivalNotice {
  id: number;
  doctorId: number;
  doctorName: string;
  eta: number;
  createdAt: number;
}

export interface Notification {
  id: number;
  targetRole: string;
  targetId?: number;
  title: string;
  body: string;
  type: 'alarm' | 'info' | 'warning';
  createdAt: number;
  read: boolean;
}

// Live GPS positions streamed over the socket — keyed by driverId. A driver
// whose app is killed disconnects and is removed (presence), so the map
// never shows stale phantom markers.
export interface DriverLocation {
  driverId: number;
  name: string;
  lat: number;
  lng: number;
  at: number;
}

// Socket-driven "driver didn't accept in time / rejected" prompt for the
// valet — consumed by ValetHomeScreen to jump straight into reassignment.
export interface ReassignPrompt {
  kind: 'task' | 'visitor';
  task?: ParkingTask;
  visitor?: Visitor;
  driverName: string;
  rejected?: boolean;
}

interface AppState {
  drivers: Driver[];
  tasks: ParkingTask[];
  slots: ParkingSlot[];
  visitors: Visitor[];
  arrivalNotices: ArrivalNotice[];
  notifications: Notification[];
  driverLocations: Record<number, DriverLocation>;
  onlineDriverIds: number[];
  reassignPrompt: ReassignPrompt | null;
  clearReassignPrompt: () => void;

  // Actions — all backed by the API now, so all return Promises.
  addTask: (task: Omit<ParkingTask, 'id'>) => Promise<number>;
  requestRetrieval: (eta: number) => Promise<number>;
  // Doctor/staff: "I'm on my way" — before any car/key exists yet, so this
  // has no task id to hand back, just fires the valet-facing notice + push.
  sendArrivalNotice: (eta: number) => Promise<void>;
  // Valet: manually clear a no-show/mistaken arrival notice.
  dismissArrivalNotice: (id: number) => Promise<void>;
  updateTask: (id: number, patch: Partial<ParkingTask>) => Promise<void>;
  assignDriver: (taskId: number, driverId: number) => Promise<void>;
  acceptTask: (taskId: number) => Promise<void>;
  rejectTask: (taskId: number) => Promise<void>;
  markKeyCollected: (taskId: number) => Promise<void>;
  markParked: (taskId: number, slotId: string) => Promise<void>;
  markRetrieved: (taskId: number) => Promise<void>;
  confirmTaskDelivered: (taskId: number) => Promise<void>;
  cancelTask: (taskId: number) => Promise<void>;
  fetchTaskHistory: (params?: {doctorId?: number; driverId?: number}) => Promise<ParkingTask[]>;
  reportLocation: (taskId: number, lat: number, lng: number) => Promise<void>;
  setDriverStatus: (driverId: number, status: DriverStatus) => Promise<void>;
  addVisitor: (v: {name: string; carNumber?: string; mobile: string; vehicleType?: 'car' | 'bike'}) => Promise<Visitor>;
  assignVisitorDriver: (visitorId: number, driverId: number) => Promise<void>;
  acceptVisitorTask: (visitorId: number) => Promise<void>;
  rejectVisitorTask: (visitorId: number) => Promise<void>;
  cancelVisitor: (visitorId: number, reason: 'no_show' | 'valet_cancelled' | 'parking_failed') => Promise<void>;
  markVisitorPickedUp: (visitorId: number) => Promise<void>;
  markVisitorParked: (visitorId: number) => Promise<void>;
  assignRetrievalDriver: (visitorId: number, driverId: number) => Promise<void>;
  markVisitorRetrieved: (visitorId: number) => Promise<void>;
  confirmVisitorDelivered: (visitorId: number) => Promise<void>;
  pushNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  clearNotifications: () => void;
}

const Ctx = createContext<AppState>({} as AppState);

// A driver's marker goes stale if no GPS ping for this long (phone offline
// but socket not yet timed out) — the map drops it rather than lying.
const LOCATION_STALE_MS = 60 * 1000;

// ── wire-format -> app-shape mappers ────────────────────────────────────
// The backend already mirrors these field names closely (see serialize.js),
// but timestamps come back as ISO strings — normalize to epoch ms.
function toEpoch(v: unknown): number | undefined {
  if (!v) return undefined;
  const t = new Date(v as string).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function mapTask(t: any): ParkingTask {
  return {
    ...t,
    requestedAt: toEpoch(t.requestedAt),
    assignedAt: toEpoch(t.assignedAt),
    acceptedAt: toEpoch(t.acceptedAt),
    keyCollectedAt: toEpoch(t.keyCollectedAt),
    completedAt: toEpoch(t.completedAt),
    locationUpdatedAt: toEpoch(t.locationUpdatedAt),
  };
}

function mapVisitor(v: any): Visitor {
  return {
    ...v,
    driverAssignedAt: toEpoch(v.driverAssignedAt),
    acceptedAt: toEpoch(v.acceptedAt),
    pickedUpAt: toEpoch(v.pickedUpAt),
    cancelledAt: toEpoch(v.cancelledAt),
    createdAt: toEpoch(v.createdAt) ?? Date.now(),
  };
}

// Socket delta helpers — replace the one changed record in place (upsert),
// never triggering a refetch.
function upsertById<T extends {id: any}>(list: T[], item: T): T[] {
  return list.some(x => x.id === item.id)
    ? list.map(x => (x.id === item.id ? item : x))
    : [item, ...list];
}

function mapNotification(n: any): Notification {
  return {...n, createdAt: toEpoch(n.createdAt) ?? Date.now()};
}

function mapArrival(a: any): ArrivalNotice {
  return {...a, createdAt: toEpoch(a.createdAt) ?? Date.now()};
}

export function AppStateProvider({children}: {children: React.ReactNode}) {
  const {user} = useAuth();
  const [drivers, setDrivers]         = useState<Driver[]>([]);
  const [tasks, setTasks]             = useState<ParkingTask[]>([]);
  const [slots, setSlots]             = useState<ParkingSlot[]>([]);
  const [visitors, setVisitors]       = useState<Visitor[]>([]);
  const [arrivalNotices, setArrivals] = useState<ArrivalNotice[]>([]);
  const [notifications, setNotifs]    = useState<Notification[]>([]);
  const [driverLocations, setDriverLocations] = useState<Record<number, DriverLocation>>({});
  const [onlineDriverIds, setOnlineDriverIds] = useState<number[]>([]);
  const [reassignPrompt, setReassignPrompt]   = useState<ReassignPrompt | null>(null);

  // Only valet/admin screens ever read the full `drivers` roster
  // (assign-driver picker, driver status pills, admin dashboard) — for
  // every other role skip that query entirely on every ~4s poll.
  const needsOpsData = user?.role === 'valet' || user?.role === 'admin';
  // `visitors` is also needed by drivers themselves — DriverJobsScreen's
  // "Visitor Pickups" section filters this list down to the ones assigned
  // to them (v.driverId === myDriverId). Without this, a driver's own app
  // never even fetches visitor data, so an assignment never shows up there
  // no matter how correctly the backend/valet side wired it up.
  const needsVisitors = needsOpsData || user?.role === 'driver';

  const fetchAll = useCallback(async () => {
    const [t, s, n, d, v, a] = await Promise.all([
      tasksApi.list(),
      slotsApi.list(),
      notificationsApi.list(),
      needsOpsData ? driversApi.list() : Promise.resolve(null),
      needsVisitors ? visitorsApi.list() : Promise.resolve(null),
      // Only the valet/admin queue needs the "expected arrivals" list.
      needsOpsData ? arrivalsApi.list() : Promise.resolve(null),
    ]);
    setTasks(t.map(mapTask));
    setSlots(s);
    setNotifs(n.map(mapNotification));
    if (d) setDrivers(d);
    if (v) setVisitors(v.map(mapVisitor));
    if (a) setArrivals(a.map(mapArrival));
  }, [needsOpsData, needsVisitors]);

  // Some socket handlers need the current user without re-subscribing the
  // whole socket on every profile change.
  const userRef = useRef(user);
  userRef.current = user;

  const clearReassignPrompt = useCallback(() => setReassignPrompt(null), []);

  // ── True-WebSocket sync ─────────────────────────────────────────────────
  // One socket per session. Full fetch happens exactly twice per connection
  // lifecycle: on login and on reconnect (to fill whatever was missed while
  // offline). Every change after that arrives as a delta event carrying the
  // changed data itself, and only that record is patched — never a refetch
  // because an emit came in.
  useEffect(() => {
    if (!user) {
      setDrivers([]); setTasks([]); setSlots([]); setVisitors([]); setNotifs([]); setArrivals([]);
      setDriverLocations({}); setOnlineDriverIds([]); setReassignPrompt(null);
      disconnectSocket();
      return;
    }

    const token = getAuthToken();
    if (!token) return;
    const socket = connectSocket(token);

    socket.on('connect', () => { fetchAll().catch(() => {}); });

    socket.on('task:upsert', (raw: any) => {
      const task = mapTask(raw);
      setTasks(p => upsertById(p, task));
      // My assignment just resolved (accepted elsewhere / reassigned /
      // moved on) — stop a still-ringing alarm.
      const me = userRef.current;
      const myDrvId = me?.linkedDriverId ?? me?.id;
      if (me?.role === 'driver' && task.driverId !== myDrvId) {
        // it may have been mine a moment ago — harmless if not ringing
        stopAssignmentAlarm().catch(() => {});
      }
    });

    socket.on('visitor:upsert', (raw: any) => {
      setVisitors(p => upsertById(p, mapVisitor(raw)));
    });

    socket.on('slot:patch', (slot: ParkingSlot) => {
      setSlots(p => upsertById(p, slot));
    });

    // Partial driver delta — merge onto what we have (full roster only
    // exists on valet/admin clients; others just ignore unknown ids).
    socket.on('driver:patch', (patch: Partial<Driver> & {id: number}) => {
      setDrivers(p => p.map(d => (d.id === patch.id ? {...d, ...patch} : d)));
    });

    socket.on('notification:new', (raw: any) => {
      const n = mapNotification(raw);
      setNotifs(p => (p.some(x => x.id === n.id) ? p : [n, ...p]));
      const me = userRef.current;
      const isForMe =
        n.targetId === me?.id ||
        (me?.linkedDriverId != null && n.targetId === me.linkedDriverId) ||
        n.targetRole === me?.role ||
        n.targetRole === `driver:${me?.linkedDriverId}` ||
        n.targetRole === 'all';
      if (!isForMe) return;
      // Alarm-grade notifications (driver assignment, valet reassign
      // warning) ring loud: native alarm-channel notification + vibration
      // loop. Everything else is a normal tray notification.
      if (n.type === 'alarm') {
        ringAssignmentAlarm(n.title, n.body).catch(() => {});
      } else {
        displayNotification(n.title, n.body, n.type);
      }
    });

    // ── live map feeds ──
    socket.on('presence:snapshot', ({driverIds}: {driverIds: number[]}) => {
      setOnlineDriverIds(driverIds);
      // Drop positions of drivers that are no longer connected.
      setDriverLocations(p => Object.fromEntries(Object.entries(p).filter(([id]) => driverIds.some(d => String(d) === id))));
    });

    socket.on('presence:driver', ({driverId, online}: {driverId: number; online: boolean}) => {
      setOnlineDriverIds(p => (online ? [...p.filter(id => id !== driverId), driverId] : p.filter(id => id !== driverId)));
      if (!online) {
        setDriverLocations(p => {
          const next = {...p};
          delete next[driverId];
          return next;
        });
      }
    });

    socket.on('driver:location', (loc: DriverLocation) => {
      setDriverLocations(p => ({...p, [loc.driverId]: loc}));
    });

    socket.on('arrival:upsert', (raw: any) => {
      setArrivals(p => upsertById(p, mapArrival(raw)));
    });
    socket.on('arrival:remove', ({id}: {id: number}) => {
      setArrivals(p => p.filter(a => a.id !== id));
    });

    // ── accept-timeout / reject prompts (valet + admin rooms only) ──
    socket.on('task:needs-reassign', ({task, driverName, rejected}: any) => {
      setReassignPrompt({kind: 'task', task: mapTask(task), driverName, rejected});
    });
    socket.on('visitor:needs-reassign', ({visitor, driverName, rejected}: any) => {
      setReassignPrompt({kind: 'visitor', visitor: mapVisitor(visitor), driverName, rejected});
    });

    // FCM device registration + foreground push handling (no-op until
    // google-services.json is in place — sockets already cover foreground).
    // Guarded by `pushCancelled`: if the user logs out (or Quick-Login swaps
    // accounts) while this promise is still resolving, the effect cleanup
    // below can run before `cleanupPush` is ever assigned — without this
    // flag the FCM onTokenRefresh/onMessage listeners it sets up would stay
    // registered against a session that's already gone, later firing an
    // authenticated call with no token attached.
    let pushCancelled = false;
    let cleanupPush: (() => void) | undefined;
    initPushMessaging().then(fn => {
      if (pushCancelled) { fn(); return; }
      cleanupPush = fn;
    }).catch(() => {});

    return () => {
      pushCancelled = true;
      cleanupPush?.();
      disconnectSocket();
    };
  }, [user?.id, fetchAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sweep stale GPS markers (socket still open but no pings — e.g. GPS off).
  useEffect(() => {
    const sweep = setInterval(() => {
      setDriverLocations(p => {
        const cutoff = Date.now() - LOCATION_STALE_MS;
        const entries = Object.entries(p).filter(([, loc]) => loc.at >= cutoff);
        return entries.length === Object.keys(p).length ? p : Object.fromEntries(entries);
      });
    }, 15000);
    return () => clearInterval(sweep);
  }, []);

  const reportLocation = useCallback(async (taskId: number, lat: number, lng: number) => {
    const updated = mapTask(await tasksApi.updateLocation(taskId, lat, lng));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  // Single, centralized GPS watcher for the whole app. For drivers it runs
  // for the entire logged-in session (not just during a task): every fix is
  // pushed over the socket so the valet's live map shows ALL reachable
  // drivers; during an active trip the same fix additionally goes through
  // the REST location endpoint, which persists it on the task and emits the
  // task:upsert delta that live-tracking screens render.
  const myDriverId = user?.linkedDriverId ?? user?.id;
  const activeDriverTask = user?.role === 'driver'
    ? tasks.find(t => t.driverId === myDriverId && (t.status === 'key_collected' || t.status === 'in_transit'))
    : undefined;
  const activeDriverTaskId = activeDriverTask?.id;
  const activeDriverTaskIdRef = useRef(activeDriverTaskId);
  activeDriverTaskIdRef.current = activeDriverTaskId;

  useEffect(() => {
    if (user?.role !== 'driver') return;

    let cancelled = false;
    const watch = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {title: 'Location Permission', message: 'KIMS Parking needs your location for live tracking.', buttonPositive: 'Allow'},
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED || cancelled) return;
      }
      Geolocation.watchPosition(
        pos => {
          if (cancelled) return;
          const {latitude, longitude} = pos.coords;
          emitDriverLocation(latitude, longitude);
          const taskId = activeDriverTaskIdRef.current;
          if (taskId) reportLocation(taskId, latitude, longitude).catch(() => {});
        },
        () => {},
        {enableHighAccuracy: true, distanceFilter: 5, interval: 3000, fastestInterval: 2000},
      );
    };

    watch();
    return () => { cancelled = true; Geolocation.stopObserving(); };
  }, [user?.role, user?.id, reportLocation]);

  const addTask = useCallback(async (task: Omit<ParkingTask, 'id'>) => {
    const created = await tasksApi.create({
      type: task.type,
      doctorId: task.doctorId,
      carNumber: task.carNumber,
      slotId: task.slotId,
      destinationLat: task.destinationLat,
      destinationLng: task.destinationLng,
    });
    const mapped = mapTask(created);
    // The backend returns the existing task instead of a duplicate on a
    // repeat call — dedupe locally too rather than trusting this call site
    // never races another.
    setTasks(p => (p.some(t => t.id === mapped.id) ? p : [...p, mapped]));
    return mapped.id;
  }, []);

  // Doctor/staff only — the real destination is wherever THIS phone is right
  // now, i.e. the person's own location, since that's who the driver is
  // actually bringing the car back to (not the valet counter).
  const requestRetrieval = useCallback(async (eta: number) => {
    const here = await getCurrentPositionSafe();
    const created = mapTask(await tasksApi.requestRetrieval({eta, destinationLat: here?.lat, destinationLng: here?.lng}));
    setTasks(p => [created, ...p]);
    await pushNotification({
      targetRole: 'valet',
      title: `🚗 Retrieval Requested — ${created.doctorName ?? ''}`,
      body: `Leaving in ${eta} min. Please assign a driver to bring ${created.carNumber} from ${created.slotId ?? 'its slot'}.`,
      type: 'alarm',
    }).catch(() => {});
    return created.id;
  }, []);

  // Doctor/staff: "I'm on my way" — no car/key involved yet, just a
  // heads-up ETA for the valet queue. The backend auto-clears this the
  // moment a real park task is created for the same doctor.
  const sendArrivalNotice = useCallback(async (eta: number) => {
    const created = mapArrival(await arrivalsApi.create(eta));
    await pushNotification({
      targetRole: 'valet',
      title: `🚶 ${created.doctorName ?? 'Someone'} is on the way`,
      body: `Arriving in ${eta} min. Have a driver ready at the entrance.`,
      type: 'alarm',
    }).catch(() => {});
  }, []);

  // Valet: dismiss a stale/no-show/mistaken arrival notice by hand.
  const dismissArrivalNotice = useCallback(async (id: number) => {
    await arrivalsApi.dismiss(id);
    setArrivals(p => p.filter(a => a.id !== id));
  }, []);

  const updateTask = useCallback(async (id: number, patch: Partial<ParkingTask>) => {
    if (patch.status === 'in_transit') {
      const updated = mapTask(await tasksApi.inTransit(id));
      setTasks(p => p.map(t => (t.id === id ? updated : t)));
      return;
    }
    // No generic PATCH exists server-side — every other transition has its
    // own dedicated endpoint (assign/key-collected/park/retrieve) below.
  }, []);

  const assignDriver = useCallback(async (taskId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.assignDriver(taskId, driverId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: taskId} : d)));
  }, []);

  // Driver: explicit accept/decline of an assignment (stops the ringing
  // alarm either way; a decline immediately frees this driver and prompts
  // the valet to reassign via the socket needs-reassign event).
  const acceptTask = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.accept(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const rejectTask = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.reject(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    if (myDriverId) setDrivers(p => p.map(d => (d.id === myDriverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [myDriverId]);

  const markKeyCollected = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.keyCollected(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const markParked = useCallback(async (taskId: number, slotId: string) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.park(taskId, slotId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    setSlots(p => p.map(s => (s.id === slotId
      ? {...s, status: 'occupied', taskId, carNumber: updated.carNumber, doctorId: updated.doctorId}
      : s)));
    if (updated.driverId) {
      setDrivers(p => p.map(d => (d.id === updated.driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
    }
  }, []);

  const markRetrieved = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const existing = tasks.find(t => t.id === taskId);
    const updated = mapTask(await tasksApi.retrieve(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    const freedSlotId = existing?.slotId ?? updated.slotId;
    if (freedSlotId) {
      setSlots(p => p.map(s => (s.id === freedSlotId
        ? {...s, status: 'free', taskId: undefined, carNumber: undefined, doctorId: undefined}
        : s)));
    }
    if (updated.driverId) {
      setDrivers(p => p.map(d => (d.id === updated.driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
    }
  }, [tasks]);

  // Valet: confirms the doctor/staff member actually took the car —
  // finally closes out a retrieval that's been sitting at the counter.
  const confirmTaskDelivered = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.confirmDelivered(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  // Staff/admin: retire a stuck task (never got a driver, or genuinely
  // abandoned) instead of it silently blocking every later session for that
  // doctor's Vehicle Status card forever.
  const cancelTask = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.cancel(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  // On-demand only — a full past-sessions log (one doctor's, one driver's,
  // or every staff record if both are omitted), not part of the constantly-
  // polled/socket-fed live `tasks` array (that stays bounded to "at most one
  // row per doctor" by design; history can be years of rows).
  const fetchTaskHistory = useCallback(async (params?: {doctorId?: number; driverId?: number}) => {
    const rows = await tasksApi.history(params);
    return rows.map(mapTask);
  }, []);

  const setDriverStatus = useCallback(async (driverId: number, status: DriverStatus) => {
    const updated = await driversApi.setStatus(driverId, status);
    setDrivers(p => p.map(d => (d.id === driverId ? updated : d)));
  }, []);

  const addVisitor = useCallback(async (v: {name: string; carNumber?: string; mobile: string; vehicleType?: 'car' | 'bike'}) => {
    const created = mapVisitor(await visitorsApi.create(v));
    setVisitors(p => [...p, created]);
    return created;
  }, []);

  const assignVisitorDriver = useCallback(async (visitorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.assignDriver(visitorId, driverId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: visitorId} : d)));
  }, []);

  const acceptVisitorTask = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.acceptTask(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  const rejectVisitorTask = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const existing = visitors.find(v => v.id === visitorId);
    const updated = mapVisitor(await visitorsApi.rejectTask(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    const driverId = existing?.driverId;
    if (driverId) setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [visitors]);

  const cancelVisitor = useCallback(async (visitorId: number, reason: 'no_show' | 'valet_cancelled' | 'parking_failed') => {
    const existing = visitors.find(v => v.id === visitorId);
    const updated = mapVisitor(await visitorsApi.cancel(visitorId, reason));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    const driverId = existing?.driverId;
    if (driverId) setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [visitors]);

  const markVisitorPickedUp = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.pickUp(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  // No slotId param — the backend auto-assigns the next free slot and
  // returns it on `updated.slotId`.
  const markVisitorParked = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const existing = visitors.find(v => v.id === visitorId);
    const updated = mapVisitor(await visitorsApi.park(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    if (updated.slotId) {
      setSlots(p => p.map(s => (s.id === updated.slotId ? {...s, status: 'occupied', carNumber: updated.carNumber} : s)));
    }
    const driverId = updated.driverId ?? existing?.driverId;
    if (driverId) setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [visitors]);

  const assignRetrievalDriver = useCallback(async (visitorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.assignRetrievalDriver(visitorId, driverId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: visitorId} : d)));
  }, []);

  const markVisitorRetrieved = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const existing = visitors.find(v => v.id === visitorId);
    const updated = mapVisitor(await visitorsApi.retrieve(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    const freedSlotId = existing?.slotId;
    if (freedSlotId) setSlots(p => p.map(s => (s.id === freedSlotId ? {...s, status: 'free', taskId: undefined, carNumber: undefined, doctorId: undefined} : s)));
    const driverId = existing?.driverId;
    if (driverId) setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [visitors]);

  // Valet: confirms the visitor actually took the car — mirrors
  // confirmTaskDelivered above for the staff/doctor flow.
  const confirmVisitorDelivered = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.confirmDelivered(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  const pushNotification = useCallback(async (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
    const created = mapNotification(
      await notificationsApi.push({targetRole: n.targetRole, targetId: n.targetId, title: n.title, body: n.body, type: n.type}),
    );
    // The socket delivers this same notification to every targeted client —
    // including this device when it's a recipient, where the notification:new
    // handler shows/rings it. Only pre-seed local state (deduped by id
    // there), never display here, or recipients-who-sent would get doubles.
    setNotifs(p => (p.some(x => x.id === created.id) ? p : [created, ...p]));
  }, []);

  const markNotificationRead = useCallback(async (id: number) => {
    const updated = mapNotification(await notificationsApi.markRead(id));
    setNotifs(p => p.map(n => (n.id === id ? updated : n)));
  }, []);

  const clearNotifications = useCallback(() => setNotifs([]), []);

  return (
    <Ctx.Provider value={{
      drivers, tasks, slots, visitors, arrivalNotices, notifications,
      driverLocations, onlineDriverIds, reassignPrompt, clearReassignPrompt,
      addTask, requestRetrieval, sendArrivalNotice, dismissArrivalNotice, updateTask, assignDriver, acceptTask, rejectTask, markKeyCollected, markParked, markRetrieved, confirmTaskDelivered, cancelTask, fetchTaskHistory, reportLocation,
      setDriverStatus, addVisitor,
      assignVisitorDriver, acceptVisitorTask, rejectVisitorTask, cancelVisitor,
      markVisitorPickedUp, markVisitorParked, assignRetrievalDriver, markVisitorRetrieved, confirmVisitorDelivered,
      pushNotification, markNotificationRead, clearNotifications,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppState() { return useContext(Ctx); }
