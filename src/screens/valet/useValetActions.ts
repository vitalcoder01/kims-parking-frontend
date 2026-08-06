import {useAppState, Visitor, ParkingTask} from '../../context/AppStateContext';
import {useAuth} from '../../context/AuthContext';
import {canView, canRun} from '../../core/valet/services/OwnershipService';

// Shared valet data + mutations, used by the Queue, Requests, and Visitors
// screens (three separate bottom tabs) so none of them re-derive the same
// filters or duplicate the assign/notify logic.
//
// Ownership rules themselves now live in core/valet/services/OwnershipService
// (Phase 1 of VALET_ARCHITECTURE_REFACTOR.md) — re-exported here under their
// original names so no existing import elsewhere has to change.
export const isMyRetrieval = canView;
export const isMyJobToRun = canRun;

export function useValetActions() {
  const {drivers, tasks, visitors, arrivalNotices, dismissArrivalNotice, addTask, assignDriver, cancelTaskAssignment, markKeyCollected, pushNotification, addVisitor,
    assignVisitorDriver, cancelVisitorAssignment, assignRetrievalDriver, assignStaffRetrievalDriver, cancelVisitor, recallVisitor,
    confirmTaskDelivered, confirmVisitorDelivered, cancelTask, recallTask, fetchTaskHistory,
    acceptRetrieval} = useAppState();
  const {user} = useAuth();
  const myValetId = user?.role === 'valet' ? user.id : null;

  // "Active Tasks" = already assigned to a driver — a bare 'requested'
  // retrieval isn't a task for anyone to act on yet. Includes 'delivered'
  // (awaiting the valet's pickup confirmation) — same job, same card, the
  // action button just changes rather than living in a separate list.
  // 'accepted' joins 'requested' as "not a job yet": a valet has taken
  // ownership of the departure but no driver is on it, so it still belongs in
  // the retrieval inbox rather than the queue of jobs in progress.
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'requested' && t.status !== 'accepted' && t.status !== 'cancelled');
  // Least-busy first — every job fully occupies a driver, so among the
  // available pool "fewest jobs completed today" is the fairest tiebreaker.
  const availableDrivers = drivers
    .filter(d => d.status === 'available')
    .sort((a, b) => (a.completedToday ?? 0) - (b.completedToday ?? 0));
  // Pending retrieval requests — created only by the doctor/staff who owns
  // the car. The valet's job here is strictly to assign a driver.
  // The backend already refuses to send a valet a departure that isn't
  // theirs, so this is only a second line of defence against a card left over
  // from before ownership changed hands — but it's the difference between a
  // stale card and a button that can only fail.
  const retrievalRequests = tasks.filter(t =>
    t.type === 'retrieve'
    && (t.status === 'requested' || t.status === 'accepted')
    && isMyRetrieval(t, myValetId));
  const activeVisitors = visitors.filter(v => v.status !== 'retrieved' && v.status !== 'cancelled');
  // A visitor's driverId is reused from the park leg and isn't cleared until
  // retrieval completes, so checking the driver's own currentTaskId is what
  // disambiguates "actively out on this retrieval right now".
  const hasActiveRetrievalDriver = (v: Visitor) => drivers.some(d => d.currentTaskId === v.id && d.status === 'busy');

  // The driver's assignment alert is sent by the backend now, inside the
  // same operation that creates the assignment — firing it from here meant a
  // valet whose phone died (or lost signal) in the gap right after the
  // assign call left a real assignment the driver was never told about.
  const assignTaskDriver = async (taskId: number, driverId: number) => {
    await assignDriver(taskId, driverId);
  };

  const assignVisitorPickupDriver = async (visitorId: number, driverId: number) => {
    await assignVisitorDriver(visitorId, driverId);
  };

  const assignVisitorRetrievalDriver = async (visitorId: number, driverId: number) => {
    await assignRetrievalDriver(visitorId, driverId);
  };

  return {
    drivers, tasks, visitors, dismissArrivalNotice, addTask, addVisitor, pushNotification, markKeyCollected, cancelVisitor, recallVisitor,
    // Every valet sees every expected arrival — it is a heads-up, not a job,
    // so there is nothing to claim and nobody to filter it for.
    arrivalNotices,
    acceptRetrieval, myValetId,
    activeTasks, availableDrivers, retrievalRequests, activeVisitors, hasActiveRetrievalDriver,
    assignTaskDriver, assignVisitorPickupDriver, assignVisitorRetrievalDriver, assignStaffRetrievalDriver,
    cancelTaskAssignment, cancelVisitorAssignment,
    confirmTaskDelivered, confirmVisitorDelivered, cancelTask, recallTask, fetchTaskHistory,
  };
}
