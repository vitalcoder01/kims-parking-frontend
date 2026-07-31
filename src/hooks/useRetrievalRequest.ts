import {useEffect, useState} from 'react';
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

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!activeRetrieve) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [activeRetrieve?.id]);

  // `now` ticks so callers can derive real elapsed time. There is no
  // deadline clock any more — the doctor's planned departure is never
  // rendered back to them as an estimate (see utils/retrievalClocks).
  return {activeRetrieve, now, requestRetrieval};
}
