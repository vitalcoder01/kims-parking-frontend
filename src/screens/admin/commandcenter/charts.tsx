import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, Pressable, GestureResponderEvent} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useCc} from './ccTheme';
import {
  Pt, TrendDay, Tone, segmentFrame, ringTick, donutTickColors, trendScale, trendLine, trendY, trendX,
  areaStrips, downsampleTrend, trendStats, radarPoint, radarDataPoints, blendHex,
} from './ccLogic';

/*
 * The three charts of the web dashboard, drawn without an SVG library (see
 * ccLogic.ts for why and for the geometry). Everything here is absolutely
 * positioned Views; non-interactive pieces carry pointerEvents="none" so
 * touches reach the one layer that handles them.
 */

/** A straight line: a thin rotated View centred on the segment's midpoint. */
function Seg({a, b, thickness, color, opacity}: {a: Pt; b: Pt; thickness: number; color: string; opacity?: number}) {
  const f = segmentFrame(a, b, thickness);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: f.left, top: f.top, width: f.width, height: f.height,
        borderRadius: thickness / 2, backgroundColor: color, opacity,
        transform: [{rotate: `${f.angle}rad`}],
      }}
    />
  );
}

function Polyline({points, thickness, color, opacity}: {points: Pt[]; thickness: number; color: string; opacity?: number}) {
  return (
    <>
      {points.slice(1).map((p, i) => (
        <Seg key={i} a={points[i]} b={p} thickness={thickness} color={color} opacity={opacity} />
      ))}
    </>
  );
}

function Dot({p, r, color, borderColor, borderWidth = 0}: {p: Pt; r: number; color: string; borderColor?: string; borderWidth?: number}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: p.x - r, top: p.y - r, width: r * 2, height: r * 2,
        borderRadius: r, backgroundColor: color, borderColor, borderWidth,
      }}
    />
  );
}

// ── Donut ──────────────────────────────────────────────────────────────

const RING_TILES = 72; // 5° apiece — reads as a smooth ring at these sizes

export const Donut = React.memo(function Donut({parts, size = 100, stroke = 13, centerLabel, centerSub}: {
  parts: {value: number; color: string}[]; size?: number; stroke?: number; centerLabel: string; centerSub?: string;
}) {
  const cc = useCc();
  const rMid = (size - stroke) / 2;
  const colors = donutTickColors(parts, RING_TILES, cc.divider);
  return (
    <View style={{width: size, height: size}}>
      {colors.map((color, i) => {
        const f = ringTick(i, RING_TILES, size / 2, size / 2, rMid, stroke);
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute', left: f.left, top: f.top, width: f.width, height: f.height,
              backgroundColor: color, transform: [{rotate: `${f.angle}rad`}],
            }}
          />
        );
      })}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]}>
        <Text style={{fontSize: size * 0.2, fontWeight: '900', color: cc.textPrimary}}>{centerLabel}</Text>
        {!!centerSub && (
          <Text style={{fontSize: Math.max(8, size * 0.09), fontWeight: '700', color: cc.textMuted, marginTop: 2}}>{centerSub}</Text>
        )}
      </View>
    </View>
  );
}, (a, b) =>
  a.size === b.size && a.stroke === b.stroke && a.centerLabel === b.centerLabel && a.centerSub === b.centerSub
  && JSON.stringify(a.parts) === JSON.stringify(b.parts));

// ── Trend (line + area) ────────────────────────────────────────────────

const PLOT_H = 150;
const MAX_POINTS = 120;
const STRIP_STEP = 3;
const TOOLTIP_W = 132;

