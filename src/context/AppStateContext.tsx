import React, {createContext, useContext, useState, useCallback, useEffect, useRef} from 'react';
import {Platform, PermissionsAndroid, AppState as RNAppState} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {displayNotification, ringAssignmentAlarm, stopAssignmentAlarm} from '../services/notifications';
import {tasksApi, driversApi, slotsApi, visitorsApi, notificationsApi, arrivalsApi, getAuthToken} from '../services/api';
import {connectSocket, disconnectSocket, emitDriverLocation} from '../services/socket';
import {initPushMessaging} from '../services/pushMessaging';
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
  // Set instead of doctorId when this task belongs to a visitor/patient
  // check-in rather than a staff/doctor session — see serializeTask.
  visitorId?: number;
  isVisitor?: boolean;
  // Who the doctor/staff member is, for the valet's dispatch card. No phone
  // number — serializeTask reaches drivers too.
  doctorDepartment?: string;
  doctorEmployeeId?: string;
  carNumber: string;
  slotId?: string; // ParkingSlot's id stays a human-readable code, e.g. "A-001"
  driverId?: number;
  driverName?: string;
  status: TaskStatus;
  requestedAt?: number;
  assignedAt?: number;
  acceptedAt?: number; // driver's explicit accept — see accept watchdog flow
  // When the driver actually set off. The trip clock anchors here; the
  // doctor's deadline anchors to requestedAt. See utils/retrievalClocks.
  startedAt?: number;
  // The valet who owns this job — only they are alarmed when it needs
  // attention, instead of every valet on shift (see jobAlerts.js).
  valetId?: number;
  valetName?: string;
  // Set once a stalled job has escalated past its owner to the whole team.
  escalatedAt?: number;

  // ── Parking session ownership ──────────────────────────────────────
  // The valet who accepted this doctor's arrival. Written once and never
  // overwritten, so it stays true even if someone else recovers the
  // departure — it's history, not routing.
  arrivalOwnerValetId?: number;
  arrivalOwnerValetName?: string;
  arrivalAcceptedAt?: number;
  // Whoever is actually running the departure leg. Same person as the
  // arrival owner in the normal case.
  retrievalOwnerValetId?: number;
  retrievalOwnerValetName?: string;
  retrievalAcceptedAt?: number;
  retrievalOwnershipSource?: 'OWNER' | 'RECOVERY';
  ownerNotifiedAt?: number;
  // Set when the owner's response window lapsed and the request was
  // released to every valet — this is what makes the "Original owner
  // unavailable" card appear.
  recoveryBroadcastAt?: number;
  // Valet aborted this park job after the key was handed over: the driver
  // brings the car back to the counter instead of parking it.
  recalledAt?: number;
  keyCollectedAt?: number;
  completedAt?: number;
  // The doctor's planned departure in minutes (0 = now). Valet-side
  // planning information only — never rendered to the doctor as an ETA.
  plannedDepartureMinutes?: number;
  // Absolute departure time, and (departure minus the configured lead time)
  // the moment the AUTOMATIC alert fires — a valet who opens the inbox
  // before then can still assign a driver right away, this only paces the
  // unattended push.
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
  carNumber?: string; // optional — plate may not be available at intake
  mobile: string;
  vehicleType: 'car' | 'bike';
  slotId?: string; // ParkingSlot's id stays a human-readable code
  driverId?: number;
  driverName?: string;
  status: 'parked' | 'pending' | 'delivered' | 'retrieved' | 'cancelled';
  retrievalRequested: boolean;
  valetId?: number;
  escalatedAt?: number;
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
  // Present only if the doctor already has a plate saved on their profile —
  // lets the valet skip straight to driver assignment from this card.
  doctorCarNumber?: string;
  // Only needed for the "no plate on file yet" fallback (see
  // ValetHomeScreen.handleArrivalArrived) — Path B skips the code lookup
  // that would normally have supplied these.
  doctorDepartment?: string;
  doctorEmployeeId?: string;
  // 3-digit valet code — what the valet searches the arrivals list by.
  doctorCardCode?: string;
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
  // Null when no driver was ever involved — the job simply never got one,
  // which is a different prompt from "your driver dropped it".
  driverName: string | null;
  rejected?: boolean;
}

