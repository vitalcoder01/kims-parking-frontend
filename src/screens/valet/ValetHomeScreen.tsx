import React, {useState, useRef, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, StatusBar, ActivityIndicator} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon, IconName} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {DriverPickerList} from '../../components/DriverPickerList';
import {usersApi, tasksApi, visitorsApi, isJobGone} from '../../services/api';
import {formatPlate, isCompletePlate} from '../../utils/plate';
import {VehicleNumberInput} from '../../components/VehicleNumberInput';
import {useValetActions, isMyJobToRun} from './useValetActions';
import type {ParkingTask} from '../../context/AppStateContext';
import {useAppState} from '../../context/AppStateContext';
import {SkeletonCard} from '../../components/Skeleton';
import {
  plannedDepartureLabel, departurePriority, minutesUntilDeparture, departureClockLabel,
  isScheduled, startsInLabel,
  enRouteSeconds, agoLabel, fmtDuration,
} from '../../utils/retrievalClocks';


type Screen = 'home' | 'scan' | 'assign' | 'visitor' | 'retrievals';

type InboxTab = 'all' | 'now' | 'soon' | 'later';
type QueueTab = 'mine' | 'team';
type InboxSection = 'retrievals' | 'arrivals';
const INBOX_TABS: {key: InboxTab; label: string}[] = [
  {key: 'all',   label: 'All'},
  {key: 'now',   label: 'Now'},
  {key: 'soon',  label: 'Soon'},
  {key: 'later', label: 'Later'},
];
// Bands over the time REMAINING, not the number the doctor originally picked.
// A doctor can now name a time up to 24h out, so the stored offset decays: a
// request made at 09:00 for 18:00 must read "9 hr" at 09:00 and "10 min" at
// 17:50, and must move from Later to Now on its own. Banding on the stored
// value would leave it parked in Later all day and then fire with no warning.
//
// A request with no departure value (legacy row, or an older server) lands in
// "later" rather than vanishing from every filtered tab.
function inboxBand(left: number | null): Exclude<InboxTab, 'all'> {
  if (left == null) return 'later';
  if (left <= 0) return 'now';
  if (left <= 20) return 'soon';
  return 'later';
}

// Planned-departure badge colours, most urgent first. This shows ONLY when
// the doctor intends to leave — it is not a delivery estimate.
function departureTone(left: number | null, c: any): string {
  if (left == null) return c.textMuted;
  if (left <= 0) return c.error;      // due, or overdue
  if (left <= 10) return '#F97316';   // orange
  if (left <= 20) return c.warning;   // yellow
  if (left <= 30) return c.info ?? '#3B82F6';
  return c.success;                   // furthest out — least urgent
}

