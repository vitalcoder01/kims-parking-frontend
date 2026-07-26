import React, {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {Platform, PermissionsAndroid, AppState as RNAppState} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {displayNotification} from '../services/notifications';
import {tasksApi, driversApi, slotsApi, visitorsApi, notificationsApi} from '../services/api';
import {getCurrentPositionSafe} from '../utils/location';
import {useAuth} from './AuthContext';

export type DriverStatus = 'available' | 'busy' | 'off';
export type TaskType = 'park' | 'retrieve';
export type TaskStatus = 'requested' | 'assigned' | 'key_collected' | 'in_transit' | 'completed';
export type SlotStatus = 'free' | 'occupied' | 'reserved';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  status: DriverStatus;
  currentTaskId?: string;
}

export interface ParkingTask {
  id: string;
  type: TaskType;
  doctorId: string;
  doctorName: string;
  carNumber: string;
  slotId?: string;
  driverId?: string;
  driverName?: string;
  status: TaskStatus;
  requestedAt?: number;
  assignedAt?: number;
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
  id: string;
  block: string;
  number: number;
  status: SlotStatus;
  taskId?: string;
  carNumber?: string;
  doctorId?: string;
}

export interface Visitor {
  id: string;
  name: string;
  carNumber: string;
  mobile: string;
  slotId?: string;
  driverName?: string;
  status: 'parked' | 'pending' | 'retrieved';
  token: string;
  createdAt: number;
  trackingProgress?: number;
}

export interface Notification {
  id: string;
  targetRole: string;
  targetId?: string;
  title: string;
  body: string;
  type: 'alarm' | 'info' | 'warning';
  createdAt: number;
  read: boolean;
}

interface AppState {
  drivers: Driver[];
  tasks: ParkingTask[];
  slots: ParkingSlot[];
  visitors: Visitor[];
  notifications: Notification[];

  // Actions — all backed by the API now, so all return Promises.
  addTask: (task: Omit<ParkingTask, 'id'>) => Promise<string>;
  requestRetrieval: (eta: number) => Promise<string>;
  updateTask: (id: string, patch: Partial<ParkingTask>) => Promise<void>;
  assignDriver: (taskId: string, driverId: string) => Promise<void>;
  markKeyCollected: (taskId: string) => Promise<void>;
  markParked: (taskId: string, slotId: string) => Promise<void>;
  markRetrieved: (taskId: string) => Promise<void>;
  reportLocation: (taskId: string, lat: number, lng: number) => Promise<void>;
  setDriverStatus: (driverId: string, status: DriverStatus) => Promise<void>;
  addVisitor: (v: Omit<Visitor, 'id' | 'token' | 'createdAt' | 'status'>) => Promise<Visitor>;
  updateVisitor: (id: string, patch: Partial<Visitor>) => Promise<void>;
  pushNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  clearNotifications: () => void;
}

const Ctx = createContext<AppState>({} as AppState);

const POLL_INTERVAL_MS = 4000;

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
    keyCollectedAt: toEpoch(t.keyCollectedAt),
    completedAt: toEpoch(t.completedAt),
    locationUpdatedAt: toEpoch(t.locationUpdatedAt),
  };
}

function mapVisitor(v: any): Visitor {
  return {...v, createdAt: toEpoch(v.createdAt) ?? Date.now()};
}

function mapNotification(n: any): Notification {
  return {...n, createdAt: toEpoch(n.createdAt) ?? Date.now()};
}

