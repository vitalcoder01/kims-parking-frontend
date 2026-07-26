import React, {useState} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Linking, Alert, Platform, PermissionsAndroid} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from 'react-native-geolocation-service';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon} from '../../components/Icon';
import {usersApi} from '../../services/api';

// Best-effort — the valet's current position becomes the retrieve trip's
// real destination (see handleRetrieve). If permission is denied or the fix
// times out, the task is still created without one; the driver/doctor just
// fall back to the nominal-distance progress estimate for that trip.
async function getCurrentPositionSafe(): Promise<{lat: number; lng: number} | null> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {title: 'Location Permission', message: 'KIMS Parking needs your location to guide the driver back to you.', buttonPositive: 'Allow'},
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
      () => resolve(null),
      {enableHighAccuracy: true, timeout: 8000, maximumAge: 10000},
    );
  });
}

function sendWhatsApp(mobile: string, name: string, carNumber: string, token: string, slot?: string) {
  const msg = `🏥 *KIMS Hospital Parking*\n\nHello ${name},\n\nYour car *${carNumber}* has been safely received by our valet service.\n\n📍 *Token:* ${token}\n🅿️ *Slot:* ${slot ?? 'Being assigned...'}\n\n_You will be notified once your car is parked._\n\nTo retrieve your car, reply *RETRIEVE* or contact our desk.\n\n_KIMS Smart Parking · Secure · Real-time_`;
  const url = `whatsapp://send?phone=+91${mobile.replace(/\D/g,'')}&text=${encodeURIComponent(msg)}`;
  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      // fallback to wa.me
      Linking.openURL(`https://wa.me/91${mobile.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`);
    }
  }).catch(() => Alert.alert('WhatsApp', 'Could not open WhatsApp. Please check if it is installed.'));
}

type Screen = 'home' | 'scan' | 'assign' | 'visitor';