export function ValetHomeScreen() {
  const dialog = useDialog();
  const {user} = useAuth();
  const {drivers, tasks, visitors, addTask, addVisitor, markKeyCollected,
    activeTasks, availableDrivers, retrievalRequests, assignTaskDriver, assignVisitorPickupDriver,
    cancelTaskAssignment,
    confirmTaskDelivered, cancelTask, recallTask, arrivalNotices, dismissArrivalNotice,
    acceptRetrieval, myValetId} = useValetActions();
  const {hydrated} = useAppState();
  const {colors, isDark} = useTheme();

  const [screen, setScreen] = useState<Screen>('home');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [foundUser, setFoundUser] = useState<any | null>(null);
  const [carNumber, setCarNumber] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Visitor-side counterpart to pendingTaskId — a freshly-created visitor
  // token also needs a driver assigned right away to collect the key.
  const [pendingVisitorId, setPendingVisitorId] = useState<number | null>(null);

  const [vName, setVName] = useState('');
  const [vCar, setVCar] = useState('');
  const [vMobile, setVMobile] = useState('');
  const [vVehicleType, setVVehicleType] = useState<'car' | 'bike'>('car');
  // Mobile is the one field that must be right — it is how the token and the
  // tracking link reach them. Validated inline, but only complained about
  // once they've actually typed something and moved on.
  const [mobileTouched, setMobileTouched] = useState(false);
  const vMobileDigits = vMobile.replace(/\D/g, '');
  const mobileValid = vMobileDigits.length === 10;
  // The plate is how the car is found later — at the desk, in the car park,
  // and in search. Required, but only non-empty: a foreign or temporary
  // registration is still a real plate, and refusing it would strand a car
  // the valet is physically looking at.
  // A complete, parseable Indian plate — not merely non-empty. The valet is
  // reading it off the car in front of them, so a half-typed one is a slip
  // rather than an edge case worth accepting.
  const carValid = isCompletePlate(vCar);
  const [carTouched, setCarTouched] = useState(false);
  const canCheckIn = mobileValid && carValid;

  // Which input currently has the keyboard — drives the focus ring so the
  // active field visibly "wakes up" instead of looking like a static box.
  const [focused, setFocused] = useState<string | null>(null);
  // Assign-driver screen: search box + a real (not decorative) sort toggle —
  // 'suggested' keeps the least-busy-first order useValetActions already
  // computes; 'name' re-sorts alphabetically for a valet who knows exactly
  // who they want and would rather scan a fixed order than a shifting one.
  const [driverSearch, setDriverSearch] = useState('');
  const [assigningDriverId, setAssigningDriverId] = useState<number | null>(null);
  // Which job's pending assignment is being cancelled right now — guards
  // against a double-tap firing the cancel-assignment call twice.
  const [cancellingAssignmentId, setCancellingAssignmentId] = useState<number | null>(null);
  // Same guard pattern for the other one-tap job actions that had none at
  // all — a slow response left the button tappable and a second tap either
  // fired a genuine duplicate (arrival -> two key tasks) or hit the server
  // after the first tap already finished the job ("task is currently
  // completed"), which is confusing rather than informative.
  const [confirmingTaskId, setConfirmingTaskId] = useState<number | null>(null);
  const [collectingKeyTaskId, setCollectingKeyTaskId] = useState<number | null>(null);
  const [arrivingId, setArrivingId] = useState<number | null>(null);
  const [assigningToId, setAssigningToId] = useState<number | null>(null);
  // Read from async callbacks that would otherwise close over stale values.
  const assigningDriverIdRef = useRef<number | null>(null);
  assigningDriverIdRef.current = assigningDriverId;
  const screenRef = useRef<Screen>('home');
  screenRef.current = screen;
  const pendingTaskIdRef = useRef<number | null>(null);
  pendingTaskIdRef.current = pendingTaskId;
  const [inboxTab, setInboxTab] = useState<InboxTab>('all');
  // The inbox holds both kinds of incoming request. Retrievals are work;
  // arrivals are information — separated so a flood of arrivals can never
  // push a waiting car off the screen.
  const [inboxSection, setInboxSection] = useState<InboxSection>('retrievals');
  const [arrivalQuery, setArrivalQuery] = useState('');
  // Job Queue is split so a valet reads only what they're accountable for.
  // Team jobs stay reachable on the second tab because the key can be handed
  // between valets — see QUEUE_TABS.
  const [queueTab, setQueueTab] = useState<QueueTab>('mine');
  // Deadlines have to visibly tick — a static "wants it in 10 min" rendered
  // once tells the valet nothing about how much of that is left by now.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  // Return-key chaining: enter on one field jumps to the next.
  const fieldRefs = useRef<Record<string, TextInput | null>>({});

  // Mine = I own it, nobody owns it, or it escalated past its owner and is
  // waiting on anyone. An escalated job deliberately lands here rather than
  // in the team tab — burying it is the exact stall escalation exists to end.
  // Arrivals, searchable and soonest-first. Matching code / plate / name in
  // one pass rather than three fields: whoever is at the counter gives you
  // one of the three and the valet shouldn't have to choose which box first.
  const arrivalQ = arrivalQuery.trim().toLowerCase();
  const arrivalsFiltered = [...arrivalNotices]
    .filter(a => !arrivalQ
      || (a.doctorCardCode ?? '').toLowerCase().includes(arrivalQ)
      || (a.doctorCarNumber ?? '').toLowerCase().includes(arrivalQ)
      || (a.doctorName ?? '').toLowerCase().includes(arrivalQ))
    .sort((a, b) => a.eta - b.eta);

  const myJobs = activeTasks.filter(t => isMyJobToRun(t, myValetId));
  const teamJobs = activeTasks.filter(t => !isMyJobToRun(t, myValetId));
  const queueJobs = queueTab === 'mine' ? myJobs : teamJobs;

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
    // Two genuinely different situations share this prompt. A named driver
    // means one was assigned and dropped it. No name means the job never got
    // a driver at all — saying "X didn't accept in time" there is simply
    // false, and it used to print the VALET's own name in that slot.
    const why = reassignPrompt.rejected ? 'rejected the job' : "didn't accept in time";
    const noDriverYet = !reassignPrompt.driverName;
    dialog.show({
      title: noDriverYet ? 'Job still needs a driver' : 'Driver did not accept',
      message: noDriverYet
        ? `${what} still has no driver. Assign one?`
        : `${reassignPrompt.driverName} ${why} for ${what}. Assign another driver?`,
      tone: 'warning',
      buttons: [
        {text: 'Later', style: 'cancel', onPress: () => {
          // Acknowledge server-side, not just locally — otherwise the sweep
          // still treats this job as unattended and pulls in every valet.
          const id = reassignPrompt.kind === 'task' ? reassignPrompt.task?.id : null;
          if (id) tasksApi.acknowledge(id).catch(() => {});
          clearReassignPrompt();
        }},
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
    });
  }, [reassignPrompt, clearReassignPrompt]);

  const handleScanCode = async () => {
    if (submitting) return;
    setCodeError('');
    const trimmed = code.trim();
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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
      // No driver notification here — the task has no driver yet. The real
      // per-driver alarm fires from handleAssignDriver once the valet picks one.
      setFoundUser(null); setCarNumber('');
      setScreen('assign');
    } catch (err: any) {
      dialog.alert(err.message || 'Something went wrong', {title: 'Error'});
    }
  };

  const handleKeyReceived = async () => {
    if (submitting || !foundUser || !carNumber.trim()) return;
    setSubmitting(true);
    try {
      await createKeyTask(foundUser, carNumber.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignDriver = async (driverId: number) => {
    // Blocks a fast double-tap (same or a different driver) from firing a
    // second assignDriver call before the first has resolved — that could
    // otherwise notify one driver and immediately bump them for another
    // with no confirmation in between.
    if (assigningDriverId != null) return;
    setAssigningDriverId(driverId);
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
      // Two very different failures land here. If the job moved on there is
      // nothing left to do on this screen, so close it — leaving the valet
      // on a driver list for someone else's job just invites more failed
      // taps. If it's only that THIS driver got taken, the job is still
      // theirs: stay put so they can pick another without navigating back in.
      if (isJobGone(err)) {
        setPendingTaskId(null); setPendingVisitorId(null);
        setScreen('home');
      }
      dialog.alert(err.message || 'Something went wrong', {
        title: isJobGone(err) ? 'Job already handled' : 'Error',
        tone: isJobGone(err) ? 'info' : 'error',
      });
    } finally {
      setAssigningDriverId(null);
    }
  };

  // The assign screen was entirely passive: it only learned the job had been
  // taken when the valet tapped a driver and the call failed. pendingTask is
  // already derived from the live socket-fed list, so the screen can know the
  // moment someone else staffs it — and close itself before a wasted tap.
  useEffect(() => {
    if (screen !== 'assign') return;
    // Not while OUR own assignment is in flight — the task gains a driverId
    // the moment it succeeds, and if that arrives before this screen has
    // finished closing, the effect would report the valet's own assignment
    // as someone else stealing the job.
    if (assigningDriverId != null) return;
    // An empty list before the first load is "not known yet", not "gone".
    if (!hydrated) return;

    // Three ways a job stops being assignable, and this screen has to leave
    // for all of them — it is bound to ONE entity, so the entity ceasing to
    // exist has to end the screen, not just the entity changing.
    //
    //   taken     — someone else staffed it; it's still on our list.
    //   vanished  — it left our list entirely. Another valet claiming a
    //               retrieval removes it from every non-owner's app, and a
    //               superseded or cancelled job drops out on the next
    //               refetch.
    //   finished  — still listed, but past the point of taking a driver.
    //
    // Only the first was handled, so the other two left a driver picker open
    // for a job that no longer existed, and the valet found out by tapping a
    // driver and getting an error.
    const taken = (pendingTaskId != null && pendingTask?.driverId != null)
      || (pendingVisitorId != null && pendingVisitor?.driverId != null);
    const vanished = (pendingTaskId != null && !pendingTask)
      || (pendingVisitorId != null && !pendingVisitor);
    const finished = (pendingTask != null && (pendingTask.status === 'completed' || pendingTask.status === 'cancelled'))
      || (pendingVisitor != null && (pendingVisitor.status === 'retrieved' || pendingVisitor.status === 'cancelled'));
    if (!taken && !vanished && !finished) return;

    setPendingTaskId(null); setPendingVisitorId(null);
    setScreen('home');
    if (taken) {
      const who = pendingTask?.valetName ?? 'Another valet';
      dialog.alert(`${who} already assigned a driver to this job.`, {
        title: 'Job already handled', tone: 'info',
      });
      return;
    }
    // Nobody to name — it left our list, so we don't know who took it.
    dialog.alert('This job is no longer available.', {
      title: 'Job no longer available', tone: 'info',
    });
  }, [screen, pendingTaskId, pendingVisitorId, pendingTask, pendingVisitor, assigningDriverId, hydrated]);

  const handleAddVisitor = async () => {
    // Name is optional; the mobile number and the plate are not.
    if (!canCheckIn) { setMobileTouched(true); setCarTouched(true); return; }
    // Blocks a fast double-tap from firing two check-ins for the same
    // visitor — unlike handleScanCode/handleKeyReceived (staff), this had no
    // guard at all, client or server, so a slow response left the button
    // tappable and a second tap created a genuine second Visitor row.
    if (submitting) return;
    setSubmitting(true);
    try {
      const visitor = await addVisitor({
        name: vName.trim(),
        // Required now, and sent in canonical form so the stored plate matches
        // what search normalises against.
        carNumber: formatPlate(vCar) ?? vCar.trim().toUpperCase(),
        mobile: vMobileDigits,
        vehicleType: vVehicleType,
      });
      // Shown regardless of WhatsApp: this token is what the visitor brings
      // back to the desk to collect their car, and with WhatsApp off it is
      // the ONLY place it appears. Reading it out is the fallback.
      dialog.alert(
        `Parking token  ${visitor.token}\n\n${visitor.carNumber || 'Vehicle'} — ${vMobileDigits}\n\n` +
        'Give this token to the visitor. They return to the valet desk with it to collect their car.',
        {title: 'Checked in', tone: 'success'},
      );
      setVName(''); setVCar(''); setVMobile(''); setVVehicleType('car');
      // Straight into driver assignment — a token with nobody assigned to
      // collect the key is exactly the gap this flow used to leave open.
      setPendingVisitorId(visitor.id);
      setScreen('assign');
    } catch (err: any) {
      dialog.alert(err.message || 'Something went wrong', {title: 'Error'});
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTaskDelivered = async (taskId: number) => {
    if (confirmingTaskId != null) return;
    setConfirmingTaskId(taskId);
    try {
      await confirmTaskDelivered(taskId);
    } catch (err: any) {
      dialog.alert(err.message || 'Could not confirm handover', {title: 'Error'});
    } finally {
      setConfirmingTaskId(null);
    }
  };

  // Same race, on the departure side. Fires either for the session owner
  // responding inside their window, or for anyone claiming a request the
  // owner never answered.
  // The ONLY way into the driver picker, from both the retrieval inbox and
  // the Job Queue. They had separate handlers with different behaviour, so
  // the queue's "Assign driver" opened the list without marking the job as
  // handled — leaving it live to every other valet (and to the recovery
  // countdown) for however long the valet spent choosing a driver.
  //
  // One tap. Accepting and assigning were two separate taps, which is one
  // more decision than the valet actually makes: opening the driver list IS
  // them saying they're handling it.
  //
  // The screen opens SYNCHRONOUSLY and the claim runs behind it. Awaiting the
  // claim first is what caused the visible stutter — `await acceptRetrieval()`
  // flushes its setTasks in one tick and `setScreen` in the next, so React
  // painted a frame with the button already relabelled "Assign driver" before
  // navigating away from it.
  //
  // Claiming still happens, and still happens immediately: it is what marks
  // the request as handled, stops the recovery countdown, and takes it off
  // every other valet's screen. Skipping it would leave the request live to
  // the whole team while this valet stands there choosing a driver.
  const handleAssignDriverTo = (t: ParkingTask) => {
    // Guards only the background claim below, not the navigation — the
    // screen change itself already takes the button off-screen on the next
    // render, but two taps landing in the same JS tick (before that commits)
    // could otherwise both fire acceptRetrieval for the same job.
    if (assigningToId === t.id) return;
    setAssigningToId(t.id);
    setPendingTaskId(t.id);
    setScreen('assign');

    // Claim only what is actually claimable. Every condition here is load-
    // bearing:
    //  - park jobs have no retrieval to accept, and `undefined === myValetId`
    //    is false, so without this a park job would fire a claim that can
    //    only fail and would then close this screen underneath the valet;
    //  - a non-valet (admin) has no claim to make and would get a 403;
    //  - past 'accepted' the job already has a driver history, and takeover
    //    of an escalated one is assignDriver's job — its guard lifts on
    //    escalation, whereas claimRetrieval would refuse and close the screen;
    //  - already ours means there is nothing to spend a request on.
    const claimable = t.type === 'retrieve'
      && myValetId != null
      && (t.status === 'requested' || t.status === 'accepted')
      && t.retrievalOwnerValetId !== myValetId;
    if (!claimable) { setAssigningToId(null); return; }

    acceptRetrieval(t.id)
      .catch((err: any) => {
        // Lost the race. Two ways this screen can already be gone, and
        // reporting a second time would stack a dialog behind the first:
        //  - an assignment is in flight (assignDriver claims too, and reports
        //    its own failure) — leave it alone;
        //  - the socket's task:restrict already pulled the job from our list
        //    and the close-effect closed us with its own message.
        if (assigningDriverIdRef.current != null) return;
        if (screenRef.current !== 'assign' || pendingTaskIdRef.current !== t.id) return;
        setPendingTaskId(null);
        setScreen('home');
        dialog.alert(err?.message || 'This retrieval request has already been accepted.', {
          title: 'Already taken', tone: 'info',
        });
      })
      .finally(() => setAssigningToId(null));
  };

  // Path B — the valet already knows who this is from the arrival card, so
  // skip the 3-digit code lookup entirely. If the plate's on file, jump
  // straight to driver assignment (same as the "already known" branch of
  // handleScanCode); otherwise drop into the scan screen's step 2 with the
  // identity pre-filled, so the valet only has to type the plate in.
  const handleArrivalArrived = async (a: {id: number; doctorId: number; doctorName: string; doctorCarNumber?: string; doctorDepartment?: string; doctorEmployeeId?: string}) => {
    if (arrivingId != null) return;
    if (!a.doctorCarNumber?.trim()) {
      setFoundUser({id: a.doctorId, name: a.doctorName, department: a.doctorDepartment, employeeId: a.doctorEmployeeId});
      setCarNumber('');
      setScreen('scan');
      return;
    }
    setArrivingId(a.id);
    try {
      await createKeyTask({id: a.doctorId, name: a.doctorName}, a.doctorCarNumber.trim());
    } finally {
      setArrivingId(null);
    }
  };

  const handleCancelTask = (taskId: number) => {
    dialog.show({
      title: 'Cancel This Job?',
      message: 'Use this if it’s stuck (e.g. never got a driver) and needs to be cleared.',
      tone: 'warning',
      buttons: [
        {text: 'Never mind', style: 'cancel'},
        {text: 'Cancel Job', style: 'destructive', onPress: () => {
          cancelTask(taskId).catch(err => dialog.alert(err.message || 'Could not cancel', {title: 'Error'}));
        }},
      ],
    });
  };

  // Give up on a driver who hasn't accepted yet, right now, instead of
  // waiting out the accept-timeout window — the job itself (and, for a
  // visitor, their token) is untouched, just back to "needs a driver".
  const handleCancelAssignment = (taskId: number) => {
    if (cancellingAssignmentId != null) return;
    setCancellingAssignmentId(taskId);
    cancelTaskAssignment(taskId)
      .catch(err => dialog.alert(err.message || 'Could not cancel the assignment', {title: 'Error'}))
      .finally(() => setCancellingAssignmentId(null));
  };

  // Past the key handover the car is physically with a driver, so it can't
  // just be voided — this tells them to bring it back to the counter.
  const handleRecallTask = (taskId: number, carNumber: string) => {
    dialog.show({
      title: 'Bring the Car Back?',
      message: `The driver will be told NOT to park ${carNumber} and to return it to the valet counter instead.`,
      tone: 'warning',
      buttons: [
        {text: 'Never mind', style: 'cancel'},
        {text: 'Recall Car', style: 'destructive', onPress: () => {
          recallTask(taskId).catch(err => dialog.alert(err.message || 'Could not recall', {title: 'Error'}));
        }},
      ],
    });
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
                  style={[s.actionBtn, {backgroundColor: code.length === 3 && !submitting ? colors.primary : colors.cardAlt}]}
                  onPress={handleScanCode} disabled={code.length !== 3 || submitting}
                >
                  <Text style={[s.actionBtnTxt, {color: code.length === 3 && !submitting ? colors.textOnPrimary : colors.textMuted}]}>{submitting ? 'Please wait…' : 'Find Customer'}</Text>
                  <Icon name="arrowRight" size={15} color={code.length === 3 && !submitting ? colors.textOnPrimary : colors.textMuted} />
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
                style={[s.actionBtn, {backgroundColor: carNumber.trim() && !submitting ? colors.primary : colors.cardAlt}]}
                onPress={handleKeyReceived} disabled={!carNumber.trim() || submitting}
              >
                <Icon name="check" size={15} color={carNumber.trim() && !submitting ? colors.textOnPrimary : colors.textMuted} />
                <Text style={[s.actionBtnTxt, {color: carNumber.trim() && !submitting ? colors.textOnPrimary : colors.textMuted}]}>{submitting ? 'Please wait…' : 'Key received'}</Text>
              </PressableScale>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── ASSIGN DRIVER ──────────────────────────────────────────────────────
  if (screen === 'assign') {
    const closeAssign = () => {
      setScreen('home'); setPendingVisitorId(null); setPendingTaskId(null);
      setDriverSearch('');
    };
    const isRetrieve = pendingTask?.type === 'retrieve';
    // Fewest jobs today first, then alphabetical so the order is stable
    // rather than shuffling between renders on equal counts. This ordering
    // only started meaning anything once completedToday was actually computed
    // server-side — before that every comparison was 0 minus 0.
    const visibleDrivers = availableDrivers
      .filter(d => d.name.toLowerCase().includes(driverSearch.trim().toLowerCase()))
      .slice()
      .sort((a, b) => (a.completedToday ?? 0) - (b.completedToday ?? 0) || a.name.localeCompare(b.name));

    return (
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.header}>
          <PressableScale onPress={closeAssign} style={[s.circleBack, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="back" size={18} color={colors.textPrimary} />
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Assign driver</Text>
          <PressableScale onPress={closeAssign} style={[s.skipBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.skipBtnTxt, {color: colors.primary}]}>Skip</Text>
          </PressableScale>
        </View>
        <ScrollView contentContainerStyle={s.subContent}>
          {/* Who this actually is — shown before picking a driver so a
              mis-scanned/mis-typed code gets caught here, not after a driver's
              already been notified. */}
          {(pendingVisitor || pendingTask) && (
            <LinearGradient
              colors={isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT}
              start={{x: 0, y: 0}} end={{x: 1, y: 1}}
              style={s.confirmCard}>
              {/* The person leads, the plate sits under it. A valet is about
                  to dispatch someone on behalf of a named human, so the name
                  is the headline and everything else is detail beneath it.
                  Each fact is on its own line — the middle-dot runs meant the
                  slot could be truncated away by a long name. */}
              <View style={s.confirmTop}>
                <Text style={[s.confirmWho, {color: '#FFFFFF'}]} numberOfLines={1}>
                  {pendingVisitor?.name ?? pendingTask?.doctorName ?? 'Unknown'}
                </Text>
                {/* Fixed light-on-dark values, not theme tokens: this card is
                    a dark surface in BOTH themes, so textPrimary would render
                    near-black on the dark theme and vanish. Retrieve keeps an
                    amber tint so the two job types stay tellable apart. */}
                <View style={[s.confirmTypePill, {backgroundColor: 'rgba(255,255,255,0.14)'}]}>
                  <Text style={[s.confirmTypeTxt, {color: isRetrieve ? '#F5C168' : '#FFFFFF'}]}>
                    {isRetrieve ? 'RETRIEVE' : 'PARK'}
                  </Text>
                </View>
              </View>
              {/* Who they are, under the name. A visitor has no department,
                  so they get the label that actually applies to them. */}
              <Text style={[s.confirmSub, {color: 'rgba(255,255,255,0.62)'}]} numberOfLines={1}>
                {pendingVisitor
                  ? (pendingVisitor.vehicleType === 'bike' ? 'Visitor — bike' : 'Visitor')
                  : pendingTask?.doctorDepartment?.trim() || 'Department not on file'}
              </Text>

              {/* Label/value rows rather than a run-on line: a valet scans
                  down the left edge for the field they want, and nothing gets
                  truncated away by a long value in front of it. */}
              <View style={[s.confirmFacts, {borderTopColor: 'rgba(255,255,255,0.16)'}]}>
                {(() => {
                  const facts: [string, string][] = [];
                  const plate = (pendingVisitor?.carNumber ?? pendingTask?.carNumber ?? '').trim();
                  facts.push(['VEHICLE', plate || 'Plate not on file']);
                  if (pendingTask?.slotId) facts.push(['SLOT', pendingTask.slotId]);
                  if (pendingVisitor?.mobile) facts.push(['MOBILE', pendingVisitor.mobile]);
                  if (pendingVisitor?.token) facts.push(['TOKEN', pendingVisitor.token]);
                  if (!pendingVisitor && pendingTask?.doctorEmployeeId) {
                    facts.push(['STAFF ID', pendingTask.doctorEmployeeId]);
                  }
                  return facts.map(([k, v]) => (
                    <View key={k} style={s.confirmFactRow}>
                      <Text style={[s.confirmFactKey, {color: 'rgba(255,255,255,0.5)'}]}>{k}</Text>
                      <Text style={[s.confirmFactVal, {color: '#FFFFFF'}]} numberOfLines={1}>{v}</Text>
                    </View>
                  ));
                })()}
              </View>
            </LinearGradient>
          )}

          <Text style={[s.stepLabel, {color: colors.textMuted}]}>SELECT DRIVER</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>
            {pendingVisitor
              ? `Assign a driver to collect the key and park ${pendingVisitor.name}'s car (${pendingVisitor.carNumber})`
              : isRetrieve
              ? `Assign a driver to retrieve ${pendingTask?.carNumber} from slot ${pendingTask?.slotId}`
              : 'Assign a driver to collect the key and park this car'}
          </Text>

          <View style={s.driverSearchRow}>
            <View style={[s.driverSearchBox, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <Icon name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[s.driverSearchInput, {color: colors.textPrimary}]}
                value={driverSearch}
                onChangeText={setDriverSearch}
                placeholder="Search drivers…"
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
              />
            </View>
          </View>

          <DriverPickerList drivers={visibleDrivers} onAssign={handleAssignDriver} assigningId={assigningDriverId} />

          <View style={[s.assignNoteCard, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
            <View style={[s.assignNoteIconWrap, {backgroundColor: colors.successLight}]}>
              <Icon name="shield" size={16} color={colors.success} />
            </View>
            <Text style={[s.assignNoteTxt, {color: colors.textSecondary}]}>
              This assignment will notify the driver and update in real-time.
            </Text>
            <Icon name="info" size={16} color={colors.textMuted} />
          </View>
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
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Inbox</Text>
        </View>

        {/* Two kinds of incoming request, kept apart. The colour of each
            count is the same language the inbox icon uses: red is a car
            someone is waiting for, blue is only a heads-up. */}
        <View style={[s.inboxTabs, {borderBottomColor: colors.border}]}>
          {([
            ['retrievals', 'Retrieval Requests', retrievalRequests.length, colors.error],
            ['arrivals', 'Expected Arrivals', arrivalNotices.length, colors.info],
          ] as const).map(([key, label, count, tint]) => {
            const active = inboxSection === key;
            return (
              <PressableScale key={key} style={s.inboxTab} onPress={() => setInboxSection(key)}>
                <View style={s.inboxSectionRow}>
                  <Text style={[s.inboxTabTxt, {color: active ? colors.textPrimary : colors.textSecondary}]}>
                    {label}
                  </Text>
                  {count > 0 && (
                    <View style={[s.inboxSectionCount, {backgroundColor: tint}]}>
                      <Text style={s.inboxSectionCountTxt}>{count > 99 ? '99+' : count}</Text>
                    </View>
                  )}
                </View>
                {active && <View style={[s.inboxTabBar, {backgroundColor: colors.textPrimary}]} />}
              </PressableScale>
            );
          })}
        </View>

        {inboxSection === 'retrievals' && (<>
        {/* Counts live on the tabs so the distribution is visible without
            switching. Zero-count tabs stay in place, dimmed — hiding them
            would shift the others under the valet's thumb mid-triage. */}
        {hydrated && retrievalRequests.length > 0 && (
          <View style={[s.inboxTabs, {borderBottomColor: colors.border}]}>
            {INBOX_TABS.map(tb => {
              const count = tb.key === 'all'
                ? retrievalRequests.length
                : retrievalRequests.filter(t => inboxBand(minutesUntilDeparture(t.requestedAt, t.plannedDepartureMinutes, now)) === tb.key).length;
              const active = inboxTab === tb.key;
              const empty = count === 0;
              return (
                <PressableScale key={tb.key} style={s.inboxTab} onPress={() => setInboxTab(tb.key)}>
                  <Text style={[s.inboxTabTxt, {
                    color: active ? colors.textPrimary : empty ? colors.textMuted : colors.textSecondary,
                  }]}>
                    {tb.label} {count}
                  </Text>
                  {active && <View style={[s.inboxTabBar, {backgroundColor: colors.textPrimary}]} />}
                </PressableScale>
              );
            })}
          </View>
        )}
        <ScrollView contentContainerStyle={s.subContent}>
          {!hydrated ? (
            <SkeletonCard lines={2} />
          ) : retrievalRequests.length === 0 ? (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Icon name="inbox" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No retrieval requests right now.</Text>
            </View>
          ) : retrievalRequests.filter(t => inboxTab === 'all' || inboxBand(minutesUntilDeparture(t.requestedAt, t.plannedDepartureMinutes, now)) === inboxTab).length === 0 ? (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Icon name="check" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>Nothing in this group.</Text>
            </View>
          ) : [...retrievalRequests]
                .filter(t => inboxTab === 'all' || inboxBand(minutesUntilDeparture(t.requestedAt, t.plannedDepartureMinutes, now)) === inboxTab)
                // NOW first, then 10/20/30/40; oldest request first within a
                // band so nobody is overtaken by a later request at the same
                // urgency.
                // Actionable work first, scheduled rows beneath it. Within
                // each group, soonest departure first. Sorting purely by
                // departure would float a request booked for 3pm above one
                // that needs a driver right now.
                .sort((a, b) =>
                  Number(isScheduled(a.retrievalReadyAt, now)) - Number(isScheduled(b.retrievalReadyAt, now))
                  || departurePriority(a.requestedAt, a.plannedDepartureMinutes, now) - departurePriority(b.requestedAt, b.plannedDepartureMinutes, now)
                  || (a.requestedAt ?? 0) - (b.requestedAt ?? 0))
                .map(t => {
            // Everything on this card is driven by time LEFT, recomputed each
            // second, so a card genuinely heats up as its deadline approaches
            // instead of being frozen at whatever the doctor first picked.
            // Booked for later: this row is informational until its lead
            // time. The server refuses the actions too (NOT_READY), so hiding
            // them is about not offering a button that can only fail.
            const scheduled = isScheduled(t.retrievalReadyAt, now);
            const left = minutesUntilDeparture(t.requestedAt, t.plannedDepartureMinutes, now);
            const tone = scheduled ? colors.textMuted : departureTone(left, colors);
            // The card itself carries the colour, graded by urgency: due is a
            // clearly washed card, hours away is barely tinted. Sorted top to
            // bottom, the inbox reads as a fade from hot to cool — which
            // conveys priority without every card shouting equally.
            // A scheduled row stays flat: the urgency wash is about what needs
            // doing NOW, and something that cannot be acted on yet must not
            // compete with something that can.
            const wash = scheduled || left == null ? '00' : left <= 0 ? '1C' : left <= 10 ? '14' : left <= 20 ? '0E' : left <= 30 ? '0A' : '08';
            const edge = scheduled || left == null ? null : left <= 0 ? '66' : left <= 10 ? '4D' : left <= 20 ? '3A' : '26';
            return (
            <View key={t.id} style={[
              s.taskCard,
              {backgroundColor: scheduled || left == null ? colors.surface : tone + wash,
               borderColor: edge ? tone + edge : colors.border},
            ]}>
              <View style={s.jobHead}>
                <View style={{flex: 1}}>
                  <Text style={[s.jobPlate, {color: colors.textPrimary}]} numberOfLines={1}>{t.carNumber}</Text>
                  <Text style={[s.jobWho, {color: colors.textSecondary}]} numberOfLines={1}>{t.doctorName}</Text>
                  {!!t.slotId && (
                    <Text style={[s.jobSlot, {color: colors.textMuted}]} numberOfLines={1}>Slot {t.slotId}</Text>
                  )}
                </View>
                {/* Planned departure only — NOT a delivery ETA. */}
                <View style={[s.departureBadge, {backgroundColor: tone}]}>
                  <Text style={s.departureBadgeTxt}>
                    {scheduled ? 'SCHEDULED' : plannedDepartureLabel(t.requestedAt, t.plannedDepartureMinutes, now)}
                  </Text>
                </View>
              </View>

              <Text style={[s.jobWaiting, {color: colors.textSecondary}]}>
                {/* Never interpolate the raw value — an older server (or a
                    pre-departure-field task) has none, and template literals
                    happily print "undefined" to the user. */}
                {/* The wall-clock time they said, alongside the countdown in
                    the badge. A doctor who names 18:00 should be findable by
                    that, not only by "in 4 hr" — and never by a raw number
                    that quietly goes stale. */}
                {left == null
                  ? 'Departure time not given'
                  : left <= 0
                  ? 'Leaving now'
                  : `Leaves at ${departureClockLabel(t.requestedAt, t.plannedDepartureMinutes, t.plannedDepartureAt)}`}
              </Text>
              {scheduled ? (
                <Text style={[s.jobSlot, {color: colors.textSecondary}]}>
                  {startsInLabel(t.retrievalReadyAt, now)}
                </Text>
              ) : !!t.requestedAt && (
                <Text style={[s.jobSlot, {color: colors.textMuted}]}>Requested {agoLabel(t.requestedAt, now)}</Text>
              )}

              {/* Why this is on a non-owner's screen at all. Without the
                  reason it just looks like a request that was routed
                  strangely. */}
              {!scheduled && t.recoveryBroadcastAt != null && t.arrivalOwnerValetId !== myValetId && (
                <View style={s.taskMetaRow}>
                  <Icon name="bellAlert" size={12} color={colors.warning} />
                  <Text style={[s.taskMeta, {color: colors.warning}]}>Original owner unavailable</Text>
                </View>
              )}

              {/* One button, one label, whether or not this is already ours —
                  a label that depends on ownership is exactly what flickered
                  when ownership changed underneath it mid-tap. Absent entirely
                  while scheduled: the row is a heads-up, not work. */}
              {!scheduled && (
                <PressableScale style={[s.taskActionBtn, s.jobActions, {borderColor: 'transparent', backgroundColor: colors.primary}]}
                  onPress={() => handleAssignDriverTo(t)}>
                  <Icon name="people" size={13} color={colors.textOnPrimary} />
                  <Text style={[s.taskActionTxt, {color: colors.textOnPrimary}]}>Assign driver</Text>
                </PressableScale>
              )}
            </View>
            );
          })}
        </ScrollView>
        </>)}

        {inboxSection === 'arrivals' && (<>
          {/* Search is what makes a flood survivable: the valet never scrolls
              this list, they type whatever the person at the counter gives
              them. One box matching code, plate or name — at the counter you
              get whichever of the three they happen to say, and making them
              pick a field first would be a decision with no information. */}
          <View style={[s.arrivalSearchWrap, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="search" size={15} color={colors.textMuted} />
            <TextInput
              style={[s.arrivalSearchInput, {color: colors.textPrimary}]}
              value={arrivalQuery}
              onChangeText={setArrivalQuery}
              placeholder="Search code, plate or name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
            />
            {arrivalQuery.length > 0 && (
              <PressableScale onPress={() => setArrivalQuery('')} hitSlop={10}>
                <Icon name="close" size={15} color={colors.textMuted} />
              </PressableScale>
            )}
          </View>

          <ScrollView contentContainerStyle={s.subContent} keyboardShouldPersistTaps="handled">
            {!hydrated ? (
              <SkeletonCard lines={2} />
            ) : arrivalNotices.length === 0 ? (
              <View style={[s.emptyBox, {borderColor: colors.border}]}>
                <Icon name="inbox" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
                <Text style={[s.emptyTxt, {color: colors.textMuted}]}>Nobody has announced an arrival.</Text>
              </View>
            ) : arrivalsFiltered.length === 0 ? (
              <View style={[s.emptyBox, {borderColor: colors.border}]}>
                <Icon name="search" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
                <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No arrival matches "{arrivalQuery.trim()}".</Text>
              </View>
            ) : arrivalsFiltered.map(a => (
              <View key={a.id} style={[s.taskCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                <View style={s.taskTop}>
                  <View style={[s.typePill, {backgroundColor: colors.info + '15'}]}>
                    <Icon name="bellAlert" size={11} color={colors.info} />
                    <Text style={[s.typePillTxt, {color: colors.info}]}>ARRIVING</Text>
                  </View>
                  {/* Doctors can now say an hour out, and "~60 min" reads
                      worse than "~1 hr" on a card being scanned at a counter. */}
                  <Text style={[s.taskStatusTxt, {color: colors.info}]}>
                    ~{a.eta >= 60 ? `${Math.round(a.eta / 6) / 10} hr` : `${a.eta} min`}
                  </Text>
                </View>
                <Text style={[s.taskDoctor, {color: colors.textPrimary}]}>{a.doctorName}</Text>
                <Text style={[s.taskMeta, {color: colors.textSecondary, marginTop: 2}]} numberOfLines={1}>
                  {a.doctorCarNumber?.trim() || 'Plate not on file'}
                </Text>
                {!!a.doctorCardCode && (
                  <Text style={[s.taskMeta, {color: colors.textMuted}]}>Code {a.doctorCardCode}</Text>
                )}
                {/* Kept from the old home-screen card. "They've arrived"
                    skips typing the code once they're standing here; without
                    a plate on file it still saves re-entering their identity.
                    "No-show" is not decoration — a notice only clears itself
                    when a key is taken, so without it a doctor who never
                    turns up leaves the blue count permanently wrong. */}
                <View style={{flexDirection: 'row', gap: 8}}>
                  <PressableScale
                    style={[s.taskActionBtn, {flex: 1, borderColor: 'transparent', backgroundColor: colors.primary, opacity: arrivingId === a.id ? 0.6 : 1}]}
                    disabled={arrivingId === a.id}
                    onPress={() => handleArrivalArrived(a)}>
                    {arrivingId === a.id
                      ? <ActivityIndicator color={colors.textOnPrimary} size="small" />
                      : <Icon name="key" size={13} color={colors.textOnPrimary} />}
                    <Text style={[s.taskActionTxt, {color: colors.textOnPrimary}]}>
                      {arrivingId === a.id ? 'Please wait…' : "They've arrived"}
                    </Text>
                  </PressableScale>
                  <PressableScale style={[s.taskActionBtn, {borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: 14}]}
                    onPress={() => dismissArrivalNotice(a.id)}>
                    <Text style={[s.taskActionTxt, {color: colors.textSecondary}]}>No-show</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </ScrollView>
        </>)}
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
        {/* keyboardShouldPersistTaps: without it, a tap while the keyboard is
            up is consumed by the ScrollView dismissing the keyboard and never
            reaches the view underneath — which made every vehicle suggestion
            unselectable. */}
        <ScrollView contentContainerStyle={s.subContent} keyboardShouldPersistTaps="handled">
          <Text style={[s.stepLabel, {color: colors.textMuted}]}>VISITOR DETAILS</Text>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>WhatsApp tracking link will be sent automatically</Text>
          {/* Mobile leads: it is the only required field, and the one the
              whole flow depends on. Name follows, marked optional so a valet
              doesn't stall asking for something a visitor may not give. */}
          {[
            {key: 'mobile', label: 'Mobile Number', icon: 'phone' as IconName, val: vMobile, set: setVMobile, ph: '10-digit number', kb: 'numeric' as const, required: true},
            {key: 'name', label: 'Name (optional)', icon: 'user' as IconName, val: vName, set: setVName, ph: 'Patient / visitor name', kb: 'default' as const, required: false},
          ].map((f, i, arr) => {
            const nextKey = arr[i + 1]?.key;
            const showMobileError = f.key === 'mobile' && mobileTouched && !mobileValid;
            const showError = showMobileError;
            return (
              <View key={f.key} style={{marginBottom: 4}}>
                <View style={s.fieldLabelRow}>
                  <Text style={[s.fieldLabel, {color: colors.textMuted}]}>{f.label.toUpperCase()}</Text>
                  {f.required && <Text style={[s.fieldReq, {color: colors.error}]}>REQUIRED</Text>}
                </View>
                <View style={[s.inputRow, {
                  borderColor: showError ? colors.error
                    : focused === f.key ? colors.textPrimary : colors.border,
                  backgroundColor: colors.surface,
                }]}>
                  <View style={[s.inputIconWrap, {backgroundColor: colors.cardAlt}]}>
                    <Icon name={f.icon} size={16} color={showError ? colors.error : focused === f.key ? colors.textPrimary : colors.textMuted} />
                  </View>
                  <TextInput style={[s.textInput, {color: colors.textPrimary}]} value={f.val}
                    onChangeText={t => {
                      // Digits only for the phone, so paste and keypad quirks
                      // can't smuggle in spaces or dashes that the length
                      // check would then measure.
                      f.set(f.key === 'mobile' ? t.replace(/\D/g, '').slice(0, 10) : t);
                    }}
                    ref={r => { fieldRefs.current[f.key] = r; }}
                    onFocus={() => setFocused(f.key)}
                    onBlur={() => {
                      setFocused(null);
                      if (f.key === 'mobile') setMobileTouched(true);
                    }}
                    returnKeyType={nextKey ? 'next' : 'done'}
                    blurOnSubmit={!nextKey}
                    onSubmitEditing={() => nextKey && fieldRefs.current[nextKey]?.focus()}
                    placeholder={f.ph} placeholderTextColor={colors.textMuted}
                    keyboardType={f.kb} autoCapitalize={f.kb === 'default' ? 'words' : 'none'} />
                  {f.key === 'mobile' && mobileValid && <Icon name="check" size={16} color={colors.success} />}
                </View>
                {showMobileError && (
                  <Text style={[s.fieldError, {color: colors.error}]}>
                    {vMobileDigits.length === 0 ? 'Mobile number is required' : `Enter all 10 digits (${vMobileDigits.length}/10)`}
                  </Text>
                )}
              </View>
            );
          })}
          {/* Its own component: it carries the offline state/RTO dataset, its
              own debounce and cache, and block-level validation, none of
              which belongs in a generic text row. */}
          <VehicleNumberInput
            value={vCar}
            onChange={setVCar}
            touched={carTouched}
            onTouch={() => setCarTouched(true)}
            required
          />

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
          {/* Deliberately hedged. Whether WhatsApp actually goes out is the
              backend's call — it depends on Meta credentials the app never
              sees — so this cannot promise a message was sent. The token is
              shown on screen either way, which is what the visitor needs. */}
          <View style={[s.whatsappNote, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="whatsapp" size={17} color="#25D366" />
            <Text style={[s.whatsappTxt, {color: colors.textSecondary}]}>
              A parking token is issued on check-in. If WhatsApp is switched on, the tracking link also goes to {vMobile || 'their number'}.
            </Text>
          </View>
          <PressableScale
            style={[s.actionBtn, {backgroundColor: canCheckIn ? colors.primary : colors.cardAlt, marginTop: 8, opacity: submitting ? 0.6 : 1}]}
            onPress={handleAddVisitor} disabled={!canCheckIn || submitting}
          >
            <Icon name="whatsapp" size={17} color={canCheckIn ? colors.textOnPrimary : colors.textMuted} />
            <Text style={[s.actionBtnTxt, {color: canCheckIn ? colors.textOnPrimary : colors.textMuted}]}>
              {submitting ? 'Checking in…' : 'Check In'}
            </Text>
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
            {/* Two counts, and the colour carries the meaning: red is a car
                someone is waiting for, blue is only a heads-up that someone
                is on their way. They sit on opposite corners so neither
                moves or overlaps as the other changes, and a zero count
                hides rather than showing "0". */}
            <PressableScale style={s.inboxBtn} onPress={() => setScreen('retrievals')}>
              <Icon name="inbox" size={20} color="#fff" />
              {retrievalRequests.length > 0 && (
                <View style={[s.inboxBadge, {backgroundColor: '#E53935'}]}>
                  <Text style={s.inboxBadgeTxt}>{retrievalRequests.length > 9 ? '9+' : retrievalRequests.length}</Text>
                </View>
              )}
              {arrivalNotices.length > 0 && (
                <View style={[s.inboxBadgeAlt, {backgroundColor: '#2F6FA8'}]}>
                  <Text style={s.inboxBadgeTxt}>{arrivalNotices.length > 9 ? '9+' : arrivalNotices.length}</Text>
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
        {/* Primary action grid — 2x2, same dark card language throughout
            (the badge colour carries the "needs attention" signal, not the
            card background, so nothing here introduces a new colour). The
            inbox icon in the header above still works as a quick-glance
            entry point; these two cards are the primary, always-visible one. */}
        <View style={s.actionGrid}>
          <PressableScale style={[s.actionCard, {backgroundColor: colors.primary}]} onPress={() => setScreen('scan')}>
            <View style={s.actionIconWrap}><Icon name="key" size={24} color="#fff" /></View>
            <Text style={s.actionCardTxt}>Staff</Text>
            <Text style={s.actionCardSub} numberOfLines={2}>Collect key from doctor / staff</Text>
          </PressableScale>
          <PressableScale style={[s.actionCard, {backgroundColor: colors.primary}]} onPress={() => setScreen('visitor')}>
            <View style={s.actionIconWrap}><Icon name="ticket" size={24} color="#fff" /></View>
            <Text style={s.actionCardTxt}>Visitor</Text>
            <Text style={s.actionCardSub} numberOfLines={2}>Patient / VIP token</Text>
          </PressableScale>
          <PressableScale
            style={[s.actionCard, {backgroundColor: colors.primary}]}
            onPress={() => { setInboxSection('retrievals'); setScreen('retrievals'); }}>
            <View style={s.actionIconWrap}><Icon name="inbox" size={24} color="#fff" /></View>
            <Text style={s.actionCardTxt}>Retrieval Requests</Text>
            <Text style={s.actionCardSub} numberOfLines={2}>Cars waiting to leave</Text>
            <View style={[s.actionBadge, {backgroundColor: retrievalRequests.length > 0 ? '#E53935' : 'rgba(255,255,255,0.14)'}]}>
              <Text style={s.actionBadgeTxt}>{retrievalRequests.length} Pending</Text>
            </View>
          </PressableScale>
          <PressableScale
            style={[s.actionCard, {backgroundColor: colors.primary}]}
            onPress={() => { setInboxSection('arrivals'); setScreen('retrievals'); }}>
            <View style={s.actionIconWrap}><Icon name="bellAlert" size={24} color="#fff" /></View>
            <Text style={s.actionCardTxt}>Expected Arrivals</Text>
            <Text style={s.actionCardSub} numberOfLines={2}>Heads-up, on the way in</Text>
            <View style={[s.actionBadge, {backgroundColor: arrivalNotices.length > 0 ? '#2F6FA8' : 'rgba(255,255,255,0.14)'}]}>
              <Text style={s.actionBadgeTxt}>{arrivalNotices.length} Today</Text>
            </View>
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
        <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>Job Queue ({queueJobs.length})</Text>
        {/* Counts sit on the tabs so a valet can see there IS team work
            without leaving their own list to check. */}
        <View style={[s.inboxTabs, {borderBottomColor: colors.border, paddingHorizontal: 0, marginBottom: 12}]}>
          {([['mine', 'My Jobs', myJobs.length], ['team', 'Team Jobs', teamJobs.length]] as const).map(([key, label, count]) => {
            const active = queueTab === key;
            return (
              <PressableScale key={key} style={s.inboxTab} onPress={() => setQueueTab(key)}>
                <Text style={[s.inboxTabTxt, {
                  color: active ? colors.textPrimary : count === 0 ? colors.textMuted : colors.textSecondary,
                }]}>
                  {label} {count}
                </Text>
                {active && <View style={[s.inboxTabBar, {backgroundColor: colors.textPrimary}]} />}
              </PressableScale>
            );
          })}
        </View>
        {!hydrated ? (
          <>
            <SkeletonCard lines={2} style={{marginBottom: 12}} />
            <SkeletonCard lines={2} />
          </>
        ) : queueJobs.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Icon name="check" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>
              {queueTab === 'mine' ? 'No active jobs' : 'No one else has a job right now'}
            </Text>
          </View>
        ) : queueJobs.map(t => {
          const tc = t.type === 'park' ? colors.primary : colors.warning;
          // 'assigned' is the task's status from creation — it does NOT by
          // itself mean a driver has been picked (a park task starts here
          // with no driver, and a rejected/timed-out driver rolls a park
          // task back to 'assigned' with driverId cleared rather than a
          // separate status). Whether a driver is actually attached has to
          // come from driverId, not the status string.
          const needsDriver = t.status === 'assigned' && !t.driverId;
          // Job ownership: only the owning valet is alarmed when a job
          // stalls, so the queue has to make it obvious at a glance which
          // ones are yours — and, more importantly, which ones have
          // escalated past their owner because nobody acted. A push can
          // silently fail; this list is the thing that can't.
          const isMine = t.valetId === user?.id;
          const isEscalated = !!t.escalatedAt && needsDriver;
          // One job, one valet. Another valet's live job is read-only here
          // until it escalates — otherwise two valets who got the same alert
          // could each assign a driver, and the second silently bumped the
          // first. Matches the backend guard in task.service.js assignDriver,
          // so the button is never offered for a call that would be refused.
          const claimedByOther = !!t.valetId && !isMine && !t.escalatedAt;
          // A driver being attached doesn't mean they've actually accepted
          // yet — the accept handshake is a separate step (see
          // DriverJobsScreen's Accept/Reject buttons), and "Mark Key Handed"
          // below must not be offered until that's actually done, or a
          // reject landing right after would either get rejected itself or
          // leave this task key_collected with no driver on it at all.
          const awaitingAccept = t.status === 'assigned' && !!t.driverId && !t.acceptedAt;
          // Car's back at the counter, but nothing's confirmed the handover
          // yet — the one stage on this whole screen that's actually
          // time-sensitive right now, so the card itself gets highlighted.
          const needsConfirm = t.status === 'delivered';
          // Valet pulled this park job back mid-drive — the car is coming
          // back to the counter instead of going into a slot.
          const recalled = !!t.recalledAt;
          // A plain cancel is only honest before the key changes hands;
          // after that the car physically exists in a driver's hands and has
          // to be recalled (driver brings it back) rather than silently voided.
          // Dispatch rights — the same rule that splits the two tabs, asked
          // per card rather than read off the tab so the two can't disagree.
          const canDispatch = isMyJobToRun(t, myValetId);
          // Recalling is a dispatch decision, not a physical one: it tells a
          // driver already on the road to turn around. It had no ownership
          // gate at all, so on the team tab it would have been the one button
          // letting a valet override someone else's job.
          const canRecall = canDispatch && t.type === 'park' && !recalled
            && (t.status === 'key_collected' || t.status === 'in_transit');
          // Status text is coloured by how much it needs the VALET right now,
          // not by park-vs-retrieve. It used to use `tc` (the type colour),
          // which meant "Awaiting driver" (needs you) and "In transit"
          // (nothing to do) looked identical, while the same stage of a park
          // and a retrieve looked different — colour encoding the one
          // dimension that doesn't matter for triage.
          //   red    = blocked, waiting on this valet
          //   amber  = in progress, no action needed
          //   muted  = someone else's move (the driver's)
          // A status line ONLY where the card has no button. When there IS a
          // button it already states the action ("Key Handed to Driver"),
          // so a band above it reading "Hand over the key" was the same
          // sentence twice — noise dressed up as information.
          const waitingNote =
              awaitingAccept ? `Waiting for ${t.driverName ?? 'driver'} to accept…`
            : recalled && t.status !== 'delivered' ? `${t.driverName ?? 'Driver'} is bringing it back`
            : t.status === 'key_collected' ? `${t.driverName ?? 'Driver'} has the key`
            : t.status === 'in_transit' ? (t.type === 'park' ? `${t.driverName ?? 'Driver'} is parking it` : `${t.driverName ?? 'Driver'} is bringing it`)
            : null;
          return (
            <View key={t.id} style={[
              s.taskCard,
              {backgroundColor: colors.surface, borderColor: isEscalated ? colors.error : colors.border},
              isEscalated && {borderWidth: 2},
            ]}>
              {/* Plate first, and big. A valet is standing in front of a
                  physical car (or holding its key tag) — the number is what
                  they match against, so it's the headline. Everything else
                  is context for it, not competition with it. Tabular figures
                  keep plates from jittering as the list re-renders. */}
              <View style={s.jobHead}>
                <View style={{flex: 1}}>
                  <Text style={[s.jobPlate, {color: colors.textPrimary}]} numberOfLines={1}>{t.carNumber}</Text>
                  <Text style={[s.jobWho, {color: colors.textSecondary}]} numberOfLines={1}>{t.doctorName}</Text>
                  {!!t.slotId && (
                    <Text style={[s.jobSlot, {color: colors.textMuted}]} numberOfLines={1}>Slot {t.slotId}</Text>
                  )}
                </View>
                <View style={s.jobHeadRight}>
                  <View style={[s.jobTypeTag, {backgroundColor: tc}]}>
                    <Icon name={t.type === 'park' ? 'arrowDown' : 'arrowUp'} size={11} color={colors.textOnPrimary} />
                    <Text style={[s.jobTypeTxt, {color: colors.textOnPrimary}]}>{t.type === 'park' ? 'IN' : 'OUT'}</Text>
                  </View>
                  {(isMine || !!t.valetName) && (
                    <View style={[
                      s.jobOwnerBadge,
                      isMine
                        ? {backgroundColor: colors.primary + '1A', borderColor: colors.primary + '55'}
                        : {backgroundColor: 'transparent', borderColor: colors.border},
                    ]}>
                      <Text
                        style={[s.jobOwnerBadgeTxt, {color: isMine ? colors.primary : colors.textSecondary}]}
                        numberOfLines={1}>
                        {isMine ? 'YOURS' : (t.valetName ?? '').split(' ')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Escalation is the one state worth shouting about — a real
                  car has been sitting with nobody on it. Everything else is
                  either already stated by the button below, or a quiet
                  "nothing for you to do right now" note. */}
              {isEscalated && (
                <View style={[s.jobAlert, {backgroundColor: colors.error + '14'}]}>
                  <Icon name="bellAlert" size={13} color={colors.error} />
                  <Text style={[s.jobAlertTxt, {color: colors.error}]}>Needs a driver</Text>
                </View>
              )}
              {/* Retrievals carry two clocks and the valet needs both: the
                  doctor's deadline (are we late?) and, once a driver has
                  actually set off, how long the car has been coming. The
                  second only exists after startedAt, so it appears then. */}
              {t.type === 'retrieve' && (() => {
                const en = enRouteSeconds(t, now);
                const mins = t.plannedDepartureMinutes;
                const left = minutesUntilDeparture(t.requestedAt, mins, now);
                if (mins == null && en == null) return null;
                return (
                  <View style={s.jobClocks}>
                    {mins != null && (
                      <View style={[s.departureChip, {backgroundColor: departureTone(left, colors) + '1F'}]}>
                        <Text style={[s.departureChipTxt, {color: departureTone(left, colors)}]}>
                          {plannedDepartureLabel(t.requestedAt, mins, now)}
                        </Text>
                      </View>
                    )}
                    {en != null && (
                      <Text style={[s.jobClockTxt, {color: colors.textSecondary}]}>
                        on the way {fmtDuration(en)}
                      </Text>
                    )}
                  </View>
                );
              })()}
              {!!waitingNote && !isEscalated && (
                <Text style={[s.jobWaiting, {color: colors.textMuted}]} numberOfLines={1}>{waitingNote}</Text>
              )}

              {needsDriver && claimedByOther && (
                <View style={[s.taskActionBtn, s.jobActions, {borderColor: colors.border, backgroundColor: 'transparent'}]}>
                  <Icon name="lock" size={13} color={colors.textMuted} />
                  <Text style={[s.taskActionTxt, {color: colors.textMuted}]}>
                    {t.valetName ?? 'Another valet'} is handling this
                  </Text>
                </View>
              )}
              {needsDriver && !claimedByOther && (
                <View style={[s.jobActions, {flexDirection: 'row', gap: 8}]}>
                  <PressableScale style={[s.taskActionBtn, {flex: 1, borderColor: 'transparent', backgroundColor: colors.primary}]}
                    onPress={() => handleAssignDriverTo(t)}>
                    <Icon name="people" size={13} color={colors.textOnPrimary} />
                    <Text style={[s.taskActionTxt, {color: colors.textOnPrimary}]}>Assign driver</Text>
                  </PressableScale>
                  <PressableScale style={[s.taskActionBtn, {borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: 14}]}
                    onPress={() => handleCancelTask(t.id)}>
                    <Text style={[s.taskActionTxt, {color: colors.textSecondary}]}>Cancel job</Text>
                  </PressableScale>
                </View>
              )}
              {t.status === 'assigned' && !needsDriver && t.type === 'park' && (
                awaitingAccept ? (
                  <View style={[s.jobActions, {flexDirection: 'row', gap: 8}]}>
                    <View style={[s.taskActionBtn, {flex: 1, borderColor: colors.border, backgroundColor: 'transparent'}]}>
                      <Icon name="timer" size={13} color={colors.textMuted} />
                      <Text style={[s.taskActionTxt, {color: colors.textMuted}]} numberOfLines={1}>Waiting to accept…</Text>
                    </View>
                    <PressableScale
                      style={[s.taskActionBtn, {borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: 14}]}
                      disabled={cancellingAssignmentId === t.id}
                      onPress={() => handleCancelAssignment(t.id)}>
                      <Text style={[s.taskActionTxt, {color: colors.textSecondary}]}>
                        {cancellingAssignmentId === t.id ? 'Cancelling…' : 'Cancel Assign'}
                      </Text>
                    </PressableScale>
                  </View>
                ) : (
                  <PressableScale
                    style={[s.taskActionBtn, s.jobActions, {borderColor: 'transparent', backgroundColor: colors.success, opacity: collectingKeyTaskId === t.id ? 0.6 : 1}]}
                    disabled={collectingKeyTaskId === t.id}
                    onPress={async () => {
                      if (collectingKeyTaskId != null) return;
                      setCollectingKeyTaskId(t.id);
                      try {
                        await markKeyCollected(t.id);
                      } catch (err: any) {
                        dialog.alert(err.message || 'Could not mark key handed over', {title: 'Error'});
                      } finally {
                        setCollectingKeyTaskId(null);
                      }
                    }}>
                    {collectingKeyTaskId === t.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Icon name="check" size={14} color="#fff" />}
                    <Text style={[s.taskActionTxt, {color: '#fff'}]}>
                      {collectingKeyTaskId === t.id ? 'Please wait…' : 'Key handed over'}
                    </Text>
                  </PressableScale>
                )
              )}
              {canRecall && (
                <PressableScale style={[s.taskActionBtn, s.jobActions, {borderColor: colors.warning, backgroundColor: 'transparent'}]}
                  onPress={() => handleRecallTask(t.id, t.carNumber)}>
                  <Icon name="back" size={13} color={colors.warning} />
                  <Text style={[s.taskActionTxt, {color: colors.warning}]}>Bring car back</Text>
                </PressableScale>
              )}
              {recalled && (t.status === 'key_collected' || t.status === 'in_transit') && (
                <View style={[s.taskActionBtn, s.jobActions, {borderColor: colors.border, backgroundColor: 'transparent'}]}>
                  <Icon name="timer" size={13} color={colors.textMuted} />
                  <Text style={[s.taskActionTxt, {color: colors.textMuted}]}>Driver is bringing it back…</Text>
                </View>
              )}
              {needsConfirm && (
                <PressableScale
                  style={[s.taskActionBtn, s.jobActions, {borderColor: 'transparent', backgroundColor: colors.success, opacity: confirmingTaskId === t.id ? 0.6 : 1}]}
                  disabled={confirmingTaskId === t.id}
                  onPress={() => handleConfirmTaskDelivered(t.id)}>
                  {confirmingTaskId === t.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Icon name="checkBold" size={14} color="#fff" />}
                  <Text style={[s.taskActionTxt, {color: '#fff'}]}>
                    {confirmingTaskId === t.id ? 'Please wait…' : (recalled ? 'Confirm car returned' : 'Confirm handover')}
                  </Text>
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
  inboxBadgeAlt:{position:'absolute',bottom:-4,left:-4,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:'#fff'},
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

  // 2x2 action grid — two equal cards per row, wrapping to a second row.
  // `(100% - gap) / 2` via percentage width keeps it responsive across phone
  // sizes without a hardcoded pixel width like the old 2-card row had.
  actionGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:12,marginBottom:24},
  actionCard:{width:'48.5%',borderRadius:22,padding:18,minHeight:148,alignItems:'center',shadowColor:'#000',shadowOffset:{width:0,height:6},shadowOpacity:0.16,shadowRadius:10,elevation:4},
  actionIconWrap:{width:46,height:46,borderRadius:14,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',marginBottom:10},
  actionCardTxt:{color:'#fff',fontSize:15,fontWeight:'800',textAlign:'center'},
  actionCardSub:{color:'rgba(255,255,255,0.65)',fontSize:11,lineHeight:14,marginTop:4,textAlign:'center'},
  actionBadge:{alignSelf:'center',borderRadius:99,paddingHorizontal:9,paddingVertical:4,marginTop:10},
  actionBadgeTxt:{color:'#fff',fontSize:10.5,fontWeight:'800'},
  sectionTitle:{fontSize:14,fontWeight:'800',marginBottom:12},
  driverPill:{borderRadius:16,borderWidth:1,width:128,overflow:'hidden'},
  driverPillTop:{flexDirection:'row',alignItems:'center',gap:8,padding:12,borderBottomWidth:1},
  driverAvatar:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},
  driverPillName:{flex:1,fontSize:13,fontWeight:'800'},
  driverPillBottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:12,paddingVertical:8},
  driverPillStatus:{fontSize:11,fontWeight:'700'},
  driverPillMeta:{fontSize:10,fontWeight:'600'},
  // Job card: the plate is the headline, one filled band carries the
  // "what does this need from me" signal, actions sit at the bottom.
  // Dropped the 4px left type-stripe — type is already stated by the IN/OUT
  // tag, and the stripe was competing with the status band for the same job.
  taskCard:{borderRadius:18,borderWidth:1,padding:16,marginBottom:12},
  jobHead:{flexDirection:'row',alignItems:'flex-start',gap:12},
  jobPlate:{fontSize:22,fontWeight:'900',letterSpacing:0.5,fontVariant:['tabular-nums']},
  jobWho:{fontSize:12,fontWeight:'600',marginTop:3},
  jobTypeTag:{flexDirection:'row',alignItems:'center',gap:3,borderRadius:8,paddingHorizontal:9,paddingVertical:5},
  jobTypeTxt:{fontSize:10,fontWeight:'900',letterSpacing:1},
  jobAlert:{flexDirection:'row',alignItems:'center',gap:7,borderRadius:10,paddingHorizontal:11,paddingVertical:9,marginTop:12},
  jobAlertTxt:{flex:1,fontSize:12.5,fontWeight:'800'},
  jobWaiting:{fontSize:12,fontWeight:'600',marginTop:10},
  jobClocks:{flexDirection:'row',alignItems:'center',gap:5,marginTop:10,flexWrap:'wrap'},
  jobClockTxt:{fontSize:12,fontWeight:'700'},
  inboxTabs:{flexDirection:'row',borderBottomWidth:1,paddingHorizontal:20},
  inboxTab:{flex:1,alignItems:'center',paddingVertical:12},
  inboxTabTxt:{fontSize:13,fontWeight:'800'},
  inboxTabBar:{height:2,borderRadius:1,marginTop:8,alignSelf:'stretch',marginHorizontal:6},
  inboxSectionRow:{flexDirection:'row',alignItems:'center',gap:6},
  inboxSectionCount:{minWidth:18,height:18,borderRadius:9,paddingHorizontal:5,alignItems:'center',justifyContent:'center'},
  inboxSectionCountTxt:{color:'#fff',fontSize:10,fontWeight:'800'},
  arrivalSearchWrap:{flexDirection:'row',alignItems:'center',gap:8,marginHorizontal:20,marginTop:12,paddingHorizontal:12,height:42,borderRadius:12,borderWidth:1},
  arrivalSearchInput:{flex:1,fontSize:14,fontWeight:'600',padding:0},
  departureBadge:{borderRadius:8,paddingHorizontal:10,paddingVertical:6},
  departureBadgeTxt:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:0.8},
  departureChip:{borderRadius:6,paddingHorizontal:8,paddingVertical:3},
  departureChipTxt:{fontSize:11,fontWeight:'900',letterSpacing:0.5},
  jobHeadRight:{alignItems:'flex-end',gap:6},
  jobOwnerBadge:{borderRadius:6,borderWidth:1,paddingHorizontal:7,paddingVertical:3,maxWidth:96},
  jobOwnerBadgeTxt:{fontSize:9.5,fontWeight:'900',letterSpacing:0.6},
  jobActions:{marginTop:12},
  // Retrieval/arrival cards still use these.
  taskTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  typePill:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:6,paddingHorizontal:8,paddingVertical:3},
  typePillTxt:{fontSize:10,fontWeight:'800',letterSpacing:0.5},
  taskStatusTxt:{fontSize:11,fontWeight:'700'},
  taskDoctor:{fontSize:14,fontWeight:'800'},
  taskMetaRow:{flexDirection:'row',alignItems:'center',gap:5,marginBottom:4},
  taskMeta:{fontSize:12,fontWeight:'600'},
  taskActionBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:12,paddingVertical:12,borderWidth:1},
  taskActionTxt:{fontSize:12.5,fontWeight:'800'},
  emptyBox:{borderRadius:14,borderWidth:1,borderStyle:'dashed',padding:24,alignItems:'center',marginBottom:16},
  emptyTxt:{fontSize:13,fontWeight:'600'},
  subContent:{padding:20,paddingBottom:40},
  confirmCard:{borderRadius:18,padding:18,marginBottom:18},
  confirmAvatarTxt:{fontSize:18,fontWeight:'900'},
  jobSlot:{fontSize:12,fontWeight:'600',marginTop:1},
  confirmTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  confirmWho:{flex:1,fontSize:20,fontWeight:'900',letterSpacing:-0.3},
  confirmSub:{fontSize:13,fontWeight:'700',marginTop:3},
  confirmFacts:{marginTop:12,paddingTop:10,borderTopWidth:1,gap:7},
  confirmFactRow:{flexDirection:'row',alignItems:'center'},
  confirmFactKey:{width:88,fontSize:10,fontWeight:'800',letterSpacing:0.8},
  confirmFactVal:{flex:1,fontSize:15,fontWeight:'800',fontVariant:['tabular-nums']},
  confirmTypePill:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:8,paddingHorizontal:8,paddingVertical:5},
  confirmTypeTxt:{fontSize:9,fontWeight:'800',letterSpacing:0.5},
  stepLabel:{fontSize:10,fontWeight:'800',letterSpacing:1.5,marginBottom:8},
  stepDesc:{fontSize:16,fontWeight:'700',marginBottom:18},
  driverSearchRow:{flexDirection:'row',gap:10,marginBottom:16},
  driverSearchBox:{flex:1,flexDirection:'row',alignItems:'center',gap:8,borderRadius:14,borderWidth:1,paddingHorizontal:14,height:48},
  driverSearchInput:{flex:1,fontSize:14,fontWeight:'600',height:48},
  assignNoteCard:{flexDirection:'row',alignItems:'center',gap:10,borderRadius:14,borderWidth:1,padding:14,marginTop:8},
  assignNoteIconWrap:{width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center'},
  assignNoteTxt:{flex:1,fontSize:12,fontWeight:'600',lineHeight:17},
  skipBtn:{borderRadius:10,borderWidth:1,paddingHorizontal:14,paddingVertical:9},
  skipBtnTxt:{fontSize:13,fontWeight:'800'},
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
  fieldLabelRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  fieldReq:{fontSize:9,fontWeight:'900',letterSpacing:0.8,marginBottom:8,marginTop:4},
  fieldError:{fontSize:12,fontWeight:'700',marginTop:-10,marginBottom:10,marginLeft:2},
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