export function AppStateProvider({children}: {children: React.ReactNode}) {
  const {user} = useAuth();
  const [drivers, setDrivers]         = useState<Driver[]>([]);
  const [tasks, setTasks]             = useState<ParkingTask[]>([]);
  const [slots, setSlots]             = useState<ParkingSlot[]>([]);
  const [visitors, setVisitors]       = useState<Visitor[]>([]);
  const [notifications, setNotifs]    = useState<Notification[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only valet/admin screens ever read `drivers`/`visitors` (assign-driver
  // picker, driver status pills, visitor management, admin dashboard) — for
  // every other role (doctor/staff/driver, the majority of connected
  // clients) skip those two queries entirely on every ~4s poll.
  const needsOpsData = user?.role === 'valet' || user?.role === 'admin';

  const fetchAll = useCallback(async () => {
    const [t, s, n, d, v] = await Promise.all([
      tasksApi.list(),
      slotsApi.list(),
      notificationsApi.list(),
      needsOpsData ? driversApi.list() : Promise.resolve(null),
      needsOpsData ? visitorsApi.list() : Promise.resolve(null),
    ]);
    setTasks(t.map(mapTask));
    setSlots(s);
    setNotifs(n.map(mapNotification));
    if (d) setDrivers(d);
    if (v) setVisitors(v.map(mapVisitor));
  }, [needsOpsData]);

  // Fetch on login, poll while logged in, clear everything on logout.
  // Polling fully stops while the app is backgrounded — every logged-in
  // phone otherwise keeps hitting the server every 4s indefinitely (e.g.
  // sitting in someone's pocket for their whole shift), which is pure waste
  // that compounds directly with headcount. One immediate refresh happens
  // when the app returns to the foreground instead of waiting for the next
  // tick, so nothing feels stale after resuming.
  useEffect(() => {
    if (!user) {
      setDrivers([]); setTasks([]); setSlots([]); setVisitors([]); setNotifs([]);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => { fetchAll().catch(() => {}); }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    fetchAll().catch(() => {});
    startPolling();

    const sub = RNAppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        fetchAll().catch(() => {});
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => { stopPolling(); sub.remove(); };
  }, [user, fetchAll]);

  const reportLocation = useCallback(async (taskId: string, lat: number, lng: number) => {
    const updated = mapTask(await tasksApi.updateLocation(taskId, lat, lng));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  // Single, centralized GPS watcher for the whole app — whichever screen is
  // on-screen (driver's task list, driver's Track tab, or nothing at all)
  // reads the same `tasks` state this writes into, so there's exactly one
  // location subscription active at a time instead of one per screen.
  const myDriverId = user?.linkedDriverId ?? user?.id;
  const activeDriverTask = user?.role === 'driver'
    ? tasks.find(t => t.driverId === myDriverId && (t.status === 'key_collected' || t.status === 'in_transit'))
    : undefined;
  const activeDriverTaskId = activeDriverTask?.id;

  useEffect(() => {
    if (!activeDriverTaskId) return;

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
        pos => { if (!cancelled) reportLocation(activeDriverTaskId, pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
        () => {},
        {enableHighAccuracy: true, distanceFilter: 5, interval: 3000, fastestInterval: 2000},
      );
    };

    watch();
    return () => { cancelled = true; Geolocation.stopObserving(); };
  }, [activeDriverTaskId, reportLocation]);

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
    setTasks(p => [...p, mapped]);
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
      type: 'info',
    }).catch(() => {});
    return created.id;
  }, []);

  const updateTask = useCallback(async (id: string, patch: Partial<ParkingTask>) => {
    if (patch.status === 'in_transit') {
      const updated = mapTask(await tasksApi.inTransit(id));
      setTasks(p => p.map(t => (t.id === id ? updated : t)));
      return;
    }
    // No generic PATCH exists server-side — every other transition has its
    // own dedicated endpoint (assign/key-collected/park/retrieve) below.
  }, []);

  const assignDriver = useCallback(async (taskId: string, driverId: string) => {
    const updated = mapTask(await tasksApi.assignDriver(taskId, driverId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: taskId} : d)));
  }, []);

  const markKeyCollected = useCallback(async (taskId: string) => {
    const updated = mapTask(await tasksApi.keyCollected(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const markParked = useCallback(async (taskId: string, slotId: string) => {
    const updated = mapTask(await tasksApi.park(taskId, slotId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    setSlots(p => p.map(s => (s.id === slotId
      ? {...s, status: 'occupied', taskId, carNumber: updated.carNumber, doctorId: updated.doctorId}
      : s)));
    if (updated.driverId) {
      setDrivers(p => p.map(d => (d.id === updated.driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
    }
  }, []);

  const markRetrieved = useCallback(async (taskId: string) => {
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

  const setDriverStatus = useCallback(async (driverId: string, status: DriverStatus) => {
    const updated = await driversApi.setStatus(driverId, status);
    setDrivers(p => p.map(d => (d.id === driverId ? updated : d)));
  }, []);

  const addVisitor = useCallback(async (v: Omit<Visitor, 'id' | 'token' | 'createdAt' | 'status'>) => {
    const created = mapVisitor(await visitorsApi.create({name: v.name, carNumber: v.carNumber, mobile: v.mobile}));
    setVisitors(p => [...p, created]);
    return created;
  }, []);

  const updateVisitor = useCallback(async (id: string, patch: Partial<Visitor>) => {
    const updated = mapVisitor(await visitorsApi.update(id, patch));
    setVisitors(p => p.map(v => (v.id === id ? updated : v)));
  }, []);

  const pushNotification = useCallback(async (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
    const created = mapNotification(
      await notificationsApi.push({targetRole: n.targetRole, targetId: n.targetId, title: n.title, body: n.body, type: n.type}),
    );
    setNotifs(p => [created, ...p]);
    // Also fire an OS-level notification so it appears in the system tray
    // even when the app is in the background.
    displayNotification(n.title, n.body, n.type);
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    const updated = mapNotification(await notificationsApi.markRead(id));
    setNotifs(p => p.map(n => (n.id === id ? updated : n)));
  }, []);

  const clearNotifications = useCallback(() => setNotifs([]), []);

  return (
    <Ctx.Provider value={{
      drivers, tasks, slots, visitors, notifications,
      addTask, requestRetrieval, updateTask, assignDriver, markKeyCollected, markParked, markRetrieved, reportLocation,
      setDriverStatus, addVisitor, updateVisitor,
      pushNotification, markNotificationRead, clearNotifications,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppState() { return useContext(Ctx); }
