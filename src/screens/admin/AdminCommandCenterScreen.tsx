import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useIsFocused} from '@react-navigation/native';
import {useTheme} from '../../context/ThemeContext';
import {useAppState} from '../../context/AppStateContext';
import {PressableScale} from '../../components/PressableScale';
import {Icon} from '../../components/Icon';
import {analyticsApi, AnalyticsPeriod, CommandCenterBundle, SlotClassification} from '../../services/api';
import {CcThemeContext, ccDark, ccLight, useCc} from './commandcenter/ccTheme';
import {
  KpiCard, SlotUtilizationPanel, TrendPanel, HeatmapPanel, ParkingSlotMapPanel,
  TaskFunnelPanel, TopDriversPanel, ServiceReliabilityPanel, ProcessTimingPanel,
} from './commandcenter/panels';
import {periodDateRangeLabel, fmtInt} from './commandcenter/ccLogic';

const PERIODS: {key: AnalyticsPeriod; label: string}[] = [
  {key: 'daily', label: 'Today'},
  {key: 'weekly', label: 'This Week'},
  {key: 'monthly', label: 'This Month'},
  {key: 'yearly', label: 'This Year'},
  {key: 'all', label: 'All-time'},
];

// A background refresh runs 13 queries server-side, so it waits for a quiet
// moment after the last live event and never fires more often than this.
const LIVE_REFRESH_QUIET_MS = 4000;
const LIVE_REFRESH_MIN_GAP_MS = 15000;
const STALE_ON_FOCUS_MS = 30000;

/*
 * The admin's Dashboard tab: the web app's command-center dashboard on a
 * phone — the same data (analyticsApi.commandCenter), the same panels, in one
 * scrolling column. Follows the app's own light/dark setting.
 */
export function AdminCommandCenterScreen() {
  const {isDark} = useTheme();
  return (
    <CcThemeContext.Provider value={isDark ? ccDark : ccLight}>
      <DashboardBody />
    </CcThemeContext.Provider>
  );
}

