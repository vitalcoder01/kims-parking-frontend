import type {AnalyticsPeriod, OperationalFriction, SlotClassification} from '../../../services/api';

/*
 * Everything the command-center dashboard computes that is not a React
 * Native view: chart geometry, the numbers behind each panel, and the
 * formatters. No imports at runtime, so it runs under plain Node and is
 * covered by ccLogic.test.ts.
 *
 * The web dashboard draws its three charts (donut, trend line, radar) as
 * SVG. This app has no SVG library, and adding a native module is a bigger
 * risk than a dashboard is worth, so the charts are built from ordinary
 * Views — thin rotated rectangles for lines, a ring of small tiles for the
 * donut. The geometry below is what makes that exact.
 */

export interface Pt {x: number; y: number}
export interface Frame {left: number; top: number; width: number; height: number; angle: number}

/**
 * Frame for an absolutely-positioned View that draws the segment a→b.
 * The View is centred on the segment's midpoint and rotated about its own
 * centre (the default), so no transform-origin support is needed.
 */
export function segmentFrame(a: Pt, b: Pt, thickness: number): Frame {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    left: (a.x + b.x) / 2 - length / 2,
    top: (a.y + b.y) / 2 - thickness / 2,
    width: length,
    height: thickness,
    angle: Math.atan2(dy, dx),
  };
}

// ── Trend line chart ───────────────────────────────────────────────────

export function trendScale(days: {tasks: number; visitors: number}[]): {maxVal: number; yTicks: number[]} {
  const maxVal = Math.max(1, ...days.map(d => Math.max(d.tasks, d.visitors)));
  // Rounded quarters collapse into duplicates on a small maximum (1 gives
  // 0,0,1,1,1), which would stack identical labels on top of each other.
  const yTicks = [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f)))];
  return {maxVal, yTicks};
}

export function trendY(v: number, h: number, maxVal: number): number {
  return h - (v / maxVal) * h;
}

export function trendX(i: number, n: number, w: number): number {
  return n <= 1 ? w / 2 : (i / (n - 1)) * w;
}

/**
 * The polyline for one series. A single day (the "Today" period, almost
 * always) has one point, which draws nothing on its own — widen it into a
 * flat two-point line across the plot so the chart is never blank.
 */
export function trendLine(values: number[], w: number, h: number, maxVal: number): Pt[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) {
    const y = trendY(values[0], h, maxVal);
    return [{x: 0, y}, {x: w, y}];
  }
  return values.map((v, i) => ({x: trendX(i, n, w), y: trendY(v, h, maxVal)}));
}

/** How far each area strip reaches under its right-hand neighbour. */
export const STRIP_OVERLAP = 2;

/**
 * Vertical strips that fill the area under a polyline, sampled every `step`
 * pixels at the strip's midpoint. Each reaches STRIP_OVERLAP px under the
 * next one: at fractional device pixels two anti-aliased edges can land in
 * the same pixel and let a sliver of background through, unless the strip
 * underneath fully covers it.
 */
export function areaStrips(line: Pt[], w: number, h: number, step: number): {left: number; width: number; top: number; height: number}[] {
  if (line.length < 2 || w <= 0 || step <= 0) return [];
  const out: {left: number; width: number; top: number; height: number}[] = [];
  for (let x = 0; x < w; x += step) {
    const xm = Math.min(w, x + step / 2);
    let k = 0;
    while (k < line.length - 2 && line[k + 1].x < xm) k++;
    const a = line[k];
    const b = line[k + 1];
    const t = b.x === a.x ? 0 : Math.max(0, Math.min(1, (xm - a.x) / (b.x - a.x)));
    const y = a.y + (b.y - a.y) * t;
    out.push({left: x, width: Math.min(step + STRIP_OVERLAP, w - x), top: y, height: Math.max(0, h - y)});
  }
  return out;
}

export interface TrendDay {date: string; tasks: number; visitors: number}
export interface TrendBucket extends TrendDay {endDate: string; days: number}

/**
 * Caps how many points the trend draws. Every point costs real native views
 * here (an SVG would not), and "all time" grows without bound. Past
 * `maxPoints`, consecutive days are grouped and each group is drawn at its
 * peak, so a spike still shows and the y-scale is unchanged.
 */
export function downsampleTrend(days: TrendDay[], maxPoints: number): TrendBucket[] {
  const size = Math.max(1, Math.ceil(days.length / Math.max(1, maxPoints)));
  const out: TrendBucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const group = days.slice(i, i + size);
    out.push({
      date: group[0].date,
      endDate: group[group.length - 1].date,
      tasks: Math.max(...group.map(d => d.tasks)),
      visitors: Math.max(...group.map(d => d.visitors)),
      days: group.length,
    });
  }
  return out;
}