export const TrendChart = React.memo(function TrendChart({days}: {days: TrendDay[]}) {
  const cc = useCc();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  const stats = useMemo(() => trendStats(days), [days]);
  const pts = useMemo(() => downsampleTrend(days, MAX_POINTS), [days]);
  const {maxVal, yTicks} = useMemo(() => trendScale(pts), [pts]);
  const tasksLine = useMemo(() => trendLine(pts.map(p => p.tasks), w, PLOT_H, maxVal), [pts, w, maxVal]);
  const visitorsLine = useMemo(() => trendLine(pts.map(p => p.visitors), w, PLOT_H, maxVal), [pts, w, maxVal]);
  const strips = useMemo(() => areaStrips(tasksLine, w, PLOT_H, STRIP_STEP), [tasksLine, w]);

  const n = pts.length;
  if (stats.n === 0) {
    return <Text style={[s.empty, {color: cc.textMuted}]}>No activity recorded in this period.</Text>;
  }

  const areaColor = blendHex(cc.accentBlue, cc.card, 0.3);
  const peakBucket = stats.peakDay ? pts.findIndex(p => p.tasks === stats.peakDay!.tasks) : -1;
  const active = sel != null && sel < n ? pts[sel] : null;
  const activeIdx = active ? sel! : null;

  const onTouch = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    if (w <= 0 || !Number.isFinite(x)) return;
    const idx = n <= 1 ? 0 : Math.round((x / w) * (n - 1));
    setSel(Math.max(0, Math.min(n - 1, idx)));
  };
  const dateLabel = (p: {date: string; endDate: string; days: number}) =>
    p.days > 1 ? `${p.date.slice(5)} → ${p.endDate.slice(5)}` : p.date;

  return (
    <View>
      <View style={s.statsRow}>
        <Stat value={String(stats.totalTasks)} label="Total Tasks" color={cc.accentBlue} muted={cc.textMuted} />
        <Stat value={String(stats.totalVisitors)} label="Total Visitors" color={cc.accentGreen} muted={cc.textMuted} />
        <Stat value={String(stats.avgTasksPerDay)} label="Avg Tasks/Day" color={cc.textPrimary} muted={cc.textMuted} />
        {stats.peakDay && stats.n > 1 && (
          <Stat value={String(stats.peakDay.tasks)} suffix={`on ${stats.peakDay.date.slice(5)}`} label="Peak Day" color={cc.textPrimary} muted={cc.textMuted} />
        )}
      </View>

      <View style={s.plotRow}>
        <View style={s.yAxis}>
          {yTicks.map(v => (
            <Text key={v} style={[s.yLabel, {top: trendY(v, PLOT_H, maxVal) - 6, color: cc.textMuted}]}>{v}</Text>
          ))}
        </View>

        <View style={{flex: 1, height: PLOT_H}} onLayout={e => setW(Math.floor(e.nativeEvent.layout.width))}>
          {w > 0 && (
            <>
              {strips.map((st, i) => (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{position: 'absolute', left: st.left, width: st.width, top: st.top, height: st.height, backgroundColor: areaColor}}
                />
              ))}
              {/* Fades the fill out toward the baseline, like the web's gradient. */}
              <LinearGradient
                pointerEvents="none"
                colors={[cc.card + '00', cc.card]}
                style={{position: 'absolute', left: 0, right: 0, top: PLOT_H * 0.3, height: PLOT_H * 0.7}}
              />
              {yTicks.map(v => (
                <View
                  key={v}
                  pointerEvents="none"
                  style={{position: 'absolute', left: 0, right: 0, top: trendY(v, PLOT_H, maxVal), height: 1, backgroundColor: cc.divider}}
                />
              ))}
              <Polyline points={visitorsLine} thickness={2} color={cc.accentGreen} />
              <Polyline points={tasksLine} thickness={2} color={cc.accentBlue} />
              {n === 1 && (
                <>
                  <Dot p={{x: trendX(0, 1, w), y: trendY(pts[0].tasks, PLOT_H, maxVal)}} r={4} color={cc.accentBlue} />
                  <Dot p={{x: trendX(0, 1, w), y: trendY(pts[0].visitors, PLOT_H, maxVal)}} r={4} color={cc.accentGreen} />
                </>
              )}
              {/* The busiest day stays marked, not only on touch. */}
              {n > 1 && peakBucket >= 0 && (() => {
                const x = trendX(peakBucket, n, w);
                const y = trendY(pts[peakBucket].tasks, PLOT_H, maxVal);
                return (
                  <>
                    <Dot p={{x, y}} r={4} color={cc.card} borderColor={cc.accentBlue} borderWidth={2} />
                    <Text
                      pointerEvents="none"
                      style={[s.peakLabel, {left: Math.max(0, Math.min(w - 60, x - 30)), top: y - 20, color: cc.accentBlue}]}>
                      Peak {pts[peakBucket].tasks}
                    </Text>
                  </>
                );
              })()}
              {active && activeIdx != null && (
                <>
                  <View
                    pointerEvents="none"
                    style={{position: 'absolute', left: trendX(activeIdx, n, w), top: 0, width: 1, height: PLOT_H, backgroundColor: cc.border}}
                  />
                  <Dot p={{x: trendX(activeIdx, n, w), y: trendY(active.tasks, PLOT_H, maxVal)}} r={3.5} color={cc.accentBlue} />
                  <Dot p={{x: trendX(activeIdx, n, w), y: trendY(active.visitors, PLOT_H, maxVal)}} r={3.5} color={cc.accentGreen} />
                  <View
                    pointerEvents="none"
                    style={[s.tooltip, {
                      left: Math.max(0, Math.min(w - TOOLTIP_W, trendX(activeIdx, n, w) + 6)),
                      backgroundColor: cc.cardAlt, borderColor: cc.border,
                    }]}>
                    <Text style={[s.tipDate, {color: cc.textPrimary}]}>{dateLabel(active)}</Text>
                    <Text style={[s.tipLine, {color: cc.accentBlue}]}>Parking Tasks {active.tasks}</Text>
                    <Text style={[s.tipLine, {color: cc.accentGreen}]}>Visitors {active.visitors}</Text>
                    {active.days > 1 && <Text style={[s.tipNote, {color: cc.textMuted}]}>peak of {active.days} days</Text>}
                  </View>
                </>
              )}
              {/* One transparent layer takes the touches, so locationX is
                  relative to the plot and not to whichever bar was hit. */}
              <View style={StyleSheet.absoluteFill} onTouchStart={onTouch} onTouchMove={onTouch} />
            </>
          )}
        </View>
      </View>

      <View style={[s.xRow, n === 1 && {justifyContent: 'center'}]}>
        {n === 1 ? (
          <Text style={[s.xLabel, {color: cc.textMuted}]}>{pts[0].date.slice(5)}</Text>
        ) : (
          <>
            <Text style={[s.xLabel, {color: cc.textMuted}]}>{pts[0].date.slice(5)}</Text>
            <Text style={[s.xLabel, {color: cc.textMuted}]}>{pts[Math.floor(n / 2)].date.slice(5)}</Text>
            <Text style={[s.xLabel, {color: cc.textMuted}]}>{pts[n - 1].date.slice(5)}</Text>
          </>
        )}
      </View>

      <View style={s.legend}>
        <LegendSwatch color={cc.accentBlue} label="Parking Tasks" text={cc.textMuted} />
        <LegendSwatch color={cc.accentGreen} label="Visitors" text={cc.textMuted} />
      </View>
    </View>
  );
});

