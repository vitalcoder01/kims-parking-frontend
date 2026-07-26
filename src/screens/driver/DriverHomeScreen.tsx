import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Animated, Alert} from 'react-native';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {computeTrip} from '../../utils/geo';

export function DriverHomeScreen() {
  const {user} = useAuth();
  const {tasks, drivers, slots, markParked, markRetrieved, updateTask, pushNotification} = useAppState();
  const {colors} = useTheme();

  const [slotInput, setSlotInput] = useState('');
  const carAnim = useRef(new Animated.Value(0)).current;

  // Find this driver's assigned tasks (login accounts link to AppState driver record via linkedDriverId)
  const myDriverId = user?.linkedDriverId ?? user?.id;
  const myTasks = tasks.filter(t => t.driverId === myDriverId && t.status !== 'completed');
  const activeTask = myTasks[0] ?? null;
  const completedToday = tasks.filter(t => t.driverId === myDriverId && t.status === 'completed');

  // Real trip progress/ETA — GPS itself is collected centrally in
  // AppStateContext; this just animates to whatever the last fix computed.
  // GPS is only ever tracked from 'in_transit' onward for a retrieve trip
  // (there's no key-handoff leg to walk) — that entire tracked leg is the
  // driver already behind the wheel bringing the car back, so it's a drive,
  // not a walk, same as a park trip's tracked leg.
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

  // Retrieve tasks skip the key-handoff step — the driver starts the trip
  // themselves the moment they're ready to head to the slot.
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
        targetRole: `doctor:${activeTask.doctorId}`, // non-broad; delivery is via targetId below
        targetId: activeTask.doctorId,
        title: '🅿️ Car Parked!',
        body: `Your car has been parked at slot ${slotInput.toUpperCase()} by ${user?.name}.`,
        type: 'info',
      });
      pushNotification({
        targetRole: 'valet',
        title: '✅ Car Parked',
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
      pushNotification({
        targetRole: 'valet',
        title: '🚗 Car Retrieved',
        body: `${activeTask.carNumber} retrieved from ${activeTask.slotId} — heading to exit.`,
        type: 'info',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark retrieved');
      return;
    }
  };

  const carX = carAnim.interpolate({inputRange: [0, 1], outputRange: ['0%', '88%']});

  const statusMeta: Record<string, {label: string; color: string; icon: string}> = {
    assigned:      {label: activeTask?.type === 'retrieve' ? 'Go to parking slot' : 'Go to valet counter', color: colors.warning, icon: '🔔'},
    key_collected: {label: 'Key in hand — driving',color: colors.primary, icon: '🚗'},
    in_transit:    {label: 'In transit',            color: colors.primary, icon: '🛣️'},
    completed:     {label: 'Done',                  color: colors.success, icon: '✅'},
  };

  const freeSlots = slots.filter(s => s.status === 'free').slice(0, 6);

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={[s.roleLbl, {color: colors.textMuted}]}>Driver</Text>
            <Text style={[s.driverName, {color: colors.textPrimary}]}>{user?.name}</Text>
          </View>
          <View style={[s.tasksBadge, {backgroundColor: completedToday.length > 0 ? colors.success + '15' : colors.surface, borderColor: colors.border}]}>
            <Text style={[s.tasksBadgeNum, {color: colors.success}]}>{completedToday.length}</Text>
            <Text style={[s.tasksBadgeSub, {color: colors.textMuted}]}>done today</Text>
          </View>
        </View>

        {/* Active task */}
        {activeTask ? (
          <View style={[s.activeCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            {/* Task type banner */}
            <View style={[s.taskBanner, {backgroundColor: activeTask.type === 'park' ? colors.primary : colors.warning}]}>
              <Text style={s.taskBannerIcon}>{activeTask.type === 'park' ? '↓' : '↑'}</Text>
              <Text style={s.taskBannerTxt}>{activeTask.type === 'park' ? 'PARKING TASK' : 'RETRIEVAL TASK'}</Text>
            </View>

            <View style={s.activeBody}>
              {/* Doctor & Car info */}
              <View style={s.infoGrid}>
                <View style={[s.infoCell, {borderColor: colors.border}]}>
                  <Text style={[s.infoCellLabel, {color: colors.textMuted}]}>CUSTOMER</Text>
                  <Text style={[s.infoCellValue, {color: colors.textPrimary}]}>{activeTask.doctorName}</Text>
                </View>
                <View style={[s.infoCell, {borderColor: colors.border, borderLeftWidth: 1}]}>
                  <Text style={[s.infoCellLabel, {color: colors.textMuted}]}>CAR</Text>
                  <Text style={[s.infoCellValue, {color: colors.textPrimary}]}>{activeTask.carNumber}</Text>
                </View>
              </View>

              {activeTask.slotId && (
                <View style={[s.slotHighlight, {backgroundColor: colors.primary + '10', borderColor: colors.primary + '30'}]}>
                  <Text style={[s.slotHighlightLabel, {color: colors.textMuted}]}>
                    {activeTask.type === 'retrieve' ? 'RETRIEVE FROM' : 'DESTINATION SLOT'}
                  </Text>
                  <Text style={[s.slotHighlightValue, {color: colors.primary}]}>{activeTask.slotId}</Text>
                </View>
              )}

              {/* Status indicator */}
              {activeTask.status in statusMeta && (
                <View style={[s.statusRow, {backgroundColor: statusMeta[activeTask.status]?.color + '10', borderColor: statusMeta[activeTask.status]?.color + '30'}]}>
                  <Text style={s.statusIcon}>{statusMeta[activeTask.status]?.icon}</Text>
                  <Text style={[s.statusLabel, {color: statusMeta[activeTask.status]?.color}]}>
                    {statusMeta[activeTask.status]?.label}
                  </Text>
                </View>
              )}

              {/* Live tracking — real GPS-driven progress bar */}
              {(activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
                <View style={[s.trackWrap, {borderColor: colors.border}]}>
                  <View style={s.trackHeadRow}>
                    <Text style={[s.trackTitle, {color: colors.textSecondary}]}>LIVE ROUTE</Text>
                    {trip ? (
                      <Text style={[s.trackEta, {color: colors.primary}]}>
                        {trip.etaMinutes} min{trip.distanceRemainingM != null ? ` · ${trip.distanceRemainingM}m` : ''}
                      </Text>
                    ) : (
                      <Text style={[s.trackEta, {color: colors.textMuted}]}>Waiting for GPS…</Text>
                    )}
                  </View>
                  <View style={s.routeBar}>
                    <View style={[s.routeTrack, {backgroundColor: colors.border}]} />
                    <Animated.View style={[s.routeProgress, {backgroundColor: colors.primary, width: carX}]} />
                    <Animated.Text style={[s.carMarker, {left: carX}]}>🚗</Animated.Text>
                  </View>
                </View>
              )}

              {/* Park action: slot input */}
              {activeTask.type === 'park' && (activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
                <View style={s.parkAction}>
                  <View style={s.slotInputRow}>
                    <View style={[s.slotInput, {borderColor: colors.border, backgroundColor: colors.background}]}>
                      <TextInput
                        style={[s.slotInputText, {color: colors.textPrimary}]}
                        value={slotInput}
                        onChangeText={t => setSlotInput(t.toUpperCase())}
                        placeholder="e.g. A-203"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                      />
                    </View>
                    <TouchableOpacity
                      style={[s.parkBtn, {backgroundColor: colors.success, opacity: slotInput.trim() ? 1 : 0.4}]}
                      onPress={handleMarkParked} disabled={!slotInput.trim()}
                    >
                      <Text style={s.parkBtnTxt}>✓ Mark Parked</Text>
                    </TouchableOpacity>
                  </View>
                  {freeSlots.length > 0 && (
                    <TouchableOpacity
                      style={[s.autoAssignBtn, {borderColor: colors.primary + '40', backgroundColor: colors.primary + '10'}]}
                      onPress={() => setSlotInput(freeSlots[0].id)} activeOpacity={0.8}
                    >
                      <Text style={[s.autoAssignTxt, {color: colors.primary}]}>⚡ Auto-Assign Nearest Free Slot ({freeSlots[0].id})</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={[s.quickPickLabel, {color: colors.textMuted}]}>AVAILABLE SLOTS</Text>
                  <View style={s.quickPicks}>
                    {freeSlots.map(sl => (
                      <TouchableOpacity key={sl.id} onPress={() => setSlotInput(sl.id)}
                        style={[s.quickPick, {backgroundColor: colors.success + '12', borderColor: colors.success + '40'}]}>
                        <Text style={[s.quickPickTxt, {color: colors.success}]}>{sl.id}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Retrieve action: no key handoff for a retrieve trip — the
                  driver starts it themselves once ready to head to the slot. */}
              {activeTask.type === 'retrieve' && activeTask.status === 'assigned' && (
                <TouchableOpacity
                  style={[s.retrieveBtn, {backgroundColor: colors.primary}]}
                  onPress={handleStartRetrieval} activeOpacity={0.85}
                >
                  <Text style={s.retrieveBtnTxt}>🔑 Start Retrieval</Text>
                </TouchableOpacity>
              )}
              {activeTask.type === 'retrieve' && activeTask.status === 'in_transit' && (
                <TouchableOpacity
                  style={[s.retrieveBtn, {backgroundColor: colors.warning}]}
                  onPress={handleMarkRetrieved} activeOpacity={0.85}
                >
                  <Text style={s.retrieveBtnTxt}>✓ Car Delivered to Valet Counter</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={[s.idleCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={s.idleIcon}>✅</Text>
            <Text style={[s.idleTitle, {color: colors.textPrimary}]}>No Active Task</Text>
            <Text style={[s.idleDesc, {color: colors.textMuted}]}>Waiting for valet to assign a task. You'll get a notification when assigned.</Text>
          </View>
        )}

        {/* Completed today */}
        {completedToday.length > 0 && (
          <>
            <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Completed Today</Text>
            {completedToday.map(t => (
              <View key={t.id} style={[s.completedRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                <View style={[s.completedDot, {backgroundColor: colors.success}]} />
                <View style={{flex: 1}}>
                  <Text style={[s.completedTitle, {color: colors.textPrimary}]}>{t.type === 'park' ? 'Parked' : 'Retrieved'} — {t.doctorName}</Text>
                  <Text style={[s.completedMeta, {color: colors.textMuted}]}>{t.carNumber} {t.slotId ? `· ${t.slotId}` : ''}</Text>
                </View>
                <Text style={[s.completedIcon, {color: colors.success}]}>✓</Text>
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
  driverName:{fontSize:20,fontWeight:'900',marginTop:2},
  tasksBadge:{borderRadius:12,borderWidth:1,paddingHorizontal:14,paddingVertical:8,alignItems:'center'},
  tasksBadgeNum:{fontSize:22,fontWeight:'900'},
  tasksBadgeSub:{fontSize:10,fontWeight:'600'},

  activeCard:{borderRadius:20,borderWidth:1,overflow:'hidden',marginBottom:20},
  taskBanner:{flexDirection:'row',alignItems:'center',gap:8,padding:14},
  taskBannerIcon:{color:'#fff',fontSize:20,fontWeight:'900'},
  taskBannerTxt:{color:'#fff',fontSize:13,fontWeight:'800',letterSpacing:1},
  activeBody:{padding:16,gap:12},
  infoGrid:{flexDirection:'row',borderRadius:12,overflow:'hidden',borderWidth:1},
  infoCell:{flex:1,padding:12},
  infoCellLabel:{fontSize:9,fontWeight:'700',letterSpacing:1,marginBottom:4},
  infoCellValue:{fontSize:14,fontWeight:'800'},

  slotHighlight:{borderRadius:12,borderWidth:1,padding:12,alignItems:'center'},
  slotHighlightLabel:{fontSize:9,fontWeight:'700',letterSpacing:1},
  slotHighlightValue:{fontSize:28,fontWeight:'900',marginTop:2},

  statusRow:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:10,borderWidth:1,padding:10},
  statusIcon:{fontSize:16},
  statusLabel:{fontSize:13,fontWeight:'700'},

  trackWrap:{borderRadius:14,borderWidth:1,padding:14},
  trackHeadRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},
  trackTitle:{fontSize:9,fontWeight:'800',letterSpacing:1.5},
  trackEta:{fontSize:11,fontWeight:'800'},
  routeBar:{height:24,position:'relative',justifyContent:'center',marginBottom:6},
  routeTrack:{position:'absolute',left:0,right:0,height:3,borderRadius:2},
  routeProgress:{position:'absolute',left:0,height:3,borderRadius:2},
  carMarker:{position:'absolute',fontSize:18,marginTop:-8,marginLeft:-9},

  parkAction:{gap:8},
  fieldLabel:{fontSize:10,fontWeight:'700',letterSpacing:1,marginBottom:4},
  autoAssignBtn:{borderRadius:10,borderWidth:1,paddingVertical:10,alignItems:'center'},
  autoAssignTxt:{fontSize:12,fontWeight:'800'},
  slotInputRow:{flexDirection:'row',gap:10},
  slotInput:{flex:1,borderRadius:12,borderWidth:1.5,paddingHorizontal:14,height:48,justifyContent:'center'},
  slotInputText:{fontSize:15,fontWeight:'700'},
  parkBtn:{borderRadius:12,paddingHorizontal:16,height:48,alignItems:'center',justifyContent:'center'},
  parkBtnTxt:{color:'#fff',fontSize:13,fontWeight:'800'},
  quickPickLabel:{fontSize:9,fontWeight:'700',letterSpacing:1},
  quickPicks:{flexDirection:'row',flexWrap:'wrap',gap:8},
  quickPick:{borderRadius:8,borderWidth:1,paddingHorizontal:10,paddingVertical:6},
  quickPickTxt:{fontSize:12,fontWeight:'700'},

  retrieveBtn:{borderRadius:14,padding:16,alignItems:'center'},
  retrieveBtnTxt:{color:'#fff',fontSize:14,fontWeight:'800'},

  idleCard:{borderRadius:20,borderWidth:1,padding:40,alignItems:'center',marginBottom:20},
  idleIcon:{fontSize:40,marginBottom:12},
  idleTitle:{fontSize:18,fontWeight:'800',marginBottom:8},
  idleDesc:{fontSize:13,textAlign:'center',lineHeight:19},

  sectionTitle:{fontSize:14,fontWeight:'800',marginBottom:12},
  completedRow:{flexDirection:'row',alignItems:'center',borderRadius:14,borderWidth:1,padding:14,marginBottom:8,gap:12,overflow:'hidden'},
  completedDot:{position:'absolute',left:0,top:0,bottom:0,width:4},
  completedTitle:{fontSize:13,fontWeight:'700'},
  completedMeta:{fontSize:11,marginTop:2},
  completedIcon:{fontSize:16,fontWeight:'800'},

  infoRow:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,paddingTop:12,marginTop:4},
  infoLabel:{fontSize:12,fontWeight:'600'},
  infoValue:{fontSize:13,fontWeight:'700'},
});
