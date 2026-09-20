import {
  segmentFrame, trendScale, trendLine, areaStrips, trendStats, downsampleTrend, blendHex,
  donutTickColors, ringTick, radarScaleMax, radarPoint, radarDataPoints,
  heatColor, slotState, groupSlotsByBlock, blockOccupancy, slotSummary,
  reliabilityAxes, fmtInt, fmtMinutes, periodRange, periodDateRangeLabel,
} from './ccLogic';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (got: unknown) => {toEqual(want: unknown): void; toBe(want: unknown): void};

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe('segmentFrame', () => {
  it('draws a horizontal segment as an unrotated bar', () => {
    expect(segmentFrame({x: 0, y: 0}, {x: 10, y: 0}, 2)).toEqual({left: 0, top: -1, width: 10, height: 2, angle: 0});
  });
  it('centres the bar on the segment midpoint whatever the direction', () => {
    const f = segmentFrame({x: 5, y: 0}, {x: 5, y: 10}, 2);
    expect(near(f.left + f.width / 2, 5) && near(f.top + f.height / 2, 5)).toBe(true);
    expect(near(f.angle, Math.PI / 2)).toBe(true);
    expect(f.width).toBe(10);
  });
  it('rotating the bar about its centre lands exactly on both endpoints', () => {
    const cases: [number, number, number, number][] = [[0, 0, 3, 4], [10, 40, 2, 7], [-5, 3, 9, -8], [4, 4, 4, 4]];
    for (const [x1, y1, x2, y2] of cases) {
      const f = segmentFrame({x: x1, y: y1}, {x: x2, y: y2}, 3);
      const cx = f.left + f.width / 2, cy = f.top + f.height / 2;
      const half = f.width / 2;
      const end1 = {x: cx - half * Math.cos(f.angle), y: cy - half * Math.sin(f.angle)};
      const end2 = {x: cx + half * Math.cos(f.angle), y: cy + half * Math.sin(f.angle)};
      const okA = near(end1.x, x1) && near(end1.y, y1) && near(end2.x, x2) && near(end2.y, y2);
      const okB = near(end1.x, x2) && near(end1.y, y2) && near(end2.x, x1) && near(end2.y, y1);
      expect(okA || okB).toBe(true);
    }
  });
});

describe('trend chart', () => {
  it('scales to at least 1 and drops duplicate ticks on a tiny maximum', () => {
    expect(trendScale([]).maxVal).toBe(1);
    expect(trendScale([{tasks: 1, visitors: 0}]).yTicks).toEqual([0, 1]);
    expect(trendScale([{tasks: 8, visitors: 3}]).yTicks).toEqual([0, 2, 4, 6, 8]);
  });
  it('widens a single point into a flat two-point line', () => {
    expect(trendLine([5], 100, 50, 10)).toEqual([{x: 0, y: 25}, {x: 100, y: 25}]);
    expect(trendLine([], 100, 50, 10)).toEqual([]);
  });
  it('maps values to the plot: max at the top, zero at the bottom, x evenly spread', () => {
    expect(trendLine([0, 10, 5], 100, 50, 10)).toEqual([{x: 0, y: 50}, {x: 50, y: 0}, {x: 100, y: 25}]);
  });
  it('fills the area under a line with strips that follow it', () => {
    const line = trendLine([0, 10], 100, 50, 10); // rises from bottom-left to top-right
    const strips = areaStrips(line, 100, 50, 10);
    expect(strips.length).toBe(10);
    expect(near(strips[0].top, 50 - (5 / 100) * 50)).toBe(true); // midpoint x=5 → 5% up
    expect(near(strips[9].top, 50 - (95 / 100) * 50)).toBe(true);
    expect(strips.every(s => near(s.top + s.height, 50))).toBe(true);
    expect(strips.every(s => s.left + s.width <= 100 + 1e-9)).toBe(true);
  });
  it('overlaps every strip under the next so no sliver of background shows', () => {
    const strips = areaStrips(trendLine([3, 8, 5, 9], 100, 50, 10), 100, 50, 7);
    for (let i = 0; i + 1 < strips.length; i++) {
      expect(strips[i].left + strips[i].width - strips[i + 1].left >= 1.5).toBe(true);
    }
    expect(near(strips[strips.length - 1].left + strips[strips.length - 1].width, 100)).toBe(true);
  });
  it('gives no area for a lone point or a zero-width plot', () => {
    expect(areaStrips([{x: 0, y: 1}], 100, 50, 10)).toEqual([]);
    expect(areaStrips(trendLine([1, 2], 0, 50, 2), 0, 50, 10)).toEqual([]);
  });
  it('computes the headline stats, first peak wins a tie', () => {
    const s = trendStats([
      {date: '2026-09-01', tasks: 3, visitors: 1},
      {date: '2026-09-02', tasks: 7, visitors: 2},
      {date: '2026-09-03', tasks: 7, visitors: 0},
    ]);
    expect(s.totalTasks).toBe(17);
    expect(s.totalVisitors).toBe(3);
    expect(s.avgTasksPerDay).toBe(5.7);
    expect(s.peakIdx).toBe(1);
    expect(trendStats([]).peakDay).toBe(null);
    expect(trendStats([]).avgTasksPerDay).toBe(0);
  });
});

