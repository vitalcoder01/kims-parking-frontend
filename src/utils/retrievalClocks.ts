import {ParkingTask} from '../context/AppStateContext';

// The doctor's selection is a PLANNED DEPARTURE ("I intend to leave in 10
// minutes"), not a vehicle ETA. The system cannot promise when a car will
// arrive — that depends on valet dispatch and driver travel — so nothing
// derived from it may ever be shown to the doctor as an arrival estimate.
//
// It exists for exactly three things, all valet-side: the inbox badge, inbox
// ordering, and prioritisation.
//
// The only honest clock is the trip itself, which starts when the driver
// actually sets off (startedAt) and is therefore real elapsed time.

export const PLANNED_DEPARTURE_OPTIONS = [0, 10, 20, 30, 40] as const;

/** Label for a planned-departure value. 0 means "leaving now". */
export function plannedDepartureLabel(mins: number | undefined): string {
  if (mins == null) return '—';
  return mins === 0 ? 'NOW' : `${mins} MIN`;
}

/** Sort weight — NOW first, then soonest. Unknown sorts last. */
export function departurePriority(mins: number | undefined): number {
  return mins == null ? Number.MAX_SAFE_INTEGER : mins;
}

/** Seconds the driver has been en route, or null if they haven't set off. */
export function enRouteSeconds(task: ParkingTask | undefined, now: number): number | null {
  if (task?.startedAt == null) return null;
  return Math.max(0, Math.round((now - task.startedAt) / 1000));
}

/** "1 min ago" / "just now" — how long a request has been waiting. */
export function agoLabel(since: number | undefined, now: number): string {
  if (since == null) return '';
  const m = Math.floor((now - since) / 60000);
  if (m < 1) return 'just now';
  return `${m} min ago`;
}

/** mm:ss for a DURATION — never a time of day (see fmtTimeOfDay callers). */
export function fmtDuration(seconds: number): string {
  const s = Math.abs(seconds);
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
