import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl, ActivityIndicator, Share, Pressable} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useTheme} from '../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../theme/colors';
import {Icon} from '../components/Icon';
import {PressableScale} from '../components/PressableScale';
import {analyticsApi, AnalyticsOverview, AnalyticsPeriod, DriverAnalytics} from '../services/api';

const PERIODS: {key: AnalyticsPeriod; label: string}[] = [
  {key: 'daily', label: 'Today'},
  {key: 'weekly', label: 'This Week'},
  {key: 'monthly', label: 'This Month'},
  {key: 'yearly', label: 'This Year'},
  {key: 'all', label: 'All-time'},
];

// Shared by both the valet and admin tabs — the data isn't role-scoped (see
// analytics.service.js: it's the whole operation's picture for the selected
// period), so a valet reads it as "how is my shift going" and admin reads the
// identical screen as "how is the operation going". One screen, two doors in.

const MEDALS = ['#F5C168', '#C7CDD6', '#D3946B']; // gold / silver / bronze

function hourLabel(h: number | null): string {
  if (h == null) return '—';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

function minutesLabel(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'Updated just now';
  if (secs < 3600) return `Updated ${Math.floor(secs / 60)}m ago`;
  return `Updated ${Math.floor(secs / 3600)}h ago`;
}

const PERIOD_TITLES: Record<AnalyticsPeriod, string> = {
  daily: 'Today', weekly: 'This Week', monthly: 'This Month', yearly: 'This Year', all: 'All-Time',
};

function buildShareText(data: AnalyticsOverview): string {
  const visitorTotal = data.visitorJobs + data.staffJobs;
  const visitorPct = visitorTotal > 0 ? Math.round((data.visitorJobs / visitorTotal) * 100) : 0;
  const lines = [
    `📊 KIMS Parking — ${PERIOD_TITLES[data.period]} Analytics`,
    ``,
    `🚗 ${data.totalCarsParked} parked · ${data.totalCarsRetrieved} retrieved · ${data.totalJobsCompleted} total jobs`,
    `⏱ Avg park ${minutesLabel(data.avgParkMinutes)} · Avg retrieve ${minutesLabel(data.avgRetrieveMinutes)}`,
    `🕐 Busiest hour ${hourLabel(data.busiestHour)}`,
    `👥 ${visitorPct}% visitor · ${100 - visitorPct}% staff`,
    ``,
    `🏆 Top Performers`,
    ...data.drivers.filter(d => d.totalCompleted > 0).slice(0, 5).map((d, i) =>
      `${i + 1}. ${d.name} — ${d.totalCompleted} jobs (${d.parksCompleted} parked, ${d.retrievesCompleted} retrieved)`),
  ];
  return lines.join('\n');
}

export function AnalyticsScreen() {
  const {colors, isDark} = useTheme();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [trendIndex, setTrendIndex] = useState<number | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<number | null>(null);
  const [idleExpanded, setIdleExpanded] = useState(false);
  const [period, setPeriod] = useState<AnalyticsPeriod>('all');

  const load = useCallback((p: AnalyticsPeriod, silent?: boolean) => {
    if (!silent) setLoading(true);
    analyticsApi.overview(p)
      .then(d => { setData(d); setErr(null); })
      .catch(() => setErr('Could not load analytics'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  // Switching periods re-fetches fresh (not silent — the old period's
  // numbers would otherwise sit on screen, wrong, while the new ones load).
  useEffect(() => { load(period); setTrendIndex(null); }, [period, load]);

  const s = styles;
  const visitorTotal = (data?.visitorJobs ?? 0) + (data?.staffJobs ?? 0);
  const visitorPct = visitorTotal > 0 ? Math.round(((data?.visitorJobs ?? 0) / visitorTotal) * 100) : 0;
  const activeDrivers = (data?.drivers ?? []).filter(d => d.totalCompleted > 0);
  const idleDrivers = (data?.drivers ?? []).filter(d => d.totalCompleted === 0);

  // Crowns: the fastest average among drivers who actually have a
  // qualifying average — a single job's lucky timing shouldn't outrank a
  // driver with a real sample, but there's no minimum-jobs floor yet since
  // volume is still low; this is the first place to add one as it grows.
  const fastestParkId = useMemo(() => {
    const withAvg = activeDrivers.filter(d => d.avgParkMinutes != null);
    if (!withAvg.length) return null;
    return withAvg.reduce((best, d) => d.avgParkMinutes! < best.avgParkMinutes! ? d : best).id;
  }, [activeDrivers]);
  const fastestRetrieveId = useMemo(() => {
    const withAvg = activeDrivers.filter(d => d.avgRetrieveMinutes != null);
    if (!withAvg.length) return null;
    return withAvg.reduce((best, d) => d.avgRetrieveMinutes! < best.avgRetrieveMinutes! ? d : best).id;
  }, [activeDrivers]);

  const hourly = data?.hourlyDistribution ?? new Array(24).fill(0);
  const maxHourly = Math.max(1, ...hourly);
  const activeHour = selectedHour ?? data?.busiestHour ?? null;
  const activeHourCount = activeHour != null ? hourly[activeHour] : 0;

  const [sharing, setSharing] = useState(false);
  const onShare = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      await Share.share({message: buildShareText(data)});
    } catch {
      // best-effort — sharing is never critical enough to surface an error
    } finally {
      setSharing(false);
    }
  };
  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? BRAND_GRADIENT_DARK[0] : BRAND_GRADIENT[0]} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(period, true); }} tintColor={colors.primary} />}>

        <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.gradHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
          <View style={s.gradTopRow}>
            <View>
              <Text style={s.eyebrow}>{PERIODS.find(p => p.key === period)?.label.toUpperCase()} · LIVE</Text>
              <Text style={s.gradTitle}>Analytics</Text>
            </View>
            <View style={{flexDirection: 'row', gap: 8}}>
              <PressableScale style={[s.headerBtn, sharing && {opacity: 0.6}]} disabled={sharing} onPress={onShare}>
                {sharing ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="share" size={17} color="#fff" />}
              </PressableScale>
              <PressableScale style={[s.headerBtn, refreshing && {opacity: 0.6}]} disabled={refreshing} onPress={() => { setRefreshing(true); load(period, true); }}>
                <Icon name="refresh" size={18} color="#fff" />
              </PressableScale>
            </View>
          </View>

          <View style={s.heroRow}>
            <View style={s.heroStat}>
              <Icon name="key" size={13} color="rgba(255,255,255,0.55)" />
              <Text style={s.heroNum}>{data?.totalCarsParked ?? (loading ? '–' : 0)}</Text>
              <Text style={s.heroLbl}>Parked</Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroStat}>
              <Icon name="route" size={13} color="rgba(255,255,255,0.55)" />
              <Text style={s.heroNum}>{data?.totalCarsRetrieved ?? (loading ? '–' : 0)}</Text>
              <Text style={s.heroLbl}>Retrieved</Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroStat}>
              <Icon name="flag" size={13} color="rgba(255,255,255,0.55)" />
              <Text style={s.heroNum}>{data?.totalJobsCompleted ?? (loading ? '–' : 0)}</Text>
              <Text style={s.heroLbl}>Total Jobs</Text>
            </View>
          </View>

          {data && <Text style={s.updatedTxt}>{relativeTime(data.generatedAt)}</Text>}
        </LinearGradient>

        {/* Period selector — switches the whole overview (stats, hourly
            histogram, leaderboard) to a real, database-scoped answer for that
            window, not an all-time number relabeled. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.periodScroll}
          contentContainerStyle={s.periodRow}>
          {PERIODS.map(p => {
            const on = p.key === period;
            return (
              <PressableScale
                key={p.key}
                disabled={loading}
                onPress={() => setPeriod(p.key)}
                style={[s.periodChip, {
                  backgroundColor: on ? colors.primary : colors.surface,
                  borderColor: on ? colors.primary : colors.border,
                  opacity: loading ? 0.6 : 1,
                }]}>
                <Text style={[s.periodChipTxt, {color: on ? colors.textOnPrimary : colors.textSecondary}]}>{p.label}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {loading && !data ? (
          <View style={s.centerBox}><ActivityIndicator color={colors.primary} /></View>
        ) : err && !data ? (
          <View style={s.centerBox}>
            <Icon name="alert" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
            <Text style={{color: colors.textMuted, marginBottom: 12}}>{err}</Text>
            <PressableScale disabled={loading} onPress={() => load(period)} style={[s.retryBtn, {backgroundColor: colors.primary, opacity: loading ? 0.6 : 1}]}>
              {loading
                ? <ActivityIndicator color={colors.background} size="small" />
                : <Text style={{color: colors.background, fontWeight: '800'}}>Retry</Text>}
            </PressableScale>
          </View>
        ) : (
        <View style={s.body}>
          {/* Performance — rated, not just reported */}
          {/* The measured time, and nothing invented on top of it.
              This used to carry a coloured left stripe and a "Excellent /
              Good / Needs attention" verdict chip driven by hardcoded
              thresholds nobody at KIMS ever agreed to — which is how the
              same 7 minutes could read "Good" for parking and "Needs
              attention" for retrieval, side by side, and look arbitrary.
              A real SLA would come from admin-configurable targets, not a
              constant in this file. Until it does, show the number. */}
          <View style={s.rowGap}>
            <View style={[s.perfCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={s.perfBody}>
                <Text style={[s.timeVal, {color: colors.textPrimary}]}>{minutesLabel(data?.avgParkMinutes ?? null)}</Text>
                <Text style={[s.timeLbl, {color: colors.textMuted}]}>Avg. park time</Text>
              </View>
            </View>
            <View style={[s.perfCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={s.perfBody}>
                <Text style={[s.timeVal, {color: colors.textPrimary}]}>{minutesLabel(data?.avgRetrieveMinutes ?? null)}</Text>
                <Text style={[s.timeLbl, {color: colors.textMuted}]}>Avg. retrieve time</Text>
              </View>
            </View>
          </View>

          {/* Activity by hour — real 24h histogram, tap any bar to inspect it */}
          <View style={[s.chartCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={s.chartHeadRow}>
              <Text style={[s.chartTitle, {color: colors.textPrimary}]}>Activity by Hour</Text>
              {activeHour != null && (
                <Text style={[s.chartCaption, {color: colors.textMuted}]}>
                  {activeHourCount} job{activeHourCount === 1 ? '' : 's'} · {hourLabel(activeHour)}
                </Text>
              )}
            </View>
            <View style={s.barsRow}>
              {hourly.map((count, h) => {
                const isPeak = h === data?.busiestHour;
                const isSelected = h === activeHour;
                const heightPx = 6 + (count / maxHourly) * 46;
                const barColor = isSelected ? '#F5C168' : count > 0 ? colors.primary : colors.border;
                return (
                  <Pressable key={h} style={s.barCol} onPress={() => setSelectedHour(h === selectedHour ? null : h)} hitSlop={2}>
                    <View style={[s.bar, {height: heightPx, backgroundColor: barColor, opacity: isPeak && !isSelected ? 1 : (isSelected ? 1 : 0.55)}]} />
                  </Pressable>
                );
              })}
            </View>
            <View style={s.axisRow}>
              <Text style={[s.axisTxt, {color: colors.textMuted}]}>12AM</Text>
              <Text style={[s.axisTxt, {color: colors.textMuted}]}>6AM</Text>
              <Text style={[s.axisTxt, {color: colors.textMuted}]}>12PM</Text>
              <Text style={[s.axisTxt, {color: colors.textMuted}]}>6PM</Text>
              <Text style={[s.axisTxt, {color: colors.textMuted}]}>11PM</Text>
            </View>
          </View>

          {/* Park vs Retrieve — the SAME jobs Activity by Hour counts above,
              split by type instead of combined, at whatever bucket
              resolution suits the selected period (hourly/daily/monthly,
              see backend trendBuckets). Absent for All-time, where a
              calendar trend can't usefully answer "when" over a multi-year
              span. Tap any bar to inspect it, same interaction Activity by
              Hour already uses — no reading required, tap and the numbers
              are right there. */}
          {data?.trend && (
            <View style={[s.chartCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.chartHeadRow, {marginBottom: 2}]}>
                <View style={s.chartTitleRow}>
                  <Icon name="carKey" size={15} color={colors.primary} />
                  <Text style={[s.chartTitle, {color: colors.textPrimary}]}>Park vs Retrieve</Text>
                </View>
                <View style={s.legendRow}>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, {backgroundColor: colors.primary}]} />
                    <Text style={[s.legendTxt, {color: colors.textMuted}]}>Park</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, {backgroundColor: colors.info}]} />
                    <Text style={[s.legendTxt, {color: colors.textMuted}]}>Retrieve</Text>
                  </View>
                </View>
              </View>
              <Text style={[s.chartHint, {color: colors.textMuted}]}>
                Same activity as above, broken down by job type — tap a bar for that {period === 'daily' ? 'hour' : period === 'yearly' ? 'month' : 'day'}.
              </Text>
              {(() => {
                const {labels, park, retrieve} = data.trend;
                const maxVal = Math.max(1, ...park, ...retrieve);
                const n = labels.length;
                // Hourly (24 buckets) reuses the exact tick set Activity by
                // Hour uses above, so the two charts visibly read as the
                // same time axis. Everything else (7 weekdays, 12 months) is
                // few enough / already meaningful enough to label directly;
                // only a long month's 28-31 raw day numbers gets thinned to
                // first/mid/last.
                const isHourly = n === 24;
                const thinned = !isHourly && n > 14;
                const ticks = isHourly
                  ? ['12AM', '6AM', '12PM', '6PM', '11PM']
                  : thinned ? [labels[0], labels[Math.floor(n / 2)], labels[n - 1]] : labels;
                const selected = trendIndex != null && trendIndex < n ? trendIndex : null;
                const peak = park.reduce((best, _, i) => ((park[i] + retrieve[i]) > (park[best] + retrieve[best]) ? i : best), 0);
                const dispIndex = selected ?? peak;
                return (
                  <>
                    {(park[dispIndex] + retrieve[dispIndex]) > 0 && (
                      <Text style={[s.trendReadout, {color: colors.textPrimary}]}>
                        {isHourly ? hourLabel(dispIndex) : labels[dispIndex]}: {park[dispIndex]} parked, {retrieve[dispIndex]} retrieved
                      </Text>
                    )}
                    <View style={[s.barsRow, {gap: n > 20 ? 1 : 2}]}>
                      {labels.map((_, i) => {
                        const dim = selected != null && selected !== i;
                        return (
                          <Pressable key={i} style={s.trendCol} onPress={() => setTrendIndex(i === trendIndex ? null : i)} hitSlop={2}>
                            <View style={[s.trendBar, {height: park[i] ? 4 + (park[i] / maxVal) * 50 : 2, backgroundColor: colors.primary, opacity: dim ? 0.35 : 1}]} />
                            <View style={[s.trendBar, {height: retrieve[i] ? 4 + (retrieve[i] / maxVal) * 50 : 2, backgroundColor: colors.info, opacity: dim ? 0.35 : 1}]} />
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={s.axisRow}>
                      {ticks.map((t, i) => (
                        <Text key={i} style={[s.axisTxt, !isHourly && !thinned && s.axisCell, {color: colors.textMuted}]}>{t}</Text>
                      ))}
                    </View>
                  </>
                );
              })()}
            </View>
          )}

          {/* Block utilization — which block actually got used this period,
              computed from completed park jobs (real slot ids), never
              invented. */}
          {!!data?.blockUtilization.length && (
            <View style={[s.chartCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.chartTitleRow, {marginBottom: 12}]}>
                <Icon name="parking" size={15} color={colors.primary} />
                <Text style={[s.chartTitle, {color: colors.textPrimary}]}>Block Utilization</Text>
              </View>
              <View style={{gap: 10}}>
                {(() => {
                  const maxCount = Math.max(...data.blockUtilization.map(b => b.count));
                  return data.blockUtilization.map(b => (
                    <View key={b.block} style={s.blockRow}>
                      <Text style={[s.blockLbl, {color: colors.textSecondary}]}>Block {b.block}</Text>
                      <View style={[s.blockTrack, {backgroundColor: colors.border}]}>
                        <View style={[s.blockFill, {width: `${(b.count / maxCount) * 100}%`, backgroundColor: colors.primary}]} />
                      </View>
                      <Text style={[s.blockCount, {color: colors.textPrimary}]}>{b.count}</Text>
                    </View>
                  ));
                })()}
              </View>
            </View>
          )}

          {/* Visitor vs staff */}
          <View style={[s.insightCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={s.insightRow}>
              <View style={[s.insightIconWrap, {backgroundColor: colors.primary + '18'}]}>
                <Icon name="people" size={16} color={colors.primary} />
              </View>
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6}}>
                  <Text style={[s.insightLbl, {color: colors.textMuted}]}>Visitor vs staff jobs</Text>
                  <Text style={[s.insightLbl, {color: colors.textMuted, fontWeight: '800'}]}>{visitorPct}% visitor</Text>
                </View>
                <View style={[s.ratioTrack, {backgroundColor: colors.border}]}>
                  <View style={[s.ratioFill, {width: `${visitorPct}%`, backgroundColor: colors.primary}]} />
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 4}}>
                  <Text style={[s.insightSub, {color: colors.textMuted}]}>{data?.visitorJobs ?? 0} visitor</Text>
                  <Text style={[s.insightSub, {color: colors.textMuted}]}>{data?.staffJobs ?? 0} staff</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Leaderboard — tap a row to expand */}
          <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Top Performers</Text>

          {activeDrivers.length === 0 && idleDrivers.length === 0 ? (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Icon name="trophy" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No drivers yet</Text>
            </View>
          ) : activeDrivers.length === 0 ? (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Icon name="trophy" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No completed jobs yet — the leaderboard fills in as drivers finish their first job.</Text>
            </View>
          ) : (
            <View style={{gap: 10}}>
              {activeDrivers.map((d, i) => {
                const medal = MEDALS[i] ?? null;
                const expanded = expandedDriverId === d.id;
                const parkShare = d.totalCompleted > 0 ? Math.round((d.parksCompleted / d.totalCompleted) * 100) : 0;
                const badges: string[] = [];
                if (d.id === fastestParkId) badges.push('Fastest park');
                if (d.id === fastestRetrieveId) badges.push('Fastest retrieve');
                return (
                  <PressableScale
                    key={d.id}
                    onPress={() => setExpandedDriverId(expanded ? null : d.id)}
                    style={[
                      s.driverCard,
                      {backgroundColor: colors.surface, borderColor: medal ?? colors.border, borderWidth: medal ? 1.5 : 1},
                    ]}>
                    <View style={s.driverTopRow}>
                      <View style={[s.rankWrap, medal ? {backgroundColor: medal} : {backgroundColor: colors.border}]}>
                        <Text style={[s.rankTxt, {color: medal ? '#15161A' : colors.textMuted}]}>{i + 1}</Text>
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={[s.driverName, {color: colors.textPrimary}]} numberOfLines={1}>{d.name}</Text>
                        <Text style={[s.driverMeta, {color: colors.textMuted}]}>
                          {d.parksCompleted} parked · {d.retrievesCompleted} retrieved
                        </Text>
                      </View>
                      <View style={s.driverTotalWrap}>
                        <Text style={[s.driverTotalNum, {color: colors.textPrimary}]}>{d.totalCompleted}</Text>
                        <Text style={[s.driverTotalLbl, {color: colors.textMuted}]}>jobs</Text>
                      </View>
                      <Icon name="chevronDown" size={16} color={colors.textMuted} style={{transform: [{rotate: expanded ? '180deg' : '0deg'}]}} />
                    </View>

                    {badges.length > 0 && (
                      <View style={s.badgeRow}>
                        {badges.map(b => (
                          <View key={b} style={[s.crownBadge, {backgroundColor: '#F5C16818'}]}>
                            <Icon name="crown" size={11} color="#F5C168" />
                            <Text style={s.crownBadgeTxt}>{b}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {expanded && (
                      <View style={[s.expandBox, {borderTopColor: colors.divider}]}>
                        <View style={s.expandRow}>
                          <Text style={[s.expandLbl, {color: colors.textMuted}]}>Avg park time</Text>
                          <Text style={[s.expandVal, {color: colors.textPrimary}]}>{minutesLabel(d.avgParkMinutes)}</Text>
                        </View>
                        <View style={s.expandRow}>
                          <Text style={[s.expandLbl, {color: colors.textMuted}]}>Avg retrieve time</Text>
                          <Text style={[s.expandVal, {color: colors.textPrimary}]}>{minutesLabel(d.avgRetrieveMinutes)}</Text>
                        </View>
                        <View style={[s.ratioTrack, {backgroundColor: colors.border, marginTop: 8}]}>
                          <View style={[s.ratioFill, {width: `${parkShare}%`, backgroundColor: colors.success}]} />
                        </View>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 4}}>
                          <Text style={[s.insightSub, {color: colors.textMuted}]}>{parkShare}% park jobs</Text>
                          <Text style={[s.insightSub, {color: colors.textMuted}]}>{100 - parkShare}% retrieve jobs</Text>
                        </View>
                      </View>
                    )}
                  </PressableScale>
                );
              })}

              {idleDrivers.length > 0 && (
                <PressableScale onPress={() => setIdleExpanded(v => !v)} style={[s.idleCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={[s.idleTitle, {color: colors.textMuted}]}>
                      {idleDrivers.length} driver{idleDrivers.length > 1 ? 's' : ''} with no completed jobs yet
                    </Text>
                    <Icon name="chevronDown" size={15} color={colors.textMuted} style={{transform: [{rotate: idleExpanded ? '180deg' : '0deg'}]}} />
                  </View>
                  {idleExpanded && (
                    <View style={s.idleChipRow}>
                      {idleDrivers.map(d => (
                        <View key={d.id} style={[s.idleChip, {backgroundColor: colors.background, borderColor: colors.border}]}>
                          <Text style={[s.idleChipTxt, {color: colors.textMuted}]}>{d.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </PressableScale>
              )}
            </View>
          )}
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  scroll: {paddingBottom: 32},
  gradHeader: {paddingTop: 8, paddingBottom: 18, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden'},
  gradTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20},
  eyebrow: {color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4},
  gradTitle: {color: '#fff', fontSize: 24, fontWeight: '900'},
  headerBtn: {width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center'},
  heroRow: {flexDirection: 'row', alignItems: 'center'},
  heroStat: {flex: 1, alignItems: 'center', gap: 4},
  heroNum: {color: '#fff', fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums']},
  heroLbl: {color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700'},
  heroDivider: {width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)'},
  updatedTxt: {color: 'rgba(255,255,255,0.5)', fontSize: 10.5, fontWeight: '600', textAlign: 'center', marginTop: 14},
  centerBox: {alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30},
  retryBtn: {paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12},
  body: {paddingHorizontal: 20, paddingTop: 18},
  rowGap: {flexDirection: 'row', gap: 12, marginBottom: 14},
  perfCard: {flex: 1, borderRadius: 16, borderWidth: 1, overflow: 'hidden', flexDirection: 'row'},
  perfBody: {flex: 1, padding: 14, alignItems: 'flex-start'},
  timeVal: {fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums']},
  timeLbl: {fontSize: 11, fontWeight: '700', marginTop: 2},
  chartCard: {borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14},
  chartHeadRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  chartTitle: {fontSize: 13.5, fontWeight: '800'},
  chartCaption: {fontSize: 11, fontWeight: '700'},
  barsRow: {flexDirection: 'row', alignItems: 'flex-end', height: 58, marginBottom: 6},
  barCol: {flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 58},
  bar: {width: '55%', borderRadius: 2, minHeight: 4},
  axisRow: {flexDirection: 'row', justifyContent: 'space-between'},
  axisTxt: {fontSize: 9.5, fontWeight: '700'},
  axisCell: {flex: 1, textAlign: 'center'},
  periodScroll: {flexGrow: 0},
  periodRow: {gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4},
  periodChip: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1},
  periodChipTxt: {fontSize: 12.5, fontWeight: '800'},
  chartTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
  legendDot: {width: 7, height: 7, borderRadius: 2},
  legendTxt: {fontSize: 10.5, fontWeight: '700'},
  chartHint: {fontSize: 11, marginBottom: 10},
  trendReadout: {fontSize: 11, fontWeight: '700', marginBottom: 8},
  trendCol: {flex: 1, height: 58, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1},
  trendBar: {width: '45%', borderRadius: 1},
  blockRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  blockLbl: {width: 56, fontSize: 12, fontWeight: '700'},
  blockTrack: {flex: 1, height: 8, borderRadius: 4, overflow: 'hidden'},
  blockFill: {height: 8, borderRadius: 4},
  blockCount: {width: 28, fontSize: 12, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums']},
  insightCard: {borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 22},
  insightRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  insightIconWrap: {width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  insightLbl: {fontSize: 12, fontWeight: '700'},
  insightSub: {fontSize: 10.5, fontWeight: '700'},
  ratioTrack: {height: 6, borderRadius: 3, overflow: 'hidden'},
  ratioFill: {height: 6, borderRadius: 3},
  sectionTitle: {fontSize: 15, fontWeight: '900', marginBottom: 12},
  emptyBox: {borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 20},
  emptyTxt: {fontSize: 13, fontWeight: '600', textAlign: 'center'},
  driverCard: {borderRadius: 16, padding: 14},
  driverTopRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  rankWrap: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  rankTxt: {fontSize: 13, fontWeight: '900'},
  driverName: {fontSize: 14.5, fontWeight: '800'},
  driverMeta: {fontSize: 11.5, fontWeight: '600', marginTop: 2},
  driverTotalWrap: {alignItems: 'center'},
  driverTotalNum: {fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums']},
  driverTotalLbl: {fontSize: 10, fontWeight: '700'},
  badgeRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginLeft: 42},
  crownBadge: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999},
  crownBadgeTxt: {fontSize: 10, fontWeight: '800', color: '#B8860B'},
  expandBox: {marginTop: 12, paddingTop: 12, borderTopWidth: 1},
  expandRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
  expandLbl: {fontSize: 12, fontWeight: '600'},
  expandVal: {fontSize: 12.5, fontWeight: '800'},
  idleCard: {borderRadius: 14, borderWidth: 1, padding: 12},
  idleTitle: {fontSize: 12, fontWeight: '700', flex: 1},
  idleChipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10},
  idleChip: {borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5},
  idleChipTxt: {fontSize: 11, fontWeight: '700'},
});
