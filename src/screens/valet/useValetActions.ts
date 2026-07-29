import {useAppState, Visitor} from '../../context/AppStateContext';

// Shared valet data + mutations, used by the Queue, Requests, and Visitors
// screens (three separate bottom tabs) so none of them re-derive the same
// filters or duplicate the assign/notify logic.
export function useValetActions() {
  const {drivers, tasks, visitors, addTask, assignDriver, markKeyCollected, pushNotification, addVisitor,
    assignVisitorDriver, assignRetrievalDriver, cancelVisitor,
    confirmTaskDelivered, confirmVisitorDelivered} = useAppState();

  // "Active Tasks" = already assigned to a driver — a bare 'requested'
  // retrieval isn't a task for anyone to act on yet. Includes 'delivered'
  // (awaiting the valet's pickup confirmation) — same job, same card, the
  // action button just changes rather than living in a separate list.
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'requested');
  // Least-busy first — every job fully occupies a driver, so among the
  // available pool "fewest jobs completed today" is the fairest tiebreaker.
  const availableDrivers = drivers
    .filter(d => d.status === 'available')
    .sort((a, b) => (a.completedToday ?? 0) - (b.completedToday ?? 0));
  // Pending retrieval requests — created only by the doctor/staff who owns
  // the car. The valet's job here is strictly to assign a driver.
  const retrievalRequests = tasks.filter(t => t.type === 'retrieve' && t.status === 'requested');
  const activeVisitors = visitors.filter(v => v.status !== 'retrieved' && v.status !== 'cancelled');
  // A visitor's driverId is reused from the park leg and isn't cleared until
  // retrieval completes, so checking the driver's own currentTaskId is what
  // disambiguates "actively out on this retrieval right now".
  const hasActiveRetrievalDriver = (v: Visitor) => drivers.some(d => d.currentTaskId === v.id && d.status === 'busy');

  const assignTaskDriver = async (taskId: number, driverId: number) => {
    const task = tasks.find(t => t.id === taskId);
    const isRetrieve = task?.type === 'retrieve';
    await assignDriver(taskId, driverId);
    pushNotification({
      // targetRole alone fully identifies the recipient — the backend
      // resolves 'driver:<id>' to that driver's actual user id. Do NOT also
      // pass targetId: driverId here — Driver.id and User.id are separate
      // sequences that can numerically collide with an unrelated account
      // (e.g. driver id 1 vs a doctor whose own user id is also 1), and
      // targetUserId is matched directly against the users table.
      targetRole: `driver:${driverId}`,
      title: isRetrieve ? '🔔 Retrieval Task!' : '🔔 Task Assigned!',
      body: isRetrieve
        ? `Retrieve ${task?.carNumber} from slot ${task?.slotId} for ${task?.doctorName}.`
        : `Collect key from valet for ${task?.doctorName}'s car (${task?.carNumber}).`,
      type: 'alarm',
    });
  };

  const assignVisitorPickupDriver = async (visitorId: number, driverId: number) => {
    const visitor = visitors.find(v => v.id === visitorId);
    await assignVisitorDriver(visitorId, driverId);
    pushNotification({
      targetRole: `driver:${driverId}`,
      title: '🔔 Visitor Car Pickup!',
      body: `Collect key from valet for ${visitor?.name}'s car (${visitor?.carNumber}).`,
      type: 'alarm',
    });
  };

  const assignVisitorRetrievalDriver = async (visitorId: number, driverId: number) => {
    const visitor = visitors.find(v => v.id === visitorId);
    await assignRetrievalDriver(visitorId, driverId);
    pushNotification({
      targetRole: `driver:${driverId}`,
      title: '🔔 Visitor Retrieval!',
      body: `Bring ${visitor?.carNumber} from slot ${visitor?.slotId} back for ${visitor?.name}.`,
      type: 'alarm',
    });
  };

  return {
    drivers, tasks, visitors, addTask, addVisitor, pushNotification, markKeyCollected, cancelVisitor,
    activeTasks, availableDrivers, retrievalRequests, activeVisitors, hasActiveRetrievalDriver,
    assignTaskDriver, assignVisitorPickupDriver, assignVisitorRetrievalDriver,
    confirmTaskDelivered, confirmVisitorDelivered,
  };
}
