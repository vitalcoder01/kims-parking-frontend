import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../context/AuthContext';
import {useMyDriverId, isMyJob} from '../../hooks/useMyDriverId';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {useDialog} from '../../components/AppDialog';
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

// A rolling seven-day window CENTRED on today, not the Sunday-to-Saturday
// calendar week. Anchoring to the calendar meant the highlight drifted across
// the row as the week went on — parked at the far right by Friday and at the
// far left on Sunday — so the one cell the driver looks at was never in the
// same place twice. Now today holds the middle and the dates move around it.
const WINDOW = 7;
const TODAY_INDEX = Math.floor(WINDOW / 2);   // 3 of 0..6

function weekStrip() {
  const today = new Date();
  return Array.from({length: WINDOW}, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + (i - TODAY_INDEX));
    return {
      // toDateString, not letter+num: a window spanning a month boundary can
      // repeat a day number, and React needs these keys to be unique.
      key: d.toDateString(),
      // Indexed by the real weekday. The old code used the loop index, which
      // only lined up because the row happened to start on a Sunday.
      letter: DAY_LETTERS[d.getDay()],
      num: d.getDate(),
      isToday: i === TODAY_INDEX,
      isPast: i < TODAY_INDEX,
    };
  });
}

function isToday(ms?: number) {
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function DriverDashboardScreen() {
  const {user, updateProfile} = useAuth();
  const {tasks, visitors, setDriverStatus, fetchTaskHistory, hydrated} = useAppState();
  const {colors: c, isDark} = useTheme();
  const dialog = useDialog();
  const navigation = useNavigation<any>();
  const g = greeting();
  const days = weekStrip();

  const myDriverId = useMyDriverId();
  // From user.driverStatus, NOT AppStateContext's `drivers` array — that's
  // only ever fetched for valet/admin sessions, so for a driver it's
  // permanently empty (see web's identical fix for the full story). The
  // backend's serializeUser already sends this on login/refresh.
  const myStatus = user?.driverStatus;
  const [togglingShift, setTogglingShift] = useState(false);

  // On/off is the only thing this toggle controls — 'busy' is set
  // automatically by taking a job, never chosen. The backend already
  // refuses to take a driver off-duty while they're on a live job (see
  // driver.service.js setStatus's ACTIVE_TASK_STATUSES guard), so a driver
  // physically mid-job can't shift off mid-drive.
  const onShift = myStatus === 'available';
  const handleToggleShift = async () => {
    if (!myDriverId || togglingShift) return;
    if (myStatus === 'busy') {
      dialog.alert("You're still out on a job — finish or hand it off before going off-duty.", {title: 'Still on a job'});
      return;
    }
    const next = onShift ? 'off' : 'available';
    setTogglingShift(true);
    try {
      await setDriverStatus(myDriverId, next);
      updateProfile({driverStatus: next});
    } catch (err: any) {
      dialog.alert(err.message || 'Could not change your shift status', {title: 'Error'});
    } finally {
      setTogglingShift(false);
    }
  };

  const myTasks = tasks.filter(t => isMyJob(t.driverId, myDriverId));
  // 'delivered' is already off this driver's plate — awaiting valet
  // confirmation only, not something to keep showing as their active job.
  const activeTask = myTasks.find(t => t.status !== 'completed' && t.status !== 'delivered' && t.status !== 'cancelled') ?? null;
  // Visitor pickups genuinely still waiting on THIS driver. Two bugs used to
  // live here:
  //   1. Matching on `v.status === 'pending'` double-counted a visitor's park
  //      leg — that job is already the one `activeTask` above surfaces (it's
  //      the same ParkingTask, see visitor.service.js's createParkTaskForVisitor)
  //      — so a single open job was showing as "2 open" (activeTask + this).
  //   2. Matching the retrieval leg on `v.driverId` alone trusted a field
  //      that's reused from the park leg and NOT cleared once that leg
  //      completes (see visitor.service.js's assignRetrievalDriver comment).
  //      So the original parking driver kept seeing "visitor pickup waiting"
  //      for a retrieval the valet hadn't dispatched to anyone yet — or had
  //      dispatched to someone else entirely — because the stale id still
  //      happened to be theirs.
  // Fixed by requiring an actual live retrieve-type task assigned to this
  // driver (the same source of truth `tasks`/`activeTask` already use)
  // instead of trusting the visitor row's own driverId for the retrieval
  // case, and excluding whichever visitor `activeTask` already represents
  // so the one live job a driver can hold (currentTaskId is exclusive) never
  // gets shown — and counted — twice.
  const pendingVisitors = visitors.filter(v => v.status === 'parked' && v.retrievalRequested
    && v.id !== activeTask?.visitorId
    && tasks.some(t => t.visitorId === v.id && t.type === 'retrieve'
      && isMyJob(t.driverId, myDriverId) && t.status !== 'completed' && t.status !== 'cancelled'));
  const openCount = (activeTask ? 1 : 0) + pendingVisitors.length;

  // "Completed"/"Total jobs" need real history, not the live `tasks` array —
  // that's deliberately bounded to "at most one row per doctor" now, so a
  // job retired the moment a doctor's next car comes in would otherwise
  // vanish from these stats even though it genuinely happened today.
  //
  // Depends on `tasks` itself, not `tasks.length` — completing a job
  // replaces an existing row in place (markParked/markRetrieved's
  // setTasks(p => p.map(...))), so the array's length never changes when
  // the thing this effect cares about does. With .length as the dep this
  // never refired right after finishing a job, so "Completed"/"Total jobs"
  // sat stale until something unrelated elsewhere happened to change the
  // task count.
  const [history, setHistory] = useState<typeof tasks>([]);
  useEffect(() => {
    if (!myDriverId) return;
    fetchTaskHistory({driverId: myDriverId}).then(setHistory).catch(() => {});
  }, [myDriverId, fetchTaskHistory, tasks]);

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

        {/* Shift toggle — the driver's own on/off control, not something a
            valet/admin has to set for them. Busy (on a live job) shows as a
            locked, distinct state rather than a toggle that would just fail
            on tap — the backend already refuses this move mid-job. Mirrors
            kims-parking-web's identical feature. */}
        <PressableScale
          onPress={handleToggleShift}
          disabled={togglingShift || myStatus === 'busy'}
          style={[
            st.shiftCard,
            {
              borderColor: onShift ? c.success + '40' : c.border,
              backgroundColor: onShift ? c.successLight : c.surface,
              opacity: myStatus === 'busy' ? 0.75 : 1,
            },
          ]}>
          <View style={[st.shiftIconWrap, {backgroundColor: myStatus === 'busy' ? c.warningLight : onShift ? c.success : c.cardAlt}]}>
            <Icon name={myStatus === 'busy' ? 'bolt' : 'key'} size={17} color={myStatus === 'busy' ? c.warning : onShift ? '#fff' : c.textMuted} />
          </View>
          <View style={{flex: 1}}>
            <Text style={[st.shiftTitle, {color: c.textPrimary}]}>
              {myStatus === 'busy' ? 'On a job' : onShift ? 'On shift' : 'Off shift'}
            </Text>
            <Text style={[st.shiftSub, {color: c.textSecondary}]}>
              {myStatus === 'busy' ? 'Finish your current job to go off-duty' : onShift ? 'Visible to valets for new jobs' : "Tap to start — you won't be assigned jobs"}
            </Text>
          </View>
          <View style={[st.shiftSwitch, {backgroundColor: onShift ? c.success : c.border}]}>
            {togglingShift ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={[st.shiftThumb, onShift && st.shiftThumbOn]} />
            )}
          </View>
        </PressableScale>

        {/* Week strip */}
        <View style={st.weekRow}>
          {days.map(d => (
            <View
              key={d.key}
              style={[
                st.dayCell,
                d.isToday && {borderColor: c.textPrimary, backgroundColor: c.surface},
                // Days already gone recede, so the eye lands on today and the
                // days still ahead of it.
                d.isPast && !d.isToday && {opacity: 0.45},
              ]}>
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

  shiftCard: {flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 18},
  shiftIconWrap: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  shiftTitle: {fontSize: 14, fontWeight: '800'},
  shiftSub: {fontSize: 11.5, marginTop: 2},
  shiftSwitch: {width: 46, height: 27, borderRadius: 14, padding: 3, alignItems: 'flex-start', justifyContent: 'center'},
  shiftThumb: {width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.25, shadowRadius: 3, elevation: 2},
  shiftThumbOn: {transform: [{translateX: 19}]},
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