function Stat({value, suffix, label, color, muted}: {value: string; suffix?: string; label: string; color: string; muted: string}) {
  return (
    <View>
      <Text style={{fontSize: 15, fontWeight: '900', color}}>
        {value}{suffix ? <Text style={{fontSize: 10, fontWeight: '700', color: muted}}> {suffix}</Text> : null}
      </Text>
      <Text style={{fontSize: 9, fontWeight: '700', color: muted}}>{label}</Text>
    </View>
  );
}

function LegendSwatch({color, label, text}: {color: string; label: string; text: string}) {
  return (
    <View style={s.swatchRow}>
      <View style={{width: 8, height: 8, borderRadius: 2, backgroundColor: color}} />
      <Text style={{fontSize: 10, fontWeight: '700', color: text}}>{label}</Text>
    </View>
  );
}

// ── Radar ──────────────────────────────────────────────────────────────

export const RadarChart = React.memo(function RadarChart({axes, size = 132, selected, onSelect}: {
  axes: {pct: number; tone: Tone}[]; size?: number; selected: number | null; onSelect: (i: number | null) => void;
}) {
  const cc = useCc();
  const cx = size / 2, cy = size / 2, R = size / 2 - 10;
  const n = axes.length;
  const toneColor = (t: Tone) => (t === 'danger' ? cc.danger : t === 'warn' ? cc.warning : cc.accentBlue);
  const ring = (f: number) => Array.from({length: n}, (_, i) => radarPoint(i, n, f, cx, cy, R));
  const outer = ring(1);
  const data = radarDataPoints(axes.map(a => a.pct), cx, cy, R);
  const dim = selected == null ? 1 : 0.35;
  return (
    <View style={{width: size, height: size}}>
      {[0.5, 1].map(f => {
        const pts = ring(f);
        return pts.map((p, i) => <Seg key={`${f}-${i}`} a={p} b={pts[(i + 1) % n]} thickness={1} color={cc.divider} />);
      })}
      {outer.map((p, i) => <Seg key={`ax${i}`} a={{x: cx, y: cy}} b={p} thickness={1} color={cc.divider} />)}
      {data.map((p, i) => <Seg key={`d${i}`} a={p} b={data[(i + 1) % n]} thickness={2} color={cc.accentBlue} opacity={dim} />)}
      {data.map((p, i) => {
        const isSel = selected === i;
        const c = toneColor(axes[i].tone);
        return (
          <Pressable
            key={`v${i}`}
            onPress={() => onSelect(isSel ? null : i)}
            style={{position: 'absolute', left: p.x - 11, top: p.y - 11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center'}}>
            {isSel && <View style={{position: 'absolute', width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: c, opacity: 0.5}} />}
            <View
              style={{
                width: isSel ? 9 : 6, height: isSel ? 9 : 6, borderRadius: 5, backgroundColor: c,
                borderWidth: 1.2, borderColor: cc.card, opacity: selected == null || isSel ? 1 : 0.4,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  center: {alignItems: 'center', justifyContent: 'center'},
  empty: {fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 18},
  statsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginBottom: 22},
  plotRow: {flexDirection: 'row'},
  yAxis: {width: 30, height: PLOT_H},
  yLabel: {position: 'absolute', right: 6, fontSize: 8.5, fontWeight: '700'},
  peakLabel: {position: 'absolute', width: 60, textAlign: 'center', fontSize: 8.5, fontWeight: '800'},
  tooltip: {position: 'absolute', top: 0, width: TOOLTIP_W, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8},
  tipDate: {fontSize: 11, fontWeight: '800', marginBottom: 4},
  tipLine: {fontSize: 11, fontWeight: '700'},
  tipNote: {fontSize: 9.5, fontWeight: '600', marginTop: 3},
  xRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingLeft: 30},
  xLabel: {fontSize: 9.5, fontWeight: '700'},
  legend: {flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 8},
  swatchRow: {flexDirection: 'row', alignItems: 'center', gap: 4},
});
