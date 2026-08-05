import type {ParkingTask, ParkingSlot} from '../../../context/AppStateContext';
import {isMyJobToRun} from '../services/OwnershipService';
import {departurePriority} from '../../../utils/retrievalClocks';

/**
 * Centralizes the Dashboard's 4-section grouping — ported verbatim from
 * ValetHomeScreen's inline isAssignPending/isAcceptPending/isNotCompleted/
 * isJobInProgress predicates and the dashboardJobs/dashboardMine/
 * dashboardTeam/parkedVehicles derivations. Same statuses, same section
 * names, same My/Team split.
 */
export const isAssignPending = (t: ParkingTask): boolean =>
  (t.status === 'assigned' && !t.driverId) || t.status === 'requested' || t.status === 'accepted';

export const isAcceptPending = (t: ParkingTask): boolean =>
  t.status === 'assigned' && !!t.driverId && !t.acceptedAt;

export const isNotCompleted = (t: ParkingTask): boolean =>
  t.status === 'delivered';

export const isJobInProgress = (t: ParkingTask): boolean =>
  !isAssignPending(t) && !isAcceptPending(t) && !isNotCompleted(t);

export interface DashboardSections {
  mine: ParkingTask[];
  team: ParkingTask[];
  forTab: ParkingTask[];
  assignPendingJobs: ParkingTask[];
  acceptPendingJobs: ParkingTask[];
  inProgressJobs: ParkingTask[];
  notCompletedJobs: ParkingTask[];
}

/**
 * `activeTasks` and `retrievalRequests` merge into one list — the old
 * standalone Retrieval Requests inbox is gone, an unclaimed retrieval is
 * just another job that needs a driver now.
 */
export function selectDashboardSections(
  activeTasks: ParkingTask[],
  retrievalRequests: ParkingTask[],
  myValetId: number | null | undefined,
  queueTab: 'mine' | 'team',
): DashboardSections {
  const dashboardJobs = [...activeTasks, ...retrievalRequests];
  const mine = dashboardJobs.filter(t => isMyJobToRun(t, myValetId));
  const team = dashboardJobs.filter(t => !isMyJobToRun(t, myValetId));
  const forTab = queueTab === 'mine' ? mine : team;

  return {
    mine,
    team,
    forTab,
    assignPendingJobs: forTab.filter(isAssignPending),
    acceptPendingJobs: forTab.filter(isAcceptPending),
    inProgressJobs: forTab.filter(isJobInProgress),
    notCompletedJobs: forTab.filter(isNotCompleted),
  };
}

/**
 * Parked Vehicles — not scoped by the My/Team split at all (a parked car
 * isn't anyone's active job, it's just sitting in its slot). Every
 * occupied slot with no live (non-terminal) retrieve task against it —
 * occupancy alone isn't "sitting idle", it also needs no retrieval
 * currently in flight, or a car mid-retrieval would double-count as both
 * parked and in progress.
 */
export function selectParkedVehicles(slots: ParkingSlot[], tasks: ParkingTask[]): ParkingSlot[] {
  return slots.filter(sl => sl.status === 'occupied' && !tasks.some(t =>
    t.type === 'retrieve' && t.slotId === sl.id && t.status !== 'completed' && t.status !== 'cancelled'));
}

/**
 * Which unassigned job gets a driver next. Drive time to wherever the car
 * actually gets parked varies job to job (never a fixed distance) — the
 * only thing that reliably says "this one's more urgent" is either a real
 * deadline (a retrieval with a planned departure) or, absent that, simply
 * how long it's already been waiting.
 *
 * Tier 1 — retrievals with an explicit planned departure, most urgent/
 * overdue first (same ranking the old Retrieval Requests inbox used).
 * Tier 2 — everything else (park jobs, and retrievals with no departure
 * given), oldest-first — a job nobody's picked up in 20 minutes should
 * dispatch before one that landed 30 seconds ago.
 */
export function sortAssignPendingByUrgency(jobs: ParkingTask[], now: number): ParkingTask[] {
  const age = (t: ParkingTask) => now - (t.requestedAt ?? t.assignedAt ?? now);
  const hasDeadline = (t: ParkingTask) => t.type === 'retrieve' && t.plannedDepartureMinutes != null;
  return [...jobs].sort((a, b) => {
    const aDeadline = hasDeadline(a), bDeadline = hasDeadline(b);
    if (aDeadline !== bDeadline) return aDeadline ? -1 : 1; // deadline jobs sort before FIFO ones
    if (aDeadline && bDeadline) {
      return departurePriority(a.requestedAt, a.plannedDepartureMinutes, now)
        - departurePriority(b.requestedAt, b.plannedDepartureMinutes, now);
    }
    return age(b) - age(a); // oldest (longest-waiting) first
  });
}
