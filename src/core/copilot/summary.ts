import type {ParkingTask} from '../../context/AppStateContext';
import type {CopilotRole} from './insights';

/*
 * "How has today gone" — computed from tasks the app already holds.
 *
 * Same rules as the insight engine about role and data availability: every
 * figure below comes from `tasks`, which every role receives. Nothing here
 * touches `drivers` or `visitors`, so it cannot accidentally report a zero
 * that only means "this role never fetched that collection".
 *
 * Scoped per role because "handled today" means something different to each
 * of them: the valet who dispatched it, the driver who drove it, the admin
 * watching the whole floor.
 */

export interface ShiftSummary {
  /** Jobs finished today, scoped to this person. */
  completed: number;
  /** Still open right now, scoped to this person. */
  active: number;
  /** Median minutes from assignment to completion, or null when too few. */
  medianMinutes: number | null;
  /** Busiest hour today as a 0-23 hour, or null when nothing finished. */
  busiestHour: number | null;
}

const MIN = 60_000;

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Median, not mean.
 *
 * One car that sat for three hours because a doctor never came down would
 * drag an average far enough to make a good shift look bad. The median says
 * what a typical job took, which is the question being asked.
 */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function selectShiftSummary(
  tasks: ParkingTask[],
  ctx: {role: CopilotRole; userId?: number; driverId?: number | null; now: number},
): ShiftSummary {
  const since = startOfToday(ctx.now);

  // Whose work counts. A valet owns what they dispatched, a driver owns what
  // they drove, an admin owns the floor, and a doctor owns their own car.
  const mine = (t: ParkingTask): boolean => {
    switch (ctx.role) {
      case 'valet':  return t.valetId === ctx.userId;
      case 'driver': return ctx.driverId != null && t.driverId === ctx.driverId;
      case 'admin':  return true;
      default:       return t.doctorId === ctx.userId;
    }
  };

  const todays = tasks.filter(mine);

  const done = todays.filter(t =>
    t.status === 'completed' && t.completedAt != null && t.completedAt >= since);

  const active = todays.filter(t =>
    t.status !== 'completed' && t.status !== 'cancelled').length;

  const durations = done
    .map(t => {
      const from = t.assignedAt ?? t.requestedAt;
      return from != null && t.completedAt != null ? (t.completedAt - from) / MIN : null;
    })
    .filter((n): n is number => n != null && n >= 0)
    .map(Math.round);

  // Busiest hour, by when jobs actually finished.
  let busiestHour: number | null = null;
  if (done.length) {
    const buckets = new Map<number, number>();
    for (const t of done) {
      const h = new Date(t.completedAt as number).getHours();
      buckets.set(h, (buckets.get(h) ?? 0) + 1);
    }
    busiestHour = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return {
    completed: done.length,
    active,
    // Below three samples a median is just "one of these three numbers" and
    // reads as more authority than it has.
    medianMinutes: durations.length >= 3 ? median(durations) : null,
    busiestHour,
  };
}

/** "2 PM" / "11 AM" — for the one place an hour is shown to a person. */
export function hourLabel(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${ampm}`;
}
