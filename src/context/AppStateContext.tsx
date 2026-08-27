import React, {createContext, useContext, useState, useCallback, useMemo, useEffect, useRef} from 'react';
import {Platform, PermissionsAndroid, AppState as RNAppState} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {displayNotification, ringAssignmentAlarm, stopAssignmentAlarm} from '../services/notifications';
import {tasksApi, driversApi, slotsApi, visitorsApi, notificationsApi, arrivalsApi, getAuthToken} from '../services/api';
import {connectSocket, disconnectSocket, emitDriverLocation} from '../services/socket';
import {initPushMessaging} from '../services/pushMessaging';
import {markSynced, markSyncFailed} from '../services/syncClock';
import {getCurrentPositionSafe} from '../utils/location';
import {useAuth} from './AuthContext';

export type DriverStatus = 'available' | 'busy' | 'off';
export type TaskType = 'park' | 'retrieve';
export type TaskStatus = 'requested' | 'accepted' | 'assigned' | 'key_collected' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
export type SlotStatus = 'free' | 'occupied' | 'reserved';

export interface Driver {
  id: number;
  name: string;
  phone: string;
  status: DriverStatus;
  currentTaskId?: number;
  // Fairness signal for the assign picker — every job fully occupies a
  // driver, so "active count" is always 0 for anyone pickable.
  completedToday?: number;
}

export interface ParkingTask {
  id: number;
  type: TaskType;
  doctorId: number;
  doctorName: string;
  // Set instead of doctorId for a visitor/patient check-in rather than a
  // staff/doctor session — see serializeTask.
  visitorId?: number;
  isVisitor?: boolean;
  doctorDepartment?: string;
  doctorEmployeeId?: string;
  carNumber: string;
  slotId?: string; // human-readable code, e.g. "A-001"
  driverId?: number;
  driverName?: string;
  status: TaskStatus;
  requestedAt?: number;
  assignedAt?: number;
  acceptedAt?: number; // driver's explicit accept — see accept watchdog flow
  // The trip clock anchors here; the doctor's deadline anchors to
  // requestedAt. See utils/retrievalClocks.
  startedAt?: number;
  // Only this valet is alarmed when the job needs attention, instead of
  // everyone on shift (jobAlerts.js).
  valetId?: number;
  valetName?: string;
  escalatedAt?: number; // stalled past its owner, escalated to the whole team

  // ── Parking session ownership ──────────────────────────────────────
  // The valet who accepted the arrival. Written once, never overwritten —
  // history, not routing, so it survives someone else recovering the
  // departure.
  arrivalOwnerValetId?: number;
  arrivalOwnerValetName?: string;
  arrivalAcceptedAt?: number;
  // Whoever is actually running the departure leg — same person as the
  // arrival owner in the normal case.
  retrievalOwnerValetId?: number;
  retrievalOwnerValetName?: string;
  retrievalAcceptedAt?: number;
  retrievalOwnershipSource?: 'OWNER' | 'RECOVERY';
  ownerNotifiedAt?: number;
  // The owner's response window lapsed and the request released to
  // everyone — drives the "Original owner unavailable" card.
  recoveryBroadcastAt?: number;
  // Valet aborted a park job after the key was already handed over — driver
  // brings the car back instead of parking it.
  recalledAt?: number;
  keyCollectedAt?: number;
  completedAt?: number;
  plannedDepartureMinutes?: number; // 0 = now; valet-side planning only, never shown to the doctor as an ETA
  // Absolute departure time; (departure minus lead time) is when the
  // automatic alert fires — the valet can still act sooner from the inbox.
  plannedDepartureAt?: number;
  retrievalReadyAt?: number;
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
  carNumber?: string; // plate may not be available at intake
  mobile: string;
  vehicleType: 'car' | 'bike';
  slotId?: string;
  driverId?: number;
  driverName?: string;
  status: 'parked' | 'pending' | 'delivered' | 'retrieved' | 'cancelled';
  retrievalRequested: boolean;
  valetId?: number;
  escalatedAt?: number;
  // Assignment/accept handshake (backend visitor.service.js) — both clear
  // again on driver reject or the 60s accept timeout.
  driverAssignedAt?: number;
  acceptedAt?: number;
  // Driver confirmed they've collected the vehicle — distinguishes
  // "assigned, not yet in hand" from "driving it to park" while status is
  // still 'pending' either way.
  pickedUpAt?: number;
  cancelledAt?: number;
  cancelReason?: 'no_show' | 'valet_cancelled' | 'parking_failed';
  token: string;
  // Opaque, unguessable — the public WhatsApp tracking link uses this, not
  // the sequential `id` (which would enumerate every other patient).
  publicToken: string;
  createdAt: number;
  trackingProgress?: number;
}

