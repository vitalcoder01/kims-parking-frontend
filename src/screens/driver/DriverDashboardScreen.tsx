import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../context/AuthContext';
import {useMyDriverId, isMyJob} from '../../hooks/useMyDriverId';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {Icon} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {SkeletonBlock} from '../../components/Skeleton';
import {useNavigation} from '@react-navigation/native';

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return {text: 'good morning.', icon: 'sun' as const};
  if (h < 17) return {text: 'good afternoon.', icon: 'sun' as const};
  if (h < 21) return {text: 'good evening.', icon: 'sunset' as const};
  return {text: 'good night.', icon: 'moon' as const};
}

function weekStrip() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return Array.from({length: 7}, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {letter: DAY_LETTERS[i], num: d.getDate(), isToday: d.toDateString() === today.toDateString()};
  });
}

function isToday(ms?: number) {
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function DriverDashboardScreen() {
  const {user} = useAuth();
  const {tasks, visitors, fetchTaskHistory, hydrated} = useAppState();
  const {colors: c, isDark} = useTheme();
  const navigation = useNavigation<any>();
  const g = greeting();
  const days = weekStrip();

  const myDriverId = useMyDriverId();
  const myTasks = tasks.filter(t => isMyJob(t.driverId, myDriverId));
  // 'delivered' is already off this driver's plate — awaiting valet
  // confirmation only, not something to keep showing as their active job.
  const activeTask = myTasks.find(t => t.status !== 'completed' && t.status !== 'delivered' && t.status !== 'cancelled') ?? null;
  const pendingVisitors = visitors.filter(v => isMyJob(v.driverId, myDriverId)
    && (v.status === 'pending' || (v.status === 'parked' && v.retrievalRequested)));
  const openCount = (activeTask ? 1 : 0) + pendingVisitors.length;

  // "Completed"/"Total jobs" need real history, not the live `tasks` array —
  // that's deliberately bounded to "at most one row per doctor" now, so a
  // job retired the moment a doctor's next car comes in would otherwise
  // vanish from these stats even though it genuinely happened today.
  const [history, setHistory] = useState<typeof tasks>([]);
  useEffect(() => {
    if (!myDriverId) return;
    fetchTaskHistory({driverId: myDriverId}).then(setHistory).catch(() => {});
  }, [myDriverId, fetchTaskHistory, tasks.length]);

  const completedToday = history.filter(t => t.status === 'completed' && isToday(t.completedAt));

  const stats = [
    {label: 'Completed', value: completedToday.length, icon: 'flag' as const},
    {label: 'Open now', value: openCount, icon: 'inbox' as const},
    {label: 'Total jobs', value: history.length, icon: 'history' as const},
  ];

  return (
    <SafeAreaView style={[st.safe, {backgroundColor: c.background}]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.background} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={st.headerRow}>
          <View style={[st.streakPill, {backgroundColor: c.surface, borderColor: c.border}]}>
            <Icon name={g.icon} size={15} color={c.textPrimary} />
          </View>
          <Text style={[st.greeting, {color: c.textPrimary}]}>{g.text}</Text>
          <View style={[st.avatar, {backgroundColor: c.primary}]}>
            <Text style={[st.avatarTxt, {color: c.textOnPrimary}]}>{(user?.name ?? 'D').charAt(0).toUpperCase()}</Text>
          </View>
        </View>

        {/* Week strip */}
        <View style={st.weekRow}>
          {days.map(d => (
            <View key={d.letter + d.num} style={[st.dayCell, d.isToday && {borderColor: c.textPrimary, backgroundColor: c.surface}]}>
              <Text style={[st.dayLetter, {color: c.textMuted}]}>{d.letter}</Text>
              <Text style={[st.dayNum, {color: d.isToday ? c.textPrimary : c.textSecondary}, d.isToday && st.dayNumToday]}>{d.num}</Text>
            </View>
          ))}
        </View>

        {/* Hero card */}
        <PressableScale
          onPress={() => navigation.navigate('Jobs')}
          style={[st.hero, {backgroundColor: c.primary}]}
        >
          <Text style={[st.heroEyebrow, {color: c.textOnPrimary + '99'}]}>
            {activeTask ? (activeTask.type === 'park' ? 'Parking task' : 'Retrieval task') : 'Standing by'}
          </Text>
          <Text style={[st.heroTitle, {color: c.textOnPrimary}]}>
            {activeTask
              ? `${activeTask.carNumber} · ${activeTask.doctorName}`
              : 'No active job right now'}
          </Text>
          <View style={[st.heroBtn, {backgroundColor: c.textOnPrimary}]}>
            <Text style={[st.heroBtnTxt, {color: c.primary}]}>{activeTask ? 'Open job' : 'View jobs'}</Text>
            <Icon name="arrowRight" size={15} color={c.primary} />
          </View>
        </PressableScale>

        {/* Stats row */}
        <View style={st.statsRow}>
          {/* A zeroed tile during load reads as a real number — "you've done
              nothing today" — rather than as "not known yet". */}
          {!hydrated ? [0, 1, 2].map(i => (
            <View key={i} style={[st.statCard, {backgroundColor: c.surface, borderColor: c.border}]}>
              <SkeletonBlock height={18} width={18} radius={5} />
              <SkeletonBlock height={20} width="55%" radius={6} />
              <SkeletonBlock height={10} width="70%" radius={5} />
            </View>
          )) : stats.map(s => (
            <View key={s.label} style={[st.statCard, {backgroundColor: c.surface, borderColor: c.border}]}>
              <Icon name={s.icon} size={18} color={c.textPrimary} />
              <Text style={[st.statValue, {color: c.textPrimary}]}>{s.value}</Text>
              <Text style={[st.statLabel, {color: c.textSecondary}]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Pending visitor pickups shortcut */}
        {pendingVisitors.length > 0 && (
          <PressableScale
            onPress={() => navigation.navigate('Jobs')}
            style={[st.noticeCard, {backgroundColor: c.warningLight, borderColor: c.warning + '40'}]}
          >
            <Icon name="bellAlert" size={18} color={c.warning} />
            <Text style={[st.noticeTxt, {color: c.textPrimary}]}>
              {pendingVisitors.length} visitor pickup{pendingVisitors.length > 1 ? 's' : ''} waiting
            </Text>
            <Icon name="chevronRight" size={16} color={c.textSecondary} />
          </PressableScale>
        )}

        {/* Recent activity */}
        <Text style={[st.sectionTitle, {color: c.textPrimary}]}>Recent activity</Text>
        {completedToday.length === 0 ? (
          <View style={[st.emptyCard, {backgroundColor: c.surface, borderColor: c.border}]}>
            <Icon name="flag" size={22} color={c.textMuted} />
            <Text style={[st.emptyTxt, {color: c.textSecondary}]}>Nothing completed yet today</Text>
          </View>
        ) : (
          completedToday.slice(0, 5).map(t => (
            <View key={t.id} style={[st.activityRow, {backgroundColor: c.surface, borderColor: c.border}]}>
              <View style={[st.activityIcon, {backgroundColor: c.successLight}]}>
                <Icon name={t.type === 'park' ? 'arrowDown' : 'arrowUp'} size={15} color={c.success} />
              </View>
              <View style={{flex: 1}}>
                <Text style={[st.activityTitle, {color: c.textPrimary}]}>{t.type === 'park' ? 'Parked' : 'Retrieved'} · {t.doctorName}</Text>
                <Text style={[st.activityMeta, {color: c.textSecondary}]}>{t.carNumber}{t.slotId ? ` · ${t.slotId}` : ''}</Text>
              </View>
              <Icon name="check" size={16} color={c.success} />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: 20, paddingTop: 12, paddingBottom: 40},

  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18},
  streakPill: {width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  greeting: {flex: 1, fontSize: 22, fontWeight: '800'},
  avatar: {width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center'},
  avatarTxt: {fontSize: 14, fontWeight: '800'},

  weekRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20},
  dayCell: {width: 38, height: 52, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4},
  dayLetter: {fontSize: 11, fontWeight: '600'},
  dayNum: {fontSize: 15, fontWeight: '700'},
  dayNumToday: {fontWeight: '900'},

  hero: {borderRadius: 24, padding: 22, marginBottom: 16, minHeight: 150, justifyContent: 'space-between'},
  heroEyebrow: {fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase'},
  heroTitle: {fontSize: 20, fontWeight: '800', marginTop: 8, lineHeight: 26},
  heroBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16},
  heroBtnTxt: {fontSize: 13, fontWeight: '800'},

  statsRow: {flexDirection: 'row', gap: 10, marginBottom: 16},
  statCard: {flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, gap: 6},
  statValue: {fontSize: 22, fontWeight: '900'},
  statLabel: {fontSize: 11, fontWeight: '600'},

  noticeCard: {flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16},
  noticeTxt: {flex: 1, fontSize: 13, fontWeight: '700'},

  sectionTitle: {fontSize: 15, fontWeight: '800', marginBottom: 10},
  emptyCard: {borderRadius: 18, borderWidth: 1, padding: 28, alignItems: 'center', gap: 8},
  emptyTxt: {fontSize: 13, fontWeight: '600'},

  activityRow: {flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 8},
  activityIcon: {width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  activityTitle: {fontSize: 13, fontWeight: '700'},
  activityMeta: {fontSize: 11, fontWeight: '600', marginTop: 2},
});
