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

// Quick picks. Anything else is chosen on the clock (see CUSTOM_DEPARTURE),
// which is why this list is short rather than trying to cover every case.
export const PLANNED_DEPARTURE_OPTIONS = [0, 15, 30] as const;

/** Doctor's "I'm on my way" choices, in minutes. */
export const ARRIVAL_ETA_OPTIONS = [30, 40, 60] as const;

/** A custom pick can never be further out than the next 24h — see clockToMinutes. */
export const MAX_PLANNED_DEPARTURE_MINUTES = 24 * 60;

/**
 * The moment the doctor actually intends to leave.
 *
 * Minutes are stored relative to when the request was made, so the raw number
 * decays: "360 min" stays 360 forever while six hours tick past. Everything
 * user-facing therefore derives from this pair — request time plus offset —
 * and is recomputed against the current clock. With a 40-minute ceiling the
 * old static label was merely imprecise; at 24 hours it would be nonsense.
 */
export function departureAt(requestedAt: number | undefined, mins: number | undefined): number | null {
  if (requestedAt == null || mins == null) return null;
  return requestedAt + mins * 60000;
}

/** Minutes still to go — negative once the doctor is already overdue. */
export function minutesUntilDeparture(
  requestedAt: number | undefined,
  mins: number | undefined,
  now: number,
): number | null {
  const at = departureAt(requestedAt, mins);
  if (at == null) return null;
  return Math.round((at - now) / 60000);
}

/** "45 MIN" / "2 HR 15 MIN" / "1 HR". Hours only appear once they exist. */
function spanLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} MIN`;
  if (m === 0) return `${h} HR`;
  return `${h} HR ${m} MIN`;
}

/**
 * Live label for the valet's inbox — counts down, and says so plainly once
 * the time has passed rather than showing a stale or negative number.
 */
export function plannedDepartureLabel(
  requestedAt: number | undefined,
  mins: number | undefined,
  now: number,
): string {
  const left = minutesUntilDeparture(requestedAt, mins, now);
  if (left == null) return '—';
  if (left <= 0) return 'NOW';
  return spanLabel(left);
}

/** Sort weight — soonest first, overdue before that. Unknown sorts last. */
export function departurePriority(
  requestedAt: number | undefined,
  mins: number | undefined,
  now: number,
): number {
  const left = minutesUntilDeparture(requestedAt, mins, now);
  return left == null ? Number.MAX_SAFE_INTEGER : left;
}

/**
 * A time of day the doctor picked, resolved to minutes from now.
 *
 * Always the NEXT occurrence: a time already past today means tomorrow. That
 * is what makes "within 24 hours" true by construction rather than something
 * that has to be validated and rejected — there is no reachable input that
 * lands outside the window.
 */
export function clockToMinutes(hour: number, minute: number, now: number): number {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  let diff = Math.round((target.getTime() - now) / 60000);
  if (diff < 0) diff += 24 * 60;
  return Math.min(diff, MAX_PLANNED_DEPARTURE_MINUTES);
}

/**
 * "6:30 PM" — how people here actually say a time.
 *
 * Takes a 24-hour hour, because that is what the arithmetic above works in;
 * 12-hour is a display format, not a storage one. Keeping the conversion in
 * one direction (24 -> 12, at the edge) avoids the midnight/noon mistakes that
 * come from carrying an hour and a meridiem around as two separate values.
 */
export function fmtClock12(hour24: number, minute: number): string {
  const pm = hour24 >= 12;
  const h12 = ((hour24 + 11) % 12) + 1;
  return `${h12}:${String(minute).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
}

/** 12-hour parts of a 24-hour hour: 0 -> 12 AM, 12 -> 12 PM, 13 -> 1 PM. */
export function to12(hour24: number): {h12: number; pm: boolean} {
  return {h12: ((hour24 + 11) % 12) + 1, pm: hour24 >= 12};
}

/** The inverse: 12 AM -> 0, 12 PM -> 12, 1 PM -> 13. */
export function to24(h12: number, pm: boolean): number {
  return (h12 % 12) + (pm ? 12 : 0);
}

/** The wall-clock time a departure lands on. */
export function departureClockLabel(
  requestedAt: number | undefined,
  mins: number | undefined,
  plannedAt?: number,
): string {
  // Prefer the absolute time the server fixed at request time; fall back to
  // the offset for rows created before that column existed.
  const at = plannedAt ?? departureAt(requestedAt, mins);
  if (at == null) return '';
  const d = new Date(at);
  return fmtClock12(d.getHours(), d.getMinutes());
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