// Doctor/staff "I'm on my way" notice — valet-facing only. See
// arrivalNotice.service.js for why this isn't a ParkingTask.
export interface ArrivalNotice {
  id: number;
  doctorId: number;
  doctorName: string;
  // Only present if the doctor has a saved plate — lets the valet skip
  // straight to driver assignment from this card.
  doctorCarNumber?: string;
  // "No plate on file" fallback (ValetHomeScreen.handleArrivalArrived) skips
  // the code lookup that would normally supply these.
  doctorDepartment?: string;
  doctorEmployeeId?: string;
  doctorCardCode?: string; // 3-digit code the valet searches the arrivals list by
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

// Live GPS positions streamed over the socket, keyed by driverId. A killed
// app disconnects (presence) and is removed, so the map has no phantoms.
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
  // Null when no driver was ever involved — different prompt from "your
  // driver dropped it".
  driverName: string | null;
  rejected?: boolean;
  // 'escalation' (jobAlerts.js): Later defers, one more prompt after another
  // grace window. 'reminder' (driverReminder.js, 60s loop): Later silences
  // permanently. Same dialog, different backend call on the same button.
  source?: 'escalation' | 'reminder';
}

interface AppState {
  drivers: Driver[];
  tasks: ParkingTask[];
  slots: ParkingSlot[];
  visitors: Visitor[];
  arrivalNotices: ArrivalNotice[];
  notifications: Notification[];
  // False until the first full fetch resolves — distinguishes "still
  // loading" from "loaded and genuinely empty". Without it, an action
  // offered during an empty startup render (the doctor's Arrival card)
  // could fire against data that hadn't arrived yet.
  hydrated: boolean;
  reassignPrompt: ReassignPrompt | null;
  clearReassignPrompt: () => void;

  addTask: (task: Omit<ParkingTask, 'id'>) => Promise<number>;
  requestRetrieval: (plannedDepartureMinutes: number) => Promise<number>; // 0 | 10 | 20 | 30 | 40 — not an ETA
  cancelMyRetrieval: (taskId: number) => Promise<void>;
  sendArrivalNotice: (eta: number) => Promise<void>; // doctor/staff "I'm on my way" — no task exists yet
  acceptRetrieval: (taskId: number) => Promise<void>;
  dismissArrivalNotice: (id: number) => Promise<void>; // valet: clear a no-show/mistaken notice
  updateTask: (id: number, patch: Partial<ParkingTask>) => Promise<void>;
  assignDriver: (taskId: number, driverId: number) => Promise<void>;
  cancelTaskAssignment: (taskId: number) => Promise<void>; // give up on a driver who hasn't accepted yet; job stays open
  acceptTask: (taskId: number) => Promise<void>;
  rejectTask: (taskId: number) => Promise<void>;
  markKeyCollected: (taskId: number) => Promise<void>;
  markParked: (taskId: number, slotId: string) => Promise<void>;
  markRetrieved: (taskId: number) => Promise<void>;
  confirmTaskDelivered: (taskId: number) => Promise<void>;
  cancelTask: (taskId: number) => Promise<void>;
  closeParkedSession: (taskId: number) => Promise<void>; // valet: car left without a retrieval — frees the slot
  myArrivalNotice: ArrivalNotice | null;                 // doctor/staff: their own open heads-up, if any
  refreshMyArrival: () => Promise<void>;
  cancelMyArrival: (id: number) => Promise<void>;
  recallTask: (taskId: number) => Promise<void>; // valet: abort a park job already in the driver's hands
  markTaskReturned: (taskId: number) => Promise<void>; // driver: confirm a recalled car is back at the counter
  fetchTaskHistory: (params?: {doctorId?: number; driverId?: number}) => Promise<ParkingTask[]>;
  reportLocation: (taskId: number, lat: number, lng: number) => Promise<void>;
  setDriverStatus: (driverId: number, status: DriverStatus) => Promise<void>;
  addVisitor: (v: {name: string; carNumber?: string; mobile: string; vehicleType?: 'car' | 'bike'}) => Promise<Visitor>;
  assignVisitorDriver: (visitorId: number, driverId: number) => Promise<void>;
  cancelVisitorAssignment: (visitorId: number) => Promise<void>; // give up on an unaccepted pickup driver; token stays open
  cancelVisitor: (visitorId: number, reason: 'no_show' | 'valet_cancelled' | 'parking_failed') => Promise<void>;
  recallVisitor: (visitorId: number) => Promise<void>;
  /** Valet: car gone, nobody asked — closes the session and frees the bay. */
  closeParkedVisitor: (visitorId: number) => Promise<void>;
  assignRetrievalDriver: (visitorId: number, driverId: number) => Promise<void>;
  assignStaffRetrievalDriver: (doctorId: number, driverId: number) => Promise<void>;
  confirmVisitorDelivered: (visitorId: number) => Promise<void>;
  pushNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  refreshTasks: () => Promise<void>; // re-read everything — e.g. after a JOB_GONE reply proves local state is stale
  markNotificationRead: (id: number) => Promise<void>;
  clearNotifications: () => void;
}

const Ctx = createContext<AppState>({} as AppState);

/*
 * The live-map feed lives in its own context, deliberately.
 *
 * Drivers emit GPS on a ~2-3s watch (see the watchPosition config below),
 * so with a handful of drivers on shift these two values change several
 * times a second. They were part of the main AppState value, which meant
 * every one of those pings changed that value's identity and re-rendered
 * every screen subscribed to it -- the doctor's home, the driver's job
 * list, the admin dashboards -- none of which read a driver's coordinates.
 *
 * Exactly one screen does (ValetMapScreen). Splitting the feed out means a
 * ping now re-renders that screen and nothing else.
 */
