import React, {useState} from 'react';
import {
  ScrollView, View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, Alert,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {useAppState} from '../context/AppStateContext';
import {useRetrievalRequest} from '../hooks/useRetrievalRequest';
import {Badge} from '../components/Badge';
import {LiveTrackingScreen} from './shared/LiveTrackingScreen';

const TIME_OPTIONS = [10, 15, 20, 30];

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
  const {activeRetrieve, remainingSeconds, requestRetrieval} = useRetrievalRequest();
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [showTracking, setShowTracking] = useState(false);

  // tasks come back newest-first (createdAt desc) — index 0 is latest.
  const myTasks = tasks.filter(t => t.doctorId === user?.id);
  const activeTask = myTasks.find(t => t.status !== 'completed');
  const latestTask = myTasks[0];
  const task = activeTask ?? latestTask;
  const isParked = task?.status === 'completed' && task.type === 'park';

  const handleRequest = async () => {
    if (!selectedTime) return;
    setRequesting(true);
    try {
      await requestRetrieval(selectedTime);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not request retrieval');
    } finally {
      setRequesting(false);
    }
  };

  if (showTracking && activeRetrieve) {
    return <LiveTrackingScreen task={activeRetrieve} onBack={() => setShowTracking(false)} />;
  }

  const justRetrieved = task?.type === 'retrieve' && task.status === 'completed';

  if (!task || !task.slotId || justRetrieved) {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>{justRetrieved ? '🚗' : '🅿️'}</Text>
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
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Session strip */}
        <View style={[s.strip, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          <Text style={[s.session, {color: colors.textMuted}]}>SESSION · {task.carNumber}</Text>
          <Badge label={isParked ? 'Parked' : 'In Progress'} variant={isParked ? 'success' : 'warning'} dot />
        </View>

        {/* Slot hero */}
        <View style={[s.hero, {backgroundColor: isDark ? '#1A0A00' : '#FFF4EE', borderBottomColor: colors.primary + '28'}]}>
          <Text style={[s.heroEye, {color: colors.primary + 'AA'}]}>PARKING SLOT</Text>
          <Text style={[s.heroNum, {color: colors.textPrimary}]}>{task.slotId}</Text>
          {task.completedAt && (
            <Text style={[s.heroSub, {color: colors.textSecondary}]}>Parked at {formatTime(task.completedAt)}</Text>
          )}
          <View style={[s.heroAccent, {backgroundColor: colors.primary}]} />
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

          {/* Retrieval */}
          {isParked && !activeRetrieve && (
            <>
              <Text style={[s.sec, {color: colors.textMuted}]}>REQUEST RETRIEVAL</Text>
              <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
                <Text style={[s.whenQ, {color: colors.textPrimary}]}>When do you need your car?</Text>
                <Text style={[s.whenSub, {color: colors.textSecondary}]}>The valet will assign a driver to bring it to you.</Text>

                <View style={s.chipRow}>
                  {TIME_OPTIONS.map(opt => {
                    const on = selectedTime === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        activeOpacity={0.7}
                        onPress={() => setSelectedTime(opt)}
                        style={[
                          s.chip,
                          {
                            backgroundColor: on ? colors.primary + '14' : colors.cardAlt,
                            borderColor: on ? colors.primary : colors.border,
                          },
                        ]}>
                        <Text style={[s.chipNum, {color: on ? colors.primary : colors.textPrimary}]}>{opt}</Text>
                        <Text style={[s.chipUnit, {color: on ? colors.primary + 'AA' : colors.textMuted}]}>min</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedTime && (
                  <View style={[s.etaCard, {backgroundColor: colors.success + '10', borderColor: colors.success + '30'}]}>
                    <View>
                      <Text style={[s.etaLbl, {color: colors.textMuted}]}>Car ready by</Text>
                      <Text style={[s.etaVal, {color: colors.success}]}>{formatTime(Date.now() + selectedTime * 60000)}</Text>
                    </View>
                    <Text style={s.etaIcon}>🚗</Text>
                  </View>
                )}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleRequest}
                  disabled={!selectedTime || requesting}
                  style={[
                    s.cta,
                    {
                      backgroundColor: selectedTime ? colors.primary : colors.border,
                      shadowColor: colors.primary,
                      opacity: requesting ? 0.6 : 1,
                    },
                  ]}>
                  <Text style={[s.ctaTxt, {color: selectedTime ? '#fff' : colors.textMuted}]}>
                    {requesting ? 'Requesting…' : selectedTime ? `Confirm — Leaving in ${selectedTime} min` : 'Select a time above'}
                  </Text>
                  {selectedTime && !requesting ? <Text style={s.ctaArrow}>→</Text> : null}
                </TouchableOpacity>
              </View>
            </>
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
                    <Text style={[s.whenQ, {color: colors.textPrimary}]}>Retrieval requested</Text>
                  )}
                  <View style={[s.retrievalStageRow, {borderTopColor: colors.divider}]}>
                    <Text style={s.retrievalStageIcon}>
                      {activeRetrieve.status === 'requested' ? '⏳' : activeRetrieve.status === 'assigned' ? '🔔' : '🚗'}
                    </Text>
                    <Text style={[s.retrievalStageTxt, {color: colors.textSecondary}]}>
                      {activeRetrieve.status === 'requested' && 'Waiting for valet to assign a driver'}
                      {activeRetrieve.status === 'assigned' && `${activeRetrieve.driverName ?? 'A driver'} assigned — heading to your car`}
                      {activeRetrieve.status === 'in_transit' && `${activeRetrieve.driverName ?? 'Driver'} is bringing your car to you`}
                    </Text>
                  </View>
                  {activeRetrieve.status === 'in_transit' && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowTracking(true)}
                      style={[s.cta, {backgroundColor: colors.primary, shadowColor: colors.primary}]}>
                      <Text style={[s.ctaTxt, {color: '#fff'}]}>🗺️ View Live Tracking Map</Text>
                    </TouchableOpacity>
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
  emptyIcon: {fontSize: 40, marginBottom: 8},
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
  retrievalStageIcon: {fontSize: 20},
  retrievalStageTxt: {flex: 1, fontSize: 13, fontWeight: '700'},

  whenQ: {fontSize: 15, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, marginBottom: 3},
  whenSub: {fontSize: 12, paddingHorizontal: 14, marginBottom: 14},

  chipRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 14},
  chip: {
    flex: 1, borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 16, alignItems: 'center',
  },
  chipNum: {fontSize: 26, fontWeight: '900', lineHeight: 30},
  chipUnit: {fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3},

  etaCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 14, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  etaLbl: {fontSize: 10, fontWeight: '600'},
  etaVal: {fontSize: 24, fontWeight: '900', marginTop: 3},
  etaIcon: {fontSize: 30},

  cta: {
    margin: 14, marginTop: 8, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  ctaTxt: {fontSize: 14, fontWeight: '900'},
  ctaArrow: {fontSize: 16, color: '#fff', fontWeight: '900'},
});
