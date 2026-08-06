import React, {useCallback, useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useTheme} from '../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../theme/colors';
import {Icon} from '../components/Icon';
import {PressableScale} from '../components/PressableScale';
import {analyticsApi, AnalyticsOverview} from '../services/api';

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

export function AnalyticsScreen() {
  const {colors, isDark} = useTheme();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? BRAND_GRADIENT_DARK[0] : BRAND_GRADIENT[0]} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}>

        <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.gradHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
          <View style={s.gradTopRow}>
            <View>
              <View style={s.eyebrowRow}>
                <Icon name="sparkle" size={12} color="rgba(255,255,255,0.75)" />
                <Text style={s.eyebrow}>ALL-TIME</Text>
              </View>
              <Text style={s.gradTitle}>Analytics</Text>
            </View>
            <PressableScale style={s.refreshBtn} onPress={() => { setRefreshing(true); load(true); }}>
              <Icon name="refresh" size={18} color="#fff" />
            </PressableScale>
          </View>

          <View style={s.heroRow}>
            <View style={s.heroStat}>
              <Text style={s.heroNum}>{data?.totalCarsParked ?? (loading ? '–' : 0)}</Text>
              <Text style={s.heroLbl}>Parked</Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroNum}>{data?.totalCarsRetrieved ?? (loading ? '–' : 0)}</Text>
              <Text style={s.heroLbl}>Retrieved</Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroNum}>{data?.totalJobsCompleted ?? (loading ? '–' : 0)}</Text>
              <Text style={s.heroLbl}>Total Jobs</Text>
            </View>
          </View>
        </LinearGradient>

        {loading && !data ? (
          <View style={s.centerBox}><ActivityIndicator color={colors.primary} /></View>
        ) : err && !data ? (
          <View style={s.centerBox}>
            <Icon name="alert" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
            <Text style={{color: colors.textMuted, marginBottom: 12}}>{err}</Text>
            <PressableScale onPress={() => load()} style={[s.retryBtn, {backgroundColor: colors.primary}]}>
              <Text style={{color: colors.background, fontWeight: '800'}}>Retry</Text>
            </PressableScale>
          </View>
        ) : (
        <View style={s.body}>
          {/* Timing */}
          <View style={s.rowGap}>
            <View style={[s.timeCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.timeIconWrap, {backgroundColor: colors.success + '18'}]}>
                <Icon name="carKey" size={18} color={colors.success} />
              </View>
              <Text style={[s.timeVal, {color: colors.textPrimary}]}>{minutesLabel(data?.avgParkMinutes ?? null)}</Text>
              <Text style={[s.timeLbl, {color: colors.textMuted}]}>Avg. park time</Text>
            </View>
            <View style={[s.timeCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.timeIconWrap, {backgroundColor: colors.info + '18'}]}>
                <Icon name="route" size={18} color={colors.info} />
              </View>
              <Text style={[s.timeVal, {color: colors.textPrimary}]}>{minutesLabel(data?.avgRetrieveMinutes ?? null)}</Text>
              <Text style={[s.timeLbl, {color: colors.textMuted}]}>Avg. retrieve time</Text>
            </View>
          </View>

          {/* Insights */}
          <View style={[s.insightCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={s.insightRow}>
              <View style={[s.insightIconWrap, {backgroundColor: '#F5C16818'}]}>
                <Icon name="clock" size={16} color="#F5C168" />
              </View>
              <View style={{flex: 1}}>
                <Text style={[s.insightLbl, {color: colors.textMuted}]}>Busiest hour</Text>
                <Text style={[s.insightVal, {color: colors.textPrimary}]}>{hourLabel(data?.busiestHour ?? null)}</Text>
              </View>
            </View>
            <View style={[s.insightDivider, {backgroundColor: colors.divider}]} />
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

          {/* Leaderboard */}
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
                return (
                  <View key={d.id} style={[s.driverCard, {backgroundColor: colors.surface, borderColor: medal ?? colors.border, borderWidth: medal ? 1.5 : 1}]}>
                    <View style={[s.rankWrap, medal ? {backgroundColor: medal} : {backgroundColor: colors.border}]}>
                      <Text style={[s.rankTxt, {color: medal ? '#15161A' : colors.textMuted}]}>{i + 1}</Text>
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={[s.driverName, {color: colors.textPrimary}]} numberOfLines={1}>{d.name}</Text>
                      <Text style={[s.driverMeta, {color: colors.textMuted}]}>
                        {d.parksCompleted} parked · {d.retrievesCompleted} retrieved
                      </Text>
                      <Text style={[s.driverMeta, {color: colors.textMuted}]}>
                        {minutesLabel(d.avgParkMinutes)} avg park · {minutesLabel(d.avgRetrieveMinutes)} avg retrieve
                      </Text>
                    </View>
                    <View style={s.driverTotalWrap}>
                      <Text style={[s.driverTotalNum, {color: colors.textPrimary}]}>{d.totalCompleted}</Text>
                      <Text style={[s.driverTotalLbl, {color: colors.textMuted}]}>jobs</Text>
                    </View>
                  </View>
                );
              })}
              {idleDrivers.length > 0 && (
                <Text style={[s.idleNote, {color: colors.textMuted}]}>
                  {idleDrivers.length} driver{idleDrivers.length > 1 ? 's' : ''} with no completed jobs yet — {idleDrivers.map(d => d.name.split(' ')[0]).join(', ')}
                </Text>
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
  gradHeader: {paddingTop: 8, paddingBottom: 22, paddingHorizontal: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26},
  gradTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20},
  eyebrowRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4},
  eyebrow: {color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2},
  gradTitle: {color: '#fff', fontSize: 24, fontWeight: '900'},
  refreshBtn: {width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center'},
  heroRow: {flexDirection: 'row', alignItems: 'center'},
  heroStat: {flex: 1, alignItems: 'center'},
  heroNum: {color: '#fff', fontSize: 28, fontWeight: '900'},
  heroLbl: {color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', marginTop: 2},
  heroDivider: {width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.2)'},
  centerBox: {alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30},
  retryBtn: {paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12},
  body: {paddingHorizontal: 20, paddingTop: 18},
  rowGap: {flexDirection: 'row', gap: 12, marginBottom: 14},
  timeCard: {flex: 1, borderRadius: 16, borderWidth: 1, padding: 14, alignItems: 'flex-start'},
  timeIconWrap: {width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  timeVal: {fontSize: 18, fontWeight: '900'},
  timeLbl: {fontSize: 11, fontWeight: '700', marginTop: 2},
  insightCard: {borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 22},
  insightRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  insightIconWrap: {width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  insightLbl: {fontSize: 12, fontWeight: '700'},
  insightVal: {fontSize: 16, fontWeight: '900', marginTop: 2},
  insightSub: {fontSize: 10.5, fontWeight: '700'},
  insightDivider: {height: 1, marginVertical: 12},
  ratioTrack: {height: 6, borderRadius: 3, overflow: 'hidden'},
  ratioFill: {height: 6, borderRadius: 3},
  sectionTitle: {fontSize: 15, fontWeight: '900', marginBottom: 12},
  emptyBox: {borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 20},
  emptyTxt: {fontSize: 13, fontWeight: '600', textAlign: 'center'},
  driverCard: {flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, gap: 12},
  rankWrap: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  rankTxt: {fontSize: 13, fontWeight: '900'},
  driverName: {fontSize: 14.5, fontWeight: '800'},
  driverMeta: {fontSize: 11.5, fontWeight: '600', marginTop: 2},
  driverTotalWrap: {alignItems: 'center'},
  driverTotalNum: {fontSize: 20, fontWeight: '900'},
  driverTotalLbl: {fontSize: 10, fontWeight: '700'},
  idleNote: {fontSize: 11.5, fontWeight: '600', marginTop: 4, paddingHorizontal: 2},
});