interface DriverLocationsState {
  driverLocations: Record<number, DriverLocation>;
  onlineDriverIds: number[];
}
const LocationsCtx = createContext<DriverLocationsState>({driverLocations: {}, onlineDriverIds: []});

// A driver's marker goes stale if no GPS ping for this long (phone offline
// but socket not yet timed out) — the map drops it rather than lying.
const LOCATION_STALE_MS = 60 * 1000;

// Timestamps arrive as ISO strings (serialize.js) — normalize to epoch ms.
function toEpoch(v: unknown): number | undefined {
  if (!v) return undefined;
  const t = new Date(v as string).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function mapTask(t: any): ParkingTask {
  return {
    ...t,
    // Legacy `eta` fallback — a running server may still serialize the old
    // key while a freshly built app reads the new one.
    plannedDepartureMinutes: t.plannedDepartureMinutes ?? t.eta ?? undefined,
    requestedAt: toEpoch(t.requestedAt),
    assignedAt: toEpoch(t.assignedAt),
    acceptedAt: toEpoch(t.acceptedAt),
    startedAt: toEpoch(t.startedAt),
    escalatedAt: toEpoch(t.escalatedAt),
    plannedDepartureAt: toEpoch(t.plannedDepartureAt),
    retrievalReadyAt: toEpoch(t.retrievalReadyAt),
    arrivalAcceptedAt: toEpoch(t.arrivalAcceptedAt),
    retrievalAcceptedAt: toEpoch(t.retrievalAcceptedAt),
    ownerNotifiedAt: toEpoch(t.ownerNotifiedAt),
    recoveryBroadcastAt: toEpoch(t.recoveryBroadcastAt),
    recalledAt: toEpoch(t.recalledAt),
    keyCollectedAt: toEpoch(t.keyCollectedAt),
    completedAt: toEpoch(t.completedAt),
    locationUpdatedAt: toEpoch(t.locationUpdatedAt),
  };
}

export function mapVisitor(v: any): Visitor {
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
  const [hydrated, setHydrated]       = useState(false);
  const [driverLocations, setDriverLocations] = useState<Record<number, DriverLocation>>({});
  const [onlineDriverIds, setOnlineDriverIds] = useState<number[]>([]);
  const [reassignPrompt, setReassignPrompt]   = useState<ReassignPrompt | null>(null);

  // Only valet/admin need the full drivers roster.
  const needsOpsData = user?.role === 'valet' || user?.role === 'admin';
  // Drivers need `visitors` too — DriverJobsScreen filters it to their own assignments.
  const needsVisitors = needsOpsData || user?.role === 'driver';

  /*
   * Guards against two refreshes overwriting each other out of order.
   *
   * Resuming the app fires this twice at once -- once from the
   * foreground/visibility handler and once from the socket's `connect`
   * after it reconnects -- which is the single most common way the app is
   * used, not a rare interleaving. Both call Promise.all and then setState
   * with whatever they got; whichever HTTP response happens to land second
   * wins, even when it is the older snapshot. The result is a screen that
   * silently reverts: a job that just completed reappears, a new assignment
   * disappears, until the next socket event happens to correct it.
   *
   * Each call takes a ticket and only commits if it still holds the latest
   * one. A superseded response is dropped rather than applied, because a
   * newer request is already in flight with better data.
   */
  const fetchSeqRef = useRef(0);

  /*
   * Counts live mutations, so a refresh can tell whether the world moved
   * underneath it.
   *
   * fetchAll reads a server snapshot taken when the request left. If a
   * socket event lands while that request is in flight, the event carries
   * NEWER truth than the snapshot -- but the snapshot arrives second and
   * overwrites it. The job that just went in_transit reverts to assigned
   * and stays wrong until the next unrelated event happens to repair it.
   *
   * Bumped by every socket handler that mutates entity state. fetchAll
   * records it before the request and re-reads it on commit; a change means
   * the snapshot is known-stale, so it is applied and then immediately
   * followed by one more fetch to converge on the truth. Applying it is
   * still right -- it is fresher than what was there for everything the
   * event did not touch -- it just cannot be the last word.
   */
  const mutationSeqRef = useRef(0);
  // Lets the converge pass call fetchAll without fetchAll depending on
  // itself (a useCallback cannot reference its own identity).
  const fetchAllRef = useRef<(() => Promise<void>) | null>(null);
  const bumpMutation = useCallback(() => { mutationSeqRef.current += 1; }, []);

  const fetchAll = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const mutationsAtStart = mutationSeqRef.current;
    const [t, s, n, d, v, a] = await Promise.all([
      tasksApi.list(),
      slotsApi.list(),
      notificationsApi.list(),
      needsOpsData ? driversApi.list() : Promise.resolve(null),
      needsVisitors ? visitorsApi.list() : Promise.resolve(null),
      needsOpsData ? arrivalsApi.list() : Promise.resolve(null),
    ]);
    // Superseded while we were awaiting — a newer fetchAll is already
    // in flight, so applying this would move the UI backwards.
    if (seq !== fetchSeqRef.current) return;

    const tasks: ParkingTask[] = t.map(mapTask);
    const visitorRows: Visitor[] | null = v ? v.map(mapVisitor) : null;
    setTasks(tasks);
    setSlots(s);
    setNotifs(n.map(mapNotification));
    if (d) setDrivers(d);
    if (visitorRows) setVisitors(visitorRows);
    if (a) setArrivals(a.map(mapArrival));
    setHydrated(true);
    markSynced();

    // A socket event overtook this snapshot while it was in flight, so what
    // we just applied is stale for whatever that event touched. One more
    // pass settles it. Guarded by the seq check at the top, so a burst of
    // events cannot turn this into a fetch loop: each retry supersedes the
    // last rather than stacking.
    if (mutationSeqRef.current !== mutationsAtStart) {
      // setTimeout rather than a microtask: this lets the socket handler's
      // own setState flush first, so the retry reads settled state.
      setTimeout(() => { void fetchAllRef.current?.(); }, 0);
    }

    // Authoritative stale-alarm check: the app may have been killed/offline
    // when a rollback happened, leaving the unswipeable `ongoing`
    // notification stuck — if nothing is awaiting our acceptance after a
    // full refetch, nothing should be ringing.
    const me = userRef.current;
    const myDrvId = me?.role === 'driver' ? me.linkedDriverId ?? null : null;
    if (myDrvId != null) {
      const awaitingMe = tasks.some(x => x.driverId === myDrvId && x.status === 'assigned' && !x.acceptedAt)
        || (visitorRows ?? []).some(x => x.driverId === myDrvId && x.status === 'pending' && !x.acceptedAt);
      if (!awaitingMe) stopAssignmentAlarm().catch(() => {});
    }
  }, [needsOpsData, needsVisitors]);
  fetchAllRef.current = fetchAll;

  // Socket handlers need the current user without re-subscribing on every profile change.
  const userRef = useRef(user);
  userRef.current = user;

  const reassignShownAt = useRef(0);
  const clearReassignPrompt = useCallback(() => setReassignPrompt(null), []);

  // ── True-WebSocket sync — full fetch on login/reconnect, deltas after.
  useEffect(() => {
    if (!user) {
      setDrivers([]); setTasks([]); setSlots([]); setVisitors([]); setNotifs([]); setArrivals([]);
      setHydrated(false);
      setDriverLocations({}); setOnlineDriverIds([]); setReassignPrompt(null);
      disconnectSocket();
      return;
    }

    const token = getAuthToken();
    if (!token) return;
    const socket = connectSocket(token);

    socket.on('connect', () => { fetchAll().catch(() => markSyncFailed()); });

    socket.on('task:upsert', (raw: any) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      const task = mapTask(raw);
      setTasks(p => upsertById(p, task));
      // Someone else just staffed this job — close any open "needs a
      // driver" prompt rather than inviting a second, conflicting assignment.
      if (task.driverId) {
        setReassignPrompt(prev =>
          prev?.kind === 'task' && prev.task?.id === task.id ? null : prev);
      }
      const me = userRef.current;
      // linkedDriverId only — Driver.id and User.id are separate sequences,
      // so `?? me.id` would stop the alarm on the wrong person's event.
      const myDrvId = me?.role === 'driver' ? me.linkedDriverId ?? null : null;
      if (myDrvId != null && task.driverId !== myDrvId) {
        stopAssignmentAlarm().catch(() => {}); // may have been mine a moment ago — harmless if not ringing
      }
    });

    // The server's authoritative "this stopped being yours" push — the
    // alarm notification is `ongoing` (unswipeable), so a driver offline
    // when this happened needs a direct signal, not just the inference above.
    socket.on('assignment:cancelled', () => {
      stopAssignmentAlarm().catch(() => {});
    });

    socket.on('visitor:upsert', (raw: any) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      const visitor = mapVisitor(raw);
      setVisitors(p => upsertById(p, visitor));
      if (visitor.driverId) {
        setReassignPrompt(prev =>
          prev?.kind === 'visitor' && prev.visitor?.id === visitor.id ? null : prev);
      }
    });

    socket.on('slot:patch', (slot: ParkingSlot) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      setSlots(p => upsertById(p, slot));
    });

    socket.on('driver:patch', (patch: Partial<Driver> & {id: number}) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      setDrivers(p => p.map(d => (d.id === patch.id ? {...d, ...patch} : d)));
    });

    socket.on('notification:new', (raw: any) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      const n = mapNotification(raw);
      setNotifs(p => (p.some(x => x.id === n.id) ? p : [n, ...p]));
      const me = userRef.current;
      const isForMe =
        n.targetId === me?.id ||
        (me?.linkedDriverId != null && n.targetId === me.linkedDriverId) ||
        n.targetRole === me?.role ||
        n.targetRole === `driver:${me?.linkedDriverId}` ||
        // Owner-scoped valet pushes (task.service.js's markParked,
        // `valet:${parkOwner}`) — parallel to driver:<id> above.
        n.targetRole === `valet:${me?.id}` ||
        n.targetRole === 'all';
      if (!isForMe) return;
      // A reassign event fires both as task:needs-reassign (dialog) and
      // this notification (alarm) within ms of each other — suppress the
      // alarm's duplicate for a short window after the dialog shows.
      if (Date.now() - reassignShownAt.current < 4000) return;
      if (n.type === 'alarm') {
        // n.id is the same row id the FCM push carries, so the socket and the
        // push collapse onto one ring — and reopening the app replays this
        // event without buzzing a second time for a job already announced.
        ringAssignmentAlarm(
          n.title, n.body, String(n.id),
          (raw as {alarmLevel?: string})?.alarmLevel === 'long' ? 'long' : 'short',
        ).catch(() => {});
      } else {
        // n.id matches the FCM push's id, so the two deliveries of this one
        // event collapse into a single tray entry.
        displayNotification(n.title, n.body, n.type, n.id);
      }
    });

    // ── live map feeds ──
    socket.on('presence:snapshot', ({driverIds}: {driverIds: number[]}) => {
      setOnlineDriverIds(driverIds);
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

    // A retrieval just became someone's alone — every other valet drops it
    // rather than keeping a recovery-broadcast card whose button can only 409.
    socket.on('task:restrict', ({id, ownerValetId}: {id: number; ownerValetId: number}) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      if (user?.role !== 'valet' || user.id === ownerValetId) return;
      setTasks(p => p.filter(t => t.id !== id));
    });

    socket.on('task:recovery', ({task}: any) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      setTasks(p => upsertById(p, mapTask(task)));
    });

    socket.on('arrival:upsert', (raw: any) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      setArrivals(p => upsertById(p, mapArrival(raw)));
    });
    socket.on('arrival:remove', ({id}: {id: number}) => {
      bumpMutation(); // snapshot in flight is now stale — see mutationSeqRef
      setArrivals(p => p.filter(a => a.id !== id));
    });

    // ── accept-timeout / reject prompts (valet + admin rooms only) ──
    // One prompt per job while it's open — the same job can legitimately
    // raise this event twice (owner alone, then the whole team on escalate),
    // and the owner receives both.
    socket.on('task:needs-reassign', ({task, driverName, rejected}: any) => {
      const mapped = mapTask(task);
      setReassignPrompt(prev => {
        if (prev?.kind === 'task' && prev.task?.id === mapped.id) return prev;
        reassignShownAt.current = Date.now();
        return {kind: 'task', task: mapped, driverName, rejected};
      });
    });
    socket.on('visitor:needs-reassign', ({visitor, driverName, rejected}: any) => {
      const mapped = mapVisitor(visitor);
      setReassignPrompt(prev => {
        if (prev?.kind === 'visitor' && prev.visitor?.id === mapped.id) return prev;
        reassignShownAt.current = Date.now();
        return {kind: 'visitor', visitor: mapped, driverName, rejected};
      });
    });
    // Repeats every 60s until staffed or silenced (driverReminder.js).
    socket.on('task:driver-reminder', ({task}: any) => {
      const mapped = mapTask(task);
      setReassignPrompt(prev => {
        if (prev?.kind === 'task' && prev.task?.id === mapped.id && prev.source === 'reminder') return prev;
        reassignShownAt.current = Date.now();
        return {kind: 'task', task: mapped, driverName: null, source: 'reminder'};
      });
    });

    // FCM device registration + foreground push handling. `pushCancelled`
    // guards against logout/account-switch racing this promise's
    // resolution — without it, listeners it registers could outlive the
    // session and fire an authenticated call with no token attached.
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

  // A reassign prompt says "this job needs a driver" — derived state, not a
  // one-shot event, so it clears itself the instant that's no longer true
  // (catching task:upsert alone missed this across a dropped socket, which
  // is precisely when another valet steps in).
  useEffect(() => {
    if (!reassignPrompt) return;
    const stillNeedsDriver = reassignPrompt.kind === 'task'
      ? tasks.some(t => t.id === reassignPrompt.task?.id && !t.driverId)
      : visitors.some(v => v.id === reassignPrompt.visitor?.id && !v.driverId);
    if (!stillNeedsDriver) setReassignPrompt(null);
  }, [reassignPrompt, tasks, visitors]);

  // Socket reconnect is the only other refetch trigger — a socket that
  // drops without reconnecting (wifi wobble, doze, backgrounded app) would
  // otherwise leave a driver staring at a stale Accept button indefinitely.
  useEffect(() => {
    if (!user) return;
    const sub = RNAppState.addEventListener('change', next => {
      if (next === 'active') fetchAll().catch(() => markSyncFailed());
    });
    return () => sub.remove();
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

  // A GPS ping only carries position — merge just those fields, never the
  // whole task. A ping in flight when Mark Parked lands can reply with a
  // stale pre-request status (backend's "hasn't moved, skip the write"
  // path); replacing the whole record with that used to resurrect a
  // completed job on the driver's screen until the next reconnect.
  const reportLocation = useCallback(async (taskId: number, lat: number, lng: number) => {
    const fresh = mapTask(await tasksApi.updateLocation(taskId, lat, lng));
    setTasks(p => p.map(t => (t.id === taskId
      ? {...t,
         driverLat: fresh.driverLat,
         driverLng: fresh.driverLng,
         locationUpdatedAt: fresh.locationUpdatedAt,
         // Set once by the first ping, never cleared — every viewer computes
         // trip progress from this anchor.
         driverStartLat: t.driverStartLat ?? fresh.driverStartLat,
         driverStartLng: t.driverStartLng ?? fresh.driverStartLng,
         trackingProgress: fresh.trackingProgress ?? t.trackingProgress}
      : t)));
  }, []);

  // One GPS watcher for the whole driver session, not just active trips:
  // every fix streams to the live map; during an active trip it also posts
  // to the task's location endpoint (task:upsert renders it on tracking screens).
  // linkedDriverId only — `?? user.id` is a different id sequence, and
  // matching on undefined would claim every unassigned task.
  const myDriverId = user?.role === 'driver' ? user.linkedDriverId ?? null : null;
  const activeDriverTask = myDriverId != null
    ? tasks.find(t => t.driverId != null && t.driverId === myDriverId
        && (t.status === 'key_collected' || t.status === 'in_transit'))
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
        // distanceFilter: 0 — 5m used to mean a driver standing at the
        // counter (just took the key) produced no update until they moved.
        {enableHighAccuracy: true, distanceFilter: 0, interval: 3000, fastestInterval: 2000},
      );
    };

    watch();
    return () => { cancelled = true; Geolocation.stopObserving(); };
  }, [user?.role, user?.id, reportLocation]);

  // One-shot fix the moment tracking starts, instead of waiting for the
  // ambient watch's next callback — avoids "Waiting for location…" hanging
  // on the doctor's tracking screen.
  useEffect(() => {
    if (user?.role !== 'driver' || !activeDriverTaskId) return;
    Geolocation.getCurrentPosition(
      pos => {
        const {latitude, longitude} = pos.coords;
        emitDriverLocation(latitude, longitude);
        reportLocation(activeDriverTaskId, latitude, longitude).catch(() => {});
      },
      () => {},
      {enableHighAccuracy: true, timeout: 8000, maximumAge: 0},
    );
  }, [user?.role, activeDriverTaskId, reportLocation]);

  const addTask = useCallback(async (task: Omit<ParkingTask, 'id'>) => {
    const created = await tasksApi.create({
      type: task.type,
      doctorId: task.doctorId,
      carNumber: task.carNumber,
      slotId: task.slotId,
    });
    const mapped = mapTask(created);
    // Backend returns the existing task, not a duplicate, on a repeat call —
    // dedupe locally too rather than trusting this call site never races.
    setTasks(p => (p.some(t => t.id === mapped.id) ? p : [...p, mapped]));
    return mapped.id;
  }, []);

  // Destination is the admin-set fixed valet gate, not this phone's GPS —
  // the car always comes back to the same entrance regardless of exactly
  // where the doctor is standing when they tap the button.
  const requestRetrieval = useCallback(async (plannedDepartureMinutes: number) => {
    const created = mapTask(await tasksApi.requestRetrieval({plannedDepartureMinutes}));
    // upsertById — the backend's own task:upsert broadcast for this row can
    // land before this response does.
    setTasks(p => upsertById(p, created));
    // No notification fired from here — the backend raises it inside the
    // same operation, addressed to the one valet who owns this session.
    return created.id;
  }, []);

  // Doctor/staff "I'm on my way" — no car/key involved, just a heads-up ETA
  // for the valet queue (auto-cleared once a real park task exists). No
  // notification either: nothing's actionable until a key changes hands, so
  // the valet's only cue is the inbox count.
  // A doctor/staff member's own open heads-up. They can't read the valet's
  // queue (GET /arrivals is valet/admin-scoped), so this is the only way
  // their app knows they have one outstanding — and therefore the only way
  // it can offer to take it back.
  const [myArrivalNotice, setMyArrivalNotice] = useState<ArrivalNotice | null>(null);
  const isArrivalOwner = user?.role === 'doctor' || user?.role === 'staff';

  const refreshMyArrival = useCallback(async () => {
    if (!isArrivalOwner) { setMyArrivalNotice(null); return; }
    try {
      const raw = await arrivalsApi.mine();
      setMyArrivalNotice(raw ? mapArrival(raw) : null);
    } catch {
      // Non-critical: the send/cancel buttons still work without it.
    }
  }, [isArrivalOwner]);

  useEffect(() => { refreshMyArrival(); }, [refreshMyArrival]);

  const sendArrivalNotice = useCallback(async (eta: number) => {
    await arrivalsApi.create(eta);
    await refreshMyArrival();
  }, [refreshMyArrival]);

  const cancelMyArrival = useCallback(async (id: number) => {
    await arrivalsApi.dismiss(id);
    setMyArrivalNotice(null);
  }, []);

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
    // No generic PATCH server-side — every other transition has its own
    // dedicated endpoint (assign/key-collected/park/retrieve) below.
  }, []);

  // A plain status transition: stop any ringing alarm, hit the endpoint,
  // patch the task in place. Everything below with its own side effects
  // (slot/driver patches) stays its own function.
  const simpleTaskAction = useCallback((apiCall: (id: number) => Promise<any>) => async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await apiCall(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const acceptRetrieval = useCallback(simpleTaskAction(tasksApi.acceptRetrieval), []);

  // Doctor/staff: call off a departure request — the backend tells the
  // valet/any assigned driver in the same operation.
  const cancelMyRetrieval = useCallback(async (taskId: number) => {
    const updated = mapTask(await tasksApi.cancelMyRetrieval(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const assignDriver = useCallback(async (taskId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    // Only a retrieval needs a destination — the valet's own live location,
    // the physical handover point, captured fresh on every assignment.
    const task = tasks.find(t => t.id === taskId);
    const coords = task?.type === 'retrieve' ? await getCurrentPositionSafe() : null;
    const updated = mapTask(await tasksApi.assignDriver(taskId, driverId, coords ? {lat: coords.lat, lng: coords.lng} : undefined));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: taskId} : d)));
  }, [tasks]);

  const cancelTaskAssignment = useCallback(async (taskId: number) => {
    const freedDriverId = tasks.find(t => t.id === taskId)?.driverId;
    const updated = mapTask(await tasksApi.cancelAssignment(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    if (freedDriverId != null) setDrivers(p => p.map(d => (d.id === freedDriverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [tasks]);

  const acceptTask = useCallback(simpleTaskAction(tasksApi.accept), []);

  const rejectTask = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.reject(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    if (myDriverId != null) setDrivers(p => p.map(d => (d.id === myDriverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [myDriverId]);

  const markKeyCollected = useCallback(simpleTaskAction(tasksApi.keyCollected), []);

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

  const confirmTaskDelivered = useCallback(simpleTaskAction(tasksApi.confirmDelivered), []);

  // Staff/admin: retire a stuck task instead of it silently blocking every
  // later session for that doctor's Vehicle Status card.
  const cancelTask = useCallback(simpleTaskAction(tasksApi.cancel), []);

  // Valet: the car physically left without anyone requesting a retrieval.
  // Frees the slot as well as closing the session — the backend does both,
  // and the slot:patch/task:upsert deltas bring every other client along.
  const closeParkedSession = useCallback(async (taskId: number) => {
    const updated = mapTask(await tasksApi.closeParked(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    if (updated.slotId) {
      setSlots(p => p.map(sl => (sl.id === updated.slotId
        ? {...sl, status: 'free' as const, taskId: undefined, carNumber: undefined, doctorId: undefined}
        : sl)));
    }
  }, []);

  // Past the key handover a plain cancel isn't allowed (a real car is in a
  // driver's hands) — this recalls it instead: driver brings it back, valet
  // confirms receipt to close it out.
  const recallTask = useCallback(async (taskId: number) => {
    const updated = mapTask(await tasksApi.recall(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const markTaskReturned = useCallback(simpleTaskAction(tasksApi.markReturned), []);

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
    // upsertById, not a blind append: the backend broadcasts its own
    // visitor:upsert for this same row over the socket, and that delta can
    // land before this call's own response does. A plain [...p, created]
    // didn't check whether the socket had already added it, so the same
    // visitor could end up as two separate entries in this array — showing
    // as duplicate cards with an identical token everywhere the list is
    // rendered, even though there was only ever one row in the database.
    setVisitors(p => upsertById(p, created));
    return created;
  }, []);

  const assignVisitorDriver = useCallback(async (visitorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.assignDriver(visitorId, driverId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    // Driver.currentTaskId is a ParkingTask id, never a visitor id — mixing
    // the two once left a driver stuck "busy" server-side (see
    // visitor.service.js's freeDriverIfStillOn). The linked park task
    // should already be in `tasks`; falls back to undefined otherwise.
    const linkedTaskId = tasks.find(t => t.visitorId === visitorId && t.type === 'park' && t.status !== 'completed' && t.status !== 'cancelled')?.id;
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: linkedTaskId} : d)));
  }, [tasks]);

  const cancelVisitorAssignment = useCallback(async (visitorId: number) => {
    const freedDriverId = visitors.find(v => v.id === visitorId)?.driverId;
    const updated = mapVisitor(await visitorsApi.cancelAssignment(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    if (freedDriverId != null) setDrivers(p => p.map(d => (d.id === freedDriverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [visitors]);

  const cancelVisitor = useCallback(async (visitorId: number, reason: 'no_show' | 'valet_cancelled' | 'parking_failed') => {
    const existing = visitors.find(v => v.id === visitorId);
    const updated = mapVisitor(await visitorsApi.cancel(visitorId, reason));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    const driverId = existing?.driverId;
    if (driverId) setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [visitors]);

  // The linked ParkingTask (not the Visitor row) flips to recalled, via the
  // normal task:upsert delta — this just fires the request and refreshes
  // whatever the visitor row does mirror (e.g. driverName).
  const closeParkedVisitor = useCallback(async (visitorId: number) => {
    const updated = mapVisitor(await visitorsApi.closeParked(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  const recallVisitor = useCallback(async (visitorId: number) => {
    const updated = mapVisitor(await visitorsApi.recall(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  const assignRetrievalDriver = useCallback(async (visitorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.assignRetrievalDriver(visitorId, driverId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    const linkedTaskId = tasks.find(t => t.visitorId === visitorId && t.type === 'retrieve' && t.status !== 'completed' && t.status !== 'cancelled')?.id;
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: linkedTaskId} : d)));
  }, [tasks]);

  // The staff/doctor equivalent of assignRetrievalDriver — captures the
  // valet's own live location as the handover point, same as assignDriver
  // for a retrieve task. upsertById since this can create a brand-new
  // retrieve task not yet in local state.
  const assignStaffRetrievalDriver = useCallback(async (doctorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const coords = await getCurrentPositionSafe();
    const updated = mapTask(await tasksApi.assignRetrievalDriverForDoctor(
      doctorId, driverId, coords ? {lat: coords.lat, lng: coords.lng} : undefined,
    ));
    setTasks(p => upsertById(p, updated));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: updated.id} : d)));
  }, []);

  const confirmVisitorDelivered = useCallback(async (visitorId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.confirmDelivered(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  const pushNotification = useCallback(async (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
    const created = mapNotification(
      await notificationsApi.push({targetRole: n.targetRole, targetId: n.targetId, title: n.title, body: n.body, type: n.type}),
    );
    // The socket delivers this same notification back to every targeted
    // client, including this one — pre-seed local state only (deduped by id
    // in notification:new), never display here, or the sender gets doubles.
    setNotifs(p => (p.some(x => x.id === created.id) ? p : [created, ...p]));
  }, []);

  const markNotificationRead = useCallback(async (id: number) => {
    const updated = mapNotification(await notificationsApi.markRead(id));
    setNotifs(p => p.map(n => (n.id === id ? updated : n)));
  }, []);

  const clearNotifications = useCallback(() => setNotifs([]), []);

  // Memoized so its identity only changes when something in it actually
  // changes. Every entry below is useState/useCallback/useMemo, and the
  // object references nothing else, so this dependency list is exactly
  // the value's own keys — there is no dep to forget.
  //
  // Without this the object was rebuilt on every provider render, so any
  // state change anywhere in here re-rendered every consumer in the app.
  const value = useMemo(() => ({
    drivers,
    tasks,
    slots,
    visitors,
    arrivalNotices,
    notifications,
    hydrated,
    reassignPrompt,
    clearReassignPrompt,
    addTask,
    requestRetrieval,
    cancelMyRetrieval,
    sendArrivalNotice,
    acceptRetrieval,
    dismissArrivalNotice,
    updateTask,
    assignDriver,
    cancelTaskAssignment,
    acceptTask,
    rejectTask,
    markKeyCollected,
    markParked,
    markRetrieved,
    confirmTaskDelivered,
    cancelTask,
    closeParkedSession,
    recallTask,
    markTaskReturned,
    fetchTaskHistory,
    reportLocation,
    myArrivalNotice,
    refreshMyArrival,
    cancelMyArrival,
    setDriverStatus,
    addVisitor,
    assignVisitorDriver,
    cancelVisitorAssignment,
    cancelVisitor,
    recallVisitor,
    closeParkedVisitor,
    assignRetrievalDriver,
    assignStaffRetrievalDriver,
    confirmVisitorDelivered,
    pushNotification,
    markNotificationRead,
    clearNotifications,
    refreshTasks: fetchAll,
  }), [drivers, tasks, slots, visitors, arrivalNotices, notifications, hydrated, reassignPrompt, clearReassignPrompt, addTask, requestRetrieval, cancelMyRetrieval, sendArrivalNotice, acceptRetrieval, dismissArrivalNotice, updateTask, assignDriver, cancelTaskAssignment, acceptTask, rejectTask, markKeyCollected, markParked, markRetrieved, confirmTaskDelivered, cancelTask, closeParkedSession, recallTask, markTaskReturned, fetchTaskHistory, reportLocation, myArrivalNotice, refreshMyArrival, cancelMyArrival, setDriverStatus, addVisitor, assignVisitorDriver, cancelVisitorAssignment, cancelVisitor, recallVisitor, closeParkedVisitor, assignRetrievalDriver, assignStaffRetrievalDriver, confirmVisitorDelivered, pushNotification, markNotificationRead, clearNotifications, fetchAll]);

  const locationsValue = useMemo(
    () => ({driverLocations, onlineDriverIds}),
    [driverLocations, onlineDriverIds],
  );

  return (
    <Ctx.Provider value={value}>
      <LocationsCtx.Provider value={locationsValue}>
        {children}
      </LocationsCtx.Provider>
    </Ctx.Provider>
  );
}

export function useAppState() { return useContext(Ctx); }

/** Live driver positions. Separate on purpose — see LocationsCtx. */
export function useDriverLocations() { return useContext(LocationsCtx); }
