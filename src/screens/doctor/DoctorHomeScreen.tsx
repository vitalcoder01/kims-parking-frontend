import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Animated} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {LiveTrackingScreen} from '../shared/LiveTrackingScreen';
import {scheduleNotification} from '../../services/notifications';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon} from '../../components/Icon';

const ETA_OPTIONS = [
  {label: '10', sub: 'min', value: 10, grad: ['#4338CA','#4F46E5'] as [string,string]},
  {label: '20', sub: 'min', value: 20, grad: ['#4F46E5','#6366F1'] as [string,string]},
  {label: '30', sub: 'min', value: 30, grad: ['#4F46E5','#22D3EE'] as [string,string]},
  {label: '40', sub: 'min', value: 40, grad: ['#06B6D4','#22D3EE'] as [string,string]},
];

export function DoctorHomeScreen() {
  const {user, logout} = useAuth();
  const {tasks, pushNotification} = useAppState();
  const {colors, isDark} = useTheme();
  const [departureSet, setDepartureSet]   = useState(false);
  const [countdown, setCountdown]         = useState<number | null>(null);
  const [showTracking, setShowTracking]   = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  const myTasks   = tasks.filter(t => t.doctorId === user?.id);
  const activeTask = myTasks.find(t => t.status !== 'completed');
  const latestTask = myTasks[myTasks.length - 1];

  useEffect(() => {
    if (departureSet && countdown !== null && countdown > 0) {
      const t = setInterval(() => setCountdown(c => (c ?? 1) - 1), 1000);
      return () => clearInterval(t);
    }
  }, [departureSet, countdown]);

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, {toValue: 1.04, duration: 1000, useNativeDriver: true}),
      Animated.timing(pulse, {toValue: 1, duration: 1000, useNativeDriver: true}),
    ])).start();
  }, []);

  const handleDeparture = (eta: number) => {
    setDepartureSet(true);
    setCountdown(eta * 60);
    const slot = latestTask?.slotId ?? 'parking slot';
    // Immediate in-app + tray confirmation for the doctor.
    pushNotification({
      targetRole: 'valet',
      title: `🚗 Departure Scheduled — ${user?.name}`,
      body: `Leaving in ${eta} min. Valet will be alerted to retrieve your car from ${slot}.`,
      type: 'info',
    }).catch(() => {});
    // Schedule the real retrieval alarm to fire when the timer elapses —
    // this fires in the phone's notification tray even if the app is fully closed.
    scheduleNotification(
      `🚨 Retrieve Car Now — ${user?.name}`,
      `${user?.name} is leaving. Please retrieve car ${user?.carNumber ?? ''} from ${slot} and bring it to the entrance.`,
      Date.now() + eta * 60 * 1000,
      'alarm',
    );
  };

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const statusMap: Record<string,{label:string;color:string}> = {
    assigned:      {label: 'Driver Assigned',      color: colors.warning},
    key_collected: {label: 'Key Collected',         color: colors.info},
    in_transit:    {label: 'En Route to Parking',   color: colors.primary},
    completed:     {label: 'Safely Parked',         color: colors.success},
  };
  const statusInfo = activeTask ? statusMap[activeTask.status] : null;

  if (showTracking && (activeTask || latestTask)) {
    return <LiveTrackingScreen task={activeTask ?? latestTask} onBack={() => setShowTracking(false)} />;
  }

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
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
              <TouchableOpacity style={s.logoutBtn} onPress={logout} activeOpacity={0.8}>
                <Icon name="logout" size={18} color="#fff" />
              </TouchableOpacity>
              <View style={s.cardCodeBox}>
                <Text style={s.cardCodeNum}>{user?.cardCode ?? '---'}</Text>
                <Text style={s.cardCodeLbl}>VALET CODE</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={s.body}>
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

            {activeTask || latestTask ? (
              <>
                {(activeTask?.slotId ?? latestTask?.slotId) && (
                  <LinearGradient colors={isDark ? ['#162040','#1C2A50'] : ['#EEF2FF','#DBEAFE']} style={s.slotBanner} start={{x:0,y:0}} end={{x:1,y:0}}>
                    <Text style={[s.slotLabel, {color: colors.textMuted}]}>PARKED AT SLOT</Text>
                    <Text style={[s.slotValue, {color: colors.primary}]}>{activeTask?.slotId ?? latestTask?.slotId}</Text>
                  </LinearGradient>
                )}
                <View style={s.metaRow}>
                  {[
                    {label: 'Vehicle', value: activeTask?.carNumber ?? latestTask?.carNumber ?? '—'},
                    {label: 'Driver', value: activeTask?.driverName ?? latestTask?.driverName ?? 'Unassigned'},
                  ].map(m => (
                    <View key={m.label} style={[s.metaCell, {borderColor: colors.border}]}>
                      <Text style={[s.metaCellLabel, {color: colors.textMuted}]}>{m.label.toUpperCase()}</Text>
                      <Text style={[s.metaCellValue, {color: colors.textPrimary}]}>{m.value}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={[s.trackBtn, {backgroundColor: colors.primary + '10', borderColor: colors.primary + '30'}]}
                  onPress={() => setShowTracking(true)} activeOpacity={0.8}>
                  <Icon name="map" size={18} color={colors.primary} />
                  <Text style={[s.trackBtnTxt, {color: colors.primary}]}>View Live Tracking Map</Text>
                  <Icon name="arrowRight" size={18} color={colors.primary} />
                </TouchableOpacity>
              </>
            ) : (
              <View style={[s.emptySlot, {borderColor: colors.border}]}>
                <Icon name="carSide" size={40} color={colors.textMuted} />
                <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No active parking session.{'\n'}Hand your keys to the valet at the entrance.</Text>
              </View>
            )}
          </View>

          {/* Departure */}
          {(latestTask?.status === 'completed') && !departureSet && (
            <View style={[s.departureCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <LinearGradient colors={BRAND_GRADIENT} style={s.departureHeader} start={{x:0,y:0}} end={{x:1,y:0}}>
                <Text style={s.departureHeaderTxt}>Ready to Leave?</Text>
                <Text style={s.departureHeaderSub}>Notify valet to retrieve your car</Text>
              </LinearGradient>
              <View style={s.etaGrid}>
                {ETA_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.value} onPress={() => handleDeparture(opt.value)} activeOpacity={0.8}>
                    <LinearGradient colors={opt.grad} style={s.etaBtn} start={{x:0,y:0}} end={{x:0,y:1}}>
                      <Text style={s.etaBtnNum}>{opt.label}</Text>
                      <Text style={s.etaBtnSub}>{opt.sub}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Countdown */}
          {departureSet && countdown !== null && (
            <Animated.View style={{transform: [{scale: pulse}]}}>
              <LinearGradient colors={BRAND_GRADIENT} style={s.countdownCard} start={{x:0,y:0}} end={{x:1,y:1}}>
                <Text style={s.countdownLabel}>Valet Notified ✓</Text>
                <Text style={s.countdownTimer}>{fmt(countdown)}</Text>
                <Text style={s.countdownSub}>Your car is being retrieved</Text>
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
  logoutBtn:{width:38,height:38,borderRadius:12,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.25)'},
  cardCodeBox:{backgroundColor:'rgba(255,255,255,0.2)',borderRadius:16,paddingHorizontal:16,paddingVertical:10,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.25)'},
  cardCodeNum:{color:'#fff',fontSize:28,fontWeight:'900',letterSpacing:6},
  cardCodeLbl:{color:'rgba(255,255,255,0.7)',fontSize:8,fontWeight:'700',letterSpacing:1.5,marginTop:2},

  body:{padding:16,marginTop:-16,gap:12},
  statusCard:{borderRadius:20,borderWidth:1,overflow:'hidden'},
  statusTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,paddingBottom:12},
  statusCardTitle:{fontSize:15,fontWeight:'800'},
  statusPill:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:20,borderWidth:1,paddingHorizontal:10,paddingVertical:4},
  statusDot:{width:7,height:7,borderRadius:4},
  statusPillTxt:{fontSize:11,fontWeight:'700'},
  slotBanner:{padding:16,alignItems:'center',marginHorizontal:16,marginBottom:12,borderRadius:14},
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

  departureCard:{borderRadius:20,borderWidth:1,overflow:'hidden'},
  departureHeader:{padding:18},
  departureHeaderTxt:{color:'#fff',fontSize:17,fontWeight:'900'},
  departureHeaderSub:{color:'rgba(255,255,255,0.75)',fontSize:12,marginTop:3},
  etaGrid:{flexDirection:'row',gap:10,padding:16},
  etaBtn:{flex:1,borderRadius:14,paddingVertical:16,alignItems:'center'},
  etaBtnNum:{color:'#fff',fontSize:22,fontWeight:'900'},
  etaBtnSub:{color:'rgba(255,255,255,0.75)',fontSize:10,fontWeight:'600',marginTop:2},

  countdownCard:{borderRadius:20,padding:28,alignItems:'center'},
  countdownLabel:{color:'rgba(255,255,255,0.8)',fontSize:12,fontWeight:'700'},
  countdownTimer:{color:'#fff',fontSize:56,fontWeight:'900',fontVariant:['tabular-nums'],marginVertical:6},
  countdownSub:{color:'rgba(255,255,255,0.7)',fontSize:12},

});
