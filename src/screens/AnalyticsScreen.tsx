import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl, ActivityIndicator, Share, Pressable} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useTheme} from '../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../theme/colors';
import {Icon} from '../components/Icon';
import {PressableScale} from '../components/PressableScale';
import {analyticsApi, AnalyticsOverview, DriverAnalytics} from '../services/api';

// Shared by both the valet and admin tabs — the data isn't role-scoped (see
// analytics.service.js: it's the whole operation's all-time picture), so a
// valet reads it as "how is my shift going" and admin reads the identical
// screen as "how is the operation going". One screen, two doors in.

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

// Tunable heuristics, not contractual SLAs — just enough to turn a raw
// minutes figure into an at-a-glance "is this good" signal.
function parkRating(m: number | null): {label: string; tone: 'good' | 'ok' | 'bad'} | null {
  if (m == null) return null;
  if (m <= 5) return {label: 'Excellent', tone: 'good'};
  if (m <= 9) return {label: 'Good', tone: 'ok'};
  return {label: 'Needs attention', tone: 'bad'};
}
function retrieveRating(m: number | null): {label: string; tone: 'good' | 'ok' | 'bad'} | null {
  if (m == null) return null;
  if (m <= 3) return {label: 'Excellent', tone: 'good'};
  if (m <= 6) return {label: 'Good', tone: 'ok'};
  return {label: 'Needs attention', tone: 'bad'};
}