describe('trend downsampling', () => {
  const mk = (n: number) => Array.from({length: n}, (_, i) => ({date: `2026-01-${String(i + 1).padStart(2, '0')}`, tasks: i % 7, visitors: i % 5}));
  it('leaves a short series untouched', () => {
    const b = downsampleTrend(mk(5), 120);
    expect(b.length).toBe(5);
    expect(b.map(x => x.tasks)).toEqual([0, 1, 2, 3, 4]);
    expect(b.every(x => x.days === 1 && x.date === x.endDate)).toBe(true);
  });
  it('groups a long series and never exceeds the cap', () => {
    for (const n of [1, 2, 119, 120, 121, 240, 241, 365, 1000, 5000]) {
      expect(downsampleTrend(mk(n), 120).length <= 120).toBe(true);
    }
  });
  it('keeps the peak of each group so a spike is never lost', () => {
    const days = mk(300);
    days[137] = {...days[137], tasks: 99, visitors: 42};
    const b = downsampleTrend(days, 100);
    expect(Math.max(...b.map(x => x.tasks))).toBe(99);
    expect(Math.max(...b.map(x => x.visitors))).toBe(42);
  });
  it('covers every day exactly once, in order', () => {
    const b = downsampleTrend(mk(10), 4);
    expect(b.map(x => x.days)).toEqual([3, 3, 3, 1]);
    expect(b[0].date).toBe('2026-01-01');
    expect(b[0].endDate).toBe('2026-01-03');
    expect(b[3].date).toBe('2026-01-10');
    expect(downsampleTrend([], 10)).toEqual([]);
  });
});

