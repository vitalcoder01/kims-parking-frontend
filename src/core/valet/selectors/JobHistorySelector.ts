import type {ParkingTask, Visitor} from '../../../context/AppStateContext';

/**
 * The Jobs page's Active/Completed/All classification — ported verbatim
 * from ValetRecordsScreen's inline latestTaskByDoctor/canRequestStaffRetrieval/
 * isStaffRowActive, plus the visitor status check that used to live
 * directly in the `.filter()` chain.
 */
export type StatusFilter = 'all' | 'active' | 'completed';

/** A doctor's most recent task tells us whether their session is still
 *  open: history has every park + retrieve row ever, staff and visitor
 *  alike, so "parked, nothing pending" is only true when the LATEST row
 *  for that doctor is a completed park (a later retrieve row, of any
 *  status, means one's already in flight or done). */
export function buildLatestTaskByDoctor(staffHistory: ParkingTask[]): Map<number, ParkingTask> {
  const latest = new Map<number, ParkingTask>();
  for (const t of staffHistory) {
    if (t.isVisitor) continue;
    const prev = latest.get(t.doctorId);
    if (!prev || t.id > prev.id) latest.set(t.doctorId, t);
  }
  return latest;
}

export function canRequestStaffRetrieval(t: ParkingTask, latestTaskByDoctor: Map<number, ParkingTask>): boolean {
  return t.type === 'park' && t.status === 'completed' && latestTaskByDoctor.get(t.doctorId)?.id === t.id;
}

/** Active/Completed here means "is the car back with its owner yet", not
 *  the raw per-row status — a park row's own status turns 'completed' the
 *  moment the car is PARKED, well before anyone's picked it up again. A
 *  park row stays Active while it's still the doctor's open session (see
 *  canRequestStaffRetrieval); a retrieve row is Active until the valet
 *  actually confirms the handover (status -> 'completed'), which is also
 *  the moment its paired park row stops being "latest" and flips too. */
export function isStaffRowActive(t: ParkingTask, latestTaskByDoctor: Map<number, ParkingTask>): boolean {
  if (t.status === 'cancelled') return false; // same convention as elsewhere: cancelled only shows under "All"
  if (t.type === 'retrieve') return t.status !== 'completed';
  return t.status !== 'completed' || latestTaskByDoctor.get(t.doctorId)?.id === t.id;
}

export function matchesStaffStatusFilter(
  t: ParkingTask,
  filter: StatusFilter,
  latestTaskByDoctor: Map<number, ParkingTask>,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return !isStaffRowActive(t, latestTaskByDoctor) && t.status !== 'cancelled';
  return isStaffRowActive(t, latestTaskByDoctor);
}

/** Visitor equivalent — activeVisitors is already pre-filtered to exclude
 *  retrieved/cancelled rows (see useValetActions), so this is deliberately
 *  the same simple check the screen already did inline, just named. */
export function matchesVisitorStatusFilter(v: Visitor, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'completed' ? v.status === 'retrieved' : v.status !== 'retrieved';
}
