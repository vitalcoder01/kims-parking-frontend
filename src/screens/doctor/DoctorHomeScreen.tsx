import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, Animated, Modal, Pressable, Easing} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {LiveTrackingScreen} from '../shared/LiveTrackingScreen';
import {useRetrievalRequest} from '../../hooks/useRetrievalRequest';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon} from '../../components/Icon';
import {SkeletonBlock} from '../../components/Skeleton';
import {
  PLANNED_DEPARTURE_OPTIONS, plannedDepartureLabel, enRouteSeconds, fmtDuration,
} from '../../utils/retrievalClocks';

// The doctor's PLANNED DEPARTURE — "I intend to leave in X minutes".
// Never an arrival estimate: the system can't promise when the car turns up.
const DEPARTURE_OPTIONS = PLANNED_DEPARTURE_OPTIONS;
// The "on my way in" arrival notice is a separate feature with its own scale.
const ETA_OPTIONS_ARRIVAL = [10, 20, 30, 40];

// Modal's own `animationType="fade"` just snaps opacity 0→1 on the whole
// overlay in one flat step — no easing, no motion — which is why it read as
// abrupt next to the card's own press-scale. This drives the slide+fade
// itself instead, and stays mounted a beat past `visible` turning false so
// the exit animation can actually play instead of the view just vanishing.
function BottomSheetModal({visible, onClose, children}: {visible: boolean; onClose: () => void; children: React.ReactNode}) {
  const translateY = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      // Starting .start() here, in the same tick as the setRendered(true)
      // that mounts the sheet, lets the (native-driven) animation begin
      // running before the Modal/Animated.View has actually attached at its
      // off-screen starting position — so it can finish, or nearly finish,
      // before there's anything on screen to show it happening. Waiting a
      // frame guarantees the mount has actually committed first.
      const raf = requestAnimationFrame(() => {
        translateY.setValue(400);
        backdropOpacity.setValue(0);
        Animated.parallel([
          Animated.timing(backdropOpacity, {toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true}),
          Animated.timing(translateY, {toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
        ]).start();
      });
      return () => cancelAnimationFrame(raf);
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true}),
        Animated.timing(translateY, {toValue: 400, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true}),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[s.modalBackdrop, {opacity: backdropOpacity}]}>
        <Pressable style={{flex: 1}} onPress={onClose} />
      </Animated.View>
      <View style={s.modalWrap} pointerEvents="box-none">
        <Animated.View style={{width: '100%', transform: [{translateY}]}}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DoctorHomeScreen() {
  const dialog = useDialog();
  const {user} = useAuth();
  const {tasks, sendArrivalNotice, hydrated} = useAppState();
  const {colors, isDark} = useTheme();
  const navigation = useNavigation<any>();
  const {activeRetrieve, now, requestRetrieval} = useRetrievalRequest();
  // Popups over the home screen, not separate full-screen views — the
  // doctor never leaves Home, Vehicle Status etc. stay visible underneath.
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [selectedEta, setSelectedEta]     = useState<number | null>(null);
  const [requesting, setRequesting]       = useState(false);
  const [showTracking, setShowTracking]   = useState(false);
  const [arrivalEta, setArrivalEta]       = useState<number | null>(null);
  const [sendingArrival, setSendingArrival] = useState(false);
  const [arrivalSent, setArrivalSent]     = useState<number | null>(null); // eta minutes, once confirmed
  const pulse = useRef(new Animated.Value(1)).current;

  // `tasks` only ever contains each doctor's single current session (the
  // backend enforces at most one isCurrent row per doctor) — no more
  // "most recent non-completed" search needed, and no more risk of an old
  // stuck task outranking a real, later one.
  const displayTask = tasks.find(t => t.doctorId === user?.id);
  const activeTask = displayTask && displayTask.status !== 'completed' && displayTask.status !== 'cancelled' ? displayTask : undefined;
  const carIsParked = displayTask?.type === 'park' && displayTask.status === 'completed';
  // 'delivered' — driver's brought the car back to the valet counter, but
  // the valet hasn't confirmed handover yet. That's still "come get it",
  // not "already done" — the task only becomes 'completed' once confirmed.
  const carJustRetrieved = displayTask?.type === 'retrieve' && displayTask.status === 'delivered';
  // A cancelled session (e.g. staff retired a stuck "no driver ever showed
  // up" job) is over, same as completed — nothing to show for it. A
  // completed RETRIEVE is also over — the car's already back with the
  // doctor, there's no "vehicle status" left worth showing until the next
  // park request. A completed PARK is different: the car is still sitting
  // in the lot, so that one legitimately stays displayed.
  const showEmptyState = !displayTask || displayTask.status === 'cancelled'
    || (displayTask.status === 'completed' && displayTask.type === 'retrieve');
  // Park job actually under way — the driver has the key and is moving, so
  // there's a real GPS position worth showing. (Retrievals are covered by
  // the countdown card; this is the park-side equivalent.)
  const parkInMotion = displayTask?.type === 'park'
    && (displayTask.status === 'key_collected' || displayTask.status === 'in_transit');

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, {toValue: 1.04, duration: 1000, useNativeDriver: true}),
      Animated.timing(pulse, {toValue: 1, duration: 1000, useNativeDriver: true}),
    ])).start();
  }, []);

  // A real session showing up (key handed over) means the arrival notice
  // did its job — drop back to the plain empty state instead of still
  // showing "arriving in X min" once the car's actually here.
  useEffect(() => {
    if (!showEmptyState) { setArrivalSent(null); setArrivalEta(null); }
  }, [showEmptyState]);

  const handleArrival = async () => {
    if (!arrivalEta) return;
    setSendingArrival(true);
    try {
      await sendArrivalNotice(arrivalEta);
      setArrivalSent(arrivalEta);
      setShowArrivalModal(false);
    } catch (err: any) {
      dialog.alert(err.message || 'Could not notify the valet', {title: 'Error'});
    } finally {
      setSendingArrival(false);
    }
  };

  const handleDeparture = async () => {
    if (selectedEta == null) return;   // 0 = "Now" is valid, and falsy
    setRequesting(true);
    try {
      await requestRetrieval(selectedEta);
      setShowDepartureModal(false);
    } catch (err: any) {
      dialog.alert(err.message || 'Could not request retrieval', {title: 'Error'});
    } finally {
      setRequesting(false);
    }
  };

  // Wall-clock time of day, e.g. "3:40 PM" — NOT a duration.
  const fmtTimeOfDay = (ms: number) => new Date(ms).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});

  // 'assigned' is the task's status from the moment it's *created* — it does
  // NOT mean a driver has been picked yet. Whether one has is driverId
  // being set, not the status string, so that has to gate the label
  // separately instead of folding it into the status map below.
  const statusMap: Record<string,{label:string;color:string}> = {
    assigned:      {label: 'Driver Assigned',      color: colors.warning},
    key_collected: {label: 'Key Collected',         color: colors.info},
    // A retrieval's destination is the valet counter, NOT the doctor — the
    // driver brings the car back there and the doctor collects it (their own
    // button literally says "Car delivered to valet counter", and the
    // arrival banner says "collect at the gate"). "En Route to You" implied
    // door-to-door delivery that never happens.
    in_transit:    {label: activeTask?.type === 'retrieve' ? 'Coming to Valet Counter' : 'En Route to Parking', color: colors.primary},
    delivered:     {label: 'Ready at the counter', color: colors.success},
    completed:     {label: 'Safely Parked',         color: colors.success},
  };
  const statusInfo = activeTask
    ? (activeTask.status === 'assigned' && !activeTask.driverId
        ? {label: 'Awaiting Driver', color: colors.textMuted}
        : statusMap[activeTask.status])
    : null;

  if (showTracking && displayTask) {
    return <LiveTrackingScreen task={displayTask} onBack={() => setShowTracking(false)} />;
  }

  return (
    <SafeAreaView edges={['bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Gradient header */}
        <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.header} start={{x:0,y:0}} end={{x:1,y:1}}>
          <View style={s.headerContent}>
            <View style={{flex: 1}}>
              <Text style={s.headerGreet}>Good day,</Text>
              <Text style={s.headerName}>{user?.name}</Text>
              <Text style={s.headerDept}>{user?.department}</Text>
            </View>
            <View style={{alignItems: 'flex-end', gap: 10}}>
              <PressableScale style={s.cardCodeBox} onPress={() => navigation.navigate('Card')}>
                <Text style={s.cardCodeNum}>{user?.cardCode ?? '---'}</Text>
                <View style={s.cardCodeLblRow}>
                  <Text style={s.cardCodeLbl}>VALET CODE</Text>
                  <Icon name="chevronRight" size={11} color="rgba(255,255,255,0.7)" />
                </View>
              </PressableScale>
            </View>
          </View>
        </LinearGradient>

        <View style={s.body}>
          {/* Countdown — real backend-tracked retrieval state, shared with
              the "My Parking" tab via useRetrievalRequest so it's identical
              no matter which screen the doctor is looking at. This is the
              single most relevant thing on the whole screen while it's
              running, so it leads — above Vehicle Status, above the
              launcher cards, not buried at the bottom. Hidden once
              'delivered' — the CAR READY AT ENTRANCE banner below already
              covers that, so both wouldn't need to say it at once. */}
          {activeRetrieve && activeRetrieve.status !== 'delivered' && (() => {
            // The doctor is told what is HAPPENING, never when the car will
            // arrive. Their planned-departure choice was scheduling
            // information for the valet team — turning it into a countdown
            // here would be promising a delivery time the system has no way
            // to honour. The only clock shown is the real trip, and only
            // once a driver has actually set off.
            const enRoute = enRouteSeconds(activeRetrieve, now);
            const onTheWay = activeRetrieve.status === 'in_transit' && enRoute != null;
            return (
              <Animated.View style={{transform: [{scale: onTheWay ? pulse : 1}]}}>
                <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.countdownCard} start={{x:0,y:0}} end={{x:1,y:1}}>
                  {onTheWay ? (
                    <>
                      <View style={s.countdownLabelRow}>
                        <Icon name="car" size={13} color="rgba(255,255,255,0.8)" />
                        <Text style={s.countdownLabel}>Vehicle on the way</Text>
                      </View>
                      <Text style={s.countdownTimer}>{fmtDuration(enRoute!)}</Text>
                      <Text style={s.countdownSub}>
                        {activeRetrieve.driverName ?? 'Your driver'} · collect at the valet counter
                      </Text>
                      <PressableScale style={s.countdownTrackBtn} onPress={() => setShowTracking(true)}>
                        <Icon name="map" size={15} color="#fff" />
                        <Text style={s.countdownTrackBtnTxt}>Track live</Text>
                      </PressableScale>
                    </>
                  ) : (
                    <>
                      <View style={s.sentIconWrap}>
                        <Icon name="checkBold" size={26} color="#fff" />
                      </View>
                      <Text style={s.sentTitle}>Departure request sent</Text>
                      <Text style={s.sentBody}>The valet team has been notified.</Text>
                      <Text style={s.sentBody}>We'll notify you when your vehicle is on the way.</Text>
                    </>
                  )}
                </LinearGradient>
              </Animated.View>
            );
          })()}

          {/* A park job in motion has no countdown card (there's no ETA to
              count down to — the driver picks whichever slot is free), so
              without this the doctor has no way to watch their car being
              parked. Same role the countdown card plays for a retrieval,
              minus the timer. */}
          {parkInMotion && (
            <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.trackCard} start={{x:0,y:0}} end={{x:1,y:1}}>
              <View style={s.trackCardTop}>
                <Icon name="carKey" size={15} color="rgba(255,255,255,0.85)" />
                <Text style={s.trackCardTitle} numberOfLines={1}>
                  {displayTask?.status === 'key_collected'
                    ? `${displayTask?.driverName ?? 'Driver'} has your key`
                    : `${displayTask?.driverName ?? 'Driver'} is parking your car`}
                </Text>
              </View>
              <PressableScale style={s.countdownTrackBtn} onPress={() => setShowTracking(true)}>
                <Icon name="map" size={15} color="#fff" />
                <Text style={s.countdownTrackBtnTxt}>Track live</Text>
              </PressableScale>
            </LinearGradient>
          )}

          {/* Arrival / Departure launcher cards — each independently gated
              on its OWN relevance, not a shared on/off switch: Arrival only
              makes sense idle (showEmptyState), Departure only once a car's
              actually parked (carIsParked && !activeRetrieve) — the
              opposite state. These two conditions are mutually exclusive,
              so at most one card ever renders; neither renders "blocked"
              anymore since a card only shows up when it's actually usable. */}
          {!hydrated && (
            <View style={s.primaryRow}>
              <SkeletonBlock height={116} radius={18} style={{flex: 1}} />
              <SkeletonBlock height={116} radius={18} style={{flex: 1}} />
            </View>
          )}
          {hydrated && (showEmptyState || (carIsParked && !activeRetrieve)) && (
            <View style={s.primaryRow}>
              {showEmptyState && (
                <PressableScale
                  onPress={() => setShowArrivalModal(true)}
                  style={[s.primaryBtn, {backgroundColor: colors.primary}]}>
                  <View style={s.primaryIconWrap}><Icon name="bellAlert" size={26} color="#fff" /></View>
                  <Text style={s.primaryBtnTxt}>Arrival</Text>
                  <Text style={s.primaryBtnSub} numberOfLines={2}>Let valet know you're coming</Text>
                </PressableScale>
              )}
              {carIsParked && !activeRetrieve && (
                <PressableScale
                  onPress={() => setShowDepartureModal(true)}
                  style={[s.primaryBtn, {backgroundColor: colors.accent}]}>
                  <View style={s.primaryIconWrap}><Icon name="car" size={26} color="#fff" /></View>
                  <Text style={s.primaryBtnTxt}>Departure</Text>
                  <Text style={s.primaryBtnSub} numberOfLines={2}>Request your car back</Text>
                </PressableScale>
              )}
            </View>
          )}

          {arrivalSent && showEmptyState && (
            <View style={[s.noticeBanner, {backgroundColor: colors.success + '10', borderColor: colors.success + '30'}]}>
              <Icon name="bellAlert" size={16} color={colors.success} />
              <Text style={[s.noticeBannerTxt, {color: colors.success}]}>
                Valet notified — arriving in ~{arrivalSent} min
              </Text>
            </View>
          )}

          {/* One fact leads, everything else supports it. When the car is
              parked the slot number IS the answer the doctor opened the app
              for, so it's the headline — not a value in a two-column grid
              under a title bar and a status pill. No dot: the wording
              already says the state, and a coloured dot next to text that
              states the same thing is decoration. */}
          <View style={[s.statusCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            {!hydrated ? (
              <View style={s.statusBody}>
                <SkeletonBlock height={12} width="35%" radius={6} />
                <SkeletonBlock height={34} width="55%" radius={8} style={{marginTop: 12}} />
                <SkeletonBlock height={12} width="70%" radius={6} style={{marginTop: 14}} />
              </View>
            ) : showEmptyState || !displayTask ? (
              <View style={s.statusBody}>
                <View style={s.statusTopRow}>
                  <Text style={[s.statusEyebrow, {color: colors.textMuted}]}>VEHICLE STATUS</Text>
                  <Text style={[s.statusState, {color: colors.textMuted}]}>No active session</Text>
                </View>
                <Text style={[s.statusHeadline, {color: colors.textMuted}]}>No car parked</Text>
                <Text style={[s.statusSub, {color: colors.textMuted}]}>
                  Hand your keys to the valet at the entrance.
                </Text>
              </View>
            ) : carIsParked ? (
              <View style={s.statusBody}>
                <View style={s.statusTopRow}>
                  <Text style={[s.statusEyebrow, {color: colors.textMuted}]}>PARKED AT</Text>
                  <Text style={[s.statusState, {color: colors.success}]}>Safely parked</Text>
                </View>
                <Text style={[s.statusSlot, {color: colors.textPrimary}]}>{displayTask.slotId ?? '—'}</Text>
                <Text style={[s.statusSub, {color: colors.textSecondary}]}>
                  {displayTask.carNumber}
                  {displayTask.driverName ? `  ·  Parked by ${displayTask.driverName}` : ''}
                </Text>
              </View>
            ) : carJustRetrieved ? (
              <View style={s.statusBody}>
                <View style={s.statusTopRow}>
                  <Text style={[s.statusEyebrow, {color: colors.textMuted}]}>RETRIEVING</Text>
                  <Text style={[s.statusState, {color: colors.success}]}>Ready for pickup</Text>
                </View>
                <Text style={[s.statusHeadline, {color: colors.textPrimary}]}>Collect at the valet counter</Text>
                <Text style={[s.statusSub, {color: colors.textSecondary}]}>{displayTask.carNumber}</Text>
              </View>
            ) : (
              <View style={s.statusBody}>
                <View style={s.statusTopRow}>
                  <Text style={[s.statusEyebrow, {color: colors.textMuted}]}>
                    {displayTask.type === 'park' ? 'PARKING' : 'RETRIEVING'}
                  </Text>
                  {!!statusInfo && (
                    <Text style={[s.statusState, {color: statusInfo.color}]}>{statusInfo.label}</Text>
                  )}
                </View>
                <Text style={[s.statusHeadline, {color: colors.textPrimary}]}>
                  {displayTask.driverName
                    ? `${displayTask.driverName} has your car`
                    : 'Waiting for a driver'}
                </Text>
                <Text style={[s.statusSub, {color: colors.textSecondary}]}>
                  {displayTask.carNumber}
                  {displayTask.driverName ? `  ·  ${displayTask.driverName}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Past sessions */}
          <PressableScale
            style={[s.historyLink, {backgroundColor: colors.surface, borderColor: colors.border}]}
            onPress={() => navigation.navigate('History')}>
            <Icon name="history" size={18} color={colors.textPrimary} />
            <Text style={[s.historyLinkTxt, {color: colors.textPrimary}]}>View Parking History</Text>
            <Icon name="arrowRight" size={16} color={colors.textMuted} />
          </PressableScale>
        </View>
      </ScrollView>

      {/* Arrival popup — sits over Home; Home itself never unmounts. */}
      <BottomSheetModal visible={showArrivalModal} onClose={() => setShowArrivalModal(false)}>
          <View style={[s.departureCard, s.modalCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.departureHeader} start={{x:0,y:0}} end={{x:1,y:0}}>
              <PressableScale style={s.modalCloseBtn} onPress={() => setShowArrivalModal(false)}>
                <Icon name="close" size={16} color="#fff" />
              </PressableScale>
              <Text style={s.departureHeaderTxt}>{arrivalSent ? 'Valet Notified' : 'On Your Way?'}</Text>
              <Text style={s.departureHeaderSub}>
                {arrivalSent
                  ? `We told the valet you'll arrive in ~${arrivalSent} min`
                  : 'Let the valet know before you get here so a driver is ready'}
              </Text>
            </LinearGradient>
            {!arrivalSent && (
              <View style={s.etaBody}>
                <Text style={[s.etaQuestion, {color: colors.textMuted}]}>WHEN WILL YOU ARRIVE?</Text>
                <View style={s.etaGrid}>
                  {ETA_OPTIONS_ARRIVAL.map(opt => {
                    const on = arrivalEta === opt;
                    return (
                      <PressableScale
                        key={opt}
                        onPress={() => setArrivalEta(opt)}
                        disabled={sendingArrival}
                        style={[
                          s.etaBtn,
                          {
                            backgroundColor: on ? colors.textPrimary : colors.cardAlt,
                            borderColor: on ? colors.textPrimary : colors.border,
                          },
                        ]}>
                        <Text style={[s.etaBtnNum, {color: on ? colors.background : colors.textPrimary}]}>{opt}</Text>
                        <Text style={[s.etaBtnSub, {color: on ? colors.background + 'AA' : colors.textMuted}]}>min</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <PressableScale
                  onPress={handleArrival}
                  disabled={!arrivalEta || sendingArrival}
                  style={[
                    s.etaConfirmBtn,
                    {backgroundColor: arrivalEta ? colors.primary : colors.border, opacity: sendingArrival ? 0.6 : 1},
                  ]}>
                  <Text style={[s.etaConfirmTxt, {color: arrivalEta ? colors.textOnPrimary : colors.textMuted}]}>
                    {sendingArrival ? 'Notifying…' : arrivalEta ? 'Notify the valet' : 'Select a time above'}
                  </Text>
                  {arrivalEta && !sendingArrival && <Icon name="arrowRight" size={15} color={colors.textOnPrimary} />}
                </PressableScale>
              </View>
            )}
          </View>
      </BottomSheetModal>

      {/* Departure popup — same pattern, over the same Home screen. */}
      <BottomSheetModal visible={showDepartureModal} onClose={() => setShowDepartureModal(false)}>
          <View style={[s.departureCard, s.modalCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.departureHeader} start={{x:0,y:0}} end={{x:1,y:0}}>
              <PressableScale style={s.modalCloseBtn} onPress={() => setShowDepartureModal(false)}>
                <Icon name="close" size={16} color="#fff" />
              </PressableScale>
              <Text style={s.departureHeaderTxt}>Ready to Leave?</Text>
              <Text style={s.departureHeaderSub}>We'll notify the valet team so they can plan your retrieval</Text>
            </LinearGradient>
            <View style={s.etaBody}>
              <Text style={[s.etaQuestion, {color: colors.textMuted}]}>WHEN ARE YOU LEAVING?</Text>
              <View style={s.etaGrid}>
                {DEPARTURE_OPTIONS.map(opt => {
                  const on = selectedEta === opt;
                  return (
                    <PressableScale
                      key={opt}
                      onPress={() => setSelectedEta(opt)}
                      disabled={requesting}
                      style={[
                        s.etaBtn,
                        {
                          backgroundColor: on ? colors.textPrimary : colors.cardAlt,
                          borderColor: on ? colors.textPrimary : colors.border,
                        },
                      ]}>
                      <Text style={[s.etaBtnNum, {color: on ? colors.background : colors.textPrimary}]}>
                        {opt === 0 ? 'Now' : opt}
                      </Text>
                      {opt !== 0 && (
                        <Text style={[s.etaBtnSub, {color: on ? colors.background + 'AA' : colors.textMuted}]}>min</Text>
                      )}
                    </PressableScale>
                  );
                })}
              </View>
              {/* No "car ready by <time>" preview — that was an arrival
                  promise dressed up as a confirmation. */}

              <PressableScale
                onPress={handleDeparture}
                disabled={selectedEta == null || requesting}
                style={[
                  s.etaConfirmBtn,
                  {backgroundColor: selectedEta != null ? colors.primary : colors.border, opacity: requesting ? 0.6 : 1},
                ]}>
                <Text style={[s.etaConfirmTxt, {color: selectedEta != null ? colors.textOnPrimary : colors.textMuted}]}>
                  {requesting ? 'Sending…' : selectedEta != null ? 'Send departure request' : 'Select a time above'}
                </Text>
                {selectedEta != null && !requesting && <Icon name="arrowRight" size={15} color={colors.textOnPrimary} />}
              </PressableScale>
            </View>
          </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1}, scroll:{paddingBottom:40},
  header:{paddingTop:20,paddingHorizontal:20,paddingBottom:32},
  headerContent:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  headerGreet:{color:'rgba(255,255,255,0.75)',fontSize:13,fontWeight:'500'},
  headerName:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:2},
  headerDept:{color:'rgba(255,255,255,0.65)',fontSize:12,marginTop:2},
  cardCodeBox:{backgroundColor:'rgba(255,255,255,0.2)',borderRadius:16,paddingHorizontal:16,paddingVertical:10,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.25)'},
  cardCodeNum:{color:'#fff',fontSize:28,fontWeight:'900',letterSpacing:6},
  cardCodeLblRow:{flexDirection:'row',alignItems:'center',gap:2,marginTop:2},
  cardCodeLbl:{color:'rgba(255,255,255,0.7)',fontSize:8,fontWeight:'700',letterSpacing:1.5},

  body:{padding:16,paddingTop:20,gap:12},
  statusCard:{borderRadius:20,borderWidth:1,overflow:'hidden'},
  statusBody:{padding:20},
  statusTopRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  statusEyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.4},
  // Status as plain weighted text — no dot. The words already carry the
  // state; a coloured dot beside them repeats it as decoration.
  statusState:{fontSize:12,fontWeight:'800'},
  // The slot number is the whole answer when a car is parked — sized like it.
  statusSlot:{fontSize:40,fontWeight:'900',letterSpacing:-0.5,marginTop:6,fontVariant:['tabular-nums']},
  statusHeadline:{fontSize:18,fontWeight:'800',marginTop:6},
  statusSub:{fontSize:13,fontWeight:'600',marginTop:8},
  historyLink:{flexDirection:'row',alignItems:'center',gap:10,borderRadius:16,borderWidth:1,padding:14},
  historyLinkTxt:{flex:1,fontSize:13,fontWeight:'700'},

  primaryRow:{flexDirection:'row',gap:12},
  primaryBtn:{flex:1,borderRadius:18,padding:20,alignItems:'center'},
  primaryIconWrap:{width:52,height:52,borderRadius:16,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',marginBottom:8},
  primaryBtnTxt:{color:'#fff',fontSize:15,fontWeight:'800'},
  primaryBtnSub:{color:'rgba(255,255,255,0.7)',fontSize:11,lineHeight:14,marginTop:4,height:28,textAlign:'center'},

  noticeBanner:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:14,borderWidth:1,padding:12},
  noticeBannerTxt:{flex:1,fontSize:12,fontWeight:'700'},

  modalBackdrop:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)'},
  modalWrap:{flex:1,justifyContent:'flex-end'},
  modalCard:{width:'100%',borderBottomLeftRadius:0,borderBottomRightRadius:0,paddingBottom:8},
  modalCloseBtn:{position:'absolute',top:14,right:14,width:30,height:30,borderRadius:15,backgroundColor:'rgba(255,255,255,0.2)',alignItems:'center',justifyContent:'center',zIndex:1},

  departureCard:{borderRadius:20,borderWidth:1,overflow:'hidden'},
  departureHeader:{padding:18},
  departureHeaderTxt:{color:'#fff',fontSize:17,fontWeight:'900'},
  departureHeaderSub:{color:'rgba(255,255,255,0.75)',fontSize:12,marginTop:3},
  etaBody:{padding:16},
  etaQuestion:{fontSize:10,fontWeight:'700',letterSpacing:1,marginBottom:12},
  etaGrid:{flexDirection:'row',gap:10},
  etaBtn:{flex:1,borderRadius:14,paddingVertical:16,alignItems:'center',borderWidth:1.5},
  etaBtnNum:{fontSize:22,fontWeight:'900',lineHeight:26},
  etaBtnSub:{fontSize:9,fontWeight:'800',letterSpacing:1,textTransform:'uppercase',marginTop:3},


  etaConfirmBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:14,paddingVertical:15,marginTop:14},
  etaConfirmTxt:{fontSize:14,fontWeight:'900'},

  trackCard:{borderRadius:20,padding:18,gap:14},
  trackCardTop:{flexDirection:'row',alignItems:'center',gap:8},
  trackCardTitle:{flex:1,color:'#fff',fontSize:14,fontWeight:'800'},
  countdownCard:{borderRadius:20,padding:28,alignItems:'center'},
  countdownLabelRow:{flexDirection:'row',alignItems:'center',gap:6},
  countdownLabel:{color:'rgba(255,255,255,0.8)',fontSize:12,fontWeight:'700'},
  countdownTimer:{color:'#fff',fontSize:56,fontWeight:'900',fontVariant:['tabular-nums'],marginVertical:6},
  countdownSub:{color:'rgba(255,255,255,0.7)',fontSize:12,textAlign:'center'},
  sentIconWrap:{width:52,height:52,borderRadius:26,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',marginBottom:14},
  sentTitle:{color:'#fff',fontSize:18,fontWeight:'900',marginBottom:8,textAlign:'center'},
  sentBody:{color:'rgba(255,255,255,0.75)',fontSize:13,textAlign:'center',lineHeight:19},
  countdownTrackBtn:{flexDirection:'row',alignItems:'center',gap:8,marginTop:16,backgroundColor:'rgba(255,255,255,0.2)',borderRadius:12,paddingVertical:12,paddingHorizontal:20,borderWidth:1,borderColor:'rgba(255,255,255,0.3)'},
  countdownTrackBtnTxt:{color:'#fff',fontSize:13,fontWeight:'800'},

});