describe('blendHex', () => {
  it('returns the background at alpha 0 and the foreground at alpha 1', () => {
    expect(blendHex('#3B82F6', '#111726', 0)).toBe('#111726');
    expect(blendHex('#3B82F6', '#111726', 1)).toBe('#3B82F6');
  });
  it('mixes proportionally and rounds', () => {
    expect(blendHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(blendHex('#FF0000', '#0000FF', 0.25)).toBe('#4000BF');
  });
});

describe('donut', () => {
  it('colours ring tiles by the part their centre falls in', () => {
    expect(donutTickColors([{value: 1, color: 'A'}, {value: 1, color: 'B'}, {value: 2, color: 'C'}], 8, 'T'))
      .toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'C', 'C']);
    expect(donutTickColors([{value: 1, color: 'A'}], 4, 'T')).toEqual(['A', 'A', 'A', 'A']);
  });
  it('shows only the track when there is nothing to show', () => {
    expect(donutTickColors([{value: 0, color: 'A'}], 3, 'T')).toEqual(['T', 'T', 'T']);
    expect(donutTickColors([], 2, 'T')).toEqual(['T', 'T']);
  });
  it('skips zero-sized parts', () => {
    expect(donutTickColors([{value: 0, color: 'A'}, {value: 4, color: 'B'}], 4, 'T')).toEqual(['B', 'B', 'B', 'B']);
  });
  it('places every ring tile on the circle, facing outward', () => {
    const count = 72, cx = 50, cy = 50, r = 40;
    let allOnCircle = true, allRadial = true;
    for (let i = 0; i < count; i++) {
      const f = ringTick(i, count, cx, cy, r, 12);
      const tx = f.left + f.width / 2, ty = f.top + f.height / 2;
      if (!near(Math.hypot(tx - cx, ty - cy), r, 1e-6)) allOnCircle = false;
      // the tile's width axis after rotation must point along the radius
      const ux = Math.cos(f.angle), uy = Math.sin(f.angle);
      const rx = (tx - cx) / r, ry = (ty - cy) / r;
      if (!near(ux * rx + uy * ry, 1, 1e-9)) allRadial = false;
    }
    expect(allOnCircle).toBe(true);
    expect(allRadial).toBe(true);
  });
  it('starts at 12 o\'clock and runs clockwise', () => {
    const first = ringTick(0, 100, 50, 50, 40, 12);
    expect(first.top + first.height / 2 < 50 - 39).toBe(true); // near the top
    expect(first.left + first.width / 2 > 50).toBe(true); // just right of centre
    const quarter = ringTick(25, 100, 50, 50, 40, 12);
    expect(quarter.left + quarter.width / 2 > 50 + 39).toBe(true); // ~3 o'clock
  });
  it('overlaps neighbouring tiles so no gaps show', () => {
    expect(ringTick(0, 90, 0, 0, 40, 13).height > (2 * Math.PI * 40) / 90).toBe(true);
  });
});

describe('radar', () => {
  it('scales to the data with a floor of 40', () => {
    expect(radarScaleMax([1, 5, 12])).toBe(40);
    expect(radarScaleMax([10, 55, 3])).toBe(55);
  });
  it('puts axis 0 at the top and axis n/4 at the right', () => {
    const top = radarPoint(0, 8, 1, 50, 50, 40);
    expect(near(top.x, 50) && near(top.y, 10)).toBe(true);
    const right = radarPoint(2, 8, 1, 50, 50, 40);
    expect(near(right.x, 90) && near(right.y, 50)).toBe(true);
    const half = radarPoint(0, 8, 0.5, 50, 50, 40);
    expect(near(half.y, 30)).toBe(true);
  });
  it('plots a value at the outer ring only when it reaches the scale maximum', () => {
    const pts = radarDataPoints([40, 20, 0, 0], 50, 50, 40);
    expect(near(Math.hypot(pts[0].x - 50, pts[0].y - 50), 40)).toBe(true);
    expect(near(Math.hypot(pts[1].x - 50, pts[1].y - 50), 20)).toBe(true);
    expect(near(Math.hypot(pts[2].x - 50, pts[2].y - 50), 0)).toBe(true);
  });
  it('caps a runaway value at the outer ring instead of overshooting', () => {
    const pts = radarDataPoints([500, 10], 0, 0, 40);
    expect(near(Math.hypot(pts[0].x, pts[0].y), 40)).toBe(true);
  });
});

describe('heatmap colours', () => {
  it('uses the empty tone for zero and for garbage', () => {
    expect(heatColor(0, 'light')).toBe('#EDEFF6');
    expect(heatColor(0, 'dark')).toBe('#171E30');
    expect(heatColor(NaN, 'light')).toBe('#EDEFF6');
    expect(heatColor(-1, 'dark')).toBe('#171E30');
  });
  it('steps through the ramp', () => {
    expect(heatColor(0.1, 'light')).toBe('#4C3A9E');
    expect(heatColor(0.5, 'light')).toBe('#B45BC7');
    expect(heatColor(0.7, 'light')).toBe('#E8703A');
    expect(heatColor(0.95, 'light')).toBe('#F0B23A');
    expect(heatColor(1, 'light')).toBe('#F0B23A');
  });
});

