import React, {useState, useRef, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, Linking, Alert, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon, IconName} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {DriverPickerList} from '../../components/DriverPickerList';
import {usersApi} from '../../services/api';
import {PUBLIC_BASE_URL} from '../../config/api';
import {useValetActions} from './useValetActions';
import {useAppState} from '../../context/AppStateContext';

function sendWhatsApp(mobile: string, name: string, carNumber: string | undefined, token: string, publicToken: string) {
  const trackingUrl = `${PUBLIC_BASE_URL}/track/${publicToken}`;
  const vehicleLine = carNumber ? `Your car *${carNumber}*` : 'Your vehicle';
  const msg = `🏥 *KIMS Hospital Parking*\n\nHello ${name},\n\n${vehicleLine} has been safely received by our valet service.\n\n📍 *Token:* ${token}\n_Please don't lose this token._\n\n_Track your car live:_\n${trackingUrl}\n\nWhen you're ready to leave, contact the valet desk to request your car back.\n\n_KIMS Smart Parking · Secure · Real-time_`;
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

type Screen = 'home' | 'scan' | 'assign' | 'visitor' | 'retrievals';

export function ValetHomeScreen() {
  const {user} = useAuth();
  const {drivers, tasks, visitors, addTask, addVisitor, markKeyCollected, pushNotification,
    activeTasks, availableDrivers, retrievalRequests, assignTaskDriver, assignVisitorPickupDriver,
    confirmTaskDelivered} = useValetActions();
  const {colors, isDark} = useTheme();

  const [screen, setScreen] = useState<Screen>('home');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [foundUser, setFoundUser] = useState<any | null>(null);
  const [carNumber, setCarNumber] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  // Visitor-side counterpart to pendingTaskId — a freshly-created visitor
  // token also needs a driver assigned right away to collect the key.
  const [pendingVisitorId, setPendingVisitorId] = useState<number | null>(null);

  const [vName, setVName] = useState('');
  const [vCar, setVCar] = useState('');
  const [vMobile, setVMobile] = useState('');
  const [vVehicleType, setVVehicleType] = useState<'car' | 'bike'>('car');
  // Which input currently has the keyboard — drives the focus ring so the
  // active field visibly "wakes up" instead of looking like a static box.
  const [focused, setFocused] = useState<string | null>(null);
  // Return-key chaining: enter on one field jumps to the next.
  const fieldRefs = useRef<Record<string, TextInput | null>>({});

  const pendingVisitor = pendingVisitorId ? visitors.find(v => v.id === pendingVisitorId) ?? null : null;
  const pendingTask = pendingTaskId ? tasks.find(t => t.id === pendingTaskId) ?? null : null;

  // Accept-timeout / reject prompt: the backend watchdog (or the driver's
  // explicit reject) freed the job and asked us — the valet — to pick
  // another driver. Confirming jumps straight into the assign screen.
  const {reassignPrompt, clearReassignPrompt} = useAppState();
  useEffect(() => {
    if (!reassignPrompt) return;
    const what = reassignPrompt.kind === 'task'
      ? `${reassignPrompt.task?.carNumber ?? 'this car'} (${reassignPrompt.task?.doctorName ?? ''})`
      : `${reassignPrompt.visitor?.name ?? 'this visitor'}'s car`;
    const why = reassignPrompt.rejected ? 'rejected the job' : "didn't accept in time";
    Alert.alert(
      '⚠️ Driver did not accept',
      `${reassignPrompt.driverName} ${why} for ${what}. Assign another driver?`,
      [
        {text: 'Later', style: 'cancel', onPress: clearReassignPrompt},
        {
          text: 'Reassign now',
          onPress: () => {
            if (reassignPrompt.kind === 'task' && reassignPrompt.task) {
              setPendingVisitorId(null);
              setPendingTaskId(reassignPrompt.task.id);
            } else if (reassignPrompt.visitor) {
              setPendingTaskId(null);
              setPendingVisitorId(reassignPrompt.visitor.id);
            }
            setScreen('assign');
            clearReassignPrompt();
          },
        },
      ],
    );
  }, [reassignPrompt, clearReassignPrompt]);

  const handleScanCode = async () => {
    setCodeError('');
    const trimmed = code.trim();
    try {
      const found = await usersApi.lookupByCardCode(trimmed);
      setCode('');
      // Staff already set their car number up on their own login — if it's
      // on file, skip straight to driver assignment instead of asking the
      // valet to retype something that's already known.
      if (found.carNumber?.trim()) {
        await createKeyTask(found, found.carNumber.trim());
      } else {
        setFoundUser(found);
        setCarNumber('');
      }
    } catch (err) {
      setCodeError('No user found with this code');
    }
  };

  const createKeyTask = async (user: any, plate: string) => {
    try {
      const id = await addTask({
        type: 'park',
        doctorId: user.id,
        doctorName: user.name,
        carNumber: plate.toUpperCase(),
        status: 'assigned',
        assignedAt: Date.now(),
      });
      setPendingTaskId(id);
      pushNotification({
        targetRole: 'driver',
        title: '🚗 New Parking Task',
        body: `Car ${plate.toUpperCase()} — ${user.name}. Report to valet counter.`,
        type: 'info',
      });
      setFoundUser(null); setCarNumber('');
      setScreen('assign');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleKeyReceived = async () => {
    if (!foundUser || !carNumber.trim()) return;
    await createKeyTask(foundUser, carNumber.trim());
  };

  const handleAssignDriver = async (driverId: number) => {
    try {
      if (pendingVisitorId) {
        await assignVisitorPickupDriver(pendingVisitorId, driverId);
        setPendingVisitorId(null);
      } else if (pendingTaskId) {
        await assignTaskDriver(pendingTaskId, driverId);
        setFoundUser(null); setCarNumber(''); setPendingTaskId(null);
      } else {
        return;
      }
      setScreen('home');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleAddVisitor = async () => {
    if (!vName.trim() || !vMobile.trim()) return;
    try {
      const visitor = await addVisitor({
        name: vName.trim(),
        carNumber: vCar.trim() ? vCar.trim().toUpperCase() : undefined,
        mobile: vMobile.trim(),
        vehicleType: vVehicleType,
      });
      sendWhatsApp(vMobile.trim(), vName.trim(), visitor.carNumber, visitor.token, visitor.publicToken);
      setVName(''); setVCar(''); setVMobile(''); setVVehicleType('car');
      // Straight into driver assignment — a token with nobody assigned to
      // collect the key is exactly the gap this flow used to leave open.
      setPendingVisitorId(visitor.id);
      setScreen('assign');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleAssignRetrieval = (taskId: number) => {
    setPendingTaskId(taskId);
    setScreen('assign');
  };

  const handleConfirmTaskDelivered = async (taskId: number) => {
    try {
      await confirmTaskDelivered(taskId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not confirm handover');
    }
  };

  // ── SCAN / KEY COLLECTION ──────────────────────────────────────────────
  if (screen === 'scan') {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.headerCompact}>
          <PressableScale onPress={() => { setScreen('home'); setFoundUser(null); setCode(''); setCodeError(''); }} style={[s.circleBack, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="back" size={18} color={colors.textPrimary} />
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Key Collection</Text>
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          {!foundUser ? (
            <>
              <Text style={[s.stepLabel, {color: colors.textMuted}]}>STEP 1 — IDENTIFY</Text>
              <Text style={[s.stepDesc, {color: colors.textPrimary}]}>Enter the 3-digit code from the doctor/staff card</Text>
              <View style={[s.codeBox, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                {/* OTP-style code entry — three visible cells that fill per
                    digit, driven by one invisible TextInput stretched over
                    them so tapping anywhere focuses the keyboard. */}
                <View style={s.otpRow}>
                  {[0, 1, 2].map(i => {
                    const digit = code[i];
                    const active = focused === 'code' && code.length === i;
                    return (
                      <View key={i} style={[
                        s.otpCell,
                        {backgroundColor: colors.background, borderColor: active ? colors.textPrimary : colors.border, borderWidth: active ? 2 : 1.5},
                      ]}>
                        {digit
                          ? <Text style={[s.otpDigit, {color: colors.textPrimary}]}>{digit}</Text>
                          : <View style={[s.otpDot, {backgroundColor: colors.textMuted}]} />}
                      </View>
                    );
                  })}
                  <TextInput
                    style={s.otpHidden}
                    value={code}
                    onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 3)); setCodeError(''); }}
                    onFocus={() => setFocused('code')}
                    onBlur={() => setFocused(null)}
                    keyboardType="numeric"
                    maxLength={3}
                    caretHidden
                    autoFocus
                  />
                </View>
                {!!codeError && <Text style={[s.codeError, {color: colors.error}]}>{codeError}</Text>}
                <PressableScale
                  style={[s.actionBtn, {backgroundColor: code.length === 3 ? colors.primary : colors.cardAlt}]}
                  onPress={handleScanCode} disabled={code.length !== 3}
                >
                  <Text style={[s.actionBtnTxt, {color: code.length === 3 ? colors.textOnPrimary : colors.textMuted}]}>Find Customer</Text>
                  <Icon name="arrowRight" size={15} color={code.length === 3 ? colors.textOnPrimary : colors.textMuted} />
                </PressableScale>
              </View>
            </>
          ) : (
            <>
              <Text style={[s.stepLabel, {color: colors.textMuted}]}>STEP 2 — CONFIRM & COLLECT KEY</Text>
              <View style={[s.foundCard, {backgroundColor: colors.success + '12', borderColor: colors.success + '40'}]}>
                <View style={[s.foundIconWrap, {backgroundColor: colors.successLight}]}>
                  <Icon name="check" size={26} color={colors.success} />
                </View>
                <Text style={[s.foundName, {color: colors.textPrimary}]}>{foundUser.name}</Text>
                <Text style={[s.foundDept, {color: colors.textSecondary}]}>{foundUser.department ?? foundUser.role}</Text>
                <Text style={[s.foundId, {color: colors.textMuted}]}>ID: {foundUser.employeeId}</Text>
              </View>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>CAR NUMBER PLATE</Text>
              <View style={[s.inputRow, {borderColor: focused === 'plate' ? colors.textPrimary : colors.border, backgroundColor: colors.surface}]}>
                <View style={[s.inputIconWrap, {backgroundColor: colors.cardAlt}]}>
                  <Icon name="car" size={16} color={focused === 'plate' ? colors.textPrimary : colors.textMuted} />
                </View>
                <TextInput style={[s.textInput, {color: colors.textPrimary}]} value={carNumber}
                  onChangeText={setCarNumber} placeholder="e.g. TN09 AB 1234"
                  onFocus={() => setFocused('plate')} onBlur={() => setFocused(null)}
                  returnKeyType="done"
                  onSubmitEditing={() => carNumber.trim() && handleKeyReceived()}
                  placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
              </View>
              <PressableScale
                style={[s.actionBtn, {backgroundColor: carNumber.trim() ? colors.primary : colors.cardAlt}]}
                onPress={handleKeyReceived} disabled={!carNumber.trim()}
              >
                <Icon name="check" size={15} color={carNumber.trim() ? colors.textOnPrimary : colors.textMuted} />
                <Text style={[s.actionBtnTxt, {color: carNumber.trim() ? colors.textOnPrimary : colors.textMuted}]}>Key Received — Assign Driver</Text>
              </PressableScale>
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
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.header}>
          <PressableScale onPress={() => { setScreen('home'); setPendingVisitorId(null); }} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>Skip</Text>
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Assign Driver</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <Text style={[s.stepLabel, {color: colors.textMuted}]}>SELECT DRIVER</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>
            {pendingVisitor
              ? `Tap a driver to collect the key and park ${pendingVisitor.name}'s car (${pendingVisitor.carNumber})`
              : pendingTask?.type === 'retrieve'
              ? `Assign a driver to retrieve ${pendingTask.carNumber} from slot ${pendingTask.slotId}`
              : 'Tap a driver to assign this parking task'}
          </Text>
          <DriverPickerList drivers={availableDrivers} onAssign={handleAssignDriver} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── RETRIEVAL REQUESTS ───────────────────────────────────────────────
  if (screen === 'retrievals') {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.headerCompact}>
          <PressableScale onPress={() => setScreen('home')} style={[s.circleBack, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="back" size={18} color={colors.textPrimary} />
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Retrieval Requests</Text>
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          {retrievalRequests.length === 0 ? (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Icon name="inbox" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No retrieval requests right now.</Text>
            </View>
          ) : retrievalRequests.map(t => (
            <View key={t.id} style={[s.taskCard, {backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.warning}]}>
              <View style={s.taskTop}>
                <View style={[s.typePill, {backgroundColor: colors.warning + '15'}]}>
                  <Icon name="parking" size={11} color={colors.warning} />
                  <Text style={[s.typePillTxt, {color: colors.warning}]}>SLOT {t.slotId}</Text>
                </View>
                <Text style={[s.taskStatusTxt, {color: colors.warning}]}>{t.eta ? `Leaving in ${t.eta} min` : 'Requested'}</Text>
              </View>
              <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{t.doctorName}</Text>
              <View style={s.taskMetaRow}>
                <Icon name="car" size={12} color={colors.textSecondary} />
                <Text style={[s.taskMeta, {color: colors.textSecondary}]}>{t.carNumber}</Text>
              </View>
              <PressableScale style={[s.taskActionBtn, {borderColor: colors.warning, backgroundColor: colors.warning + '12'}]}
                onPress={() => handleAssignRetrieval(t.id)}>
                <Icon name="arrowUp" size={13} color={colors.warning} />
                <Text style={[s.taskActionTxt, {color: colors.warning}]}>Assign Driver</Text>
              </PressableScale>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── VISITOR ────────────────────────────────────────────────────────────
  if (screen === 'visitor') {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.headerCompact}>
          <PressableScale onPress={() => setScreen('home')} style={[s.circleBack, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="back" size={18} color={colors.textPrimary} />
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Visitor / Patient</Text>
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          <Text style={[s.stepLabel, {color: colors.textMuted}]}>VISITOR DETAILS</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>WhatsApp tracking link will be sent automatically</Text>
          {[
            {key: 'name', label: 'Full Name', icon: 'user' as IconName, val: vName, set: setVName, ph: 'Patient / Visitor name', kb: 'default' as const},
            {key: 'mobile', label: 'Mobile Number', icon: 'phone' as IconName, val: vMobile, set: setVMobile, ph: '10-digit number', kb: 'numeric' as const},
            {key: 'car', label: 'Car Number (optional)', icon: 'car' as IconName, val: vCar, set: setVCar, ph: 'e.g. TN09 AB 1234', kb: 'default' as const},
          ].map((f, i, arr) => {
            const nextKey = arr[i + 1]?.key;
            return (
              <View key={f.key} style={{marginBottom: 4}}>
                <Text style={[s.fieldLabel, {color: colors.textMuted}]}>{f.label.toUpperCase()}</Text>
                <View style={[s.inputRow, {borderColor: focused === f.key ? colors.textPrimary : colors.border, backgroundColor: colors.surface}]}>
                  <View style={[s.inputIconWrap, {backgroundColor: colors.cardAlt}]}>
                    <Icon name={f.icon} size={16} color={focused === f.key ? colors.textPrimary : colors.textMuted} />
                  </View>
                  <TextInput style={[s.textInput, {color: colors.textPrimary}]} value={f.val} onChangeText={f.set}
                    ref={r => { fieldRefs.current[f.key] = r; }}
                    onFocus={() => setFocused(f.key)} onBlur={() => setFocused(null)}
                    returnKeyType={nextKey ? 'next' : 'done'}
                    blurOnSubmit={!nextKey}
                    onSubmitEditing={() => nextKey && fieldRefs.current[nextKey]?.focus()}
                    placeholder={f.ph} placeholderTextColor={colors.textMuted}
                    keyboardType={f.kb} autoCapitalize={f.kb === 'default' ? 'words' : 'none'} />
                </View>
              </View>
            );
          })}
          <Text style={[s.fieldLabel, {color: colors.textMuted}]}>VEHICLE TYPE</Text>
          <View style={{flexDirection: 'row', gap: 10, marginBottom: 16}}>
            {(['car', 'bike'] as const).map(t => {
              const on = vVehicleType === t;
              return (
                <PressableScale key={t} onPress={() => setVVehicleType(t)}
                  style={[s.segment, {backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border}]}>
                  <Icon name={t === 'car' ? 'car' : 'bike'} size={16} color={on ? colors.textOnPrimary : colors.textSecondary} />
                  <Text style={[s.segmentTxt, {color: on ? colors.textOnPrimary : colors.textSecondary}]}>{t === 'car' ? 'Car' : 'Bike'}</Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={[s.whatsappNote, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="whatsapp" size={17} color="#25D366" />
            <Text style={[s.whatsappTxt, {color: colors.textSecondary}]}>
              Live tracking link + parking status will be sent to {vMobile || 'their number'} via WhatsApp.
            </Text>
          </View>
          <PressableScale
            style={[s.actionBtn, {backgroundColor: (vName && vMobile.length >= 10) ? colors.primary : colors.cardAlt, marginTop: 8}]}
            onPress={handleAddVisitor} disabled={!(vName && vMobile.length >= 10)}
          >
            <Icon name="whatsapp" size={17} color={(vName && vMobile.length >= 10) ? colors.textOnPrimary : colors.textMuted} />
            <Text style={[s.actionBtnTxt, {color: (vName && vMobile.length >= 10) ? colors.textOnPrimary : colors.textMuted}]}>Generate Token & Send WhatsApp</Text>
          </PressableScale>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── HOME (Queue) ─────────────────────────────────────────────────────
  const busyDrivers = drivers.filter(d => d.status === 'busy').length;
  const offDrivers = drivers.filter(d => d.status === 'off').length;
  const completedToday = drivers.reduce((sum, d) => sum + (d.completedToday ?? 0), 0);
  const todayLabel = new Date().toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'});

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? BRAND_GRADIENT_DARK[0] : BRAND_GRADIENT[0]} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT} style={s.gradHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
          <View style={s.gradTopRow}>
            <View>
              <Text style={s.gradGreetSub}>{todayLabel}</Text>
              <Text style={s.gradGreetName}>{user?.name}</Text>
            </View>
            <PressableScale style={s.inboxBtn} onPress={() => setScreen('retrievals')}>
              <Icon name="inbox" size={20} color="#fff" />
              {retrievalRequests.length > 0 && (
                <View style={s.inboxBadge}>
                  <Text style={s.inboxBadgeTxt}>{retrievalRequests.length > 9 ? '9+' : retrievalRequests.length}</Text>
                </View>
              )}
            </PressableScale>
          </View>
          <View style={s.statRow}>
            <View style={s.statItem}>
              <Text style={s.statNum}>{availableDrivers.length}</Text>
              <Text style={s.statLbl}>Ready</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{busyDrivers}</Text>
              <Text style={s.statLbl}>On task</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{offDrivers}</Text>
              <Text style={s.statLbl}>Off duty</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{completedToday}</Text>
              <Text style={s.statLbl}>Done today</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={s.body}>
        {/* Retrieval requests now live on their own page — see the inbox
            icon (with badge count) in the header above, and the
            screen === 'retrievals' block. */}

        {/* Primary CTA buttons */}
        <View style={s.primaryRow}>
          <PressableScale style={[s.primaryBtn, {backgroundColor: colors.primary}]} onPress={() => setScreen('scan')}>
            <View style={s.primaryIconWrap}><Icon name="key" size={26} color="#fff" /></View>
            <Text style={s.primaryBtnTxt}>Staff</Text>
            <Text style={s.primaryBtnSub} numberOfLines={2}>Collect key from doctor / staff</Text>
          </PressableScale>
          <PressableScale style={[s.primaryBtn, {backgroundColor: colors.accent}]} onPress={() => setScreen('visitor')}>
            <View style={s.primaryIconWrap}><Icon name="ticket" size={26} color="#fff" /></View>
            <Text style={s.primaryBtnTxt}>Visitor</Text>
            <Text style={s.primaryBtnSub} numberOfLines={2}>Patient / VIP token</Text>
          </PressableScale>
        </View>

        {/* Driver status */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Driver Status ({drivers.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal: -20, marginBottom: 20}} contentContainerStyle={{paddingHorizontal: 20, gap: 10}}>
          {drivers.map(d => {
            const sc = d.status === 'available' ? colors.success : d.status === 'busy' ? colors.warning : colors.textMuted;
            const sl = d.status === 'available' ? 'Ready' : d.status === 'busy' ? 'On task' : 'Off duty';
            return (
              <View key={d.id} style={[s.driverPill, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                <View style={[s.driverPillTop, {borderBottomColor: colors.divider}]}>
                  <View style={[s.driverAvatar, {backgroundColor: sc + '14'}]}>
                    <Text style={[s.avatarTxt, {color: sc}]}>{d.name[0]}</Text>
                  </View>
                  <Text style={[s.driverPillName, {color: colors.textPrimary}]} numberOfLines={1}>{d.name.split(' ')[0]}</Text>
                </View>
                <View style={s.driverPillBottom}>
                  <Text style={[s.driverPillStatus, {color: sc}]}>{sl}</Text>
                  <Text style={[s.driverPillMeta, {color: colors.textMuted}]}>{d.completedToday ?? 0} today</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Job Queue — every task from assignment through to the valet's
            final confirmation that the owner actually took the car back.
            One card per job, one contextual action button that changes as
            the job's own stage changes — no separate panel for "needs a
            driver" vs "needs confirming"; it's all still the same job. */}
        <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Job Queue ({activeTasks.length})</Text>
        {activeTasks.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Icon name="check" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>All clear — no active jobs</Text>
          </View>
        ) : activeTasks.map(t => {
          const tc = t.type === 'park' ? colors.primary : colors.warning;
          // 'assigned' is the task's status from creation — it does NOT by
          // itself mean a driver has been picked (a park task starts here
          // with no driver, and a rejected/timed-out driver rolls a park
          // task back to 'assigned' with driverId cleared rather than a
          // separate status). Whether a driver is actually attached has to
          // come from driverId, not the status string.
          const needsDriver = t.status === 'assigned' && !t.driverId;
          // Car's back at the counter, but nothing's confirmed the handover
          // yet — the one stage on this whole screen that's actually
          // time-sensitive right now, so the card itself gets highlighted.
          const needsConfirm = t.status === 'delivered';
          const sl: Record<string,string> = {
            assigned: needsDriver ? 'Awaiting driver' : 'Driver assigned',
            key_collected:'Driver has key', in_transit:'In transit',
            delivered: 'Awaiting pickup confirmation', completed:'Done',
          };
          return (
            <View key={t.id} style={[
              s.taskCard,
              {backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: tc},
              needsConfirm && {borderWidth: 2, borderColor: colors.warning},
            ]}>
              <View style={s.taskTop}>
                <View style={[s.typePill, {backgroundColor: tc + '15'}]}>
                  <Icon name={t.type === 'park' ? 'arrowDown' : 'arrowUp'} size={11} color={tc} />
                  <Text style={[s.typePillTxt, {color: tc}]}>{t.type === 'park' ? 'PARK' : 'RETRIEVE'}</Text>
                </View>
                <Text style={[s.taskStatusTxt, {color: tc}]}>{sl[t.status]}</Text>
              </View>
              <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{t.doctorName}</Text>
              <View style={s.taskMetaRow}>
                <Icon name="car" size={12} color={colors.textSecondary} />
                <Text style={[s.taskMeta, {color: colors.textSecondary}]}>{t.carNumber}{t.slotId ? ` · Slot ${t.slotId}` : ''}</Text>
              </View>
              {!!t.driverName && <Text style={[s.taskDriverTxt, {color: colors.textMuted}]}>Driver: {t.driverName}</Text>}
              {needsDriver && (
                <PressableScale style={[s.taskActionBtn, {borderColor: colors.warning, backgroundColor: colors.warning + '12'}]}
                  onPress={() => handleAssignRetrieval(t.id)}>
                  <Icon name="arrowUp" size={13} color={colors.warning} />
                  <Text style={[s.taskActionTxt, {color: colors.warning}]}>Assign Driver</Text>
                </PressableScale>
              )}
              {t.status === 'assigned' && !needsDriver && t.type === 'park' && (
                <PressableScale style={[s.taskActionBtn, {borderColor: colors.success, backgroundColor: colors.success + '10'}]}
                  onPress={() => markKeyCollected(t.id)}>
                  <Icon name="check" size={13} color={colors.success} />
                  <Text style={[s.taskActionTxt, {color: colors.success}]}>Mark Key Handed to Driver</Text>
                </PressableScale>
              )}
              {needsConfirm && (
                <PressableScale style={[s.taskActionBtn, {borderColor: colors.success, backgroundColor: colors.success}]}
                  onPress={() => handleConfirmTaskDelivered(t.id)}>
                  <Icon name="checkBold" size={13} color="#fff" />
                  <Text style={[s.taskActionTxt, {color: '#fff'}]}>Confirm Handed to Owner</Text>
                </PressableScale>
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
  gradHeader:{paddingTop:16,paddingBottom:20,paddingHorizontal:20},
  gradTopRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  gradGreetSub:{color:'rgba(255,255,255,0.65)',fontSize:12,fontWeight:'600'},
  gradGreetName:{color:'#fff',fontSize:24,fontWeight:'900',marginTop:2,marginBottom:18},
  inboxBtn:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.18)'},
  inboxBadge:{position:'absolute',top:-4,right:-4,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:'#E53935',alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:'#fff'},
  inboxBadgeTxt:{color:'#fff',fontSize:10,fontWeight:'800'},
  statRow:{flexDirection:'row',alignItems:'center'},
  statItem:{flex:1},
  statNum:{color:'#fff',fontSize:20,fontWeight:'900'},
  statLbl:{color:'rgba(255,255,255,0.6)',fontSize:11,fontWeight:'600',marginTop:2},
  statDivider:{width:1,height:28,backgroundColor:'rgba(255,255,255,0.15)',marginHorizontal:4},

  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,paddingTop:20},
  headerCompact:{flexDirection:'row',alignItems:'center',gap:12,padding:16,paddingTop:20},
  circleBack:{width:36,height:36,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},
  backBtn:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:10,borderWidth:1,paddingHorizontal:12,paddingVertical:8},
  backTxt:{fontSize:13,fontWeight:'700'},
  headerTitle:{fontSize:17,fontWeight:'900'},

  primaryRow:{flexDirection:'row',gap:12,marginBottom:24},
  primaryBtn:{flex:1,borderRadius:18,padding:20,alignItems:'center'},
  primaryIconWrap:{width:52,height:52,borderRadius:16,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',marginBottom:8},
  primaryBtnTxt:{color:'#fff',fontSize:15,fontWeight:'800'},
  primaryBtnSub:{color:'rgba(255,255,255,0.7)',fontSize:11,lineHeight:14,marginTop:4,height:28,textAlign:'center'},
  sectionTitle:{fontSize:14,fontWeight:'800',marginBottom:12},
  driverPill:{borderRadius:16,borderWidth:1,width:128,overflow:'hidden'},
  driverPillTop:{flexDirection:'row',alignItems:'center',gap:8,padding:12,borderBottomWidth:1},
  driverAvatar:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},
  driverPillName:{flex:1,fontSize:13,fontWeight:'800'},
  driverPillBottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:12,paddingVertical:8},
  driverPillStatus:{fontSize:11,fontWeight:'700'},
  driverPillMeta:{fontSize:10,fontWeight:'600'},
  taskCard:{borderRadius:16,borderWidth:1,borderLeftWidth:4,padding:16,marginBottom:10},
  taskTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  typePill:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:6,paddingHorizontal:8,paddingVertical:3},
  typePillTxt:{fontSize:10,fontWeight:'800',letterSpacing:0.5},
  taskStatusTxt:{fontSize:11,fontWeight:'700'},
  taskDoctor:{fontSize:14,fontWeight:'800',marginBottom:2},
  taskMetaRow:{flexDirection:'row',alignItems:'center',gap:5,marginBottom:4},
  taskMeta:{fontSize:12,fontWeight:'600'},
  taskDriverTxt:{fontSize:11,marginBottom:8},
  taskActionBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:10,borderWidth:1,paddingVertical:10},
  taskActionTxt:{fontSize:12,fontWeight:'700'},
  emptyBox:{borderRadius:14,borderWidth:1,borderStyle:'dashed',padding:24,alignItems:'center',marginBottom:16},
  emptyTxt:{fontSize:13,fontWeight:'600'},
  subContent:{padding:20,paddingBottom:40},
  stepLabel:{fontSize:10,fontWeight:'800',letterSpacing:1.5,marginBottom:8},
  stepDesc:{fontSize:16,fontWeight:'700',marginBottom:24},
  codeBox:{borderRadius:20,borderWidth:1,padding:32,alignItems:'center',gap:20},
  otpRow:{flexDirection:'row',gap:14},
  otpCell:{width:60,height:72,borderRadius:16,alignItems:'center',justifyContent:'center'},
  otpDigit:{fontSize:34,fontWeight:'900'},
  otpDot:{width:10,height:10,borderRadius:5},
  otpHidden:{position:'absolute',top:0,left:0,right:0,bottom:0,opacity:0,fontSize:1},
  codeError:{fontSize:13,fontWeight:'600'},
  actionBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:14,height:52,paddingHorizontal:24,width:'100%'},
  actionBtnTxt:{fontSize:14,fontWeight:'800'},
  foundCard:{borderRadius:16,borderWidth:1,padding:20,alignItems:'center',marginBottom:20},
  foundIconWrap:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',marginBottom:8},
  foundName:{fontSize:18,fontWeight:'900'},
  foundDept:{fontSize:13,marginTop:2},
  foundId:{fontSize:11,marginTop:4},
  fieldLabel:{fontSize:10,fontWeight:'700',letterSpacing:1,marginBottom:8,marginTop:4},
  segment:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderWidth:1.5,borderRadius:14,height:50},
  segmentTxt:{fontSize:14,fontWeight:'800'},
  inputRow:{
    flexDirection:'row',alignItems:'center',borderWidth:1.5,borderRadius:14,paddingHorizontal:10,height:58,marginBottom:16,
    shadowColor:'#000',shadowOffset:{width:0,height:3},shadowOpacity:0.06,shadowRadius:8,elevation:2,
  },
  inputIconWrap:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',marginRight:10},
  textInput:{flex:1,fontSize:15,fontWeight:'600'},
  avatarTxt:{fontSize:16,fontWeight:'800'},
  whatsappNote:{flexDirection:'row',alignItems:'flex-start',gap:10,borderRadius:12,borderWidth:1,padding:14,marginBottom:8,marginTop:4},
  whatsappTxt:{flex:1,fontSize:12,lineHeight:17},
});