function buildShareText(data: AnalyticsOverview): string {
  const visitorTotal = data.visitorJobs + data.staffJobs;
  const visitorPct = visitorTotal > 0 ? Math.round((data.visitorJobs / visitorTotal) * 100) : 0;
  const lines = [
    `📊 KIMS Parking — All-Time Analytics`,
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
  const [expandedDriverId, setExpandedDriverId] = useState<number | null>(null);
  const [idleExpanded, setIdleExpanded] = useState(false);

  const load = useCallback((silent?: boolean) => {
    if (!silent) setLoading(true);
    analyticsApi.overview()
      .then(d => { setData(d); setErr(null); })
      .catch(() => setErr('Could not load analytics'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = styles;
  const visitorTotal = (data?.visitorJobs ?? 0) + (data?.staffJobs ?? 0);
  const visitorPct = visitorTotal > 0 ? Math.round(((data?.visitorJobs ?? 0) / visitorTotal) * 100) : 0;
  const activeDrivers = (data?.drivers ?? []).filter(d => d.totalCompleted > 0);
  const idleDrivers = (data?.drivers ?? []).filter(d => d.totalCompleted === 0);
  const pRating = parkRating(data?.avgParkMinutes ?? null);
  const rRating = retrieveRating(data?.avgRetrieveMinutes ?? null);

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

  const toneColor = (tone: 'good' | 'ok' | 'bad') =>
    tone === 'good' ? colors.success : tone === 'ok' ? colors.warning : colors.error;

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? BRAND_GRADIENT_DARK[0] : BRAND_GRADIENT[0]} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}>

        <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.gradHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
          {/* Decorative depth — two soft glow discs, pure layout, no image assets. */}
          <View pointerEvents="none" style={s.glowA} />
          <View pointerEvents="none" style={s.glowB} />

          <View style={s.gradTopRow}>
            <View>
              <View style={s.eyebrowRow}>
                <Icon name="sparkle" size={12} color="rgba(255,255,255,0.75)" />
                <Text style={s.eyebrow}>ALL-TIME · LIVE</Text>
              </View>
              <Text style={s.gradTitle}>Analytics</Text>
            </View>
            <View style={{flexDirection: 'row', gap: 8}}>
              <PressableScale style={[s.headerBtn, sharing && {opacity: 0.6}]} disabled={sharing} onPress={onShare}>
                {sharing ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="share" size={17} color="#fff" />}
              </PressableScale>
              <PressableScale style={[s.headerBtn, refreshing && {opacity: 0.6}]} disabled={refreshing} onPress={() => { setRefreshing(true); load(true); }}>
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

        {loading && !data ? (
          <View style={s.centerBox}><ActivityIndicator color={colors.primary} /></View>
        ) : err && !data ? (
          <View style={s.centerBox}>
            <Icon name="alert" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
            <Text style={{color: colors.textMuted, marginBottom: 12}}>{err}</Text>
            <PressableScale disabled={loading} onPress={() => load()} style={[s.retryBtn, {backgroundColor: colors.primary, opacity: loading ? 0.6 : 1}]}>
              {loading
                ? <ActivityIndicator color={colors.background} size="small" />
                : <Text style={{color: colors.background, fontWeight: '800'}}>Retry</Text>}
            </PressableScale>
          </View>
        ) : (
        <View style={s.body}>
          {/* Performance — rated, not just reported */}
          <View style={s.rowGap}>
            <View style={[s.perfCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.perfAccent, {backgroundColor: pRating ? toneColor(pRating.tone) : colors.border}]} />
              <View style={s.perfBody}>
                <View style={[s.timeIconWrap, {backgroundColor: colors.success + '18'}]}>
                  <Icon name="carKey" size={17} color={colors.success} />
                </View>
                <Text style={[s.timeVal, {color: colors.textPrimary}]}>{minutesLabel(data?.avgParkMinutes ?? null)}</Text>
                <Text style={[s.timeLbl, {color: colors.textMuted}]}>Avg. park time</Text>
                {pRating && (
                  <View style={[s.ratingChip, {backgroundColor: toneColor(pRating.tone) + '18'}]}>
                    <Text style={[s.ratingChipTxt, {color: toneColor(pRating.tone)}]}>{pRating.label}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={[s.perfCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.perfAccent, {backgroundColor: rRating ? toneColor(rRating.tone) : colors.border}]} />
              <View style={s.perfBody}>
                <View style={[s.timeIconWrap, {backgroundColor: colors.info + '18'}]}>
                  <Icon name="route" size={17} color={colors.info} />
                </View>
                <Text style={[s.timeVal, {color: colors.textPrimary}]}>{minutesLabel(data?.avgRetrieveMinutes ?? null)}</Text>
                <Text style={[s.timeLbl, {color: colors.textMuted}]}>Avg. retrieve time</Text>
                {rRating && (
                  <View style={[s.ratingChip, {backgroundColor: toneColor(rRating.tone) + '18'}]}>
                    <Text style={[s.ratingChipTxt, {color: toneColor(rRating.tone)}]}>{rRating.label}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Activity by hour — real 24h histogram, tap any bar to inspect it */}
          <View style={[s.chartCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={s.chartHeadRow}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <Icon name="trending" size={15} color={colors.primary} />
                <Text style={[s.chartTitle, {color: colors.textPrimary}]}>Activity by Hour</Text>
              </View>
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
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12}}>
            <Icon name="trophy" size={16} color="#F5C168" />
            <Text style={[s.sectionTitle, {color: colors.textPrimary, marginBottom: 0}]}>Top Performers</Text>
          </View>

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
                      i === 0 && medal ? s.rankGlow : null,
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
  glowA: {position: 'absolute', top: -60, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)'},
  glowB: {position: 'absolute', bottom: -50, left: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(245,193,104,0.08)'},
  gradTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20},
  eyebrowRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4},
  eyebrow: {color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2},
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
  perfAccent: {width: 4},
  perfBody: {flex: 1, padding: 14, alignItems: 'flex-start'},
  timeIconWrap: {width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  timeVal: {fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums']},
  timeLbl: {fontSize: 11, fontWeight: '700', marginTop: 2},
  ratingChip: {marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999},
  ratingChipTxt: {fontSize: 10, fontWeight: '800'},
  chartCard: {borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14},
  chartHeadRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  chartTitle: {fontSize: 13.5, fontWeight: '800'},
  chartCaption: {fontSize: 11, fontWeight: '700'},
  barsRow: {flexDirection: 'row', alignItems: 'flex-end', height: 58, marginBottom: 6},
  barCol: {flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 58},
  bar: {width: '55%', borderRadius: 2, minHeight: 4},
  axisRow: {flexDirection: 'row', justifyContent: 'space-between'},
  axisTxt: {fontSize: 9.5, fontWeight: '700'},
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
  rankGlow: {shadowColor: '#F5C168', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: {width: 0, height: 3}, elevation: 4},
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