describe('slots', () => {
  const cls = new Map<string, 'OVERLOADED' | 'UNDERUTILIZED' | 'NORMAL'>([['A-1', 'OVERLOADED'], ['A-2', 'UNDERUTILIZED'], ['A-3', 'NORMAL']]);
  it('gives live status priority over the period classification', () => {
    expect(slotState({id: 'A-1', status: 'occupied'}, cls).label).toBe('Occupied');
    expect(slotState({id: 'A-1', status: 'reserved'}, cls).label).toBe('Reserved');
  });
  it('colours a free slot by how heavily it was used', () => {
    expect(slotState({id: 'A-1', status: 'free'}, cls).label).toBe('Overloaded');
    expect(slotState({id: 'A-2', status: 'free'}, cls).label).toBe('Underutilized');
    expect(slotState({id: 'A-3', status: 'free'}, cls).label).toBe('Available');
    expect(slotState({id: 'Z-9', status: 'free'}, cls).label).toBe('Available');
  });
  it('groups by block, ordering blocks and slot numbers, without mutating the input', () => {
    const input = [{block: 'B', number: 2}, {block: 'A', number: 10}, {block: 'A', number: 2}, {block: 'B', number: 1}];
    const snapshot = JSON.stringify(input);
    const g = groupSlotsByBlock(input);
    expect(g.map(b => b.name)).toEqual(['A', 'B']);
    expect(g[0].slots.map(s => s.number)).toEqual([2, 10]);
    expect(g[1].slots.map(s => s.number)).toEqual([1, 2]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('ranks blocks busiest first with rounded percentages', () => {
    const occ = blockOccupancy([
      {block: 'A', status: 'occupied'}, {block: 'A', status: 'free'}, {block: 'A', status: 'free'},
      {block: 'B', status: 'occupied'}, {block: 'B', status: 'occupied'}, {block: 'B', status: 'free'},
    ]);
    expect(occ).toEqual([
      {block: 'B', occupied: 2, total: 3, pct: 67},
      {block: 'A', occupied: 1, total: 3, pct: 33},
    ]);
    expect(blockOccupancy([])).toEqual([]);
  });
  it('summarises the lot, including an empty one', () => {
    expect(slotSummary([{status: 'occupied'}, {status: 'reserved'}, {status: 'free'}, {status: 'free'}]))
      .toEqual({total: 4, occupied: 1, reserved: 1, available: 2, pct: 25});
    expect(slotSummary([])).toEqual({total: 0, occupied: 0, reserved: 0, available: 0, pct: 0});
  });
});

describe('service reliability', () => {
  const base = {
    totalTasks: 100, cancelledTasks: 0, cancellationRatePct: 0, driverNoResponseCount: 0, assignmentExpiredCount: 0,
    unstaffedAlertCount: 0, jobsRecalledCount: 0, escalatedTasksCount: 0, retrieveTasks: 40,
    recoveryBroadcastCount: 0, recoveryBroadcastRatePct: 0,
  };
  it('reports seven axes, all neutral when nothing went wrong', () => {
    const a = reliabilityAxes(base);
    expect(a.length).toBe(7);
    expect(a.every(x => x.tone === 'neutral' && x.pct === 0)).toBe(true);
  });
  it('never produces NaN when there were no tasks', () => {
    const a = reliabilityAxes({...base, totalTasks: 0, unstaffedAlertCount: 5});
    expect(a.every(x => Number.isFinite(x.pct))).toBe(true);
  });
  it('escalates cancellation tone at 5%', () => {
    expect(reliabilityAxes({...base, cancellationRatePct: 3})[0].tone).toBe('warn');
    expect(reliabilityAxes({...base, cancellationRatePct: 6})[0].tone).toBe('danger');
  });
  it('turns counts into rates against total tasks and writes the real sentence', () => {
    const a = reliabilityAxes({...base, totalTasks: 387, unstaffedAlertCount: 138});
    const u = a.find(x => x.label === 'Unstaffed')!;
    expect(u.raw).toBe('138');
    expect(near(u.pct, (138 / 387) * 100)).toBe(true);
    expect(u.detail).toBe('138 "still needs a driver/valet" alerts were sent out.');
    expect(a.find(x => x.label === 'No-Response')!.detail).toBe('0 "driver did not accept" alerts — 0% of tasks.');
  });
  it('marks recalls and escalations as danger, recovery above 5% as warn', () => {
    const a = reliabilityAxes({...base, jobsRecalledCount: 2, escalatedTasksCount: 1, recoveryBroadcastRatePct: 6, recoveryBroadcastCount: 3});
    expect(a.find(x => x.label === 'Recalled')!.tone).toBe('danger');
    expect(a.find(x => x.label === 'Escalated')!.tone).toBe('danger');
    expect(a.find(x => x.label === 'Recovery')!.tone).toBe('warn');
    expect(a.find(x => x.label === 'Recovery')!.detail).toBe('3 of 40 retrievals (6%) needed a recovery broadcast.');
  });
});

describe('formatters', () => {
  it('groups thousands without depending on the device locale', () => {
    expect(fmtInt(0)).toBe('0');
    expect(fmtInt(999)).toBe('999');
    expect(fmtInt(1000)).toBe('1,000');
    expect(fmtInt(1234567)).toBe('1,234,567');
    expect(fmtInt(12.6)).toBe('13');
  });
  it('formats stage durations', () => {
    expect(fmtMinutes(0.4)).toBe('<1m');
    expect(fmtMinutes(1)).toBe('1m');
    expect(fmtMinutes(12.4)).toBe('12m');
  });
});

describe('period ranges', () => {
  it('has no range for all-time and a single day for today', () => {
    expect(periodRange('all', new Date(2026, 8, 16))).toBe(null);
    const d = periodRange('daily', new Date(2026, 8, 16, 15, 30))!;
    expect(ymd(d.from)).toBe('2026-9-16');
    expect(ymd(d.to)).toBe('2026-9-16');
  });
  it('runs weeks Monday to Sunday, including from a Sunday and a Monday', () => {
    const wed = periodRange('weekly', new Date(2026, 8, 16))!;
    expect(ymd(wed.from)).toBe('2026-9-14');
    expect(ymd(wed.to)).toBe('2026-9-20');
    const sun = periodRange('weekly', new Date(2026, 8, 20))!;
    expect(ymd(sun.from)).toBe('2026-9-14');
    expect(ymd(sun.to)).toBe('2026-9-20');
    const mon = periodRange('weekly', new Date(2026, 8, 21))!;
    expect(ymd(mon.from)).toBe('2026-9-21');
    expect(ymd(mon.to)).toBe('2026-9-27');
  });
  it('crosses month and year boundaries correctly', () => {
    const w = periodRange('weekly', new Date(2026, 0, 1))!; // Thursday Jan 1 2026
    expect(ymd(w.from)).toBe('2025-12-29');
    expect(ymd(w.to)).toBe('2026-1-4');
  });
  it('covers the whole month, leap years included, and the whole year', () => {
    const feb = periodRange('monthly', new Date(2028, 1, 10))!;
    expect(ymd(feb.from)).toBe('2028-2-1');
    expect(ymd(feb.to)).toBe('2028-2-29');
    const y = periodRange('yearly', new Date(2026, 5, 1))!;
    expect(ymd(y.from)).toBe('2026-1-1');
    expect(ymd(y.to)).toBe('2026-12-31');
  });
  it('labels the range', () => {
    expect(periodDateRangeLabel('all', new Date(2026, 8, 16))).toBe('All time');
    expect(periodDateRangeLabel('yearly', new Date(2026, 8, 16))).toBe('Jan 1 - Dec 31, 2026');
    expect(periodDateRangeLabel('weekly', new Date(2026, 8, 16)).includes(' - ')).toBe(true);
    expect(periodDateRangeLabel('monthly', new Date(2026, 8, 16)).includes(' - ')).toBe(true);
    expect(periodDateRangeLabel('daily', new Date(2026, 8, 16)).includes(' - ')).toBe(false);
  });
});
