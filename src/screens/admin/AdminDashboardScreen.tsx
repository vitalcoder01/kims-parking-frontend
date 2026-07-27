import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {Badge} from '../../components/Badge';

type ActivityType = 'success' | 'info' | 'primary' | 'warning';

export function AdminDashboardScreen() {
  const {colors, isDark} = useTheme();
  const {user} = useAuth();
  const {tasks, drivers, slots} = useAppState();

  const liveTasks    = tasks.filter(t => t.status !== 'completed');
  const busyDrivers  = drivers.filter(d => d.status === 'busy').length;
  const parkedCars   = slots.filter(s => s.status === 'occupied').length;
  const pendingRetrieval = tasks.filter(t => t.type === 'retrieve' && t.status !== 'completed').length;

  // Real per-block occupancy — replaces the old hardcoded 4-block mockup,
  // which didn't even match this hospital's actual 3-block/90-slot layout.
  const blockStats = React.useMemo(() => {
    const byBlock = new Map<string, {total: number; used: number}>();
    for (const sl of slots) {
      const entry = byBlock.get(sl.block) ?? {total: 0, used: 0};
      entry.total += 1;
      if (sl.status === 'occupied') entry.used += 1;
      byBlock.set(sl.block, entry);
    }
    return [...byBlock.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, v]) => ({name: `Block ${name}`, ...v}));
  }, [slots]);

  const totalSlots = slots.length;
  const usedSlots  = parkedCars;
  const fillPct    = totalSlots ? Math.round((usedSlots / totalSlots) * 100) : 0;

  const fillColor = (pct: number) =>
    pct > 80 ? colors.error : pct > 60 ? colors.warning : colors.primary;

  const actColor: Record<ActivityType, string> = {
    success: colors.success,
    info:    '#1A72E8',
    primary: colors.primary,
    warning: colors.warning,
  };

  const liveActivity = tasks.slice(0, 5).map(t => ({
    icon: t.status === 'completed' ? '✅' : t.type === 'park' ? '🚗' : '🔄',
    text: `${t.carNumber} — ${t.type === 'park' ? 'parked' : 'retrieved'}${t.slotId ? ` at ${t.slotId}` : ''}`,
    sub: `${t.doctorName} · ${t.driverName ?? 'Unassigned'}`,
    type: t.status === 'completed' ? 'success' as const : t.type === 'park' ? 'primary' as const : 'info' as const,
  }));

  const today = new Date().toLocaleDateString(undefined, {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={[s.header, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          <View style={{flex: 1}}>
            <Text style={[s.hSub, {color: colors.textSecondary}]}>Admin Panel</Text>
            <Text style={[s.hName, {color: colors.textPrimary}]}>{user?.name ?? 'Admin'}</Text>
            <Text style={[s.hDate, {color: colors.textMuted}]}>{today}</Text>
          </View>
          <Badge label="Live" variant="success" dot />
        </View>

        {/* Metrics 2×2 — two explicit rows rather than a flex-wrap grid, since
            wrap + percentage widths + borders was rounding just over 100%
            per row and silently collapsing every card to one-per-row. */}
        <View style={s.metricsPad}>
          {[
            [
              {n: String(parkedCars),        l: 'Vehicles Parked',   c: colors.primary,  ic: '🅿️'},
              {n: String(busyDrivers),       l: 'Drivers On Duty',   c: '#1A72E8',       ic: '👥'},
            ],
            [
              {n: String(liveTasks.length),  l: 'Tasks Active',      c: colors.warning,  ic: '⚡'},
              {n: String(pendingRetrieval),  l: 'Retrieval Pending', c: colors.success,  ic: '🔄'},
            ],
          ].map((row, ri) => (
            <View key={ri} style={s.metricsRow}>
              {row.map(m => (
                <View
                  key={m.l}
                  style={[s.metricCard, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: m.c}]}>
                  <View style={[s.metricIcBadge, {backgroundColor: m.c + '18'}]}>
                    <Text style={s.metricIc}>{m.ic}</Text>
                  </View>
                  <Text style={[s.metricNum, {color: colors.textPrimary}]}>{m.n}</Text>
                  <Text style={[s.metricLbl, {color: colors.textMuted}]}>{m.l}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={s.pad}>

          {/* Parking occupancy */}
          <Text style={[s.sec, {color: colors.textMuted}]}>PARKING OCCUPANCY</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>

            {/* Overall */}
            <View style={s.ocvHead}>
              <View>
                <Text style={[s.ocvLabel, {color: colors.textMuted}]}>OVERALL</Text>
                <Text style={[s.ocvFrac, {color: colors.textPrimary}]}>
                  {usedSlots}
                  <Text style={[s.ocvTotal, {color: colors.textMuted}]}>/{totalSlots}</Text>
                </Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={[s.ocvPctLabel, {color: colors.textMuted}]}>FULL</Text>
                <Text style={[s.ocvPct, {color: fillColor(fillPct)}]}>{fillPct}%</Text>
              </View>
            </View>
            <View style={[s.mainTrack, {backgroundColor: isDark ? '#2A2A2A' : '#EBEBEB'}]}>
              <View style={[s.mainFill, {width: `${fillPct}%` as any, backgroundColor: fillColor(fillPct)}]} />
            </View>

            <View style={[s.divider, {backgroundColor: colors.divider}]} />

            {/* Per-block */}
            {blockStats.length === 0 ? (
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No parking slots configured yet</Text>
            ) : blockStats.map((b, i) => {
              const pct = b.total ? Math.round((b.used / b.total) * 100) : 0;
              const bc  = fillColor(pct);
              return (
                <View key={b.name} style={[s.blockRow, i < blockStats.length - 1 && {marginBottom: 10}]}>
                  <Text style={[s.blockName, {color: colors.textSecondary}]}>{b.name}</Text>
                  <View style={[s.blockTrack, {backgroundColor: isDark ? '#2A2A2A' : '#EBEBEB'}]}>
                    <View style={[s.blockFill, {width: `${pct}%` as any, backgroundColor: bc}]} />
                  </View>
                  <Text style={[s.blockFrac, {color: colors.textPrimary}]}>
                    {b.used}/{b.total}
                  </Text>
                  <Text style={[s.blockPct, {color: bc}]}>{pct}%</Text>
                </View>
              );
            })}
          </View>

          {/* Drivers on duty */}
          <Text style={[s.sec, {color: colors.textMuted}]}>DRIVERS ON DUTY</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {drivers.length === 0 ? (
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No drivers added yet</Text>
            ) : drivers.map((d, i) => {
              const initials = d.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              const busy     = d.status === 'busy';
              return (
                <View
                  key={d.id}
                  style={[
                    s.staffRow,
                    {borderBottomColor: colors.divider},
                    i === drivers.length - 1 && {borderBottomWidth: 0},
                  ]}>
                  <View style={[s.avatar, {backgroundColor: colors.primary + '1A', borderColor: colors.primary + '30'}]}>
                    <Text style={[s.avatarTxt, {color: colors.primary}]}>{initials}</Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={[s.staffName, {color: colors.textPrimary}]}>{d.name}</Text>
                    <Text style={[s.staffMeta, {color: colors.textSecondary}]}>Driver</Text>
                  </View>
                  <Badge label={d.status === 'off' ? 'Off Duty' : busy ? 'On Task' : 'Free'} variant={d.status === 'off' ? 'muted' : busy ? 'warning' : 'success'} dot />
                </View>
              );
            })}
          </View>

          {/* Live activity */}
          <Text style={[s.sec, {color: colors.textMuted}]}>LIVE ACTIVITY</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {liveActivity.length === 0 ? (
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No activity yet today</Text>
            ) : liveActivity.map((a, i) => (
              <View
                key={i}
                style={[
                  s.actRow,
                  {borderBottomColor: colors.divider},
                  i === liveActivity.length - 1 && {borderBottomWidth: 0},
                ]}>
                <View style={[s.actStripe, {backgroundColor: actColor[a.type]}]} />
                <Text style={s.actIcon}>{a.icon}</Text>
                <View style={{flex: 1}}>
                  <Text style={[s.actText, {color: colors.textPrimary}]}>{a.text}</Text>
                  <Text style={[s.actSub, {color: colors.textMuted}]}>{a.sub}</Text>
                </View>
              </View>
            ))}
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {paddingBottom: 40},

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  hSub: {fontSize: 11, fontWeight: '600'},
  hName: {fontSize: 20, fontWeight: '900', letterSpacing: -0.4, marginTop: 2},
  hDate: {fontSize: 11, marginTop: 3},

  metricsPad: {paddingHorizontal: 16, paddingTop: 16, gap: 12},
  metricsRow: {flexDirection: 'row', gap: 12},
  metricCard: {
    flex: 1, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 18,
    shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
  },
  metricIcBadge: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  metricIc: {fontSize: 19},
  metricNum: {fontSize: 30, fontWeight: '900', letterSpacing: -1},
  metricLbl: {fontSize: 11, fontWeight: '600', marginTop: 4},

  pad: {padding: 16},
  sec: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.3,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },

  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 4},
  emptyTxt: {fontSize: 12, fontWeight: '600', padding: 16, textAlign: 'center'},

  ocvHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 14, paddingBottom: 10},
  ocvLabel: {fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2},
  ocvFrac: {fontSize: 28, fontWeight: '900'},
  ocvTotal: {fontSize: 18},
  ocvPctLabel: {fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2},
  ocvPct: {fontSize: 28, fontWeight: '900'},
  mainTrack: {height: 10, marginHorizontal: 14, borderRadius: 5, overflow: 'hidden', marginBottom: 14},
  mainFill: {height: '100%', borderRadius: 5},
  divider: {height: 1, marginHorizontal: 14, marginBottom: 14},

  blockRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14},
  blockName: {width: 58, fontSize: 12, fontWeight: '600'},
  blockTrack: {flex: 1, height: 6, borderRadius: 3, overflow: 'hidden'},
  blockFill: {height: '100%', borderRadius: 3},
  blockFrac: {width: 40, fontSize: 11, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums']},
  blockPct: {width: 32, fontSize: 10, fontWeight: '700', textAlign: 'right'},

  staffRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarTxt: {fontSize: 11, fontWeight: '900'},
  staffName: {fontSize: 13, fontWeight: '700'},
  staffMeta: {fontSize: 11, marginTop: 2},

  actRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, gap: 10,
  },
  actStripe: {width: 3, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0},
  actIcon: {fontSize: 18, lineHeight: 22, flexShrink: 0},
  actText: {fontSize: 13, fontWeight: '600'},
  actSub: {fontSize: 11, marginTop: 2},
});
