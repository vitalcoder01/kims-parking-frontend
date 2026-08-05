import type {ParkingTask, ParkingSlot} from '../../../context/AppStateContext';
import {isMyJobToRun} from '../services/OwnershipService';

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
