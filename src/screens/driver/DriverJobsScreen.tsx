import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, Animated, StatusBar} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../context/AuthContext';
import {useMyDriverId, isMyJob} from '../../hooks/useMyDriverId';
import {isJobGone} from '../../services/api';
import {stopAssignmentAlarm} from '../../services/notifications';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {computeTrip} from '../../utils/geo';
import {Icon, IconName} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {SkeletonCard} from '../../components/Skeleton';

export function DriverJobsScreen() {
  const dialog = useDialog();
  const {user} = useAuth();
  const {tasks, markTaskReturned,
    fetchTaskHistory,
    hydrated, refreshTasks} = useAppState();
  const {colors: c, isDark} = useTheme();

  // Guards the one remaining one-tap job action below (mark returned, for
  // a recalled car) against a double-tap firing it twice while the first
  // is still in flight.
  const [actionBusy, setActionBusy] = useState(false);
  const carAnim = useRef(new Animated.Value(0)).current;

  const myDriverId = useMyDriverId();
  // 'delivered' means the driver's own part is already done (car dropped at
  // the valet counter) — it's just awaiting the valet's confirmation now,
  // so it shouldn't keep sitting here as this driver's "current job".
  const myTasks = tasks.filter(t => isMyJob(t.driverId, myDriverId) && t.status !== 'completed' && t.status !== 'delivered' && t.status !== 'cancelled');
  const activeTask = myTasks[0] ?? null;

  // The live `tasks` array is bounded to "at most one row per doctor" now —
  // a completed job vanishes from it the moment that doctor's next car comes
  // in, so "completed today" needs the real history, not this list.
  //
  // Depends on `tasks` itself, not `tasks.length` — see DriverDashboardScreen's
  // identical fix/comment for why .length silently never refired this right
  // after finishing a job.
  const [history, setHistory] = useState<typeof tasks>([]);
  useEffect(() => {
    if (!myDriverId) return;
    fetchTaskHistory({driverId: myDriverId}).then(setHistory).catch(() => {});
  }, [myDriverId, fetchTaskHistory, tasks]);
  const today = new Date().toDateString();
  const completedToday = history.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt).toDateString() === today);

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

  // A driver tapping Accept on a card the server has already invalidated is
  // the normal end of a stalled assignment, not an error they did anything
  // wrong about: the watchdog rolled it back, or the valet gave it to someone
  // else. Say so plainly, drop the dead card, and stop the alarm — leaving it
  // on screen invites the same failing tap again.
  const handleStaleJob = async (err: any, fallback: string) => {
    if (!isJobGone(err)) {
      dialog.alert(err?.message || fallback, {title: 'Error'});
      return;
    }
    await stopAssignmentAlarm().catch(() => {});
    await refreshTasks().catch(() => {});
    dialog.alert('This job was reassigned while you were deciding.', {
      title: 'Job no longer yours', tone: 'info',
    });
  };

  // Valet pulled this park job back mid-drive — the car goes back to the
  // counter instead of into a slot. They still have to confirm receipt.
  const handleMarkReturned = async () => {
    if (!activeTask || actionBusy) return;
    setActionBusy(true);
    try {
      await markTaskReturned(activeTask.id);
    } catch (err: any) {
      dialog.alert(err.message || 'Could not mark returned', {title: 'Error'});
    } finally {
      setActionBusy(false);
    }
  };

  const carX = carAnim.interpolate({inputRange: [0, 1], outputRange: ['0%', '88%']});

  const statusMeta: Record<string, {label: string; color: string; bg: string; icon: IconName}> = {
    assigned:      {label: activeTask?.type === 'retrieve' ? 'Go to parking slot' : 'Go to valet counter', color: c.warning, bg: c.warningLight, icon: 'bellAlert'},
    key_collected: {label: 'Driving to park', color: c.primary, bg: c.cardAlt, icon: 'carKey'},
    in_transit:    {label: 'In transit', color: c.primary, bg: c.cardAlt, icon: 'navigate'},
    completed:     {label: 'Done', color: c.success, bg: c.successLight, icon: 'check'},
  };

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
        {!hydrated ? (
          <SkeletonCard lines={3} style={{marginBottom: 20}} />
        ) : activeTask ? (
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

              {/* A park job has no destination at all — the driver just
                  drives with the key to whichever free slot they pick, so
                  there's nothing to route/ETA against (this used to show
                  "Waiting for GPS…" forever for exactly that reason). A
                  retrieve job does have a real destination (the assigning
                  valet's location, captured in task.service.js
                  assignDriver), so the route/ETA panel stays for that. */}
              {activeTask.type === 'retrieve' && (activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
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

              {/* Recalled: the valet wants this car back, not parked. The
                  slot picker below is deliberately replaced entirely — an
                  attempt to park it would be rejected server-side anyway. */}
              {activeTask.type === 'park' && !!activeTask.recalledAt
                && (activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
                <View style={{gap: 10}}>
                  <View style={[s.statusRow, {backgroundColor: c.warningLight}]}>
                    <Icon name="bellAlert" size={16} color={c.warning} />
                    <Text style={[s.statusLabel, {color: c.warning}]}>
                      Do not park — return this car to the valet counter
                    </Text>
                  </View>
                  <PressableScale
                    style={[s.retrieveBtn, {backgroundColor: c.primary, opacity: actionBusy ? 0.6 : 1}]}
                    onPress={handleMarkReturned} disabled={actionBusy}
                  >
                    <Icon name="check" size={16} color={c.textOnPrimary} />
                    <Text style={[s.retrieveBtnTxt, {color: c.textOnPrimary}]}>{actionBusy ? 'Please wait…' : 'Returned to counter'}</Text>
                  </PressableScale>
                </View>
              )}

              {/* No manual "mark parked" any more either — the lot-station
                  valet confirms this once the car is actually in a slot
                  (see ValetHomeScreen's confirmParkedByValet). The
                  driver's only job from here is to drive there. */}
              {activeTask.type === 'park' && !activeTask.recalledAt && (activeTask.status === 'key_collected' || activeTask.status === 'in_transit') && (
                <View style={[s.statusRow, {backgroundColor: c.cardAlt}]}>
                  <Icon name="carKey" size={16} color={c.textSecondary} />
                  <Text style={[s.statusLabel, {color: c.textSecondary}]}>Drive to a free slot — a valet will confirm once it's parked</Text>
                </View>
              )}

              {/* No manual "start" tap — the driver's only job is to drive;
                  reporting GPS itself is what advances this into in_transit
                  (see AppStateContext.activeDriverTask / the two-station
                  handoff model). This status just tells them where to go. */}
              {activeTask.type === 'retrieve' && activeTask.status === 'assigned' && (
                <View style={[s.statusRow, {backgroundColor: c.cardAlt}]}>
                  <Icon name="navigate" size={16} color={c.primary} />
                  <Text style={[s.statusLabel, {color: c.primary}]}>Head to the parking slot — tracking starts automatically</Text>
                </View>
              )}
              {/* No manual "delivered" tap either — the gate-station valet
                  confirms once the car has actually arrived (see
                  ValetHomeScreen's confirmArrivedByValet). */}
              {activeTask.type === 'retrieve' && activeTask.status === 'in_transit' && (
                <View style={[s.statusRow, {backgroundColor: c.cardAlt}]}>
                  <Icon name="carKey" size={16} color={c.textSecondary} />
                  <Text style={[s.statusLabel, {color: c.textSecondary}]}>Drive to the front gate — a valet will confirm once you arrive</Text>
                </View>
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
  completedRow:{flexDirection:'row',alignItems:'center',borderRadius:16,borderWidth:1,padding:14,marginBottom:8,gap:12},
  completedIconWrap:{width:30,height:30,borderRadius:9,alignItems:'center',justifyContent:'center'},
  completedTitle:{fontSize:13,fontWeight:'700'},
  completedMeta:{fontSize:11,marginTop:2},
});