interface AppState {
  drivers: Driver[];
  tasks: ParkingTask[];
  slots: ParkingSlot[];
  visitors: Visitor[];
  arrivalNotices: ArrivalNotice[];
  notifications: Notification[];
  /**
   * False until the first full fetch has resolved. Distinguishes "still
   * loading" from "loaded and genuinely empty" — without it every screen
   * rendered its confident empty state during startup, and any ACTION
   * offered in that state (the doctor's Arrival card) could be taken
   * against data that hadn't arrived yet, writing a real record and
   * alarming a valet for a car that was already parked.
   */
  hydrated: boolean;
  driverLocations: Record<number, DriverLocation>;
  onlineDriverIds: number[];
  reassignPrompt: ReassignPrompt | null;
  clearReassignPrompt: () => void;

  // Actions — all backed by the API now, so all return Promises.
  addTask: (task: Omit<ParkingTask, 'id'>) => Promise<number>;
  /** plannedDepartureMinutes: 0 | 10 | 20 | 30 | 40 — not an ETA. */
  requestRetrieval: (plannedDepartureMinutes: number) => Promise<number>;
  cancelMyRetrieval: (taskId: number) => Promise<void>;
  // Doctor/staff: "I'm on my way" — before any car/key exists yet, so this
  // has no task id to hand back, just fires the valet-facing notice + push.
  sendArrivalNotice: (eta: number) => Promise<void>;
  acceptRetrieval: (taskId: number) => Promise<void>;
  // Valet: manually clear a no-show/mistaken arrival notice.
  dismissArrivalNotice: (id: number) => Promise<void>;
  updateTask: (id: number, patch: Partial<ParkingTask>) => Promise<void>;
  assignDriver: (taskId: number, driverId: number) => Promise<void>;
  // Give up on a driver who hasn't accepted yet, right now. Job stays open.
  cancelTaskAssignment: (taskId: number) => Promise<void>;
  acceptTask: (taskId: number) => Promise<void>;
  rejectTask: (taskId: number) => Promise<void>;
  markKeyCollected: (taskId: number) => Promise<void>;
  markParked: (taskId: number, slotId: string) => Promise<void>;
  markRetrieved: (taskId: number) => Promise<void>;
  confirmTaskDelivered: (taskId: number) => Promise<void>;
  cancelTask: (taskId: number) => Promise<void>;
  // Valet: abort a park job already in the driver's hands — "bring it back".
  recallTask: (taskId: number) => Promise<void>;
  // Driver: confirm a recalled car is back at the valet counter.
  markTaskReturned: (taskId: number) => Promise<void>;
  fetchTaskHistory: (params?: {doctorId?: number; driverId?: number}) => Promise<ParkingTask[]>;
  reportLocation: (taskId: number, lat: number, lng: number) => Promise<void>;
  setDriverStatus: (driverId: number, status: DriverStatus) => Promise<void>;
  addVisitor: (v: {name: string; carNumber?: string; mobile: string; vehicleType?: 'car' | 'bike'}) => Promise<Visitor>;
  assignVisitorDriver: (visitorId: number, driverId: number) => Promise<void>;
  // Give up on a driver who hasn't accepted this pickup yet, right now.
  // Token stays open.
  cancelVisitorAssignment: (visitorId: number) => Promise<void>;
  cancelVisitor: (visitorId: number, reason: 'no_show' | 'valet_cancelled' | 'parking_failed') => Promise<void>;
  recallVisitor: (visitorId: number) => Promise<void>;
  assignRetrievalDriver: (visitorId: number, driverId: number) => Promise<void>;
  assignStaffRetrievalDriver: (doctorId: number, driverId: number) => Promise<void>;
  confirmVisitorDelivered: (visitorId: number) => Promise<void>;
  pushNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  /** Re-read everything from the server. For the rare case a client knows its
   *  own state is stale (e.g. a JOB_GONE reply proves the job moved on). */
  refreshTasks: () => Promise<void>;
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
    // Accept the legacy `eta` key as well. The rollout isn't atomic — a
    // running server may still be serializing the old field name while a
    // freshly built app reads the new one, which rendered "Leaving in
    // undefined min" on the valet's inbox. Compatibility has to work in
    // BOTH directions, not just old-app -> new-backend.
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
  const [hydrated, setHydrated]       = useState(false);
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
    const tasks: ParkingTask[] = t.map(mapTask);
    const visitorRows: Visitor[] | null = v ? v.map(mapVisitor) : null;
    setTasks(tasks);
    setSlots(s);
    setNotifs(n.map(mapNotification));
    if (d) setDrivers(d);
    if (visitorRows) setVisitors(visitorRows);
    if (a) setArrivals(a.map(mapArrival));
    setHydrated(true);