export function ValetHomeScreen() {
  const {user} = useAuth();
  const {drivers, tasks, slots, addTask, assignDriver, markKeyCollected, pushNotification, addVisitor} = useAppState();
  const {colors, isDark} = useTheme();

  const [screen, setScreen] = useState<Screen>('home');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [foundUser, setFoundUser] = useState<any | null>(null);
  const [carNumber, setCarNumber] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const [vName, setVName] = useState('');
  const [vCar, setVCar] = useState('');
  const [vMobile, setVMobile] = useState('');

  const activeTasks = tasks.filter(t => t.status !== 'completed');
  const availableDrivers = drivers.filter(d => d.status === 'available');
  // Currently parked cars available for retrieval (occupied slots without an in-progress retrieve task)
  const retrievingSlotIds = new Set(
    tasks.filter(t => t.type === 'retrieve' && t.status !== 'completed').map(t => t.slotId),
  );
  // `doctorId` is required — some demo slots are seeded "occupied" for
  // occupancy-stat purposes only and have no real owner/task to retrieve.
  const parkedSlots = slots.filter(sl => sl.status === 'occupied' && sl.doctorId && !retrievingSlotIds.has(sl.id));
  const pendingTask = pendingTaskId ? tasks.find(t => t.id === pendingTaskId) ?? null : null;

  const handleScanCode = async () => {
    setCodeError('');
    const trimmed = code.trim();
    try {
      const found = await usersApi.lookupByCardCode(trimmed);
      setFoundUser(found);
      // Reuse the car number already on file for this person — no need for
      // the valet to retype it every single visit.
      setCarNumber(found.carNumber ?? '');
      setCode('');
    } catch (err) {
      setCodeError('No user found with this code');
    }
  };

  const handleKeyReceived = async () => {
    if (!foundUser || !carNumber.trim()) return;
    try {
      const id = await addTask({
        type: 'park',
        doctorId: foundUser.id,
        doctorName: foundUser.name,
        carNumber: carNumber.trim().toUpperCase(),
        status: 'assigned',
        assignedAt: Date.now(),
      });
      setPendingTaskId(id);
      pushNotification({
        targetRole: 'driver',
        title: '🚗 New Parking Task',
        body: `Car ${carNumber.toUpperCase()} — ${foundUser.name}. Report to valet counter.`,
        type: 'info',
      });
      setScreen('assign');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleAssignDriver = async (driverId: string) => {
    if (!pendingTaskId) return;
    try {
      const task = tasks.find(t => t.id === pendingTaskId);
      const isRetrieve = task?.type === 'retrieve';
      await assignDriver(pendingTaskId, driverId);
      pushNotification({
        targetRole: `driver:${driverId}`, // precise: only the assigned driver, not every driver
        targetId: driverId,
        title: isRetrieve ? '🔔 Retrieval Task!' : '🔔 Task Assigned!',
        body: isRetrieve
          ? `Retrieve ${task?.carNumber} from slot ${task?.slotId} for ${task?.doctorName}.`
          : `Collect key from valet for ${task?.doctorName}'s car (${task?.carNumber}).`,
        type: 'alarm',
      });
      setFoundUser(null); setCarNumber(''); setPendingTaskId(null);
      setScreen('home');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleRetrieve = async (slot: typeof parkedSlots[number]) => {
    try {
      const origTask = tasks.find(t => t.id === slot.taskId);
      // The valet's own position right now IS the real destination — this is
      // where the driver needs to bring the car — so distance/ETA on the
      // tracking map become genuinely accurate instead of a guessed constant.
      const here = await getCurrentPositionSafe();
      const id = await addTask({
        type: 'retrieve',
        doctorId: slot.doctorId ?? '',
        doctorName: origTask?.doctorName ?? 'Customer',
        carNumber: slot.carNumber ?? '',
        slotId: slot.id,
        status: 'assigned',
        assignedAt: Date.now(),
        destinationLat: here?.lat,
        destinationLng: here?.lng,
      });
      setPendingTaskId(id);
      setScreen('assign');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleAddVisitor = async () => {
    if (!vName.trim() || !vCar.trim() || !vMobile.trim()) return;
    try {
      const visitor = await addVisitor({name: vName.trim(), carNumber: vCar.trim().toUpperCase(), mobile: vMobile.trim()});
      sendWhatsApp(vMobile.trim(), vName.trim(), vCar.trim().toUpperCase(), visitor.token);
      setVName(''); setVCar(''); setVMobile('');
      setScreen('home');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  // ── SCAN / KEY COLLECTION ──────────────────────────────────────────────
  if (screen === 'scan') {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setScreen('home'); setFoundUser(null); setCode(''); setCodeError(''); }} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Key Collection</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          {!foundUser ? (
            <>
              <Text style={[s.stepLabel, {color: colors.textMuted}]}>STEP 1 — IDENTIFY</Text>
              <Text style={[s.stepDesc, {color: colors.textPrimary}]}>Enter the 3-digit code from the doctor/staff card</Text>
              <View style={[s.codeBox, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                <TextInput
                  style={[s.codeInput, {color: colors.textPrimary, borderBottomColor: colors.primary}]}
                  value={code}
                  onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 3)); setCodeError(''); }}
                  keyboardType="numeric"
                  maxLength={3}
                  placeholder="• • •"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                  autoFocus
                />
                {!!codeError && <Text style={[s.codeError, {color: colors.error}]}>{codeError}</Text>}
                <TouchableOpacity
                  style={[s.actionBtn, {backgroundColor: colors.primary, opacity: code.length === 3 ? 1 : 0.4}]}
                  onPress={handleScanCode} disabled={code.length !== 3}
                >
                  <Text style={s.actionBtnTxt}>Find Customer →</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[s.stepLabel, {color: colors.textMuted}]}>STEP 2 — CONFIRM & COLLECT KEY</Text>
              <View style={[s.foundCard, {backgroundColor: colors.success + '12', borderColor: colors.success + '40'}]}>
                <Text style={s.foundIcon}>✅</Text>
                <Text style={[s.foundName, {color: colors.textPrimary}]}>{foundUser.name}</Text>
                <Text style={[s.foundDept, {color: colors.textSecondary}]}>{foundUser.department ?? foundUser.role}</Text>
                <Text style={[s.foundId, {color: colors.textMuted}]}>ID: {foundUser.employeeId}</Text>
              </View>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>CAR NUMBER PLATE</Text>
              <View style={[s.inputRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={s.inputIcon}>🚘</Text>
                <TextInput style={[s.textInput, {color: colors.textPrimary}]} value={carNumber}
                  onChangeText={setCarNumber} placeholder="e.g. TN09 AB 1234"
                  placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
              </View>
              <TouchableOpacity
                style={[s.actionBtn, {backgroundColor: colors.success, opacity: carNumber.trim() ? 1 : 0.4}]}
                onPress={handleKeyReceived} disabled={!carNumber.trim()}
              >
                <Text style={s.actionBtnTxt}>✓ Key Received — Assign Driver</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── ASSIGN DRIVER ──────────────────────────────────────────────────────
  if (screen === 'assign') {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>Skip</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Assign Driver</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <Text style={[s.stepLabel, {color: colors.textMuted}]}>SELECT DRIVER</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>
            {pendingTask?.type === 'retrieve'
              ? `Assign a driver to retrieve ${pendingTask.carNumber} from slot ${pendingTask.slotId}`
              : 'Tap a driver to assign this parking task'}
          </Text>
          {availableDrivers.length === 0 && (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Text style={s.emptyIcon}>⏳</Text>
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No drivers available right now</Text>
            </View>
          )}
          {availableDrivers.map(d => (
            <TouchableOpacity key={d.id} style={[s.driverCard, {backgroundColor: colors.surface, borderColor: colors.success + '44'}]}
              onPress={() => handleAssignDriver(d.id)} activeOpacity={0.75}>
              <View style={[s.driverStripe, {backgroundColor: colors.success}]} />
              <View style={[s.avatar, {backgroundColor: colors.primary + '18'}]}>
                <Text style={[s.avatarTxt, {color: colors.primary}]}>{d.name[0]}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={[s.driverName, {color: colors.textPrimary}]}>{d.name}</Text>
                <Text style={[s.driverStatusTxt, {color: colors.success}]}>Available</Text>
              </View>
              <Text style={[s.assignArrow, {color: colors.primary}]}>Assign →</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── VISITOR ────────────────────────────────────────────────────────────
  if (screen === 'visitor') {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Visitor / Patient</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <Text style={[s.stepLabel, {color: colors.textMuted}]}>VISITOR DETAILS</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>WhatsApp tracking link will be sent automatically</Text>
          {[
            {label: 'Full Name', icon: '👤', val: vName, set: setVName, ph: 'Patient / Visitor name', kb: 'default' as const},
            {label: 'Car Number', icon: '🚘', val: vCar, set: setVCar, ph: 'e.g. TN09 AB 1234', kb: 'default' as const},
            {label: 'Mobile Number', icon: '📱', val: vMobile, set: setVMobile, ph: '10-digit number', kb: 'numeric' as const},
          ].map(f => (
            <View key={f.label} style={{marginBottom: 4}}>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>{f.label.toUpperCase()}</Text>
              <View style={[s.inputRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={s.inputIcon}>{f.icon}</Text>
                <TextInput style={[s.textInput, {color: colors.textPrimary}]} value={f.val} onChangeText={f.set}
                  placeholder={f.ph} placeholderTextColor={colors.textMuted}
                  keyboardType={f.kb} autoCapitalize={f.kb === 'default' ? 'words' : 'none'} />
              </View>
            </View>
          ))}
          <View style={[s.whatsappNote, {backgroundColor: '#25D36614', borderColor: '#25D36638'}]}>
            <Text style={{fontSize: 18}}>💬</Text>
            <Text style={[s.whatsappTxt, {color: colors.textSecondary}]}>
              Live tracking link + parking status will be sent to {vMobile || 'their number'} via WhatsApp.
            </Text>
          </View>
          <TouchableOpacity
            style={[s.actionBtn, {backgroundColor: '#25D366', opacity: (vName && vCar && vMobile.length >= 10) ? 1 : 0.4, marginTop: 8}]}
            onPress={handleAddVisitor} disabled={!(vName && vCar && vMobile.length >= 10)}
          >
            <Text style={s.actionBtnTxt}>Generate Token & Send WhatsApp</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── HOME ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Gradient header */}
        <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.gradHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
          <View style={s.greetRow}>
            <View>
              <Text style={s.gradGreetSub}>Valet Station</Text>
              <Text style={s.gradGreetName}>{user?.name}</Text>
            </View>
            <View style={s.gradBadge}>
              <Text style={s.gradBadgeNum}>{availableDrivers.length}</Text>
              <Text style={s.gradBadgeSub}>drivers{'\n'}ready</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={s.body}>
        {/* Primary CTA buttons */}
        <View style={s.primaryRow}>
          <TouchableOpacity style={[s.primaryBtn, {backgroundColor: colors.primary}]} onPress={() => setScreen('scan')} activeOpacity={0.85}>
            <View style={s.primaryIconWrap}><Icon name="key" size={26} color="#fff" /></View>
            <Text style={s.primaryBtnTxt}>Collect Key</Text>
            <Text style={s.primaryBtnSub}>Doctor / Staff</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.primaryBtn, {backgroundColor: colors.accent}]} onPress={() => setScreen('visitor')} activeOpacity={0.85}>
            <View style={s.primaryIconWrap}><Icon name="ticket" size={26} color="#fff" /></View>
            <Text style={s.primaryBtnTxt}>Visitor</Text>
            <Text style={s.primaryBtnSub}>Patient / VIP</Text>
          </TouchableOpacity>
        </View>

        {/* Driver pills */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Driver Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal: -20, marginBottom: 20}} contentContainerStyle={{paddingHorizontal: 20, gap: 10}}>
          {drivers.map(d => {
            const sc = d.status === 'available' ? colors.success : d.status === 'busy' ? colors.warning : colors.textMuted;
            const sl = d.status === 'available' ? 'Ready' : d.status === 'busy' ? 'On Task' : 'Off Duty';
            return (
              <View key={d.id} style={[s.driverPill, {backgroundColor: colors.surface, borderColor: sc + '44'}]}>
                <View style={[s.driverDot, {backgroundColor: sc}]} />
                <View style={[s.avatar, {backgroundColor: sc + '15', width: 36, height: 36, borderRadius: 18}]}>
                  <Text style={[s.avatarTxt, {color: sc}]}>{d.name[0]}</Text>
                </View>
                <Text style={[s.driverPillName, {color: colors.textPrimary}]} numberOfLines={1}>{d.name.split(' ')[0]}</Text>
                <Text style={[s.driverStatusTxt, {color: sc, fontSize: 10}]}>{sl}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Active tasks */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Active Tasks ({activeTasks.length})</Text>
        {activeTasks.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={s.emptyIcon}>✅</Text>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>All clear — no active tasks</Text>
          </View>
        ) : activeTasks.map(t => {
          const tc = t.type === 'park' ? colors.primary : colors.warning;
          const sl: Record<string,string> = {assigned:'Waiting for driver', key_collected:'Driver has key', in_transit:'In transit', completed:'Done'};
          return (
            <View key={t.id} style={[s.taskCard, {backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: tc}]}>
              <View style={s.taskTop}>
                <View style={[s.typePill, {backgroundColor: tc + '15'}]}>
                  <Text style={[s.typePillTxt, {color: tc}]}>{t.type === 'park' ? '↓ PARK' : '↑ RETRIEVE'}</Text>
                </View>
                <Text style={[s.taskStatusTxt, {color: tc}]}>{sl[t.status]}</Text>
              </View>
              <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{t.doctorName}</Text>
              <Text style={[s.taskMeta, {color: colors.textSecondary}]}>🚘 {t.carNumber}{t.slotId ? ` · Slot ${t.slotId}` : ''}</Text>
              {!!t.driverName && <Text style={[s.taskDriverTxt, {color: colors.textMuted}]}>Driver: {t.driverName}</Text>}
              {t.status === 'assigned' && t.type === 'park' && (
                <TouchableOpacity style={[s.taskActionBtn, {borderColor: colors.success, backgroundColor: colors.success + '10'}]}
                  onPress={() => markKeyCollected(t.id)}>
                  <Text style={[s.taskActionTxt, {color: colors.success}]}>✓ Mark Key Handed to Driver</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Parked cars — available for retrieval */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary, marginTop: 20}]}>Parked Cars ({parkedSlots.length})</Text>
        {parkedSlots.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={s.emptyIcon}>🅿️</Text>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No parked cars yet</Text>
          </View>
        ) : parkedSlots.map(sl => {
          const origTask = tasks.find(t => t.id === sl.taskId);
          return (
            <View key={sl.id} style={[s.taskCard, {backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.warning}]}>
              <View style={s.taskTop}>
                <View style={[s.typePill, {backgroundColor: colors.warning + '15'}]}>
                  <Text style={[s.typePillTxt, {color: colors.warning}]}>🅿️ SLOT {sl.id}</Text>
                </View>
                <Text style={[s.taskStatusTxt, {color: colors.success}]}>Parked</Text>
              </View>
              <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{origTask?.doctorName ?? 'Customer'}</Text>
              <Text style={[s.taskMeta, {color: colors.textSecondary}]}>🚘 {sl.carNumber}</Text>
              <TouchableOpacity style={[s.taskActionBtn, {borderColor: colors.warning, backgroundColor: colors.warning + '12'}]}
                onPress={() => handleRetrieve(sl)}>
                <Text style={[s.taskActionTxt, {color: colors.warning}]}>↑ Retrieve — Assign Driver</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1}, scroll:{paddingBottom:40},
  body:{padding:16,gap:8},
  gradHeader:{paddingTop:20,paddingBottom:28,paddingHorizontal:20},
  greetRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  gradGreetSub:{color:'rgba(255,255,255,0.75)',fontSize:12,fontWeight:'600'},
  gradGreetName:{color:'#fff',fontSize:20,fontWeight:'900',marginTop:2},
  gradBadge:{backgroundColor:'rgba(255,255,255,0.2)',borderRadius:14,paddingHorizontal:16,paddingVertical:10,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.25)'},
  gradBadgeNum:{color:'#fff',fontSize:24,fontWeight:'900'},
  gradBadgeSub:{color:'rgba(255,255,255,0.75)',fontSize:10,fontWeight:'700',textAlign:'center'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,paddingTop:20},
  backBtn:{borderRadius:10,borderWidth:1,paddingHorizontal:12,paddingVertical:8},
  backTxt:{fontSize:13,fontWeight:'700'},
  headerTitle:{fontSize:17,fontWeight:'900'},
  driverBadge:{borderRadius:12,borderWidth:1,paddingHorizontal:14,paddingVertical:8,alignItems:'center'},
  driverBadgeNum:{fontSize:22,fontWeight:'900'},
  driverBadgeSub:{fontSize:10,fontWeight:'700',textAlign:'center'},
  primaryRow:{flexDirection:'row',gap:12,marginBottom:24},
  primaryBtn:{flex:1,borderRadius:18,padding:20,alignItems:'center'},
  primaryIconWrap:{width:52,height:52,borderRadius:16,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',marginBottom:8},
  primaryBtnTxt:{color:'#fff',fontSize:15,fontWeight:'800'},
  primaryBtnSub:{color:'rgba(255,255,255,0.7)',fontSize:11,marginTop:2},
  sectionTitle:{fontSize:14,fontWeight:'800',marginBottom:12},
  driverPill:{borderRadius:14,borderWidth:1,padding:10,alignItems:'center',gap:4,width:86,position:'relative'},
  driverDot:{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:4},
  driverPillName:{fontSize:11,fontWeight:'700'},
  taskCard:{borderRadius:16,borderWidth:1,borderLeftWidth:4,padding:16,marginBottom:10},
  taskTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  typePill:{borderRadius:6,paddingHorizontal:8,paddingVertical:3},
  typePillTxt:{fontSize:10,fontWeight:'800',letterSpacing:0.5},
  taskStatusTxt:{fontSize:11,fontWeight:'700'},
  taskDoctor:{fontSize:14,fontWeight:'800',marginBottom:2},
  taskMeta:{fontSize:12,fontWeight:'600',marginBottom:4},
  taskDriverTxt:{fontSize:11,marginBottom:8},
  taskActionBtn:{borderRadius:10,borderWidth:1,paddingVertical:10,alignItems:'center'},
  taskActionTxt:{fontSize:12,fontWeight:'700'},
  emptyBox:{borderRadius:14,borderWidth:1,borderStyle:'dashed',padding:24,alignItems:'center',marginBottom:16},
  emptyIcon:{fontSize:28,marginBottom:8},
  emptyTxt:{fontSize:13,fontWeight:'600'},
  subContent:{padding:20,paddingBottom:40},
  stepLabel:{fontSize:10,fontWeight:'800',letterSpacing:1.5,marginBottom:8},
  stepDesc:{fontSize:16,fontWeight:'700',marginBottom:24},
  codeBox:{borderRadius:20,borderWidth:1,padding:32,alignItems:'center',gap:20},
  codeInput:{fontSize:52,fontWeight:'900',letterSpacing:16,borderBottomWidth:3,paddingBottom:8,width:180,textAlign:'center'},
  codeError:{fontSize:13,fontWeight:'600'},
  actionBtn:{borderRadius:14,height:52,alignItems:'center',justifyContent:'center',paddingHorizontal:24,width:'100%'},
  actionBtnTxt:{color:'#fff',fontSize:14,fontWeight:'800'},
  foundCard:{borderRadius:16,borderWidth:1,padding:20,alignItems:'center',marginBottom:20},
  foundIcon:{fontSize:32,marginBottom:8},
  foundName:{fontSize:18,fontWeight:'900'},
  foundDept:{fontSize:13,marginTop:2},
  foundId:{fontSize:11,marginTop:4},
  fieldLabel:{fontSize:10,fontWeight:'700',letterSpacing:1,marginBottom:8,marginTop:4},
  inputRow:{flexDirection:'row',alignItems:'center',borderWidth:1.5,borderRadius:12,paddingHorizontal:14,height:52,marginBottom:16},
  inputIcon:{fontSize:16,marginRight:10},
  textInput:{flex:1,fontSize:15,fontWeight:'600'},
  driverCard:{flexDirection:'row',alignItems:'center',borderRadius:16,borderWidth:1,padding:16,marginBottom:10,gap:12,overflow:'hidden'},
  driverStripe:{position:'absolute',left:0,top:0,bottom:0,width:4},
  avatar:{alignItems:'center',justifyContent:'center'},
  avatarTxt:{fontSize:16,fontWeight:'800'},
  driverName:{fontSize:14,fontWeight:'800'},
  driverStatusTxt:{fontSize:12,fontWeight:'600'},
  assignArrow:{fontSize:13,fontWeight:'700'},
  whatsappNote:{flexDirection:'row',alignItems:'flex-start',gap:10,borderRadius:12,borderWidth:1,padding:14,marginBottom:8,marginTop:4},
  whatsappTxt:{flex:1,fontSize:12,lineHeight:17},
});
