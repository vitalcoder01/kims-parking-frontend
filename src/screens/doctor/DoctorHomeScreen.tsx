import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, Animated, Alert} from 'react-native';
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

const ETA_OPTIONS = [10, 20, 30, 40];

// Same launcher-card pattern as the valet's Staff/Visitor buttons — two
// square cards, always both visible, one per intent — rather than an
// inline form that appears/disappears depending on state.
type Screen = 'home' | 'arrival' | 'departure';

export function DoctorHomeScreen() {
  const {user} = useAuth();
  const {tasks, sendArrivalNotice} = useAppState();
  const {colors, isDark} = useTheme();
  const navigation = useNavigation<any>();
  const {activeRetrieve, remainingSeconds, requestRetrieval} = useRetrievalRequest();
  const [screen, setScreen]               = useState<Screen>('home');
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
  // Nothing to actually track without a driver on the move yet — showing
  // this button for e.g. "Awaiting Driver" just opens a map with nothing on it.
  const canTrack = !!displayTask?.driverId && !carJustRetrieved
    && displayTask.status !== 'completed' && displayTask.status !== 'cancelled';

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
      setScreen('home');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not notify the valet');
    } finally {
      setSendingArrival(false);
    }
  };

  const handleDeparture = async () => {
    if (!selectedEta) return;
    setRequesting(true);
    try {
      await requestRetrieval(selectedEta);
      setScreen('home');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not request retrieval');
    } finally {
      setRequesting(false);
    }
  };

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});

  // 'assigned' is the task's status from the moment it's *created* — it does
  // NOT mean a driver has been picked yet. Whether one has is driverId
  // being set, not the status string, so that has to gate the label
  // separately instead of folding it into the status map below.
  const statusMap: Record<string,{label:string;color:string}> = {
    assigned:      {label: 'Driver Assigned',      color: colors.warning},
    key_collected: {label: 'Key Collected',         color: colors.info},
    in_transit:    {label: activeTask?.type === 'retrieve' ? 'En Route to You' : 'En Route to Parking', color: colors.primary},
    delivered:     {label: 'Car Arrived — Confirm at Counter', color: colors.success},
    completed:     {label: 'Safely Parked',         color: colors.success},
  };
  const statusInfo = activeTask
    ? (activeTask.status === 'assigned' && !activeTask.driverId
        ? {label: 'Awaiting Driver', color: colors.textMuted}
        : statusMap[activeTask.status])
    : null;

  // Arrival only makes sense with no session already running; departure
  // only once the car is actually parked and waiting. Both cards always
  // show — whichever doesn't apply right now is just blocked, not hidden.
  const arrivalBlocked = !showEmptyState;
  const departureBlocked = !(carIsParked && !activeRetrieve);

  if (showTracking && displayTask) {
    return <LiveTrackingScreen task={displayTask} onBack={() => setShowTracking(false)} />;
  }

  if (screen === 'arrival') {
    return (
      <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.headerCompact}>
          <PressableScale onPress={() => setScreen('home')} style={[s.circleBack, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="back" size={18} color={colors.textPrimary} />
          </PressableScale>
          <Text style={[s.headerCompactTitle, {color: colors.textPrimary}]}>On Your Way?</Text>
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <View style={[s.departureCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.departureHeader} start={{x:0,y:0}} end={{x:1,y:0}}>
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
                  {ETA_OPTIONS.map(opt => {
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
                    {sendingArrival ? 'Notifying…' : arrivalEta ? `Notify Valet — Arriving in ${arrivalEta} min` : 'Select a time above'}
                  </Text>
                  {arrivalEta && !sendingArrival && <Icon name="arrowRight" size={15} color={colors.textOnPrimary} />}
                </PressableScale>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'departure') {
    return (
      <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.headerCompact}>
          <PressableScale onPress={() => setScreen('home')} style={[s.circleBack, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="back" size={18} color={colors.textPrimary} />
          </PressableScale>
          <Text style={[s.headerCompactTitle, {color: colors.textPrimary}]}>Ready to Leave?</Text>
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <View style={[s.departureCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.departureHeader} start={{x:0,y:0}} end={{x:1,y:0}}>
              <Text style={s.departureHeaderTxt}>Ready to Leave?</Text>
              <Text style={s.departureHeaderSub}>Valet will assign a driver to bring your car to you</Text>
            </LinearGradient>
            <View style={s.etaBody}>
              <Text style={[s.etaQuestion, {color: colors.textMuted}]}>WHEN DO YOU NEED YOUR CAR?</Text>
              <View style={s.etaGrid}>
                {ETA_OPTIONS.map(opt => {
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
                      <Text style={[s.etaBtnNum, {color: on ? colors.background : colors.textPrimary}]}>{opt}</Text>
                      <Text style={[s.etaBtnSub, {color: on ? colors.background + 'AA' : colors.textMuted}]}>min</Text>
                    </PressableScale>
                  );
                })}
              </View>

              {selectedEta != null && (
                <View style={[s.etaReadyRow, {backgroundColor: colors.success + '10', borderColor: colors.success + '30'}]}>
                  <View>
                    <Text style={[s.etaReadyLbl, {color: colors.textMuted}]}>Car ready by</Text>
                    <Text style={[s.etaReadyVal, {color: colors.success}]}>{fmtClock(Date.now() + selectedEta * 60000)}</Text>
                  </View>
                  <Icon name="car" size={24} color={colors.success} />
                </View>
              )}

              <PressableScale
                onPress={handleDeparture}
                disabled={!selectedEta || requesting}
                style={[
                  s.etaConfirmBtn,
                  {backgroundColor: selectedEta ? colors.primary : colors.border, opacity: requesting ? 0.6 : 1},
                ]}>
                <Text style={[s.etaConfirmTxt, {color: selectedEta ? colors.textOnPrimary : colors.textMuted}]}>
                  {requesting ? 'Requesting…' : selectedEta ? `Confirm — Leaving in ${selectedEta} min` : 'Select a time above'}
                </Text>
                {selectedEta && !requesting && <Icon name="arrowRight" size={15} color={colors.textOnPrimary} />}
              </PressableScale>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
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
          {/* Arrival / Departure — same launcher-card pair as the valet's
              Staff/Visitor buttons: both always visible, side by side.
              Whichever doesn't apply to the current state is blocked
              (dimmed, untappable) rather than disappearing — the doctor
              always sees both options exist, just not always usable. */}
          <View style={s.primaryRow}>
            <PressableScale
              disabled={arrivalBlocked}
              onPress={() => setScreen('arrival')}
              style={[s.primaryBtn, {backgroundColor: colors.primary, opacity: arrivalBlocked ? 0.4 : 1}]}>
              <View style={s.primaryIconWrap}><Icon name="bellAlert" size={26} color="#fff" /></View>
              <Text style={s.primaryBtnTxt}>Arrival</Text>
              <Text style={s.primaryBtnSub} numberOfLines={2}>
                {arrivalBlocked ? 'Session already active' : "Let valet know you're coming"}
              </Text>
            </PressableScale>
            <PressableScale
              disabled={departureBlocked}
              onPress={() => setScreen('departure')}
              style={[s.primaryBtn, {backgroundColor: colors.accent, opacity: departureBlocked ? 0.4 : 1}]}>
              <View style={s.primaryIconWrap}><Icon name="car" size={26} color="#fff" /></View>
              <Text style={s.primaryBtnTxt}>Departure</Text>
              <Text style={s.primaryBtnSub} numberOfLines={2}>
                {departureBlocked ? 'No parked car yet' : 'Request your car back'}
              </Text>
            </PressableScale>
          </View>

          {arrivalSent && showEmptyState && (
            <View style={[s.noticeBanner, {backgroundColor: colors.success + '10', borderColor: colors.success + '30'}]}>
              <Icon name="bellAlert" size={16} color={colors.success} />
              <Text style={[s.noticeBannerTxt, {color: colors.success}]}>
                Valet notified — arriving in ~{arrivalSent} min
              </Text>
            </View>
          )}

          {/* Car Status Card */}
          <View style={[s.statusCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={s.statusTop}>
              <Text style={[s.statusCardTitle, {color: colors.textPrimary}]}>Vehicle Status</Text>
              {statusInfo && (
                <View style={[s.statusPill, {backgroundColor: statusInfo.color + '18', borderColor: statusInfo.color + '40'}]}>
                  <View style={[s.statusDot, {backgroundColor: statusInfo.color}]} />
                  <Text style={[s.statusPillTxt, {color: statusInfo.color}]}>{statusInfo.label}</Text>
                </View>
              )}
            </View>

            {!showEmptyState && displayTask ? (
              <>
                {carIsParked && displayTask.slotId && (
                  <LinearGradient colors={isDark ? ['#162040','#1C2A50'] : ['#EEF2FF','#DBEAFE']} style={s.slotBanner} start={{x:0,y:0}} end={{x:1,y:0}}>
                    <Text style={[s.slotLabel, {color: colors.textMuted}]}>PARKED AT SLOT</Text>
                    <Text style={[s.slotValue, {color: colors.primary}]}>{displayTask.slotId}</Text>
                  </LinearGradient>
                )}
                {carJustRetrieved && (
                  <LinearGradient colors={isDark ? ['#0D2A1C', '#0F3323'] : ['#ECFDF5', '#D1FAE5']} style={s.slotBanner} start={{x:0,y:0}} end={{x:1,y:0}}>
                    <View style={s.slotLabelRow}>
                      <Icon name="car" size={13} color={colors.success} />
                      <Text style={[s.slotLabel, {color: colors.success}]}>CAR READY AT ENTRANCE</Text>
                    </View>
                    <Text style={[s.slotValue, {color: colors.success, fontSize: 22}]}>Please collect at the gate</Text>
                  </LinearGradient>
                )}
                <View style={s.metaRow}>
                  {[
                    {label: 'Vehicle', value: displayTask.carNumber ?? '—'},
                    {label: 'Driver', value: displayTask.driverName ?? 'Unassigned'},
                  ].map(m => (
                    <View key={m.label} style={[s.metaCell, {borderColor: colors.border}]}>
                      <Text style={[s.metaCellLabel, {color: colors.textMuted}]}>{m.label.toUpperCase()}</Text>
                      <Text style={[s.metaCellValue, {color: colors.textPrimary}]}>{m.value}</Text>
                    </View>
                  ))}
                </View>
                {canTrack && (
                  <PressableScale style={[s.trackBtn, {backgroundColor: colors.primary + '10', borderColor: colors.primary + '30'}]}
                    onPress={() => setShowTracking(true)}>
                    <Icon name="map" size={18} color={colors.primary} />
                    <Text style={[s.trackBtnTxt, {color: colors.primary}]}>View Live Tracking Map</Text>
                    <Icon name="arrowRight" size={18} color={colors.primary} />
                  </PressableScale>
                )}
              </>
            ) : (
              <View style={[s.emptySlot, {borderColor: colors.border}]}>
                <Icon name="carSide" size={40} color={colors.textMuted} />
                <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No active parking session.{'\n'}Hand your keys to the valet at the entrance.</Text>
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

          {/* Countdown — real backend-tracked retrieval state, shared with
              the "My Parking" tab via useRetrievalRequest so it's identical
              no matter which screen the doctor is looking at. Hidden once
              'delivered' — the CAR READY AT ENTRANCE banner above already
              covers that, so both wouldn't need to say it at once. */}
          {activeRetrieve && activeRetrieve.status !== 'delivered' && (
            <Animated.View style={{transform: [{scale: pulse}]}}>
              <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.countdownCard} start={{x:0,y:0}} end={{x:1,y:1}}>
                <View style={s.countdownLabelRow}>
                  <Icon
                    name={activeRetrieve.status === 'requested' ? 'timer' : activeRetrieve.status === 'assigned' ? 'bell' : 'car'}
                    size={13} color="rgba(255,255,255,0.8)"
                  />
                  <Text style={s.countdownLabel}>
                    {activeRetrieve.status === 'requested' && 'Waiting for Valet'}
                    {activeRetrieve.status === 'assigned' && `${activeRetrieve.driverName ?? 'Driver'} Assigned`}
                    {activeRetrieve.status === 'in_transit' && `${activeRetrieve.driverName ?? 'Driver'} On The Way`}
                  </Text>
                </View>
                {remainingSeconds != null && <Text style={s.countdownTimer}>{fmt(remainingSeconds)}</Text>}
                <Text style={s.countdownSub}>Your car is being retrieved</Text>
                {activeRetrieve.status === 'in_transit' && (
                  <PressableScale style={s.countdownTrackBtn} onPress={() => setShowTracking(true)}>
                    <Icon name="map" size={15} color="#fff" />
                    <Text style={s.countdownTrackBtnTxt}>View Live Tracking Map</Text>
                  </PressableScale>
                )}
              </LinearGradient>
            </Animated.View>
          )}
        </View>
      </ScrollView>
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
  statusTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,paddingBottom:12},
  statusCardTitle:{fontSize:15,fontWeight:'800'},
  statusPill:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:20,borderWidth:1,paddingHorizontal:10,paddingVertical:4},
  statusDot:{width:7,height:7,borderRadius:4},
  statusPillTxt:{fontSize:11,fontWeight:'700'},
  slotBanner:{padding:16,alignItems:'center',marginHorizontal:16,marginBottom:12,borderRadius:14},
  slotLabelRow:{flexDirection:'row',alignItems:'center',gap:6},
  slotLabel:{fontSize:9,fontWeight:'700',letterSpacing:1.5},
  slotValue:{fontSize:36,fontWeight:'900',marginTop:2},
  metaRow:{flexDirection:'row',borderTopWidth:1,borderTopColor:'rgba(0,0,0,0.05)'},
  metaCell:{flex:1,padding:14},
  metaCellLabel:{fontSize:9,fontWeight:'700',letterSpacing:1,marginBottom:4},
  metaCellValue:{fontSize:14,fontWeight:'800'},
  trackBtn:{flexDirection:'row',alignItems:'center',margin:12,marginTop:4,borderRadius:12,borderWidth:1,padding:12,gap:8},
  trackBtnIcon:{fontSize:16},
  trackBtnTxt:{flex:1,fontSize:13,fontWeight:'700'},
  trackBtnArrow:{fontSize:16,fontWeight:'700'},
  emptySlot:{margin:16,borderRadius:14,borderWidth:1,borderStyle:'dashed',padding:28,alignItems:'center',gap:8},
  emptyIcon:{fontSize:36},
  emptyTxt:{fontSize:13,textAlign:'center',lineHeight:19},
  historyLink:{flexDirection:'row',alignItems:'center',gap:10,borderRadius:16,borderWidth:1,padding:14},
  historyLinkTxt:{flex:1,fontSize:13,fontWeight:'700'},

  primaryRow:{flexDirection:'row',gap:12},
  primaryBtn:{flex:1,borderRadius:18,padding:20,alignItems:'center'},
  primaryIconWrap:{width:52,height:52,borderRadius:16,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',marginBottom:8},
  primaryBtnTxt:{color:'#fff',fontSize:15,fontWeight:'800'},
  primaryBtnSub:{color:'rgba(255,255,255,0.7)',fontSize:11,lineHeight:14,marginTop:4,height:28,textAlign:'center'},

  noticeBanner:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:14,borderWidth:1,padding:12},
  noticeBannerTxt:{flex:1,fontSize:12,fontWeight:'700'},

  headerCompact:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,paddingTop:12,paddingBottom:16},
  circleBack:{width:38,height:38,borderRadius:19,borderWidth:1,alignItems:'center',justifyContent:'center'},
  headerCompactTitle:{fontSize:18,fontWeight:'900'},
  subContent:{padding:16,paddingTop:4,gap:12},

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

  etaReadyRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:14,borderWidth:1,padding:14,marginTop:14},
  etaReadyLbl:{fontSize:10,fontWeight:'600'},
  etaReadyVal:{fontSize:22,fontWeight:'900',marginTop:2},

  etaConfirmBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:14,paddingVertical:15,marginTop:14},
  etaConfirmTxt:{fontSize:14,fontWeight:'900'},

  countdownCard:{borderRadius:20,padding:28,alignItems:'center'},
  countdownLabelRow:{flexDirection:'row',alignItems:'center',gap:6},
  countdownLabel:{color:'rgba(255,255,255,0.8)',fontSize:12,fontWeight:'700'},
  countdownTimer:{color:'#fff',fontSize:56,fontWeight:'900',fontVariant:['tabular-nums'],marginVertical:6},
  countdownSub:{color:'rgba(255,255,255,0.7)',fontSize:12},
  countdownTrackBtn:{flexDirection:'row',alignItems:'center',gap:8,marginTop:16,backgroundColor:'rgba(255,255,255,0.2)',borderRadius:12,paddingVertical:12,paddingHorizontal:20,borderWidth:1,borderColor:'rgba(255,255,255,0.3)'},
  countdownTrackBtnTxt:{color:'#fff',fontSize:13,fontWeight:'800'},

});