    // Kill a stale alarm that no socket event could ever have reached us.
    // If the app was killed or offline when the assignment was rolled back,
    // the `ongoing` notification is still sitting there — unswipeable — for a
    // job that is no longer ours. This is the authoritative answer: we have
    // just asked the server for everything, so if nothing is waiting on our
    // acceptance, nothing should be ringing.
    const me = userRef.current;
    const myDrvId = me?.role === 'driver' ? me.linkedDriverId ?? null : null;
    if (myDrvId != null) {
      const awaitingMe = tasks.some(x => x.driverId === myDrvId && x.status === 'assigned' && !x.acceptedAt)
        || (visitorRows ?? []).some(x => x.driverId === myDrvId && x.status === 'pending' && !x.acceptedAt);
      if (!awaitingMe) stopAssignmentAlarm().catch(() => {});
    }
  }, [needsOpsData, needsVisitors]);

  // Some socket handlers need the current user without re-subscribing the
  // whole socket on every profile change.
  const userRef = useRef(user);
  userRef.current = user;

  // When a reassign dialog was last raised — see the notification:new
  // handler for why the companion alarm is suppressed right after.
  const reassignShownAt = useRef(0);
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
      setHydrated(false);
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
      // Someone (possibly another valet) just staffed this job — close any
      // open "needs a driver" prompt for it rather than leaving a dialog on
      // screen inviting a second, conflicting assignment.
      if (task.driverId) {
        setReassignPrompt(prev =>
          prev?.kind === 'task' && prev.task?.id === task.id ? null : prev);
      }
      // My assignment just resolved (accepted elsewhere / reassigned /
      // moved on) — stop a still-ringing alarm.
      const me = userRef.current;
      // linkedDriverId ONLY. Driver.id and User.id are separate sequences, so
      // `?? me.id` silently resolves to some other driver's id and this stops
      // (or fails to stop) the alarm on the wrong person's event.
      const myDrvId = me?.role === 'driver' ? me.linkedDriverId ?? null : null;
      if (myDrvId != null && task.driverId !== myDrvId) {
        // it may have been mine a moment ago — harmless if not ringing
        stopAssignmentAlarm().catch(() => {});
      }
    });

    // The server telling THIS driver, specifically, that a job stopped being
    // theirs — rolled back by the accept watchdog, or reassigned by a valet.
    // The alarm notification is `ongoing`, so it cannot be swiped away; if we
    // only inferred this from the broadcast above, a driver who was offline
    // at that moment would be left holding a live-looking alarm forever.
    socket.on('assignment:cancelled', () => {
      stopAssignmentAlarm().catch(() => {});
    });

    socket.on('visitor:upsert', (raw: any) => {
      const visitor = mapVisitor(raw);
      setVisitors(p => upsertById(p, visitor));
      if (visitor.driverId) {
        setReassignPrompt(prev =>
          prev?.kind === 'visitor' && prev.visitor?.id === visitor.id ? null : prev);
      }
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
      // A reassign alert arrives twice: once as `task:needs-reassign` (the
      // in-app dialog, which is actionable) and once as this notification
      // (which rings the alarm). The push has to keep existing — it's the
      // only thing that reaches a valet whose app is closed — but when the
      // dialog is already on screen the ring is the same message a second
      // time. They land within milliseconds of each other, so a short window
      // is enough to tell "companion of the dialog" from "genuinely new".
      if (Date.now() - reassignShownAt.current < 4000) return;
      // Alarm-grade notifications (driver assignment, valet reassign
      // warning) ring loud: native alarm-channel notification + vibration
      // loop. Everything else is a normal tray notification.
      if (n.type === 'alarm') {
        ringAssignmentAlarm(n.title, n.body).catch(() => {});
      } else {
        // Same id the FCM push carries, so the two deliveries of this one
        // event collapse into a single tray entry and a single buzz.
        displayNotification(n.title, n.body, n.type, n.id);
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

    // A retrieval just became someone's alone. Anyone who isn't that valet
    // drops it — otherwise a card they were shown during a recovery
    // broadcast stays on screen with a button that can only 409.
    socket.on('task:restrict', ({id, ownerValetId}: {id: number; ownerValetId: number}) => {
      if (user?.role !== 'valet' || user.id === ownerValetId) return;
      setTasks(p => p.filter(t => t.id !== id));
    });

    // The owner didn't respond in time — this request is now open to
    // everyone, and arrives with the reason to show on the card.
    socket.on('task:recovery', ({task}: any) => {
      setTasks(p => upsertById(p, mapTask(task)));
    });

    socket.on('arrival:upsert', (raw: any) => {
      setArrivals(p => upsertById(p, mapArrival(raw)));
    });
    socket.on('arrival:remove', ({id}: {id: number}) => {
      setArrivals(p => p.filter(a => a.id !== id));
    });

    // ── accept-timeout / reject prompts (valet + admin rooms only) ──
    // One prompt per job, ever, while it's open. The same job legitimately
    // raises this event more than once — first to its owner alone, then to
    // the whole team when it escalates — and the owner is a valet, so they
    // receive both. Without this the second one replaced the first (firing
    // the dialog again) and, because dialogs queue rather than drop, they
    // stacked up one behind another the longer nobody acted.
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

  // A reassign prompt says "this job needs a driver". Derived state, not a
  // one-shot event: the instant the job actually has one — whoever assigned
  // it, and whether or not we saw the socket event that did it — the prompt
  // is describing something untrue and must go. Relying on catching
  // task:upsert alone left it on screen across a backgrounded app or a
  // dropped socket, which is precisely when another valet steps in.
  useEffect(() => {
    if (!reassignPrompt) return;
    const stillNeedsDriver = reassignPrompt.kind === 'task'
      ? tasks.some(t => t.id === reassignPrompt.task?.id && !t.driverId)
      : visitors.some(v => v.id === reassignPrompt.visitor?.id && !v.driverId);
    if (!stillNeedsDriver) setReassignPrompt(null);
  }, [reassignPrompt, tasks, visitors]);

  // The socket is the only thing that keeps state fresh, and `connect` is the
  // only refetch trigger — so a socket that drops without reconnecting (wifi
  // wobble, doze, backgrounded app) leaves the UI frozen indefinitely. That is
  // how a driver ends up staring at an Accept button for a job that was rolled
  // back minutes ago. Coming back to the foreground is the moment the user is
  // about to act on what they see, so it is exactly when it must be true.
  useEffect(() => {
    if (!user) return;
    const sub = RNAppState.addEventListener('change', next => {
      if (next === 'active') fetchAll().catch(() => {});
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

  // A GPS ping is authoritative about ONE thing: where the driver is. It is
  // NOT authoritative about the job's state, so only the position fields are
  // merged and the rest of the local record is left alone.
  //
  // This used to replace the whole task with the ping's response, which put a
  // parked job back on the driver's screen. The driver stands still at the
  // slot, so their pings take the backend's "hasn't moved, skip the write"
  // path, which answers with the row as it was read at the START of that
  // request. Tap Mark Parked while one of those is in flight and its reply
  // lands a moment later still saying `key_collected` — overwriting the
  // completed task and bringing the card back, slot input and all. Nothing
  // corrected it either: the app only refetches on socket connect, so the
  // resurrected card survived until a reconnect or restart.
  const reportLocation = useCallback(async (taskId: number, lat: number, lng: number) => {
    const fresh = mapTask(await tasksApi.updateLocation(taskId, lat, lng));
    setTasks(p => p.map(t => (t.id === taskId
      ? {...t,
         driverLat: fresh.driverLat,
         driverLng: fresh.driverLng,
         locationUpdatedAt: fresh.locationUpdatedAt,
         // Only ever set, never cleared — the start anchor is written once by
         // the first ping and every viewer computes trip progress from it.
         driverStartLat: t.driverStartLat ?? fresh.driverStartLat,
         driverStartLng: t.driverStartLng ?? fresh.driverStartLng,
         trackingProgress: fresh.trackingProgress ?? t.trackingProgress}
      : t)));
  }, []);

  // Single, centralized GPS watcher for the whole app. For drivers it runs
  // for the entire logged-in session (not just during a task): every fix is
  // pushed over the socket so the valet's live map shows ALL reachable
  // drivers; during an active trip the same fix additionally goes through
  // the REST location endpoint, which persists it on the task and emits the
  // task:upsert delta that live-tracking screens render.
  // linkedDriverId only — never fall back to user.id (different sequence),
  // and never match on undefined (an unassigned task serialises driverId as
  // undefined, so `undefined === undefined` claimed every unclaimed job).
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
        // distanceFilter was 5 (meters) — the OS only fires a callback once
        // the phone has physically moved that far, so a driver still
        // standing at the counter (just took the key, hasn't walked off
        // yet) produced NO update at all until they actually started moving.
        // 0 reports every fix the provider delivers, movement or not.
        {enableHighAccuracy: true, distanceFilter: 0, interval: 3000, fastestInterval: 2000},
      );
    };

    watch();
    return () => { cancelled = true; Geolocation.stopObserving(); };
  }, [user?.role, user?.id, reportLocation]);

  // The ambient watch above only reports whenever the OS *happens* to next
  // deliver a fix — if the driver was stationary right when a task became
  // trackable, that could be a real wait. Firing one immediate one-shot fix
  // the moment tracking starts (rather than waiting for the ambient loop's
  // next callback) is what actually closes "the gap" the doctor's live
  // tracking screen sits in "Waiting for driver's location…" for.
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
    // The backend returns the existing task instead of a duplicate on a
    // repeat call — dedupe locally too rather than trusting this call site
    // never races another.
    setTasks(p => (p.some(t => t.id === mapped.id) ? p : [...p, mapped]));
    return mapped.id;
  }, []);

  // Destination is the admin-set fixed valet gate (backend fallback), not
  // this phone's own GPS — the car is always handed back at the same fixed
  // entrance regardless of exactly where the doctor is standing when they
  // tap the button (see "CAR READY AT ENTRANCE — please collect at the
  // gate"), and capturing live GPS here was exactly as fragile as an
  // emulator's default location was for parking.
  const requestRetrieval = useCallback(async (plannedDepartureMinutes: number) => {
    const created = mapTask(await tasksApi.requestRetrieval({plannedDepartureMinutes}));
    // upsertById — same reasoning as addVisitor above: the backend's own
    // task:upsert broadcast for this row can land before this response
    // does, and a blind prepend didn't check for that already having
    // happened.
    setTasks(p => upsertById(p, created));
    // No notification is fired from here. The backend raises it inside the
    // same operation, addressed to the one valet who owns this doctor's
    // parking session. This used to broadcast to the whole `valet` role from
    // the DOCTOR's phone, which reached every valet regardless of ownership —
    // silently undoing the owner-only routing, and ringing the owner twice.
    return created.id;
  }, []);

  // Doctor/staff: "I'm on my way" — no car/key involved yet, just a
  // heads-up ETA for the valet queue. The backend auto-clears this the
  // moment a real park task is created for the same doctor.
  const sendArrivalNotice = useCallback(async (eta: number) => {
    await arrivalsApi.create(eta);
    // The valet's list updates from the arrival:upsert socket delta this
    // creates, which is also what moves the blue inbox count.
    // No notification at all — not alarm, not info. An arrival is not work:
    // nothing can be accepted or assigned until a key physically changes
    // hands. The valet's only cue is the blue count on the inbox icon, which
    // is what makes twenty people announcing themselves cost twenty rows in
    // a searchable list instead of twenty interruptions. It also closes the
    // repeat-tap flood: the notice dedupes to one open row per doctor, while
    // a push fired once per tap.
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

  // Valet: "Accept Retrieval".
  const acceptRetrieval = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.acceptRetrieval(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  // Doctor/staff: call off a departure request. The valet (and any assigned
  // driver) are told by the backend inside the same operation, so a doctor
  // whose phone dies right after tapping this still can't leave a valet
  // walking out to a car nobody is coming for.
  const cancelMyRetrieval = useCallback(async (taskId: number) => {
    const updated = mapTask(await tasksApi.cancelMyRetrieval(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const assignDriver = useCallback(async (taskId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    // Only a retrieval needs a destination at all — that's the valet's own
    // location right now, the actual physical handover point, captured
    // fresh on every assignment (so it naturally works for whichever valet
    // happens to be doing the assigning, not one fixed shared point).
    const task = tasks.find(t => t.id === taskId);
    const coords = task?.type === 'retrieve' ? await getCurrentPositionSafe() : null;
    const updated = mapTask(await tasksApi.assignDriver(taskId, driverId, coords ? {lat: coords.lat, lng: coords.lng} : undefined));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: taskId} : d)));
  }, [tasks]);

  // Valet: give up on a driver who hasn't accepted yet, right now, instead
  // of waiting out the accept-timeout window. The job itself is untouched —
  // just back to "needs a driver".
  const cancelTaskAssignment = useCallback(async (taskId: number) => {
    const freedDriverId = tasks.find(t => t.id === taskId)?.driverId;
    const updated = mapTask(await tasksApi.cancelAssignment(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
    if (freedDriverId != null) setDrivers(p => p.map(d => (d.id === freedDriverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
  }, [tasks]);

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
    if (myDriverId != null) setDrivers(p => p.map(d => (d.id === myDriverId ? {...d, status: 'available', currentTaskId: undefined} : d)));
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

  // Past the key handover a plain cancel isn't allowed (a real car is in a
  // driver's hands) — this recalls it instead: the driver is told to bring
  // it back, and the valet confirms receipt to close it out.
  const recallTask = useCallback(async (taskId: number) => {
    const updated = mapTask(await tasksApi.recall(taskId));
    setTasks(p => p.map(t => (t.id === taskId ? updated : t)));
  }, []);

  const markTaskReturned = useCallback(async (taskId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapTask(await tasksApi.markReturned(taskId));
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
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: visitorId} : d)));
  }, []);

  // Valet: give up on a driver who hasn't accepted this pickup yet, right
  // now, instead of waiting out the accept-timeout window. Token untouched.
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

  // "Bring my car back" — the key's already with a driver, so the linked
  // ParkingTask (not the Visitor row — see backend recallVisitor) is what
  // actually flips to recalled; that arrives here over the socket's normal
  // task:upsert event. This just fires the request and refreshes the
  // visitor row for anything it does mirror (e.g. driverName).
  const recallVisitor = useCallback(async (visitorId: number) => {
    const updated = mapVisitor(await visitorsApi.recall(visitorId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
  }, []);

  const assignRetrievalDriver = useCallback(async (visitorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const updated = mapVisitor(await visitorsApi.assignRetrievalDriver(visitorId, driverId));
    setVisitors(p => p.map(v => (v.id === visitorId ? updated : v)));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: visitorId} : d)));
  }, []);

  // Valet-initiated "Request retrieval" for a staff/doctor member — the
  // staff/doctor equivalent of assignRetrievalDriver above. Captures the
  // valet's own live location the same way the regular assignDriver does for
  // a retrieve task: that's the real physical handover point the driver is
  // bringing the car back to. Uses upsertById (not a targeted map) because
  // this can create a brand-new retrieve task that isn't in local state yet,
  // not just update an existing one.
  const assignStaffRetrievalDriver = useCallback(async (doctorId: number, driverId: number) => {
    await stopAssignmentAlarm().catch(() => {});
    const coords = await getCurrentPositionSafe();
    const updated = mapTask(await tasksApi.assignRetrievalDriverForDoctor(
      doctorId, driverId, coords ? {lat: coords.lat, lng: coords.lng} : undefined,
    ));
    setTasks(p => upsertById(p, updated));
    setDrivers(p => p.map(d => (d.id === driverId ? {...d, status: 'busy', currentTaskId: updated.id} : d)));
  }, []);

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
      drivers, tasks, slots, visitors, arrivalNotices, notifications, hydrated,
      driverLocations, onlineDriverIds, reassignPrompt, clearReassignPrompt,
      addTask, requestRetrieval, cancelMyRetrieval, sendArrivalNotice, acceptRetrieval, dismissArrivalNotice, updateTask, assignDriver, cancelTaskAssignment, acceptTask, rejectTask, markKeyCollected, markParked, markRetrieved, confirmTaskDelivered, cancelTask, recallTask, markTaskReturned, fetchTaskHistory, reportLocation,
      setDriverStatus, addVisitor,
      assignVisitorDriver, cancelVisitorAssignment, cancelVisitor, recallVisitor,
      assignRetrievalDriver, assignStaffRetrievalDriver, confirmVisitorDelivered,
      pushNotification, markNotificationRead, clearNotifications, refreshTasks: fetchAll,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppState() { return useContext(Ctx); }
