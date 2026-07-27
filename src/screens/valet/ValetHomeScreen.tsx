import React, {useState} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Linking, Alert} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useAppState, Visitor} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon} from '../../components/Icon';
import {usersApi} from '../../services/api';
import {PUBLIC_BASE_URL} from '../../config/api';

function sendWhatsApp(mobile: string, name: string, carNumber: string, token: string, visitorId: string) {
  const trackingUrl = `${PUBLIC_BASE_URL}/track/${visitorId}`;
  const msg = `🏥 *KIMS Hospital Parking*\n\nHello ${name},\n\nYour car *${carNumber}* has been safely received by our valet service.\n\n📍 *Token:* ${token}\n\n_Track your car live:_\n${trackingUrl}\n\nWhen you're ready to leave, contact the valet desk to request your car back.\n\n_KIMS Smart Parking · Secure · Real-time_`;
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
  const {drivers, tasks, visitors, addTask, assignDriver, markKeyCollected, pushNotification, addVisitor,
    assignVisitorDriver, assignRetrievalDriver} = useAppState();
  const {colors, isDark} = useTheme();

  const [screen, setScreen] = useState<Screen>('home');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [foundUser, setFoundUser] = useState<any | null>(null);
  const [carNumber, setCarNumber] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  // Visitor-side counterpart to pendingTaskId — the 'assign' screen is
  // reused for both doctor tasks and visitor pickups/retrievals, since it's
  // the same "pick an available driver" interaction either way.
  const [pendingVisitorId, setPendingVisitorId] = useState<string | null>(null);
  const [pendingVisitorMode, setPendingVisitorMode] = useState<'park' | 'retrieve' | null>(null);

  const [vName, setVName] = useState('');
  const [vCar, setVCar] = useState('');
  const [vMobile, setVMobile] = useState('');

  // "Active Tasks" = already assigned to a driver — a bare 'requested'
  // retrieval isn't a task for anyone to act on yet, it's shown separately
  // below until the valet assigns a driver to it.
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'requested');
  const availableDrivers = drivers.filter(d => d.status === 'available');
  // Pending retrieval requests — created only by the doctor/staff who owns
  // the car (see ParkingScreen "Request Retrieval"). The valet's job here is
  // strictly to assign a driver to an existing request, never to invent one.
  const retrievalRequests = tasks.filter(t => t.type === 'retrieve' && t.status === 'requested');
  const activeVisitors = visitors.filter(v => v.status !== 'retrieved');
  // A visitor's driverId is reused from the park leg and isn't cleared until
  // retrieval completes, so it alone can't tell us whether a driver is
  // *actively* out on the retrieval right now — checking that driver's own
  // currentTaskId against this visitor is what disambiguates it. Mirrors the
  // same check the backend does in visitor.service.js assignRetrievalDriver.
  const hasActiveRetrievalDriver = (v: Visitor) => drivers.some(d => d.currentTaskId === v.id && d.status === 'busy');
  const pendingTask = pendingTaskId ? tasks.find(t => t.id === pendingTaskId) ?? null : null;
  const pendingVisitor = pendingVisitorId ? visitors.find(v => v.id === pendingVisitorId) ?? null : null;

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
    if (pendingVisitorId) {
      const visitor = visitors.find(v => v.id === pendingVisitorId);
      try {
        if (pendingVisitorMode === 'retrieve') {
          await assignRetrievalDriver(pendingVisitorId, driverId);
          pushNotification({
            targetRole: `driver:${driverId}`, targetId: driverId,
            title: '🔔 Visitor Retrieval!',
            body: `Bring ${visitor?.carNumber} from slot ${visitor?.slotId} back for ${visitor?.name}.`,
            type: 'alarm',
          });
        } else {
          await assignVisitorDriver(pendingVisitorId, driverId);
          pushNotification({
            targetRole: `driver:${driverId}`, targetId: driverId,
            title: '🔔 Visitor Car Pickup!',
            body: `Collect key from valet for ${visitor?.name}'s car (${visitor?.carNumber}).`,
            type: 'alarm',
          });
        }
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Something went wrong');
        return;
      }
      setPendingVisitorId(null); setPendingVisitorMode(null);
      setScreen('home');
      return;
    }

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

  const handleAssignRetrieval = (taskId: string) => {
    setPendingTaskId(taskId);
    setScreen('assign');
  };

  const handleAddVisitor = async () => {
    if (!vName.trim() || !vCar.trim() || !vMobile.trim()) return;
    try {
      const visitor = await addVisitor({name: vName.trim(), carNumber: vCar.trim().toUpperCase(), mobile: vMobile.trim()});
      sendWhatsApp(vMobile.trim(), vName.trim(), vCar.trim().toUpperCase(), visitor.token, visitor.id);
      setVName(''); setVCar(''); setVMobile('');
      // Straight into driver assignment — a token with nobody assigned to
      // collect the key is exactly the gap this flow used to leave open.
      setPendingVisitorId(visitor.id);
      setPendingVisitorMode('park');
      setScreen('assign');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleRequestVisitorRetrieval = (visitorId: string) => {
    setPendingVisitorId(visitorId);
    setPendingVisitorMode('retrieve');
    setScreen('assign');
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
          <TouchableOpacity onPress={() => { setScreen('home'); setPendingVisitorId(null); setPendingVisitorMode(null); }} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>Skip</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Assign Driver</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <Text style={[s.stepLabel, {color: colors.textMuted}]}>SELECT DRIVER</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>
            {pendingVisitor
              ? (pendingVisitorMode === 'retrieve'
                ? `Assign a driver to retrieve ${pendingVisitor.carNumber} from slot ${pendingVisitor.slotId} for ${pendingVisitor.name}`
                : `Tap a driver to collect the key and park ${pendingVisitor.name}'s car (${pendingVisitor.carNumber})`)
              : pendingTask?.type === 'retrieve'
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

        {/* Retrieval requests — raised only by the doctor/staff who owns the
            car (see ParkingScreen). The valet assigns a driver to each; they
            cannot start a retrieval on their own. */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary, marginTop: 20}]}>Retrieval Requests ({retrievalRequests.length})</Text>
        {retrievalRequests.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={s.emptyIcon}>🅿️</Text>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No pending retrieval requests</Text>
          </View>
        ) : retrievalRequests.map(t => (
          <View key={t.id} style={[s.taskCard, {backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.warning}]}>
            <View style={s.taskTop}>
              <View style={[s.typePill, {backgroundColor: colors.warning + '15'}]}>
                <Text style={[s.typePillTxt, {color: colors.warning}]}>🅿️ SLOT {t.slotId}</Text>
              </View>
              <Text style={[s.taskStatusTxt, {color: colors.warning}]}>{t.eta ? `Leaving in ${t.eta} min` : 'Requested'}</Text>
            </View>
            <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{t.doctorName}</Text>
            <Text style={[s.taskMeta, {color: colors.textSecondary}]}>🚘 {t.carNumber}</Text>
            <TouchableOpacity style={[s.taskActionBtn, {borderColor: colors.warning, backgroundColor: colors.warning + '12'}]}
              onPress={() => handleAssignRetrieval(t.id)}>
              <Text style={[s.taskActionTxt, {color: colors.warning}]}>↑ Assign Driver</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Visitors/patients — tokens generated via the Visitor flow. Each
            one is tracked here until retrieved, so it's always visible who
            (if anyone) has been assigned to take the keys. */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary, marginTop: 20}]}>Visitors ({activeVisitors.length})</Text>
        {activeVisitors.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={s.emptyIcon}>🎫</Text>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No active visitor tokens</Text>
          </View>
        ) : activeVisitors.map(v => {
          const needsDriver = v.status === 'parked' && v.retrievalRequested && !hasActiveRetrievalDriver(v);
          const vc = v.status === 'parked'
            ? (v.retrievalRequested ? (needsDriver ? colors.warning : colors.success) : colors.success)
            : colors.accent;
          const label = v.status === 'parked'
            ? (v.retrievalRequested
              ? (needsDriver ? 'Requested — needs driver' : `${v.driverName ?? 'Driver'} en route`)
              : `Parked · ${v.slotId ?? ''}`)
            : (v.driverName ? `${v.driverName} collecting key` : 'Waiting for driver');
          return (
            <View key={v.id} style={[s.taskCard, {backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: vc}]}>
              <View style={s.taskTop}>
                <View style={[s.typePill, {backgroundColor: vc + '15'}]}>
                  <Text style={[s.typePillTxt, {color: vc}]}>🎫 TOKEN {v.token}</Text>
                </View>
                <Text style={[s.taskStatusTxt, {color: vc}]}>{label}</Text>
              </View>
              <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{v.name}</Text>
              <Text style={[s.taskMeta, {color: colors.textSecondary}]}>🚘 {v.carNumber}</Text>
              {v.status === 'parked' && !v.retrievalRequested && (
                <TouchableOpacity style={[s.taskActionBtn, {borderColor: colors.warning, backgroundColor: colors.warning + '12'}]}
                  onPress={() => handleRequestVisitorRetrieval(v.id)}>
                  <Text style={[s.taskActionTxt, {color: colors.warning}]}>↑ Request Retrieval</Text>
                </TouchableOpacity>
              )}
              {needsDriver && (
                <TouchableOpacity style={[s.taskActionBtn, {borderColor: colors.warning, backgroundColor: colors.warning + '12'}]}
                  onPress={() => handleRequestVisitorRetrieval(v.id)}>
                  <Text style={[s.taskActionTxt, {color: colors.warning}]}>↑ Assign Driver — visitor is ready to leave</Text>
                </TouchableOpacity>
              )}
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
