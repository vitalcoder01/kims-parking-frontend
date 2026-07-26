import {useEffect, useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useAppState} from '../context/AppStateContext';

// Shared by DoctorHomeScreen and ParkingScreen so both read the exact same
// real, backend-tracked retrieval state (and the same countdown) instead of
// each keeping its own local, unpersisted "I picked a time" flag — that
// duplication was why the timer looked like it "disappeared" depending on
// which tab you were on.
export function useRetrievalRequest() {
  const {user} = useAuth();
  const {tasks, requestRetrieval} = useAppState();

  const myTasks = tasks.filter(t => t.doctorId === user?.id);
  const activeRetrieve = myTasks.find(t => t.type === 'retrieve' && t.status !== 'completed');

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!activeRetrieve) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [activeRetrieve?.id]);

  const remainingSeconds = activeRetrieve?.requestedAt != null && activeRetrieve?.eta != null
    ? Math.max(0, Math.round((activeRetrieve.requestedAt + activeRetrieve.eta * 60000 - now) / 1000))
    : null;

  return {activeRetrieve, remainingSeconds, requestRetrieval};
}
