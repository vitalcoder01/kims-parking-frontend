import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, Animated, Alert, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {computeTrip} from '../../utils/geo';
import {Icon, IconName} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';

export function DriverJobsScreen() {
  const {user} = useAuth();
  const {tasks, slots, visitors, markParked, markRetrieved, updateTask, pushNotification,
    acceptTask, rejectTask,
    acceptVisitorTask, rejectVisitorTask, markVisitorPickedUp, markVisitorParked, markVisitorRetrieved} = useAppState();
  const {colors: c, isDark} = useTheme();

  const [slotInput, setSlotInput] = useState('');
  const carAnim = useRef(new Animated.Value(0)).current;

  const myDriverId = user?.linkedDriverId ?? user?.id;
  // 'delivered' means the driver's own part is already done (car dropped at
  // the valet counter) — it's just awaiting the valet's confirmation now,
  // so it shouldn't keep sitting here as this driver's "current job".
  const myTasks = tasks.filter(t => t.driverId === myDriverId && t.status !== 'completed' && t.status !== 'delivered' && t.status !== 'cancelled');
  const activeTask = myTasks[0] ?? null;
  const completedToday = tasks.filter(t => t.driverId === myDriverId && t.status === 'completed');
  const myVisitors = visitors.filter(v => v.driverId === myDriverId
    && (v.status === 'pending' || (v.status === 'parked' && v.retrievalRequested)));

  const trip = computeTrip({
    startLat: activeTask?.driverStartLat, startLng: activeTask?.driverStartLng,
    lat: activeTask?.driverLat, lng: activeTask?.driverLng,
    destinationLat: activeTask?.destinationLat, destinationLng: activeTask?.destinationLng,
    mode: 'drive',
  });
  const liveProgress = trip?.progress ?? 0;

  useEffect(() => {
    Animated.timing(carAnim, {toValue: liveProgress, duration: 400, useNativeDriver: false}).start();
  }, [liveProgress]);

  const handleAcceptTask = async () => {
    if (!activeTask) return;
    try {
      await acceptTask(activeTask.id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not accept task');
    }
  };

  const handleRejectTask = async () => {
    if (!activeTask) return;
    try {
      await rejectTask(activeTask.id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not reject task');
    }
  };

  const handleStartRetrieval = async () => {
    if (!activeTask) return;
    try {
      await updateTask(activeTask.id, {status: 'in_transit'});
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start retrieval');
    }
  };

  const handleMarkParked = async () => {
    if (!activeTask || !slotInput.trim()) return;
    try {
      await markParked(activeTask.id, slotInput.trim().toUpperCase());
      pushNotification({
        targetRole: `doctor:${activeTask.doctorId}`,
        targetId: activeTask.doctorId,
        title: 'Car Parked',
        body: `Your car has been parked at slot ${slotInput.toUpperCase()} by ${user?.name}.`,
        type: 'info',
      });
      pushNotification({
        targetRole: 'valet',
        title: 'Car Parked',
        body: `${activeTask.carNumber} parked at ${slotInput.toUpperCase()} by ${user?.name}`,
        type: 'info',
      });
      setSlotInput('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark parked');
      return;
    }
  };

  const handleMarkRetrieved = async () => {
    if (!activeTask) return;
    try {
      await markRetrieved(activeTask.id);
      // Alarm-grade — a car is now sitting at the counter waiting on the
      // owner, and nothing else prompts the valet to confirm the handover.
      pushNotification({
        targetRole: 'valet',
        title: '🔔 Car Delivered — Confirm Handover',
        body: `${activeTask.carNumber} is at the valet counter. Confirm once the owner has taken it.`,
        type: 'alarm',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark retrieved');
      return;
    }
  };

  const handleAcceptVisitorTask = async (visitorId: number) => {
    try {
      await acceptVisitorTask(visitorId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not accept task');
    }
  };

  const handleRejectVisitorTask = async (visitorId: number) => {
    try {
      await rejectVisitorTask(visitorId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not reject task');
    }
  };

  const handleMarkVisitorPickedUp = async (visitorId: number) => {
    try {
      await markVisitorPickedUp(visitorId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark picked up');
    }
  };

  const handleMarkVisitorParked = async (visitorId: number) => {
    try {
      await markVisitorParked(visitorId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark parked');
    }
  };

  const handleMarkVisitorRetrieved = async (visitorId: number) => {
    try {
      await markVisitorRetrieved(visitorId);
      pushNotification({
        targetRole: 'valet',
        title: '🔔 Car Delivered — Confirm Handover',
        body: `Delivered by ${user?.name} — confirm once the visitor has taken it.`,
        type: 'alarm',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark retrieved');
    }
  };

  const carX = carAnim.interpolate({inputRange: [0, 1], outputRange: ['0%', '88%']});

  const statusMeta: Record<string, {label: string; color: string; bg: string; icon: IconName}> = {
    assigned:      {label: activeTask?.type === 'retrieve' ? 'Go to parking slot' : 'Go to valet counter', color: c.warning, bg: c.warningLight, icon: 'bellAlert'},
    key_collected: {label: 'Key in hand — driving', color: c.primary, bg: c.cardAlt, icon: 'carKey'},
    in_transit:    {label: 'In transit', color: c.primary, bg: c.cardAlt, icon: 'navigate'},
    completed:     {label: 'Done', color: c.success, bg: c.successLight, icon: 'check'},
  };

  const freeSlots = slots.filter(s => s.status === 'free').slice(0, 6);

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: c.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.background} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={[s.roleLbl, {color: c.textSecondary}]}>Your jobs</Text>
            <Text style={[s.driverName, {color: c.primary}]}>{user?.name}</Text>
          </View>
          <View style={[s.tasksBadge, {backgroundColor: c.surface, borderColor: c.border}]}>
            <Text style={[s.tasksBadgeNum, {color: c.primary}]}>{completedToday.length}</Text>
            <Text style={[s.tasksBadgeSub, {color: c.textSecondary}]}>done today</Text>
          </View>
        </View>

        {/* Active task */}
        {activeTask ? (
          <View style={[s.activeCard, {backgroundColor: c.surface, borderColor: c.border}]}>
            <View style={[s.taskBanner, {backgroundColor: c.primary}]}>
              <Icon name={activeTask.type === 'park' ? 'arrowDown' : 'arrowUp'} size={16} color={c.textOnPrimary} />
              <Text style={[s.taskBannerTxt, {color: c.textOnPrimary}]}>{activeTask.type === 'park' ? 'PARKING JOB' : 'RETRIEVAL JOB'}</Text>
            </View>

            <View style={s.activeBody}>
              <View style={[s.infoGrid, {borderColor: c.border}]}>
                <View style={s.infoCell}>
                  <Text style={[s.infoCellLabel, {color: c.textMuted}]}>CUSTOMER</Text>
                  <Text style={[s.infoCellValue, {color: c.primary}]}>{activeTask.doctorName}</Text>
                </View>
                <View style={[s.infoCell, {borderColor: c.border, borderLeftWidth: 1}]}>
                  <Text style={[s.infoCellLabel, {color: c.textMuted}]}>CAR</Text>
                  <Text style={[s.infoCellValue, {color: c.primary}]}>{activeTask.carNumber}</Text>
                </View>
              </View>

              {activeTask.slotId && (
                <View style={[s.slotHighlight, {backgroundColor: c.cardAlt}]}>
                  <Text style={[s.slotHighlightLabel, {color: c.textSecondary}]}>
                    {activeTask.type === 'retrieve' ? 'RETRIEVE FROM' : 'DESTINATION SLOT'}
                  </Text>
                  <Text style={[s.slotHighlightValue, {color: c.primary}]}>{activeTask.slotId}</Text>
                </View>
              )}

              {activeTask.status in statusMeta && (
                <View style={[s.statusRow, {backgroundColor: statusMeta[activeTask.status]?.bg}]}>
                  <Icon name={statusMeta[activeTask.status]?.icon!} size={16} color={statusMeta[activeTask.status]?.color} />
                  <Text style={[s.statusLabel, {color: statusMeta[activeTask.status]?.color}]}>
                    {statusMeta[activeTask.status]?.label}
                  </Text>
                </View>
              )}

              {/* Accept handshake — a freshly assigned job must be accepted
                  (or rejected) before anything else; not accepting within
                  the admin-set window sends it back to the valet. */}
              {activeTask.status === 'assigned' && !activeTask.acceptedAt && (
                <View style={{flexDirection: 'row', gap: 8}}>
                  <PressableScale
                    style={[s.parkBtn, {backgroundColor: c.cardAlt, flex: 1}]}
                    onPress={handleRejectTask}
                  >
                    <Icon name="close" size={15} color={c.primary} />
                    <Text style={[s.parkBtnTxt, {color: c.primary}]}>Reject</Text>
                  </PressableScale>
                  <PressableScale
                    style={[s.parkBtn, {backgroundColor: c.primary, flex: 1}]}
                    onPress={handleAcceptTask}
                  >
                    <Icon name="check" size={15} color={c.textOnPrimary} />
                    <Text style={[s.parkBtnTxt, {color: c.textOnPrimary}]}>Accept</Text>
                  </PressableScale>
                </View>
              )}

              {(activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
                <View style={[s.trackWrap, {borderColor: c.border}]}>
                  <View style={s.trackHeadRow}>
                    <Text style={[s.trackTitle, {color: c.textSecondary}]}>LIVE ROUTE</Text>
                    {trip ? (
                      <Text style={[s.trackEta, {color: c.primary}]}>
                        {trip.etaMinutes} min{trip.distanceRemainingM != null ? ` · ${trip.distanceRemainingM}m` : ''}
                      </Text>
                    ) : (
                      <Text style={[s.trackEta, {color: c.textMuted}]}>Waiting for GPS…</Text>
                    )}
                  </View>
                  <View style={s.routeBar}>
                    <View style={[s.routeTrack, {backgroundColor: c.border}]} />
                    <Animated.View style={[s.routeProgress, {backgroundColor: c.primary, width: carX}]} />
                    <Animated.View style={[s.carMarker, {left: carX}]}>
                      <Icon name="carSide" size={18} color={c.primary} />
                    </Animated.View>
                  </View>
                </View>
              )}

              {activeTask.type === 'park' && (activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
                <View style={s.parkAction}>
                  <View style={s.slotInputRow}>
                    <View style={[s.slotInput, {borderColor: c.border, backgroundColor: c.background}]}>
                      <TextInput
                        style={[s.slotInputText, {color: c.primary}]}
                        value={slotInput}
                        onChangeText={t => setSlotInput(t.toUpperCase())}
                        placeholder="e.g. A-203"
                        placeholderTextColor={c.textMuted}
                        autoCapitalize="characters"
                        returnKeyType="done"
                        onSubmitEditing={() => slotInput.trim() && handleMarkParked()}
                      />
                    </View>
                    <PressableScale
                      style={[s.parkBtn, {backgroundColor: c.primary, opacity: slotInput.trim() ? 1 : 0.35}]}
                      onPress={handleMarkParked} disabled={!slotInput.trim()}
                    >
                      <Icon name="check" size={15} color={c.textOnPrimary} />
                      <Text style={[s.parkBtnTxt, {color: c.textOnPrimary}]}>Mark parked</Text>
                    </PressableScale>
                  </View>
                  {freeSlots.length > 0 && (
                    <PressableScale
                      style={[s.autoAssignBtn, {borderColor: c.border, backgroundColor: c.cardAlt}]}
                      onPress={() => setSlotInput(freeSlots[0].id)}
                    >
                      <Icon name="bolt" size={14} color={c.primary} />
                      <Text style={[s.autoAssignTxt, {color: c.primary}]}>Auto-assign nearest free slot ({freeSlots[0].id})</Text>
                    </PressableScale>
                  )}
                  <Text style={[s.quickPickLabel, {color: c.textMuted}]}>AVAILABLE SLOTS</Text>
                  <View style={s.quickPicks}>
                    {freeSlots.map(sl => (
                      <PressableScale key={sl.id} onPress={() => setSlotInput(sl.id)}
                        style={[s.quickPick, {backgroundColor: c.cardAlt, borderColor: c.border}]}>
                        <Text style={[s.quickPickTxt, {color: c.primary}]}>{sl.id}</Text>
                      </PressableScale>
                    ))}
                  </View>
                </View>
              )}

              {activeTask.type === 'retrieve' && activeTask.status === 'assigned' && !!activeTask.acceptedAt && (
                <PressableScale
                  style={[s.retrieveBtn, {backgroundColor: c.primary}]}
                  onPress={handleStartRetrieval}
                >
                  <Icon name="carKey" size={16} color={c.textOnPrimary} />
                  <Text style={[s.retrieveBtnTxt, {color: c.textOnPrimary}]}>Start retrieval</Text>
                </PressableScale>
              )}
              {activeTask.type === 'retrieve' && activeTask.status === 'in_transit' && (
                <PressableScale
                  style={[s.retrieveBtn, {backgroundColor: c.primary}]}
                  onPress={handleMarkRetrieved}
                >
                  <Icon name="check" size={16} color={c.textOnPrimary} />
                  <Text style={[s.retrieveBtnTxt, {color: c.textOnPrimary}]}>Car delivered to valet counter</Text>
                </PressableScale>
              )}
            </View>
          </View>
        ) : (
          <View style={[s.idleCard, {backgroundColor: c.surface, borderColor: c.border}]}>
            <View style={[s.idleIconWrap, {backgroundColor: c.cardAlt}]}>
              <Icon name="check" size={26} color={c.textSecondary} />
            </View>
            <Text style={[s.idleTitle, {color: c.primary}]}>No active job</Text>
            <Text style={[s.idleDesc, {color: c.textSecondary}]}>Waiting for the valet to assign a job. You'll get a notification when assigned.</Text>
          </View>
        )}

        {/* Visitor/patient pickups */}
        {myVisitors.length > 0 && (
          <>
            <Text style={[s.sectionTitle, {color: c.primary}]}>Visitor pickups ({myVisitors.length})</Text>
            {myVisitors.map(v => (
              <View key={v.id} style={[s.visitorCard, {backgroundColor: c.surface, borderColor: c.border}]}>
                <View style={s.visitorHead}>
                  <Icon name={v.vehicleType === 'bike' ? 'carSide' : 'car'} size={16} color={c.textSecondary} />
                  <Text style={[s.completedTitle, {color: c.primary}]}>{v.name} · {v.carNumber ?? 'no plate'}</Text>
                </View>
                {v.status === 'pending' && !v.acceptedAt ? (
                  <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
                    <PressableScale
                      style={[s.parkBtn, {backgroundColor: c.cardAlt, flex: 1}]}
                      onPress={() => handleRejectVisitorTask(v.id)}
                    >
                      <Icon name="close" size={15} color={c.primary} />
                      <Text style={[s.parkBtnTxt, {color: c.primary}]}>Reject</Text>
                    </PressableScale>
                    <PressableScale
                      style={[s.parkBtn, {backgroundColor: c.primary, flex: 1}]}
                      onPress={() => handleAcceptVisitorTask(v.id)}
                    >
                      <Icon name="check" size={15} color={c.textOnPrimary} />
                      <Text style={[s.parkBtnTxt, {color: c.textOnPrimary}]}>Accept</Text>
                    </PressableScale>
                  </View>
                ) : v.status === 'pending' && !v.pickedUpAt ? (
                  <PressableScale
                    style={[s.parkBtn, {backgroundColor: c.primary, alignSelf: 'stretch', marginTop: 10}]}
                    onPress={() => handleMarkVisitorPickedUp(v.id)}
                  >
                    <Icon name="carKey" size={15} color={c.textOnPrimary} />
                    <Text style={[s.parkBtnTxt, {color: c.textOnPrimary}]}>Picked up vehicle</Text>
                  </PressableScale>
                ) : v.status === 'pending' ? (
                  <PressableScale
                    style={[s.parkBtn, {backgroundColor: c.primary, alignSelf: 'stretch', marginTop: 10}]}
                    onPress={() => handleMarkVisitorParked(v.id)}
                  >
                    <Icon name="check" size={15} color={c.textOnPrimary} />
                    <Text style={[s.parkBtnTxt, {color: c.textOnPrimary}]}>Mark parked</Text>
                  </PressableScale>
                ) : v.retrievalRequested ? (
                  <PressableScale style={[s.retrieveBtn, {backgroundColor: c.primary, marginTop: 10}]}
                    onPress={() => handleMarkVisitorRetrieved(v.id)}>
                    <Icon name="check" size={16} color={c.textOnPrimary} />
                    <Text style={[s.retrieveBtnTxt, {color: c.textOnPrimary}]}>Car delivered to valet counter</Text>
                  </PressableScale>
                ) : (
                  <Text style={[s.completedMeta, {color: c.textSecondary, marginTop: 6}]}>Parked at {v.slotId} — waiting for retrieval request</Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* Completed today */}
        {completedToday.length > 0 && (
          <>
            <Text style={[s.sectionTitle, {color: c.primary}]}>Completed today</Text>
            {completedToday.map(t => (
              <View key={t.id} style={[s.completedRow, {backgroundColor: c.surface, borderColor: c.border}]}>
                <View style={[s.completedIconWrap, {backgroundColor: c.successLight}]}>
                  <Icon name={t.type === 'park' ? 'arrowDown' : 'arrowUp'} size={14} color={c.success} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={[s.completedTitle, {color: c.primary}]}>{t.type === 'park' ? 'Parked' : 'Retrieved'} — {t.doctorName}</Text>
                  <Text style={[s.completedMeta, {color: c.textSecondary}]}>{t.carNumber} {t.slotId ? `· ${t.slotId}` : ''}</Text>
                </View>
                <Icon name="check" size={16} color={c.success} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1}, scroll:{padding:20,paddingBottom:40},
  headerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20},
  roleLbl:{fontSize:12,fontWeight:'600'},
  driverName:{fontSize:22,fontWeight:'800',marginTop:2},
  tasksBadge:{borderRadius:14,borderWidth:1,paddingHorizontal:14,paddingVertical:8,alignItems:'center'},
  tasksBadgeNum:{fontSize:22,fontWeight:'900'},
  tasksBadgeSub:{fontSize:10,fontWeight:'600'},

  activeCard:{borderRadius:22,borderWidth:1,overflow:'hidden',marginBottom:20},
  taskBanner:{flexDirection:'row',alignItems:'center',gap:8,padding:14},
  taskBannerTxt:{fontSize:13,fontWeight:'800',letterSpacing:1},
  activeBody:{padding:16,gap:12},
  infoGrid:{flexDirection:'row',borderRadius:14,overflow:'hidden',borderWidth:1},
  infoCell:{flex:1,padding:12},
  infoCellLabel:{fontSize:9,fontWeight:'700',letterSpacing:1,marginBottom:4},
  infoCellValue:{fontSize:14,fontWeight:'800'},

  slotHighlight:{borderRadius:14,padding:14,alignItems:'center'},
  slotHighlightLabel:{fontSize:9,fontWeight:'700',letterSpacing:1},
  slotHighlightValue:{fontSize:28,fontWeight:'900',marginTop:2},

  statusRow:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:12,padding:12},
  statusLabel:{fontSize:13,fontWeight:'700'},

  trackWrap:{borderRadius:16,borderWidth:1,padding:14},
  trackHeadRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},
  trackTitle:{fontSize:9,fontWeight:'800',letterSpacing:1.5},
  trackEta:{fontSize:11,fontWeight:'800'},
  routeBar:{height:24,position:'relative',justifyContent:'center',marginBottom:6},
  routeTrack:{position:'absolute',left:0,right:0,height:3,borderRadius:2},
  routeProgress:{position:'absolute',left:0,height:3,borderRadius:2},
  carMarker:{position:'absolute',marginTop:-9,marginLeft:-9},

  parkAction:{gap:8},
  autoAssignBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:12,borderWidth:1,paddingVertical:11},
  autoAssignTxt:{fontSize:12,fontWeight:'800'},
  slotInputRow:{flexDirection:'row',gap:10},
  slotInput:{flex:1,borderRadius:14,borderWidth:1.5,paddingHorizontal:14,height:48,justifyContent:'center'},
  slotInputText:{fontSize:15,fontWeight:'700'},
  parkBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:14,paddingHorizontal:16,height:48},
  parkBtnTxt:{fontSize:13,fontWeight:'800'},
  quickPickLabel:{fontSize:9,fontWeight:'700',letterSpacing:1},
  quickPicks:{flexDirection:'row',flexWrap:'wrap',gap:8},
  quickPick:{borderRadius:10,borderWidth:1,paddingHorizontal:12,paddingVertical:7},
  quickPickTxt:{fontSize:12,fontWeight:'700'},

  retrieveBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:16,padding:16},
  retrieveBtnTxt:{fontSize:14,fontWeight:'800'},

  idleCard:{borderRadius:22,borderWidth:1,padding:40,alignItems:'center',marginBottom:20},
  idleIconWrap:{width:56,height:56,borderRadius:28,alignItems:'center',justifyContent:'center',marginBottom:14},
  idleTitle:{fontSize:18,fontWeight:'800',marginBottom:8},
  idleDesc:{fontSize:13,textAlign:'center',lineHeight:19},

  sectionTitle:{fontSize:15,fontWeight:'800',marginBottom:12},
  visitorCard:{borderRadius:16,borderWidth:1,padding:14,marginBottom:10},
  visitorHead:{flexDirection:'row',alignItems:'center',gap:8},
  completedRow:{flexDirection:'row',alignItems:'center',borderRadius:16,borderWidth:1,padding:14,marginBottom:8,gap:12},
  completedIconWrap:{width:30,height:30,borderRadius:9,alignItems:'center',justifyContent:'center'},
  completedTitle:{fontSize:13,fontWeight:'700'},
  completedMeta:{fontSize:11,marginTop:2},
});
