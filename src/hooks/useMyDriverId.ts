import {useAuth} from '../context/AuthContext';

/**
 * The signed-in driver's Driver.id, or null if this user isn't a driver.
 *
 * Two traps this exists to close, both of which showed up as a driver seeing
 * a job that was never theirs:
 *
 * 1. There used to be a `?? user.id` fallback. Driver.id and User.id are
 *    separate sequences, so that silently resolves to a DIFFERENT driver's id
 *    whenever the two happen to collide. It was never needed — the backend
 *    always includes the driver relation on login and /auth/me, so
 *    linkedDriverId is present for every real driver.
 *
 * 2. Returning undefined is worse than returning null, because callers
 *    compare with `task.driverId === myDriverId` and an UNASSIGNED task
 *    serialises its driverId as undefined — so `undefined === undefined`
 *    matched every unclaimed job on the board. Use `isMyJob` below rather
 *    than comparing by hand.
 */
export function useMyDriverId(): number | null {
  const {user} = useAuth();
  if (!user || user.role !== 'driver') return null;
  return user.linkedDriverId ?? null;
}

/** True only when this job is genuinely assigned to this driver. */
export function isMyJob(jobDriverId: number | undefined | null, myDriverId: number | null): boolean {
  return myDriverId != null && jobDriverId != null && jobDriverId === myDriverId;
}
