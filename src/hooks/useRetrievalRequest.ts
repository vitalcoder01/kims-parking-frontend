import {useAuth} from '../context/AuthContext';
import {useAppState} from '../context/AppStateContext';


// Reads the real, backend-tracked retrieval state (and its countdown)
// rather than a local, unpersisted "I picked a time" flag. Originally shared
// with a separate "My Parking" tab; that tab duplicated the Home screen and
// was removed, but keeping this here means the countdown stays a single
// source of truth if another surface ever needs it.
export function useRetrievalRequest() {
  const {user} = useAuth();
  const {tasks, requestRetrieval} = useAppState();

  const myTasks = tasks.filter(t => t.doctorId === user?.id);
  const activeRetrieve = myTasks.find(t => t.type === 'retrieve' && t.status !== 'completed' && t.status !== 'cancelled');

  // No clock here any more. This used to tick every second so callers
  // could derive elapsed time, but the only thing that ever read it was a
  // mm:ss counter that has since been removed — the doctor's planned
  // departure is never rendered back to them as an estimate (see
  // utils/retrievalClocks). What was left re-rendered the whole Home
  // screen once a second to produce identical output. Whether a driver has
  // set off is `activeRetrieve.startedAt != null`, which needs no clock.
  return {activeRetrieve, requestRetrieval};
}