function DashboardBody() {
  const cc = useCc();
  const navigation = useNavigation<any>();
  const focused = useIsFocused();
  const {slots: liveSlots, tasks: liveTasks, visitors: liveVisitors, notifications: liveNotifications} = useAppState();

  const [period, setPeriod] = useState<AnalyticsPeriod>('daily');
  const [data, setData] = useState<CommandCenterBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Only the newest request may write: a slow response for the previous
  // period must never overwrite the one the admin just switched to.
  const seq = useRef(0);
  const lastFetchRef = useRef(Date.now());
  const load = useCallback((p: AnalyticsPeriod, silent?: boolean) => {
    const mine = ++seq.current;
    lastFetchRef.current = Date.now();
    if (!silent) setLoading(true);
    analyticsApi.commandCenter(p)
      .then(d => { if (mine === seq.current) { setData(d); setErr(null); } })
      .catch(() => { if (mine === seq.current && !silent) setErr('Could not load dashboard data'); })
      .finally(() => {
        if (mine !== seq.current) return;
        if (!silent) setLoading(false);
        setRefreshing(false);
      });
  }, []);
  useEffect(() => { load(period); }, [period, load]);

  // Live refresh: tasks/visitors/notifications are already patched in real
  // time by AppStateContext from socket events, so any change to them
  // schedules a quiet, rate-limited background refetch. Only while this tab
  // is in front — screens stay mounted after the first visit.
  const periodRef = useRef(period);
  periodRef.current = period;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedOnceRef = useRef(false);
  useEffect(() => {
    if (!mountedOnceRef.current) { mountedOnceRef.current = true; return; }
    if (!focused) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const sinceLast = Date.now() - lastFetchRef.current;
      const fire = () => load(periodRef.current, true);
      if (sinceLast >= LIVE_REFRESH_MIN_GAP_MS) fire();
      else timerRef.current = setTimeout(fire, LIVE_REFRESH_MIN_GAP_MS - sinceLast);
    }, LIVE_REFRESH_QUIET_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [liveTasks, liveVisitors, liveNotifications, focused, load]);

  // Coming back to the tab after a while away: catch up.
  useEffect(() => {
    if (focused && Date.now() - lastFetchRef.current > STALE_ON_FOCUS_MS) load(periodRef.current, true);
  }, [focused, load]);

  const classById = useMemo(() => {
    const m = new Map<string, SlotClassification>();
    if (data) for (const sl of data.slots.slots) m.set(sl.id, sl.classification);
    return m;
  }, [data]);

  const openMap = useCallback((block?: string) => navigation.navigate('Map', block ? {focusBlock: block} : undefined), [navigation]);
  const openDrivers = useCallback(() => navigation.navigate('Staff'), [navigation]);
  const openAttendance = useCallback(() => navigation.navigate('Attendance'), [navigation]);

  if (loading && !data) {
    return (
      <View style={[s.center, {backgroundColor: cc.bg}]}>
        <ActivityIndicator color={cc.accentBlue} />
        <Text style={[s.centerTxt, {color: cc.textMuted}]}>Loading dashboard…</Text>
      </View>
    );
  }
  if (err && !data) {
    return (
      <View style={[s.center, {backgroundColor: cc.bg}]}>
        <Text style={[s.centerTxt, {color: cc.textMuted, fontSize: 13}]}>{err}</Text>
        <PressableScale onPress={() => load(period)} style={[s.retry, {backgroundColor: cc.accentBlue}]}>
          <Text style={s.retryTxt}>Retry</Text>
        </PressableScale>
      </View>
    );
  }
  if (!data) return null;

  const {overview, kpiComparison, taskFunnelVolume, activityTrend, demandHeatmap, operationalFriction} = data;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, {backgroundColor: cc.bg}]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(period, true); }} tintColor={cc.accentBlue} />
        }>
        <View style={s.topRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow}>
            {PERIODS.map(p => {
              const on = p.key === period;
              return (
                <PressableScale
                  key={p.key}
                  disabled={loading}
                  onPress={() => setPeriod(p.key)}
                  style={[s.chip, {backgroundColor: on ? cc.accentBlue : cc.card, borderColor: on ? cc.accentBlue : cc.border, opacity: loading ? 0.6 : 1}]}>
                  <Text style={[s.chipTxt, {color: on ? '#fff' : cc.textSecondary}]}>{p.label}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
          <PressableScale
            disabled={refreshing}
            onPress={() => { setRefreshing(true); load(period, true); }}
            style={[s.iconBtn, {backgroundColor: cc.card, borderColor: cc.border, opacity: refreshing ? 0.6 : 1}]}>
            {refreshing
              ? <ActivityIndicator size="small" color={cc.accentBlue} />
              : <Icon name="refresh" size={14} color={cc.textPrimary} />}
          </PressableScale>
        </View>
        <Text style={[s.range, {color: cc.textMuted}]}>{periodDateRangeLabel(period)}</Text>

        {/* Dims (never blanks) the panels while a period switch is in flight,
            so "This Week" does not look like it silently did nothing. Live
            background refreshes stay undimmed — those swap in place. */}
        <View style={{opacity: loading ? 0.55 : 1}} pointerEvents={loading ? 'none' : 'auto'}>
          <View style={s.kpiRow}>
            <KpiCard icon="car" variant={cc.kpi.tasks} value={fmtInt(overview.totalJobsCompleted)} label="Parking Tasks" />
            <KpiCard icon="people" variant={cc.kpi.visitors} value={fmtInt(data.visitorIntelligence.total)} label="Visitors" />
          </View>
          <View style={[s.kpiRow, {marginBottom: 16}]}>
            <KpiCard icon="car" variant={cc.kpi.drivers} value={String(kpiComparison.drivers.current)} label="Drivers" onPress={openDrivers} />
            <KpiCard icon="userCard" variant={cc.kpi.users} value={String(kpiComparison.users.current)} label="Users" onPress={openAttendance} />
          </View>

          <View style={s.gap}><SlotUtilizationPanel liveSlots={liveSlots} onViewAll={() => openMap()} /></View>
          <View style={s.gap}><TrendPanel days={activityTrend.days} /></View>
          <View style={s.gap}><HeatmapPanel heatmap={demandHeatmap} /></View>
          <View style={s.gap}><ParkingSlotMapPanel liveSlots={liveSlots} classById={classById} onOpenSlots={openMap} /></View>
          <View style={s.gap}><TaskFunnelPanel funnelVolume={taskFunnelVolume} /></View>
          <View style={s.gap}><TopDriversPanel drivers={overview.drivers} onViewAll={openDrivers} /></View>
          <View style={s.gap}><ServiceReliabilityPanel friction={operationalFriction} /></View>
          <ProcessTimingPanel funnel={data.taskFunnel} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  centerTxt: {fontSize: 12, fontWeight: '600'},
  retry: {paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12},
  retryTxt: {color: '#fff', fontSize: 13, fontWeight: '700'},

  topRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4},
  chipScroll: {flex: 1},
  chipRow: {gap: 8, paddingRight: 4},
  chip: {paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1},
  chipTxt: {fontSize: 11.5, fontWeight: '800'},
  iconBtn: {width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  range: {fontSize: 10.5, fontWeight: '600', marginBottom: 14},

  kpiRow: {flexDirection: 'row', gap: 10, marginBottom: 10},
  gap: {marginBottom: 14},
});
