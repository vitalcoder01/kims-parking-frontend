import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Icon, IconName} from '../../../components/Icon';
import {PressableScale} from '../../../components/PressableScale';
import type {ParkingSlot} from '../../../context/AppStateContext';
import type {
  SlotClassification, TaskFunnelVolume, DriverAnalytics, DemandHeatmap, OperationalFriction, TaskFunnel,
} from '../../../services/api';
import {useCc, CcKpiVariant} from './ccTheme';
import {Donut, TrendChart, RadarChart} from './charts';
import {
  SLOT_STATE_COLORS, heatColor, slotState, groupSlotsByBlock, blockOccupancy, slotSummary,
  reliabilityAxes, fmtMinutes, Tone,
} from './ccLogic';

/*
 * The presentational building blocks of the command-center dashboard — one
 * definition of each card and chart, mirroring the web app's panels.tsx so
 * the two can never drift into showing different numbers for the same thing.
 * The numbers themselves are computed in ccLogic.ts.
 */

// ── Shared primitives ──────────────────────────────────────────────────

export function Panel({title, right, children}: {title: string; right?: React.ReactNode; children: React.ReactNode}) {
  const cc = useCc();
  return (
    <View style={[s.panel, {backgroundColor: cc.card, borderColor: cc.border}]}>
      <View style={s.panelHead}>
        <Text style={[s.panelTitle, {color: cc.textPrimary}]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Empty({children}: {children: string}) {
  const cc = useCc();
  return <Text style={[s.empty, {color: cc.textMuted}]}>{children}</Text>;
}

function LinkButton({label, onPress}: {label: string; onPress: () => void}) {
  const cc = useCc();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[s.link, {color: cc.accentBlue}]}>{label}</Text>
    </Pressable>
  );
}

function LegendRow({color, label, value}: {color: string; label: string; value: number}) {
  const cc = useCc();
  return (
    <View style={s.legendRow}>
      <View style={[s.legendSq, {backgroundColor: color}]} />
      <Text style={[s.legendLabel, {color: cc.textSecondary}]}>{label}</Text>
      <Text style={[s.legendValue, {color: cc.textPrimary}]}>{value}</Text>
    </View>
  );
}

function LegendDot({color, label}: {color: string; label: string}) {
  const cc = useCc();
  return (
    <View style={s.dotRow}>
      <View style={[s.dot, {backgroundColor: color}]} />
      <Text style={[s.dotLabel, {color: cc.textMuted}]}>{label}</Text>
    </View>
  );
}

function TabPills({tab, onChange}: {tab: 'park' | 'retrieve'; onChange: (t: 'park' | 'retrieve') => void}) {
  const cc = useCc();
  return (
    <View style={s.pills}>
      {(['park', 'retrieve'] as const).map(k => (
        <Pressable
          key={k}
          onPress={() => onChange(k)}
          style={[s.pill, {backgroundColor: tab === k ? cc.accentBlue : cc.cardAlt}]}>
          <Text style={[s.pillTxt, {color: tab === k ? '#fff' : cc.textSecondary}]}>{k === 'park' ? 'Park' : 'Retrieve'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// `grow` only inside a row; in an auto-height column flex:1 would collapse the bar.
function Bar({pct, color, grow}: {pct: number; color: string; grow?: boolean}) {
  const cc = useCc();
  return (
    <View style={[s.barTrack, grow && {flex: 1}, {backgroundColor: cc.divider}]}>
      <View style={[s.barFill, {width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color}]} />
    </View>
  );
}

// ── KPI ────────────────────────────────────────────────────────────────

export function KpiCard({icon, variant, value, label, onPress}: {
  icon: IconName; variant: CcKpiVariant; value: string; label: string; onPress?: () => void;
}) {
  const body = (
    <>
      <Icon name={icon} size={17} color={variant.icon} />
      <Text style={[s.kpiValue, {color: variant.valueText}]}>{value}</Text>
      <Text style={[s.kpiLabel, {color: variant.labelText}]}>{label}</Text>
    </>
  );
  return onPress
    ? <PressableScale onPress={onPress} style={[s.kpi, {backgroundColor: variant.bg}]}>{body}</PressableScale>
    : <View style={[s.kpi, {backgroundColor: variant.bg}]}>{body}</View>;
}

// ── Parking Activity Trends ────────────────────────────────────────────

export const TrendPanel = React.memo(function TrendPanel({days}: {days: {date: string; tasks: number; visitors: number}[]}) {
  return (
    <Panel title="Parking Activity Trends">
      <TrendChart days={days} />
    </Panel>
  );
});

// ── Hourly Demand Heatmap ──────────────────────────────────────────────

export const HeatmapPanel = React.memo(function HeatmapPanel({heatmap}: {heatmap: DemandHeatmap}) {
  const cc = useCc();
  const [hover, setHover] = useState<{row: number; col: number} | null>(null);
  return (
    <Panel title="Hourly Demand Heatmap">
      <View style={s.heatRow}>
        <View style={{width: 26}} />
        {Array.from({length: 24}, (_, h) => (
          <Text key={h} numberOfLines={1} allowFontScaling={false} style={[s.heatHour, {color: cc.textMuted}]}>
            {h % 2 === 0 ? h : ''}
          </Text>
        ))}
      </View>
      {heatmap.weekdayLabels.map((wd, row) => (
        <View key={wd} style={[s.heatRow, {marginTop: 2}]}>
          <Text allowFontScaling={false} style={[s.heatDay, {color: cc.textMuted}]}>{wd.slice(0, 3)}</Text>
          {heatmap.grid[row].map((cell, col) => (
            <Pressable
              key={col}
              onPress={() => setHover(hover?.row === row && hover?.col === col ? null : {row, col})}
              style={[
                s.heatCell,
                {backgroundColor: heatColor(cell.tasks / heatmap.maxTasks, cc.mode)},
                hover?.row === row && hover?.col === col && {borderWidth: 1.5, borderColor: cc.textPrimary},
              ]}
            />
          ))}
        </View>
      ))}
      <View style={s.heatFoot}>
        {hover ? (
          <Text style={[s.heatReadout, {color: cc.textSecondary}]}>
            <Text style={{fontWeight: '800', color: cc.textPrimary}}>{heatmap.weekdayLabels[hover.row]} {hover.col}:00</Text>
            {` — Tasks: ${heatmap.grid[hover.row][hover.col].tasks}, Visitors: ${heatmap.grid[hover.row][hover.col].visitors}`}
          </Text>
        ) : (
          <View style={s.heatLegend}>
            <Text style={[s.heatReadout, {color: cc.textMuted}]}>Low</Text>
            <LinearGradient
              colors={['#4C3A9E', '#B45BC7', '#E8703A', '#F0B23A']}
              start={{x: 0, y: 0}} end={{x: 1, y: 0}}
              style={s.heatRamp}
            />
            <Text style={[s.heatReadout, {color: cc.textMuted}]}>High</Text>
          </View>
        )}
      </View>
    </Panel>
  );
});

// ── Slot utilization (live snapshot) ───────────────────────────────────

export function SlotUtilizationPanel({liveSlots, onViewAll}: {liveSlots: ParkingSlot[]; onViewAll: () => void}) {
  const cc = useCc();
  const sum = useMemo(() => slotSummary(liveSlots), [liveSlots]);
  // The aggregate ring answers "how full", not "where" — per-block bars do.
  const byBlock = useMemo(() => blockOccupancy(liveSlots), [liveSlots]);
  return (
    <Panel title="Slot Utilization">
      {sum.total === 0 ? <Empty>No parking slots configured yet.</Empty> : (
        <>
          <View style={s.donutRow}>
            <Donut
              parts={[{value: sum.occupied, color: cc.danger}, {value: sum.available, color: cc.success}, {value: sum.reserved, color: cc.accentAmber}]}
              centerLabel={`${sum.pct}%`} centerSub="Occupied"
            />
            <View style={s.donutLegend}>
              <LegendRow color={cc.danger} label="Occupied" value={sum.occupied} />
              <LegendRow color={cc.success} label="Available" value={sum.available} />
              <LegendRow color={cc.accentAmber} label="Reserved" value={sum.reserved} />
            </View>
          </View>
          {byBlock.length > 1 && (
            <View style={[s.byBlock, {borderTopColor: cc.divider}]}>
              <Text style={[s.byBlockTitle, {color: cc.textMuted}]}>BY BLOCK</Text>
              {byBlock.map(b => (
                <View key={b.block} style={s.blockRow}>
                  <Text numberOfLines={1} style={[s.blockName, {color: cc.textSecondary}]}>{b.block}</Text>
                  <Bar grow pct={b.pct} color={b.pct >= 80 ? cc.danger : b.pct >= 50 ? cc.accentAmber : cc.success} />
                  <Text style={[s.blockCount, {color: cc.textPrimary}]}>{b.occupied}/{b.total}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
      <PressableScale
        onPress={onViewAll}
        style={[s.wideBtn, {backgroundColor: cc.accentBlue + '1c', borderColor: cc.accentBlue + '44', borderWidth: 1}]}>
        <Text style={[s.wideBtnTxt, {color: cc.accentBlue}]}>View All Slots</Text>
        <Icon name="arrowRight" size={12} color={cc.accentBlue} />
      </PressableScale>
    </Panel>
  );
}

// ── Parking Slot Map (live + period classification) ────────────────────

export function ParkingSlotMapPanel({liveSlots, classById, onOpenSlots}: {
  liveSlots: ParkingSlot[]; classById: Map<string, SlotClassification>; onOpenSlots: (block?: string) => void;
}) {
  const cc = useCc();
  const [selected, setSelected] = useState<string | null>(null);
  const blocks = useMemo(() => groupSlotsByBlock(liveSlots), [liveSlots]);
  const sel = selected ? liveSlots.find(x => x.id === selected) ?? null : null;
  const selState = sel ? slotState(sel, classById) : null;
  const selUsage = sel ? classById.get(sel.id) : undefined;

  if (liveSlots.length === 0) {
    return <Panel title="Parking Slot Map"><Empty>No parking slots configured yet.</Empty></Panel>;
  }
  return (
    <Panel title="Parking Slot Map" right={<LinkButton label="All Areas →" onPress={() => onOpenSlots()} />}>
      <View style={{gap: 12}}>
        {blocks.map(b => (
          <View key={b.name}>
            <Text style={[s.mapBlock, {color: cc.textMuted}]}>{b.name} Block</Text>
            <View style={s.mapGrid}>
              {b.slots.map(sl => {
                const on = sl.id === selected;
                return (
                  <Pressable
                    key={sl.id}
                    onPress={() => setSelected(on ? null : sl.id)}
                    style={[
                      s.mapCell,
                      {backgroundColor: slotState(sl, classById).color, opacity: on ? 1 : 0.85},
                      on && {borderWidth: 1.5, borderColor: cc.textPrimary},
                    ]}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {sel && selState && (
        <View style={[s.mapDetail, {backgroundColor: cc.cardAlt, borderColor: cc.border}]}>
          <View style={s.mapDetailHead}>
            <Text style={[s.mapDetailId, {color: cc.textPrimary}]}>{sel.id}</Text>
            <Pressable onPress={() => setSelected(null)} hitSlop={10}>
              <Icon name="close" size={13} color={cc.textMuted} />
            </Pressable>
          </View>
          <Text style={[s.mapDetailState, {color: selState.color}]}>{selState.label}</Text>
          {(selUsage === 'OVERLOADED' || selUsage === 'UNDERUTILIZED') && (
            <Text style={[s.mapDetailNote, {color: cc.textMuted}]}>
              {selUsage === 'OVERLOADED' ? 'Well above average use this period' : 'Well below average use this period'}
            </Text>
          )}
          <View style={{marginTop: 8, alignSelf: 'flex-start'}}>
            <LinkButton label="Open the map →" onPress={() => onOpenSlots(sel.block)} />
          </View>
        </View>
      )}

      <View style={[s.mapLegend, {borderTopColor: cc.divider}]}>
        <LegendDot color={SLOT_STATE_COLORS.available} label="Available" />
        <LegendDot color={SLOT_STATE_COLORS.occupied} label="Occupied" />
        <LegendDot color={SLOT_STATE_COLORS.underutilized} label="Underutilized" />
        <LegendDot color={SLOT_STATE_COLORS.overloaded} label="Overloaded" />
        <LegendDot color={SLOT_STATE_COLORS.reserved} label="Reserved" />
      </View>
    </Panel>
  );
}

// ── Task funnel (volume) ───────────────────────────────────────────────

export const TaskFunnelPanel = React.memo(function TaskFunnelPanel({funnelVolume}: {funnelVolume: TaskFunnelVolume}) {
  const cc = useCc();
  const stageColors = [cc.accentBlue, cc.accentIndigo, cc.accentAmber, cc.accentGreen];
  const [tab, setTab] = useState<'park' | 'retrieve'>('park');
  const data = funnelVolume[tab];
  const maxCount = Math.max(1, ...data.stages.map(x => x.count));
  return (
    <Panel title="Task Funnel" right={<TabPills tab={tab} onChange={setTab} />}>
      {data.sampleSize === 0 ? <Empty>{`No ${tab} tasks in this period.`}</Empty> : (
        <View style={{gap: 9}}>
          {data.stages.map((st, i) => (
            <View key={st.key}>
              <View style={s.funnelHead}>
                <Text style={[s.funnelLabel, {color: cc.textSecondary}]}>{st.label}</Text>
                <Text style={[s.funnelValue, {color: cc.textPrimary}]}>
                  {st.count}{st.avgMinutesFromCreation != null && st.avgMinutesFromCreation > 0 ? ` · ${Math.round(st.avgMinutesFromCreation)}m` : ''}
                </Text>
              </View>
              <Bar pct={(st.count / maxCount) * 100} color={stageColors[i % stageColors.length]} />
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
});

// ── Top Drivers ────────────────────────────────────────────────────────

export const TopDriversPanel = React.memo(function TopDriversPanel({drivers, onViewAll}: {drivers: DriverAnalytics[]; onViewAll: () => void}) {
  const cc = useCc();
  const active = drivers.filter(d => d.totalCompleted > 0).slice(0, 5);
  const maxV = Math.max(1, ...active.map(d => d.totalCompleted));
  return (
    <Panel title="Top Drivers" right={<LinkButton label="By Tasks" onPress={onViewAll} />}>
      {active.length === 0 ? <Empty>No completed jobs yet.</Empty> : (
        <View style={{gap: 9}}>
          {active.map((d, i) => (
            <View key={d.id} style={s.driverRow}>
              <Text style={[s.driverRank, {color: cc.textMuted}]}>#{i + 1}</Text>
              <Text numberOfLines={1} style={[s.driverName, {color: cc.textPrimary}]}>{d.name}</Text>
              <Bar grow pct={(d.totalCompleted / maxV) * 100} color={cc.accentCyan} />
              <Text style={[s.driverCount, {color: cc.textPrimary}]}>{d.totalCompleted}</Text>
            </View>
          ))}
        </View>
      )}
      <PressableScale onPress={onViewAll} style={[s.wideBtn, {backgroundColor: cc.accentBlue + '18', height: 32}]}>
        <Text style={[s.wideBtnTxt, {color: cc.accentBlue, fontSize: 11}]}>View All Drivers →</Text>
      </PressableScale>
    </Panel>
  );
});

// ── Service Reliability ────────────────────────────────────────────────

export const ServiceReliabilityPanel = React.memo(function ServiceReliabilityPanel({friction}: {friction: OperationalFriction}) {
  const cc = useCc();
  const [selected, setSelected] = useState<number | null>(null);
  const axes = useMemo(() => reliabilityAxes(friction), [friction]);
  const chartAxes = useMemo(() => axes.map(a => ({pct: a.pct, tone: a.tone})), [axes]);
  const toneColor = (t: Tone) => (t === 'danger' ? cc.danger : t === 'warn' ? cc.warning : cc.textPrimary);
  const toggle = (i: number) => setSelected(cur => (cur === i ? null : i));
  const cur = selected != null ? axes[selected] : null;
  return (
    <Panel title="Service Reliability">
      {friction.totalTasks === 0 ? <Empty>No tasks in this period.</Empty> : (
        <View>
          <View style={s.reliRow}>
            <RadarChart axes={chartAxes} selected={selected} onSelect={setSelected} />
            <View style={s.reliLegend}>
              {axes.map((ax, i) => (
                <Pressable
                  key={ax.label}
                  onPress={() => toggle(i)}
                  style={[s.reliItem, {backgroundColor: selected === i ? cc.cardAlt : 'transparent'}]}>
                  <Text style={[s.reliLabel, {color: selected === i ? cc.textPrimary : cc.textSecondary}]}>{ax.label}</Text>
                  <Text style={[s.reliRaw, {color: toneColor(ax.tone)}]}>{ax.raw}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {cur && (
            <View style={[s.reliDetail, {borderTopColor: cc.divider}]}>
              <Text style={[s.reliDetailTxt, {color: cc.textSecondary}]}>
                <Text style={{color: toneColor(cur.tone), fontWeight: '800'}}>{cur.label}: </Text>
                {cur.detail}
              </Text>
            </View>
          )}
        </View>
      )}
    </Panel>
  );
});

// ── Process Timing ─────────────────────────────────────────────────────
// A sequence (assigned → key collected → parked, each strictly after the
// last), so it is drawn as one: a connected rail of steps, each carrying its
// share of the total time. The slowest step — identified server-side, never
// guessed here — is the one break from the neutral palette.
function TimingWaterfall({stages, bottleneckKey}: {
  stages: {key: string; label: string; avgMinutes: number; sampleSize: number}[]; bottleneckKey?: string;
}) {
  const cc = useCc();
  const total = stages.reduce((a, x) => a + x.avgMinutes, 0) || 1;
  const palette = [cc.accentBlue, cc.accentIndigo, cc.accentCyan, cc.accentPurple, cc.accentAmber];
  return (
    <View>
      {stages.map((st, i) => {
        const isBottleneck = st.key === bottleneckKey;
        const isLast = i === stages.length - 1;
        const color = isBottleneck ? cc.danger : palette[i % palette.length];
        return (
          <View key={st.key} style={s.tlRow}>
            <View style={s.tlRail}>
              <View style={[s.tlHalo, {backgroundColor: color + '22', width: isBottleneck ? 16 : 14, height: isBottleneck ? 16 : 14, borderRadius: 8}]}>
                <View style={{width: isBottleneck ? 10 : 8, height: isBottleneck ? 10 : 8, borderRadius: 5, backgroundColor: color}} />
              </View>
              {!isLast && <View style={[s.tlLine, {backgroundColor: cc.divider}]} />}
            </View>
            <View style={[s.tlBody, {paddingBottom: isLast ? 2 : 14}]}>
              <View style={s.tlHead}>
                <Text style={[s.tlLabel, {color: isBottleneck ? cc.danger : cc.textPrimary}]}>{st.label}{isBottleneck ? ' ⚠' : ''}</Text>
                <Text style={[s.tlValue, {color: isBottleneck ? cc.danger : cc.textPrimary}]}>
                  {fmtMinutes(st.avgMinutes)}<Text style={{fontWeight: '600', color: cc.textMuted, fontSize: 9.5}}> · n={st.sampleSize}</Text>
                </Text>
              </View>
              <View style={[s.tlTrack, {backgroundColor: cc.divider}]}>
                <View style={[s.tlFill, {width: `${Math.max((st.avgMinutes / total) * 100, 4)}%`, backgroundColor: color}]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export const ProcessTimingPanel = React.memo(function ProcessTimingPanel({funnel}: {funnel: TaskFunnel}) {
  const cc = useCc();
  const [tab, setTab] = useState<'park' | 'retrieve'>('park');
  const data = funnel[tab];
  const timed = data.stages.filter(x => x.avgMinutes != null).map(x => ({...x, avgMinutes: x.avgMinutes as number}));
  return (
    <Panel title="Process Timing" right={<TabPills tab={tab} onChange={setTab} />}>
      {data.sampleSize === 0 || timed.length === 0 ? (
        <Empty>{`Not enough completed ${tab} tasks yet to time this stage-by-stage.`}</Empty>
      ) : (
        <>
          <TimingWaterfall stages={timed} bottleneckKey={data.bottleneck?.key} />
          {data.bottleneck && (
            <Text style={[s.tlNote, {color: cc.textMuted}]}>
              Slowest step: <Text style={{color: cc.danger, fontWeight: '800'}}>{data.bottleneck.label}</Text>
              {` averages ${Math.round(data.bottleneck.avgMinutes ?? 0)}m — the best place to speed up ${tab === 'park' ? 'parking' : 'retrieval'}.`}
            </Text>
          )}
        </>
      )}
    </Panel>
  );
});

const s = StyleSheet.create({
  panel: {borderRadius: 14, borderWidth: 1, padding: 16},
  panelHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8},
  panelTitle: {fontSize: 13.5, fontWeight: '800', letterSpacing: -0.1},
  empty: {fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 18},
  link: {fontSize: 11, fontWeight: '800'},

  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  legendSq: {width: 9, height: 9, borderRadius: 3},
  legendLabel: {flex: 1, fontSize: 11},
  legendValue: {fontSize: 11, fontWeight: '800'},
  dotRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  dot: {width: 8, height: 8, borderRadius: 2},
  dotLabel: {fontSize: 10, fontWeight: '700'},

  pills: {flexDirection: 'row', gap: 4},
  pill: {paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999},
  pillTxt: {fontSize: 10, fontWeight: '800'},

  barTrack: {height: 7, borderRadius: 4, overflow: 'hidden'},
  barFill: {height: 7, borderRadius: 4},

  kpi: {flex: 1, borderRadius: 14, padding: 14, minWidth: 0},
  kpiValue: {fontSize: 22, fontWeight: '900', marginTop: 8, letterSpacing: -0.5},
  kpiLabel: {fontSize: 11, fontWeight: '700', marginTop: 1},

  heatRow: {flexDirection: 'row', gap: 2, alignItems: 'center'},
  heatHour: {flex: 1, fontSize: 7.5, textAlign: 'center'},
  heatDay: {width: 26, fontSize: 9, fontWeight: '700'},
  heatCell: {flex: 1, aspectRatio: 1, borderRadius: 2},
  heatFoot: {marginTop: 10, minHeight: 14, alignItems: 'center', justifyContent: 'center'},
  heatReadout: {fontSize: 10.5, textAlign: 'center'},
  heatLegend: {flexDirection: 'row', alignItems: 'center', gap: 6},
  heatRamp: {width: 40, height: 6, borderRadius: 3},

  donutRow: {flexDirection: 'row', alignItems: 'center', gap: 14},
  donutLegend: {flex: 1, gap: 8, minWidth: 0},
  byBlock: {marginTop: 14, paddingTop: 12, borderTopWidth: 1, gap: 8},
  byBlockTitle: {fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3},
  blockRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  blockName: {width: 46, fontSize: 10.5, fontWeight: '700'},
  blockCount: {width: 40, fontSize: 10, fontWeight: '800', textAlign: 'right'},
  wideBtn: {marginTop: 14, height: 34, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6},
  wideBtnTxt: {fontSize: 11.5, fontWeight: '800'},

  mapBlock: {fontSize: 10, fontWeight: '800', marginBottom: 6},
  mapGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 5},
  mapCell: {width: 26, height: 24, borderRadius: 5},
  mapDetail: {marginTop: 12, borderRadius: 10, borderWidth: 1, padding: 12},
  mapDetailHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  mapDetailId: {fontSize: 12.5, fontWeight: '900'},
  mapDetailState: {fontSize: 11, fontWeight: '800', marginTop: 4},
  mapDetailNote: {fontSize: 10.5, marginTop: 2},
  mapLegend: {flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1},

  funnelHead: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3},
  funnelLabel: {fontSize: 10.5, fontWeight: '700'},
  funnelValue: {fontSize: 10.5, fontWeight: '800'},

  driverRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  driverRank: {width: 18, fontSize: 10, fontWeight: '800'},
  driverName: {width: 76, fontSize: 10.5, fontWeight: '700'},
  driverCount: {width: 28, fontSize: 10.5, fontWeight: '800', textAlign: 'right'},

  reliRow: {flexDirection: 'row', alignItems: 'center', gap: 14},
  reliLegend: {flex: 1, gap: 4, minWidth: 0},
  reliItem: {flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6},
  reliLabel: {fontSize: 9.5, fontWeight: '700'},
  reliRaw: {fontSize: 11, fontWeight: '900'},
  reliDetail: {marginTop: 10, paddingTop: 8, borderTopWidth: 1},
  reliDetailTxt: {fontSize: 10.5, fontWeight: '600'},

  tlRow: {flexDirection: 'row', gap: 11},
  tlRail: {width: 16, alignItems: 'center'},
  tlHalo: {alignItems: 'center', justifyContent: 'center'},
  tlLine: {flex: 1, width: 2, minHeight: 14, marginTop: 3},
  tlBody: {flex: 1, minWidth: 0},
  tlHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8},
  tlLabel: {flexShrink: 1, fontSize: 11.5, fontWeight: '800'},
  tlValue: {fontSize: 11, fontWeight: '800'},
  tlTrack: {height: 5, borderRadius: 999, marginTop: 6, overflow: 'hidden'},
  tlFill: {height: 5, borderRadius: 999},
  tlNote: {marginTop: 12, fontSize: 10, fontWeight: '600'},
});
