import type {ParkingTask, Visitor, Driver} from '../../context/AppStateContext';

/*
 * What the app can already see but never says out loud.
 *
 * Every rule below reads state the screen already holds and answers a
 * question a person would otherwise work out by scanning a list: which car
 * has sat all day, whether there are enough drivers for the next fifteen
 * minutes, which driver is holding a job they never accepted.
 *
 * Pure functions on purpose — no React, no timers, no platform APIs. That
 * makes the rules testable, and lets mobile and web share one definition of
 * "this is worth mentioning" the way core/valet already shares one
 * definition of "this job is yours to run".
 *
 * ── The rule that governs every other rule ───────────────────────────────
 *
 * Each role's app fetches a DIFFERENT set of collections (AppStateContext's
 * needsOpsData / needsVisitors gates):
 *
 *     tasks     every role
 *     visitors  valet, admin, driver
 *     drivers   valet, admin        <- nobody else
 *
 * A rule reading `drivers` on a doctor's phone sees an empty array and
 * concludes, with total confidence, that no driver is free. An empty
 * collection because nobody fetched it is indistinguishable from an empty
 * collection because the world is empty — and the second reading is alarming
 * and wrong. So rules are dispatched per role and each may only touch what
 * its role actually receives. That constraint is the reason this file is
 * organised by role rather than by rule.
 */

export type CopilotRole = 'valet' | 'admin' | 'driver' | 'doctor' | 'staff';

export type InsightSeverity = 'critical' | 'warn' | 'info';

export type InsightKind =
  | 'stale_parked'
  | 'retrieval_crunch'
  | 'driver_not_accepting'
  | 'unstaffed_retrieval'
  | 'car_ready'
  | 'retrieval_stalled'
  | 'job_unaccepted'
  | 'location_off'
  | 'offline';

export interface Insight {
  /**
   * Stable across renders for the same underlying situation. This is what
   * lets a surface dedupe, and lets a dismissal stick to the situation
   * rather than to whichever render happened to raise it.
   */
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  /** One line, phrased as the thing that is true — never as an instruction. */
  message: string;
  /** Optional follow-up a surface may offer as a button. Offering only: the
   *  co-pilot never performs an operational action by itself. */
  action?: {
    label: string;
    target: 'records' | 'dashboard' | 'map' | 'home';
    taskId?: number;
    visitorId?: number;
  };
}

