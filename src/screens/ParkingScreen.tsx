import React, {useState} from 'react';
import {ScrollView, View, Text, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {useAppState} from '../context/AppStateContext';
import {useRetrievalRequest} from '../hooks/useRetrievalRequest';
import {Badge} from '../components/Badge';
import {LiveTrackingScreen} from './shared/LiveTrackingScreen';
import {Icon} from '../components/Icon';
import {PressableScale} from '../components/PressableScale';

function formatDuration(sinceMs: number) {
  const mins = Math.max(0, Math.round((Date.now() - sinceMs) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});
}

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ParkingScreen() {
  const {colors, isDark} = useTheme();
  const {user} = useAuth();
  const {tasks} = useAppState();
  const {activeRetrieve, remainingSeconds} = useRetrievalRequest();
  const [showTracking, setShowTracking] = useState(false);

  // `tasks` only ever contains this doctor's single current session — no
  // more "active vs latest" search needed.
  const rawTask = tasks.find(t => t.doctorId === user?.id);
  const task = rawTask?.status === 'cancelled' ? undefined : rawTask;
  const isParked = task?.status === 'completed' && task.type === 'park';

  if (showTracking && activeRetrieve) {
    return <LiveTrackingScreen task={activeRetrieve} onBack={() => setShowTracking(false)} />;
  }

  // 'delivered' — car's back at the counter but the valet hasn't confirmed
  // handover yet; that's still "come get it," not "already done."
  const justRetrieved = task?.type === 'retrieve' && task.status === 'delivered';

  if (!task || !task.slotId || justRetrieved) {
    return (
      <SafeAreaView edges={['bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.emptyWrap}>
          <Icon name={justRetrieved ? 'car' : 'parking'} size={40} color={colors.textMuted} />
          <Text style={[s.emptyTitle, {color: colors.textPrimary}]}>{justRetrieved ? 'Car Ready at Entrance' : 'No Active Parking Session'}</Text>
          <Text style={[s.emptyDesc, {color: colors.textMuted}]}>
            {justRetrieved ? 'Please collect your vehicle at the gate.' : 'Hand your keys to the valet at the entrance to get started.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const vehicleRows: [string, string][] = [
    ['Reg. Number', task.carNumber],
    ['Parked By',   task.driverName ?? 'Unassigned'],
    ['Location',    task.slotId],
    ...(task.completedAt ? [['Duration', formatDuration(task.completedAt)] as [string, string]] : []),
  ];

  return (
    <SafeAreaView edges={['bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Session strip */}
        <View style={[s.strip, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          <Text style={[s.session, {color: colors.textMuted}]}>SESSION · {task.carNumber}</Text>
          <Badge label={isParked ? 'Parked' : 'In Progress'} variant={isParked ? 'success' : 'warning'} dot />
        </View>

        {/* Slot hero — neutral surface tint, matching the app's monochrome
            brand (BRAND_GRADIENT) rather than a one-off accent colour. */}
        <View style={[s.hero, {backgroundColor: colors.cardAlt, borderBottomColor: colors.border}]}>
          <Text style={[s.heroEye, {color: colors.textMuted}]}>PARKING SLOT</Text>
          <Text style={[s.heroNum, {color: colors.textPrimary}]}>{task.slotId}</Text>
          {task.completedAt && (
            <Text style={[s.heroSub, {color: colors.textSecondary}]}>Parked at {formatTime(task.completedAt)}</Text>
          )}
          <View style={[s.heroAccent, {backgroundColor: colors.textPrimary}]} />
        </View>

        <View style={s.pad}>

          {/* Vehicle info */}
          <Text style={[s.sec, {color: colors.textMuted}]}>VEHICLE INFO</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {vehicleRows.map(([lbl, val], i) => (
              <View
                key={lbl}
                style={[s.infoRow, {borderBottomColor: colors.divider}, i === vehicleRows.length - 1 && {borderBottomWidth: 0}]}>
                <Text style={[s.infoLbl, {color: colors.textSecondary}]}>{lbl}</Text>
                <Text style={[s.infoVal, {color: colors.textPrimary}]}>{val}</Text>
              </View>
            ))}
          </View>

          {/* Requesting retrieval lives on the Home tab only — this screen
              just shows read-only session info plus live status once a
              retrieval is actually underway. */}
          {isParked && !activeRetrieve && (
            <View style={[s.hintSheet, {backgroundColor: colors.primary + '0C', borderColor: colors.primary + '2A'}]}>
              <Icon name="info" size={18} color={colors.primary} />
              <Text style={[s.hintTxt, {color: colors.textSecondary}]}>
                Ready to leave? Request your car from the <Text style={{fontWeight: '800', color: colors.textPrimary}}>Home</Text> tab.
              </Text>
            </View>
          )}

          {/* Live retrieval status — real backend-tracked state, same for
              this screen and the Home tab, so it never resets or drifts
              depending on which tab the doctor is looking at. */}
          {activeRetrieve && (
            <>
              <Text style={[s.sec, {color: colors.textMuted}]}>RETRIEVAL STATUS</Text>
              <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
                <View style={s.retrievalStatusBox}>
                  {remainingSeconds != null ? (
                    <>
                      <Text style={[s.countdownTimer, {color: colors.primary}]}>{formatCountdown(remainingSeconds)}</Text>
                      <Text style={[s.countdownLabel, {color: colors.textMuted}]}>until requested departure</Text>
                    </>
                  ) : (
                    <Text style={[s.countdownTimer, {color: colors.textPrimary, fontSize: 18}]}>Retrieval requested</Text>
                  )}
                  <View style={[s.retrievalStageRow, {borderTopColor: colors.divider}]}>
                    <Icon
                      name={activeRetrieve.status === 'requested' ? 'timer' : activeRetrieve.status === 'assigned' ? 'bell' : 'car'}
                      size={18} color={colors.textSecondary}
                    />
                    <Text style={[s.retrievalStageTxt, {color: colors.textSecondary}]}>
                      {activeRetrieve.status === 'requested' && 'Waiting for valet to assign a driver'}
                      {activeRetrieve.status === 'assigned' && `${activeRetrieve.driverName ?? 'A driver'} assigned — heading to your car`}
                      {activeRetrieve.status === 'in_transit' && `${activeRetrieve.driverName ?? 'Driver'} is bringing your car to you`}
                    </Text>
                  </View>
                  {activeRetrieve.status === 'in_transit' && (
                    <PressableScale
                      onPress={() => setShowTracking(true)}
                      style={[s.cta, {backgroundColor: colors.primary, shadowColor: colors.primary}]}>
                      <Icon name="map" size={16} color={colors.textOnPrimary} />
                      <Text style={[s.ctaTxt, {color: colors.textOnPrimary}]}>View Live Tracking Map</Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            </>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {paddingBottom: 40},

  emptyWrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8},
  emptyTitle: {fontSize: 18, fontWeight: '800'},
  emptyDesc: {fontSize: 13, textAlign: 'center', lineHeight: 19},

  strip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  session: {fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase'},

  hero: {borderBottomWidth: 1, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 24, alignItems: 'center'},
  heroEye: {fontSize: 9, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10},
  heroNum: {fontSize: 64, fontWeight: '900', letterSpacing: -2, lineHeight: 68},
  heroSub: {fontSize: 12, marginTop: 8},
  heroAccent: {width: 40, height: 3, borderRadius: 2, marginTop: 18},

  pad: {padding: 16},
  sec: {fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8, marginTop: 10},
  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 4},

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
  },
  infoLbl: {fontSize: 12},
  infoVal: {fontSize: 13, fontWeight: '700'},

  retrievalStatusBox: {alignItems: 'center', padding: 24, gap: 4},
  countdownTimer: {fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums']},
  countdownLabel: {fontSize: 11, fontWeight: '600', marginBottom: 4},
  retrievalStageRow: {flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 16, marginTop: 12, alignSelf: 'stretch'},
  retrievalStageTxt: {flex: 1, fontSize: 13, fontWeight: '700'},

  hintSheet: {flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 4},
  hintTxt: {flex: 1, fontSize: 13, lineHeight: 18},

  cta: {
    margin: 14, marginTop: 8, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  ctaTxt: {fontSize: 14, fontWeight: '900'},
});