export function trendStats(days: {date: string; tasks: number; visitors: number}[]) {
  const n = days.length;
  const totalTasks = days.reduce((s, d) => s + d.tasks, 0);
  const totalVisitors = days.reduce((s, d) => s + d.visitors, 0);
  const avgTasksPerDay = n ? Math.round((totalTasks / n) * 10) / 10 : 0;
  const peakIdx = days.reduce((best, d, i) => (d.tasks > (days[best]?.tasks ?? -1) ? i : best), 0);
  return {n, totalTasks, totalVisitors, avgTasksPerDay, peakIdx, peakDay: n ? days[peakIdx] : null};
}

/**
 * The opaque colour `fg` looks like at `alpha` over `bg` (both #RRGGBB).
 * Opaque on purpose: translucent shapes that overlap by a fraction of a
 * pixel double-blend into visible seams, opaque ones cannot.
 */
export function blendHex(fg: string, bg: string, alpha: number): string {
  const part = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const ch = (i: number) => Math.round(part(fg, i) * alpha + part(bg, i) * (1 - alpha));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(ch(0))}${h(ch(1))}${h(ch(2))}`.toUpperCase();
}

// ── Donut ──────────────────────────────────────────────────────────────

/** The colour of each of `count` ring tiles: which part its centre falls in. */
export function donutTickColors(parts: {value: number; color: string}[], count: number, track: string): string[] {
  const live = parts.filter(p => p.value > 0);
  const total = live.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return new Array<string>(count).fill(track);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = ((i + 0.5) / count) * total;
    let acc = 0;
    let color = track;
    for (const p of live) {
      acc += p.value;
      if (at < acc) { color = p.color; break; }
    }
    out.push(color);
  }
  return out;
}

/**
 * Frame for ring tile `i` of `count`, starting at 12 o'clock and running
 * clockwise. `width` is the radial thickness, `height` the tangential length
 * (a hair over the arc so neighbours overlap); rotating by the tile's polar
 * angle turns the width axis into the radial direction.
 */
export function ringTick(i: number, count: number, cx: number, cy: number, rMid: number, stroke: number): Frame {
  const theta = -Math.PI / 2 + ((i + 0.5) / count) * 2 * Math.PI;
  const height = (2 * Math.PI * rMid) / count + 1.5;
  const px = cx + rMid * Math.cos(theta);
  const py = cy + rMid * Math.sin(theta);
  return {left: px - stroke / 2, top: py - height / 2, width: stroke, height, angle: theta};
}

// ── Radar ──────────────────────────────────────────────────────────────

/** Scale to the data's own range, with a 40-point floor so a quiet period
 *  is not stretched into an alarming shape. */
export function radarScaleMax(pcts: number[]): number {
  return Math.max(40, ...pcts);
}

export function radarPoint(i: number, n: number, frac: number, cx: number, cy: number, R: number): Pt {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2;
  return {x: cx + R * frac * Math.cos(a), y: cy + R * frac * Math.sin(a)};
}

export function radarDataPoints(pcts: number[], cx: number, cy: number, R: number): Pt[] {
  const max = radarScaleMax(pcts);
  return pcts.map((p, i) => radarPoint(i, pcts.length, Math.min(1, p / max), cx, cy, R));
}

// ── Heatmap ────────────────────────────────────────────────────────────

export function heatColor(frac: number, mode: 'light' | 'dark'): string {
  if (!(frac > 0)) return mode === 'dark' ? '#171E30' : '#EDEFF6';
  if (frac < 0.33) return '#4C3A9E';
  if (frac < 0.66) return '#B45BC7';
  if (frac < 0.85) return '#E8703A';
  return '#F0B23A';
}

// ── Slots ──────────────────────────────────────────────────────────────

export const SLOT_STATE_COLORS = {
  available: '#22C55E', occupied: '#EF4444', underutilized: '#E8C23A', overloaded: '#F0703A', reserved: '#F59E0B',
};

export function slotState(
  s: {id: string; status: string},
  classById: Map<string, SlotClassification>,
): {label: string; color: string} {
  if (s.status === 'occupied') return {label: 'Occupied', color: SLOT_STATE_COLORS.occupied};
  if (s.status === 'reserved') return {label: 'Reserved', color: SLOT_STATE_COLORS.reserved};
  const cls = classById.get(s.id);
  if (cls === 'OVERLOADED') return {label: 'Overloaded', color: SLOT_STATE_COLORS.overloaded};
  if (cls === 'UNDERUTILIZED') return {label: 'Underutilized', color: SLOT_STATE_COLORS.underutilized};
  return {label: 'Available', color: SLOT_STATE_COLORS.available};
}

export function groupSlotsByBlock<T extends {block: string; number: number}>(slots: T[]): {name: string; slots: T[]}[] {
  const m = new Map<string, T[]>();
  for (const s of slots) {
    const list = m.get(s.block) ?? [];
    list.push(s);
    m.set(s.block, list);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({name, slots: list.slice().sort((a, b) => a.number - b.number)}));
}

/** Per-block occupancy, busiest first, so the block under pressure reads first. */
export function blockOccupancy(slots: {block: string; status: string}[]) {
  const m = new Map<string, {occupied: number; total: number}>();
  for (const s of slots) {
    const e = m.get(s.block) ?? {occupied: 0, total: 0};
    e.total++;
    if (s.status === 'occupied') e.occupied++;
    m.set(s.block, e);
  }
  return [...m.entries()]
    .map(([block, e]) => ({block, ...e, pct: e.total ? Math.round((e.occupied / e.total) * 100) : 0}))
    .sort((a, b) => b.pct - a.pct);
}

export function slotSummary(slots: {status: string}[]) {
  const total = slots.length;
  const occupied = slots.filter(s => s.status === 'occupied').length;
  const reserved = slots.filter(s => s.status === 'reserved').length;
  const available = total - occupied - reserved;
  const pct = total ? Math.round((occupied / total) * 100) : 0;
  return {total, occupied, reserved, available, pct};
}

// ── Service reliability ────────────────────────────────────────────────

export type Tone = 'warn' | 'danger' | 'neutral';
export interface ReliabilityAxis {label: string; raw: string; pct: number; tone: Tone; detail: string}

/**
 * Each axis is either an already-real rate or a raw count turned into a rate
 * against total tasks, so every axis sits on the same scale a radar needs.
 */
export function reliabilityAxes(f: OperationalFriction): ReliabilityAxis[] {
  const rateOf = (count: number) => (f.totalTasks ? (count / f.totalTasks) * 100 : 0);
  return [
    {
      label: 'Cancellations', raw: `${f.cancellationRatePct}%`, pct: f.cancellationRatePct,
      tone: f.cancellationRatePct > 5 ? 'danger' : f.cancellationRatePct > 0 ? 'warn' : 'neutral',
      detail: `${f.cancelledTasks} of ${f.totalTasks} tasks were cancelled (${f.cancellationRatePct}%).`,
    },
    {
      label: 'No-Response', raw: String(f.driverNoResponseCount), pct: rateOf(f.driverNoResponseCount),
      tone: f.driverNoResponseCount > 0 ? 'warn' : 'neutral',
      detail: `${f.driverNoResponseCount} "driver did not accept" alerts — ${Math.round(rateOf(f.driverNoResponseCount) * 10) / 10}% of tasks.`,
    },
    {
      label: 'Expired', raw: String(f.assignmentExpiredCount), pct: rateOf(f.assignmentExpiredCount),
      tone: f.assignmentExpiredCount > 0 ? 'warn' : 'neutral',
      detail: `${f.assignmentExpiredCount} driver assignments expired before being accepted.`,
    },
    {
      label: 'Unstaffed', raw: String(f.unstaffedAlertCount), pct: rateOf(f.unstaffedAlertCount),
      tone: f.unstaffedAlertCount > 0 ? 'warn' : 'neutral',
      detail: `${f.unstaffedAlertCount} "still needs a driver/valet" alerts were sent out.`,
    },
    {
      label: 'Recalled', raw: String(f.jobsRecalledCount), pct: rateOf(f.jobsRecalledCount),
      tone: f.jobsRecalledCount > 0 ? 'danger' : 'neutral',
      detail: `${f.jobsRecalledCount} jobs were recalled and brought back after being sent out.`,
    },
    {
      label: 'Escalated', raw: String(f.escalatedTasksCount), pct: rateOf(f.escalatedTasksCount),
      tone: f.escalatedTasksCount > 0 ? 'danger' : 'neutral',
      detail: `${f.escalatedTasksCount} jobs were escalated.`,
    },
    {
      label: 'Recovery', raw: `${f.recoveryBroadcastRatePct}%`, pct: f.recoveryBroadcastRatePct,
      tone: f.recoveryBroadcastRatePct > 5 ? 'warn' : 'neutral',
      detail: `${f.recoveryBroadcastCount} of ${f.retrieveTasks} retrievals (${f.recoveryBroadcastRatePct}%) needed a recovery broadcast.`,
    },
  ];
}

// ── Formatters ─────────────────────────────────────────────────────────

/** 1234567 → "1,234,567". Not toLocaleString: its output depends on the
 *  device locale and on Intl being present. */
export function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtMinutes(m: number): string {
  return m < 1 ? '<1m' : `${Math.round(m)}m`;
}

/** The calendar range a period covers, mirroring the backend's periodRange
 *  (Monday-start weeks). Display only — the server range does the filtering. */
export function periodRange(period: AnalyticsPeriod, now: Date = new Date()): {from: Date; to: Date} | null {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'all') return null;
  if (period === 'daily') return {from: startOfToday, to: startOfToday};
  if (period === 'weekly') {
    const day = startOfToday.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const from = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() - diffToMonday);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return {from, to};
  }
  if (period === 'monthly') {
    return {from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0)};
  }
  return {from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31)};
}

export function periodDateRangeLabel(period: AnalyticsPeriod, now: Date = new Date()): string {
  const range = periodRange(period, now);
  if (!range) return 'All time';
  const fmt = (d: Date) => d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  if (period === 'daily') return fmt(range.from);
  if (period === 'yearly') return `Jan 1 - Dec 31, ${range.from.getFullYear()}`;
  return `${fmt(range.from)} - ${fmt(range.to)}`;
}