export interface InsightContext {
  role: CopilotRole;
  /** The signed-in user's id — a doctor's own tasks are found by this. */
  userId?: number;
  /** Set only for drivers; their own jobs are found by this. */
  driverId?: number | null;
  tasks: ParkingTask[];
  /** Empty for doctor/staff — never reason about absence here. */
  visitors: Visitor[];
  /** Empty for everyone except valet/admin — never reason about absence here. */
  drivers: Driver[];
  connected: boolean;
  /** True once the first fetch has landed. Before that every list is empty
   *  for the boring reason, and silence is the only honest output. */
  hydrated: boolean;
  now: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Parked this long with nobody asking reads as forgotten, not busy. */
const STALE_PARKED_MS = 4 * HOUR;
/** How long a driver may hold an unaccepted job before it is worth saying. */
const ACCEPT_GRACE_MS = 2 * MIN;
/** A retrieval with nobody on it after this long is a person standing waiting. */
const UNSTAFFED_MS = 5 * MIN;
/** A doctor who asked this long ago and sees no movement deserves an answer. */
const DOCTOR_STALLED_MS = 12 * MIN;
/** A driver's own job left unaccepted this long is about to be reassigned. */
const DRIVER_UNACCEPTED_MS = 45_000;
/** How far ahead "due out soon" looks when checking driver cover. */
const CRUNCH_WINDOW_MIN = 15;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isLive = (t: ParkingTask) => t.status !== 'completed' && t.status !== 'cancelled';

/**
 * The one entry point. Dispatches to the rules that role's data can support.
 */
export function selectInsights(ctx: InsightContext): Insight[] {
  /*
   * Two states where the only honest answer is silence, or near it.
   *
   * Before hydration every collection is empty because nothing has arrived
   * yet. While disconnected they are a snapshot of whenever the socket
   * dropped. Announcing "no drivers free" from either would read as fact and
   * send someone chasing a problem that may not exist.
   */
  if (!ctx.hydrated) return [];
  if (!ctx.connected) {
    return [{
      id: 'offline',
      kind: 'offline',
      severity: 'warn',
      message: 'Not connected — what you are seeing may be out of date.',
    }];
  }

  switch (ctx.role) {
    case 'valet':
    case 'admin':
      return rank(opsInsights(ctx));
    case 'driver':
      return rank(driverInsights(ctx));
    case 'doctor':
    case 'staff':
      return rank(ownerInsights(ctx));
    default:
      return [];
  }
}

// ── Valet / admin: the whole floor ───────────────────────────────────────
// The only roles holding the drivers roster, so the only ones that may
// reason about staffing.
function opsInsights(ctx: InsightContext): Insight[] {
  const {tasks, visitors, drivers, now} = ctx;
  const out: Insight[] = [];

  const unstaffed = tasks.filter(t =>
    t.type === 'retrieve' && (t.status === 'requested' || t.status === 'accepted')
    && t.driverId == null && t.requestedAt != null && now - t.requestedAt > UNSTAFFED_MS);

  if (unstaffed.length) {
    out.push({
      id: `unstaffed_retrieval:${unstaffed.map(t => t.id).sort().join(',')}`,
      kind: 'unstaffed_retrieval',
      severity: 'critical',
      message: `${plural(unstaffed.length, 'retrieval has', 'retrievals have')} had no driver for over ${UNSTAFFED_MS / MIN} min.`,
      action: {label: 'Assign', target: 'dashboard', taskId: unstaffed[0].id},
    });
  }

  /*
   * More cars due out than hands free to fetch them.
   *
   * Counts only drivers with nothing in hand: a driver mid-job is not cover
   * for a departure fifteen minutes away, and counting them is how a
   * staffing warning turns into reassuring nonsense.
   */
  const freeDrivers = drivers.filter(d => d.status === 'available').length;
  const dueSoon = tasks.filter(t => {
    if (t.type !== 'retrieve' || !isLive(t)) return false;
    if (t.requestedAt == null || t.plannedDepartureMinutes == null) return false;
    return (t.requestedAt + t.plannedDepartureMinutes * MIN - now) / MIN <= CRUNCH_WINDOW_MIN;
  }).length;

  if (dueSoon > 0 && dueSoon > freeDrivers) {
    out.push({
      id: `retrieval_crunch:${dueSoon}v${freeDrivers}`,
      kind: 'retrieval_crunch',
      severity: dueSoon - freeDrivers >= 3 ? 'critical' : 'warn',
      message: `${plural(dueSoon, 'car is', 'cars are')} due out within ${CRUNCH_WINDOW_MIN} min and ${
        freeDrivers === 0 ? 'no driver is' : `only ${plural(freeDrivers, 'driver is', 'drivers are')}`
      } free.`,
      action: {label: 'Open dashboard', target: 'dashboard'},
    });
  }

  for (const t of tasks.filter(t =>
    t.status === 'assigned' && t.driverId != null && t.acceptedAt == null
    && t.assignedAt != null && now - t.assignedAt > ACCEPT_GRACE_MS)) {
    out.push({
      id: `driver_not_accepting:${t.id}`,
      kind: 'driver_not_accepting',
      severity: 'warn',
      message: `${t.driverName ?? 'A driver'} has not accepted ${t.carNumber} for ${Math.floor((now - (t.assignedAt ?? now)) / MIN)} min.`,
      action: {label: 'Reassign', target: 'dashboard', taskId: t.id},
    });
  }

  const stale = visitors.filter(v =>
    v.status === 'parked' && !v.retrievalRequested
    && v.pickedUpAt != null && now - v.pickedUpAt > STALE_PARKED_MS);

  if (stale.length) {
    const first = stale[0];
    out.push({
      id: `stale_parked:${stale.map(v => v.id).sort().join(',')}`,
      kind: 'stale_parked',
      severity: 'info',
      message: stale.length === 1
        ? `${first.carNumber} has been parked ${Math.floor((now - (first.pickedUpAt ?? now)) / HOUR)}h with no retrieval request.`
        : `${plural(stale.length, 'car has', 'cars have')} been parked over ${STALE_PARKED_MS / HOUR}h with no retrieval request.`,
      action: {label: 'Review', target: 'records', visitorId: stale.length === 1 ? first.id : undefined},
    });
  }

  return out;
}

// ── Driver: only their own jobs ──────────────────────────────────────────
function driverInsights(ctx: InsightContext): Insight[] {
  const {tasks, driverId, now} = ctx;
  if (driverId == null) return [];
  const out: Insight[] = [];
  const mine = tasks.filter(t => t.driverId === driverId && isLive(t));

  // Their own unaccepted job — the one thing a driver can lose by ignoring,
  // since the watchdog reassigns it.
  for (const t of mine.filter(t =>
    t.status === 'assigned' && t.acceptedAt == null
    && t.assignedAt != null && now - t.assignedAt > DRIVER_UNACCEPTED_MS)) {
    out.push({
      id: `job_unaccepted:${t.id}`,
      kind: 'job_unaccepted',
      severity: 'critical',
      message: `${t.carNumber} is waiting on you to accept — it will be reassigned if you do not.`,
      action: {label: 'Open', target: 'dashboard', taskId: t.id},
    });
  }

  /*
   * Moving a car with no position reaching the server.
   *
   * The valet's map and the doctor's tracking page both read locationUpdatedAt;
   * when it is missing mid-job they simply see nothing, with no clue why. The
   * driver is the only person who can fix it and the only one not told.
   */
  const enRoute = mine.find(t => t.status === 'in_transit' || t.status === 'key_collected');
  if (enRoute && enRoute.startedAt != null && now - enRoute.startedAt > 2 * MIN && enRoute.locationUpdatedAt == null) {
    out.push({
      id: `location_off:${enRoute.id}`,
      kind: 'location_off',
      severity: 'warn',
      message: 'Your location is not reaching the valet desk — check location permission.',
    });
  }

  return out;
}

// ── Doctor / staff: only their own car ───────────────────────────────────
// No visitors, no drivers roster. Everything here comes from their own tasks.
function ownerInsights(ctx: InsightContext): Insight[] {
  const {tasks, userId, now} = ctx;
  if (userId == null) return [];
  const out: Insight[] = [];
  const mine = tasks.filter(t => t.doctorId === userId && isLive(t));

  const ready = mine.find(t => t.type === 'retrieve' && t.status === 'delivered');
  if (ready) {
    out.push({
      id: `car_ready:${ready.id}`,
      kind: 'car_ready',
      severity: 'critical',
      message: `${ready.carNumber} is waiting for you at the entrance.`,
      action: {label: 'View', target: 'home', taskId: ready.id},
    });
  }

  // Asked a while ago and still nobody assigned. Says only what is true —
  // that it has not been picked up yet — and deliberately promises no ETA,
  // for the same reason the countdown was removed from this screen.
  const stalled = mine.find(t =>
    t.type === 'retrieve' && t.driverId == null
    && t.requestedAt != null && now - t.requestedAt > DOCTOR_STALLED_MS);

  if (stalled) {
    out.push({
      id: `retrieval_stalled:${stalled.id}`,
      kind: 'retrieval_stalled',
      severity: 'warn',
      message: `Your request was made ${Math.floor((now - (stalled.requestedAt ?? now)) / MIN)} min ago and has not been picked up yet.`,
      action: {label: 'View', target: 'home', taskId: stalled.id},
    });
  }

  return out;
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = {critical: 0, warn: 1, info: 2};

/**
 * Worst first, and capped.
 *
 * The cap is the point. A surface listing nine things is one people learn to
 * skip, and the entire value here is that when it speaks, it is worth
 * reading.
 */
export function rank(insights: Insight[], limit = 3): Insight[] {
  return [...insights]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, limit);
}
