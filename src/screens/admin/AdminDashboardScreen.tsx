import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {Badge} from '../../components/Badge';

const LIVE_ACTIVITY = [
  {icon: '🚗', text: 'TS-09-CD-5678 parked at B-114',     sub: 'Mohan Rao · 2 min ago',        type: 'success' as const},
  {icon: '🔄', text: 'MH-02-AB-1234 retrieval requested', sub: 'Dr. Priya Sharma · 5 min ago', type: 'info'    as const},
  {icon: '✅', text: 'AP-28-EF-9012 task assigned',        sub: 'Ravi Teja → Block C',           type: 'primary' as const},
  {icon: '📍', text: 'KA-05-GH-3456 received at Gate 2',  sub: 'Rajan Mehta · 11 min ago',     type: 'warning' as const},
  {icon: '✅', text: 'MH-14-KL-2222 delivered to Gate 1', sub: 'Arjun Singh · 18 min ago',     type: 'success' as const},
];

const BLOCKS = [
  {name: 'Block A', total: 60, used: 47},
  {name: 'Block B', total: 60, used: 28},
  {name: 'Block C', total: 40, used: 36},
  {name: 'Block D', total: 40, used: 12},
];

const STAFF = [
  {name: 'Rajan Mehta',  role: 'Valet',           loc: 'Gate 1',  status: 'available'},
  {name: 'Suresh Kumar', role: 'Parking Driver',   loc: 'Block A', status: 'busy'},
  {name: 'Mohan Rao',    role: 'Parking Driver',   loc: 'Block B', status: 'busy'},
  {name: 'Ravi Teja',    role: 'Parking Driver',   loc: 'Gate 2',  status: 'available'},
  {name: 'Arjun Singh',  role: 'Retrieval Driver', loc: 'Block D', status: 'busy'},
  {name: 'Prasad N.',    role: 'Retrieval Driver', loc: 'Gate 1',  status: 'available'},
];

type ActivityType = 'success' | 'info' | 'primary' | 'warning';

export function AdminDashboardScreen() {
  const {colors, isDark} = useTheme();
  const {user} = useAuth();
  const {tasks, drivers, slots, visitors} = useAppState();

  const liveTasks    = tasks.filter(t => t.status !== 'completed');
  const busyDrivers  = drivers.filter(d => d.status === 'busy').length;
  const parkedCars   = slots.filter(s => s.status === 'occupied').length;
  const pendingRetrieval = tasks.filter(t => t.type === 'retrieve' && t.status !== 'completed').length;

  const liveActivity = [
    ...tasks.slice(-5).reverse().map(t => ({
      icon: t.status === 'completed' ? '✅' : t.type === 'park' ? '🚗' : '🔄',
      text: `${t.carNumber} — ${t.type === 'park' ? 'parked' : 'retrieved'} ${t.slotId ? `at ${t.slotId}` : ''}`,
      sub: `${t.doctorName} · ${t.driverName ?? 'Unassigned'}`,
      type: t.status === 'completed' ? 'success' as const : t.type === 'park' ? 'primary' as const : 'info' as const,
    })),
    ...LIVE_ACTIVITY.slice(0, Math.max(0, 5 - tasks.length)),
  ].slice(0, 5);

  const totalSlots = BLOCKS.reduce((a, b) => a + b.total, 0);
  const usedSlots  = BLOCKS.reduce((a, b) => a + b.used,  0);
  const fillPct    = Math.round((usedSlots / totalSlots) * 100);

  const fillColor = (pct: number) =>
    pct > 80 ? colors.error : pct > 60 ? colors.warning : colors.primary;

  const actColor: Record<ActivityType, string> = {
    success: colors.success,
    info:    '#1A72E8',
    primary: colors.primary,
    warning: colors.warning,
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={[s.header, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          <View style={{flex: 1}}>
            <Text style={[s.hSub, {color: colors.textSecondary}]}>Admin Panel</Text>
            <Text style={[s.hName, {color: colors.textPrimary}]}>{user?.name ?? 'Admin'}</Text>
            <Text style={[s.hDate, {color: colors.textMuted}]}>Wednesday, 16 July 2026 · 10:47 AM</Text>
          </View>
          <Badge label="Live" variant="success" dot />
        </View>

        {/* Metrics 2×2 */}
        <View style={s.metricsGrid}>
          {([
            {n: String(parkedCars),        l: 'Vehicles\nParked',   c: colors.primary,  ic: '🅿️'},
            {n: String(busyDrivers),       l: 'Staff\nOn Duty',     c: '#1A72E8',       ic: '👥'},
            {n: String(liveTasks.length),  l: 'Tasks\nActive',      c: colors.warning,  ic: '⚡'},
            {n: String(pendingRetrieval),  l: 'Retrieval\nPending', c: colors.success,  ic: '🔄'},
          ] as const).map(m => (
            <View
              key={m.l}
              style={[
                s.metricCard,
                {backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: m.c},
              ]}>
              <Text style={s.metricIc}>{m.ic}</Text>
              <Text style={[s.metricNum, {color: m.c}]}>{m.n}</Text>
              <Text style={[s.metricLbl, {color: colors.textMuted}]}>{m.l}</Text>
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
            {BLOCKS.map((b, i) => {
              const pct = Math.round((b.used / b.total) * 100);
              const bc  = fillColor(pct);
              return (
                <View key={b.name} style={[s.blockRow, i < BLOCKS.length - 1 && {marginBottom: 10}]}>
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

          {/* Staff on duty */}
          <Text style={[s.sec, {color: colors.textMuted}]}>STAFF ON DUTY</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {STAFF.map((st, i) => {
              const initials = st.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              const busy     = st.status === 'busy';
              return (
                <View
                  key={st.name}
                  style={[
                    s.staffRow,
                    {borderBottomColor: colors.divider},
                    i === STAFF.length - 1 && {borderBottomWidth: 0},
                  ]}>
                  <View style={[s.avatar, {backgroundColor: colors.primary + '1A', borderColor: colors.primary + '30'}]}>
                    <Text style={[s.avatarTxt, {color: colors.primary}]}>{initials}</Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={[s.staffName, {color: colors.textPrimary}]}>{st.name}</Text>
                    <Text style={[s.staffMeta, {color: colors.textSecondary}]}>
                      {st.role} · {st.loc}
                    </Text>
                  </View>
                  <Badge label={busy ? 'On Task' : 'Free'} variant={busy ? 'warning' : 'success'} dot />
                </View>
              );
            })}
          </View>

          {/* Live activity */}
          <Text style={[s.sec, {color: colors.textMuted}]}>LIVE ACTIVITY</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {liveActivity.map((a, i) => (
              <View
                key={i}
                style={[
                  s.actRow,
                  {borderBottomColor: colors.divider},
                  i === LIVE_ACTIVITY.length - 1 && {borderBottomWidth: 0},
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

  metricsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: 'transparent'},
  metricCard: {
    width: '50%', flexGrow: 1,
    borderWidth: 0.5, borderLeftWidth: 4,
    paddingHorizontal: 16, paddingVertical: 18,
  },
  metricIc: {fontSize: 20, marginBottom: 8},
  metricNum: {fontSize: 32, fontWeight: '900', letterSpacing: -1},
  metricLbl: {fontSize: 10, fontWeight: '600', marginTop: 3},

  pad: {padding: 16},
  sec: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.3,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },

  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 4},

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
