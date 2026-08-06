import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, StatusBar, ActivityIndicator, Modal, Pressable, Platform} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {Visitor, ParkingTask} from '../../context/AppStateContext';
import {Icon} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {HScrollHint} from '../../components/HScrollHint';
import {DriverPickerList} from '../../components/DriverPickerList';
import {useValetActions} from './useValetActions';
import {ParkingMapScreen} from '../ParkingMapScreen';
import {selectVisitorStage, selectStaffStage, Stage} from '../../core/valet/selectors/JobStageSelector';
import {
  buildLatestTaskByDoctor, canRequestStaffRetrieval as coreCanRequestStaffRetrieval,
  matchesStaffStatusFilter, matchesVisitorStatusFilter,
} from '../../core/valet/selectors/JobHistorySelector';

function fmtTime(ms?: number) {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
}

const STUB_W = 78;
const NOTCH = 18;

// Placeholder body colours until the visitor's real vehicle colour comes
// through the backend (Vehicle Setup work) — stable per token so a card
// doesn't change colour between refreshes.
const SWATCHES = ['#2E5BFF', '#1FA24A', '#D32F2F', '#F5B301', '#46505C', '#7C3AED', '#0D9488', '#B3B9C4'];
function tokenColour(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return SWATCHES[Math.abs(h) % SWATCHES.length];
}

// Vertical dashed perforation line — RN's borderStyle:'dashed' is
// unreliable for a single-side border on Android, so draw real dashes.
function PerfLine({color}: {color: string}) {
  return (
    <View style={s.perfLine}>
      {Array.from({length: 14}, (_, i) => (
        <View key={i} style={[s.perfDash, {backgroundColor: color}]} />
      ))}
    </View>
  );
}

type RecordsTab = 'visitors' | 'staff' | 'map';
type StatusFilter = 'all' | 'active' | 'completed';
// One shared vehicle-lifecycle stage, whether the ticket is a visitor token
// or a staff/doctor session — both run the identical park -> parked ->
// retrieve journey underneath, just through different record shapes.
// Stage classification itself now lives in
// core/valet/selectors/JobStageSelector (Phase 1 of
// VALET_ARCHITECTURE_REFACTOR.md) — same 4 stages, same meaning.
type StageFilter = 'all' | Stage;
const STAGE_FILTERS: {key: Exclude<StageFilter, 'all'>; label: string}[] = [
  {key: 'atHospital', label: 'At hospital'},
  {key: 'transitToLot', label: 'Vehicle → parking lot'},
  {key: 'parked', label: 'Parked'},
  {key: 'transitToHospital', label: 'Vehicle → hospital'},
];

export function ValetRecordsScreen() {
  const dialog = useDialog();
  const {colors, isDark} = useTheme();
  const {tasks, activeVisitors, availableDrivers, hasActiveRetrievalDriver,
    assignVisitorPickupDriver, assignVisitorRetrievalDriver, assignStaffRetrievalDriver, cancelVisitor, recallVisitor, confirmVisitorDelivered,
    confirmTaskDelivered, fetchTaskHistory} = useValetActions();

  const [tab, setTab] = useState<RecordsTab>('visitors');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [pendingVisitorId, setPendingVisitorId] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<'park' | 'retrieve' | null>(null);
  // The staff/doctor equivalent of pendingVisitorId — set when the valet taps
  // "Request retrieval" on a staff ticket, so the same driver-assign screen
  // below can serve both flows.
  const [pendingDoctorTaskId, setPendingDoctorTaskId] = useState<number | null>(null);
  const [assigningDriverId, setAssigningDriverId] = useState<number | null>(null);
  const [confirmingVisitorId, setConfirmingVisitorId] = useState<number | null>(null);
  const [recallingVisitorId, setRecallingVisitorId] = useState<number | null>(null);
  const [confirmingTaskId, setConfirmingTaskId] = useState<number | null>(null);
  // Detail sheet — shared by both tabs, holds whichever ticket was tapped.
  const [detailVisitor, setDetailVisitor] = useState<Visitor | null>(null);
  const [detailTask, setDetailTask] = useState<ParkingTask | null>(null);
  // Every staff/doctor session ever, not just each doctor's single current
  // one — the live `tasks` array is deliberately bounded to "at most one row
  // per doctor" now, so this tab's actual record view needs its own fetch.
  const [staffHistory, setStaffHistory] = useState<ParkingTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'staff') return;
    setHistoryLoading(true);
    fetchTaskHistory().then(setStaffHistory).catch(() => {}).finally(() => setHistoryLoading(false));
    // This screen used to fetch history ONCE, on tab entry, and never again —
    // a check-in or status change that happened while a valet was already
    // sitting on this tab just never appeared until they left and came back.
    // `tasks` (the live, socket-fed current-tasks list from AppStateContext)
    // changing is our proxy for "something happened" — history itself isn't
    // pushed over the socket, so this piggybacks on the one realtime signal
    // that already exists, and the backend response is cheap/cached anyway.
  }, [tab, fetchTaskHistory, tasks]);

  const q = query.trim().toLowerCase();

  // The 4-stage breakdown that appears under "Active" — same stages for a
  // visitor token and a staff/doctor session, since both run the identical
  // park -> parked -> retrieve journey, just through different record shapes.
  const visitorStage = (v: Visitor) => selectVisitorStage(v, hasActiveRetrievalDriver);
  const staffStage = (t: ParkingTask) => selectStaffStage(t);

  const visitorsFiltered = activeVisitors
    .filter(v => matchesVisitorStatusFilter(v, statusFilter))
    .filter(v => statusFilter !== 'active' || stageFilter === 'all' || visitorStage(v) === stageFilter)
    .filter(v => !q || v.name?.toLowerCase().includes(q) || v.carNumber?.toLowerCase().includes(q) || v.token.toLowerCase().includes(q));

  // A doctor's most recent task tells us whether their session is still
  // open — see core/valet/selectors/JobHistorySelector for the full
  // reasoning (ported verbatim, just centralized).
  const latestTaskByDoctor = buildLatestTaskByDoctor(staffHistory);
  const canRequestStaffRetrieval = (t: ParkingTask) => coreCanRequestStaffRetrieval(t, latestTaskByDoctor);

  // Staff/doctor tab is the actual "how many doctors" record — every park +
  // retrieve task, not just the ones still in progress (that live view is
  // the Home tab's Job Queue; this one's a searchable log). Visitor-linked
  // tasks are excluded — they already have their own tab, and an unscoped
  // history fetch returns every task ever, staff and visitor alike.
  const staffFiltered = staffHistory
    .filter(t => !t.isVisitor)
    .filter(t => matchesStaffStatusFilter(t, statusFilter, latestTaskByDoctor))
    .filter(t => statusFilter !== 'active' || stageFilter === 'all' || staffStage(t) === stageFilter)
    .filter(t => !q || t.doctorName?.toLowerCase().includes(q) || t.carNumber?.toLowerCase().includes(q));

  const pendingVisitor = pendingVisitorId ? activeVisitors.find(v => v.id === pendingVisitorId) ?? null : null;
  const pendingDoctorTask = pendingDoctorTaskId ? staffHistory.find(t => t.id === pendingDoctorTaskId) ?? null : null;

  const handleAssign = async (driverId: number) => {
    if (!pendingVisitorId && !pendingDoctorTaskId) return;
    if (assigningDriverId != null) return;
    setAssigningDriverId(driverId);
    try {
      if (pendingDoctorTaskId != null) {
        if (!pendingDoctorTask) return;
        await assignStaffRetrievalDriver(pendingDoctorTask.doctorId, driverId);
        setPendingDoctorTaskId(null);
      } else if (pendingVisitorId != null) {
        if (pendingMode === 'retrieve') await assignVisitorRetrievalDriver(pendingVisitorId, driverId);
        else await assignVisitorPickupDriver(pendingVisitorId, driverId);
        setPendingVisitorId(null); setPendingMode(null);
      }
    } catch (err: any) {
      dialog.alert(err.message || 'Something went wrong', {title: 'Error'});
    } finally {
      setAssigningDriverId(null);
    }
  };


  const handleConfirmVisitorDelivered = async (visitorId: number) => {
    if (confirmingVisitorId != null) return;
    setConfirmingVisitorId(visitorId);
    try {
      await confirmVisitorDelivered(visitorId);
    } catch (err: any) {
      dialog.alert(err.message || 'Could not confirm handover', {title: 'Error'});
    } finally {
      setConfirmingVisitorId(null);
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

  const handleCancel = (visitorId: number) => {
    dialog.show({title: 'Cancel Visitor Token', message: 'This will cancel the check-in. This cannot be undone.', tone: 'warning', buttons: [
      {text: 'Never mind', style: 'cancel'},
      {text: 'Cancel Token', style: 'destructive', onPress: () => cancelVisitor(visitorId, 'valet_cancelled').catch(err => dialog.alert(err.message || 'Something went wrong', {title: 'Error'}))},
    ]});
  };

  // Past the key handover the car is physically with a driver — it can't be
  // cancelled/no-shown anymore (see cancelVisitor's backend comment), so
  // this is the only thing left on offer at that stage.
  const handleRecallVisitor = (visitorId: number, carNumber?: string) => {
    dialog.show({
      title: 'Bring the Car Back?',
      message: `The driver will be told NOT to park ${carNumber || 'this car'} and to return it to the valet counter instead.`,
      tone: 'warning',
      buttons: [
        {text: 'Never mind', style: 'cancel'},
        {text: 'Recall Car', style: 'destructive', onPress: async () => {
          if (recallingVisitorId != null) return;
          setRecallingVisitorId(visitorId);
          try {
            await recallVisitor(visitorId);
          } catch (err: any) {
            dialog.alert(err.message || 'Could not recall the car', {title: 'Error'});
          } finally {
            setRecallingVisitorId(null);
          }
        }},
      ],
    });
  };

  if (pendingVisitor || pendingDoctorTask) {
    return (
      <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.header}>
          <PressableScale
            onPress={() => { setPendingVisitorId(null); setPendingMode(null); setPendingDoctorTaskId(null); }}
            style={[s.skipBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.skipTxt, {color: colors.textPrimary}]}>Cancel</Text>
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Assign Driver</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>
            {pendingDoctorTask
              ? `Assign a driver to retrieve ${pendingDoctorTask.carNumber} for ${pendingDoctorTask.doctorName}`
              : pendingMode === 'retrieve'
              ? `Assign a driver to retrieve ${pendingVisitor!.carNumber} from slot ${pendingVisitor!.slotId} for ${pendingVisitor!.name}`
              : `Tap a driver to collect the key and park ${pendingVisitor!.name}'s car (${pendingVisitor!.carNumber})`}
          </Text>
          <DriverPickerList drivers={availableDrivers} onAssign={handleAssign} assigningId={assigningDriverId} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const renderVisitorTicket = (v: Visitor) => {
    const needsDriver = v.status === 'parked' && v.retrievalRequested && !hasActiveRetrievalDriver(v);
    const retrieving = v.status === 'parked' && v.retrievalRequested && !needsDriver;
    const parkedIdle = v.status === 'parked' && !v.retrievalRequested;
    const delivered = v.status === 'delivered';
    // The visitor row itself doesn't track a driver's key handover — that
    // lives on its linked ParkingTask (see backend createVisitor). Reading
    // it here is what tells the difference between "nobody's touched this
    // yet" (Cancel/No-Show is still valid) and "a driver already has the
    // key" (only a recall makes sense from here on).
    const linkedTask = tasks.find(t => t.visitorId === v.id && t.type === 'park' && t.status !== 'completed' && t.status !== 'cancelled');
    const keyWithDriver = v.status === 'pending' && !!v.driverId;
    const awaitingDriver = v.status === 'pending' && !v.driverId;
    const recalled = !!linkedTask?.recalledAt;
    const chipTone = parkedIdle ? colors.success : colors.warning;
    const chipBg = parkedIdle ? colors.successLight : colors.warningLight;
    const chipLabel = parkedIdle ? `Parked · ${v.slotId ?? ''}`
      : delivered ? 'Awaiting pickup confirmation'
      : retrieving ? 'Retrieving'
      : needsDriver ? 'Ready to leave'
      : v.pickedUpAt ? 'Parking now'
      : v.acceptedAt ? 'Collecting key'
      : v.driverId ? 'Awaiting accept'
      : v.status === 'retrieved' ? 'Retrieved'
      : 'Awaiting driver';
    const swatch = tokenColour(v.token);

    return (
      <View key={v.id} style={[
        s.ticket,
        {backgroundColor: colors.surface},
        // Car's back at the counter, nothing's confirmed the handover yet —
        // the one thing on this whole screen that's actually time-sensitive
        // right now, so it gets a visible highlight rather than living in
        // some separate "needs attention" panel.
        delivered && {borderWidth: 2, borderColor: colors.warning},
      ]}>
        {/* perforation notches — cut into the card by the screen background */}
        <View style={[s.notch, s.notchTop, {backgroundColor: colors.background}]} />
        <View style={[s.notch, s.notchBottom, {backgroundColor: colors.background}]} />

        {/* main body */}
        <View style={s.ticketBody}>
          <View style={s.nameRow}>
            <Text style={[s.name, {color: colors.textPrimary}]}>{v.name || 'Visitor'}</Text>
            <View style={[s.chip, {backgroundColor: chipBg}]}>
              <View style={[s.chipDot, {backgroundColor: chipTone}]} />
              <Text style={[s.chipTxt, {color: chipTone}]}>{chipLabel}</Text>
            </View>
            <PressableScale style={[s.infoBtn, {backgroundColor: colors.cardAlt}]} onPress={() => setDetailVisitor(v)}>
              <Icon name="info" size={13} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <View style={s.carRow}>
            <View style={[s.carSwatch, {backgroundColor: swatch}]} />
            <Text style={[s.carReg, {color: colors.textSecondary}]}>{v.carNumber ?? 'No plate'}</Text>
          </View>

          {parkedIdle && (
            <PressableScale style={[s.actionBtn, {backgroundColor: colors.primary}]}
              onPress={() => { setPendingVisitorId(v.id); setPendingMode('retrieve'); }}>
              <Text style={[s.actionTxt, {color: colors.textOnPrimary}]}>Request retrieval</Text>
              <Icon name="arrowRight" size={15} color={colors.textOnPrimary} />
            </PressableScale>
          )}
          {needsDriver && (
            <PressableScale style={[s.actionBtn, {backgroundColor: colors.warning}]}
              onPress={() => { setPendingVisitorId(v.id); setPendingMode('retrieve'); }}>
              <Text style={[s.actionTxt, {color: '#fff'}]}>Assign driver</Text>
              <Icon name="arrowRight" size={15} color="#fff" />
            </PressableScale>
          )}
          {retrieving && (
            <View style={[s.actionBtn, {backgroundColor: colors.warningLight}]}>
              <Text style={[s.actionTxt, {color: colors.warning}]}>{v.driverName ?? 'Driver'} en route…</Text>
            </View>
          )}
          {delivered && (
            <PressableScale
              style={[s.actionBtn, {backgroundColor: colors.success, opacity: confirmingVisitorId === v.id ? 0.6 : 1}]}
              disabled={confirmingVisitorId === v.id}
              onPress={() => handleConfirmVisitorDelivered(v.id)}>
              {confirmingVisitorId === v.id
                ? <ActivityIndicator color="#fff" size="small" />
                : <Icon name="checkBold" size={15} color="#fff" />}
              <Text style={[s.actionTxt, {color: '#fff'}]}>
                {confirmingVisitorId === v.id ? 'Please wait…' : 'Confirm handed to owner'}
              </Text>
            </PressableScale>
          )}
          {/* Awaiting driver — nobody's touched this yet, cancel/no-show is
              still the right call. */}
          {awaitingDriver && (
            <PressableScale style={[s.actionBtn, s.actionGhost, {borderColor: colors.border}]}
              onPress={() => handleCancel(v.id)}>
              <Icon name="close" size={14} color={colors.textSecondary} />
              <Text style={[s.actionTxt, {color: colors.textSecondary}]}>Cancel</Text>
            </PressableScale>
          )}
          {/* A driver already has the key — the car is physically gone, so
              cancelling/no-showing it no longer makes sense. The only real
              action left is asking for it back. */}
          {keyWithDriver && !recalled && (
            <PressableScale
              style={[s.actionBtn, s.actionGhost, {borderColor: colors.warning}]}
              onPress={() => handleRecallVisitor(v.id, v.carNumber)}>
              <Icon name="back" size={14} color={colors.warning} />
              <Text style={[s.actionTxt, {color: colors.warning}]}>Bring back my car</Text>
            </PressableScale>
          )}
          {keyWithDriver && recalled && linkedTask?.status !== 'delivered' && (
            <View style={[s.actionBtn, {backgroundColor: colors.cardAlt}]}>
              <Icon name="timer" size={14} color={colors.textMuted} />
              <Text style={[s.actionTxt, {color: colors.textMuted}]}>Driver is bringing it back…</Text>
            </View>
          )}
          {keyWithDriver && linkedTask?.status === 'delivered' && (
            <PressableScale
              style={[s.actionBtn, {backgroundColor: colors.success, opacity: confirmingTaskId === linkedTask.id ? 0.6 : 1}]}
              disabled={confirmingTaskId === linkedTask.id}
              onPress={() => handleConfirmTaskDelivered(linkedTask.id)}>
              {confirmingTaskId === linkedTask.id
                ? <ActivityIndicator color="#fff" size="small" />
                : <Icon name="checkBold" size={15} color="#fff" />}
              <Text style={[s.actionTxt, {color: '#fff'}]}>
                {confirmingTaskId === linkedTask.id ? 'Please wait…' : 'Confirm car returned'}
              </Text>
            </PressableScale>
          )}
        </View>

        {/* ticket stub */}
        <PerfLine color={colors.border} />
        <View style={s.stub}>
          <Text style={[s.stubLbl, {color: colors.textMuted}]}>TOKEN</Text>
          <Text style={[s.stubToken, {color: colors.textPrimary}]}>#{v.token}</Text>
          <Text style={[s.stubSlot, {color: colors.textMuted}]}>{v.slotId ?? '—'}</Text>
          <View style={[s.stubBar, {backgroundColor: swatch}]} />
        </View>
      </View>
    );
  };

  // Staff/doctor tab — read-only record (assigning drivers / marking key
  // handed off already lives on the Home tab's Job Queue; duplicating those
  // actions here would just be the same "two places for one job" problem
  // this whole redesign was meant to get rid of).
  const renderStaffTicket = (t: ParkingTask) => {
    // 'requested'/'accepted' are the same "no driver yet" state as 'assigned'
    // with no driverId — the Home tab's Job Queue keeps them out of the queue
    // entirely (they live in the Retrieval Requests inbox instead) and
    // assignDriver always flips status straight to 'assigned' once a driver
    // is actually picked, so a requested/accepted row here always means
    // nobody's been assigned. Missing these two fell through to the "Driver
    // assigned" default below, which said the opposite of what was true.
    const needsDriver = (t.status === 'assigned' || t.status === 'requested' || t.status === 'accepted') && !t.driverId;
    const delivered = t.status === 'delivered';
    const cancelled = t.status === 'cancelled';
    const canRetrieve = canRequestStaffRetrieval(t);
    const chipTone = t.status === 'completed' ? colors.success : cancelled ? colors.textMuted : colors.warning;
    const chipBg = t.status === 'completed' ? colors.successLight : cancelled ? colors.cardAlt : colors.warningLight;
    const chipLabel = t.status === 'completed'
      ? (t.type === 'park' ? (canRetrieve ? `Parked · ${t.slotId ?? ''}` : 'Completed') : 'Retrieved')
      : cancelled ? 'Cancelled'
      : delivered ? 'Awaiting pickup confirmation'
      : needsDriver ? 'Awaiting driver'
      : t.status === 'in_transit' ? 'In transit'
      : t.status === 'key_collected' ? 'Driver has key'
      : 'Driver assigned';
    const swatch = tokenColour(`${t.type}-${t.id}`);

    return (
      <View key={t.id} style={[
        s.ticket,
        {backgroundColor: colors.surface},
        delivered && {borderWidth: 2, borderColor: colors.warning},
      ]}>
        <View style={[s.notch, s.notchTop, {backgroundColor: colors.background}]} />
        <View style={[s.notch, s.notchBottom, {backgroundColor: colors.background}]} />

        <View style={s.ticketBody}>
          <View style={s.nameRow}>
            <Text style={[s.name, {color: colors.textPrimary}]}>{t.doctorName}</Text>
            <View style={[s.chip, {backgroundColor: chipBg}]}>
              <View style={[s.chipDot, {backgroundColor: chipTone}]} />
              <Text style={[s.chipTxt, {color: chipTone}]}>{chipLabel}</Text>
            </View>
            <PressableScale style={[s.infoBtn, {backgroundColor: colors.cardAlt}]} onPress={() => setDetailTask(t)}>
              <Icon name="info" size={13} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <View style={s.carRow}>
            <View style={[s.carSwatch, {backgroundColor: swatch}]} />
            <Text style={[s.carReg, {color: colors.textSecondary}]}>{t.carNumber}</Text>
          </View>

          {(!!t.driverName || (t.type === 'park' && !!t.completedAt)) && (
            <View style={s.metaRow}>
              {!!t.driverName && <Text style={[s.driverTxt, {color: colors.textMuted}]}>Driver: {t.driverName}</Text>}
              {/* Arrival time — when the driver actually parked the car, not
                  when the job was created/assigned. Only meaningful for a
                  park task that's actually reached that point. */}
              {t.type === 'park' && !!t.completedAt && (
                <Text style={[s.driverTxt, {color: colors.textMuted}]}>Parked at {fmtTime(t.completedAt)}</Text>
              )}
            </View>
          )}

          {canRetrieve && (
            <PressableScale style={[s.actionBtn, {backgroundColor: colors.primary}]}
              onPress={() => setPendingDoctorTaskId(t.id)}>
              <Text style={[s.actionTxt, {color: colors.textOnPrimary}]}>Request retrieval</Text>
              <Icon name="arrowRight" size={15} color={colors.textOnPrimary} />
            </PressableScale>
          )}

          {delivered && (
            <PressableScale
              style={[s.actionBtn, {backgroundColor: colors.success, opacity: confirmingTaskId === t.id ? 0.6 : 1}]}
              disabled={confirmingTaskId === t.id}
              onPress={() => handleConfirmTaskDelivered(t.id)}>
              {confirmingTaskId === t.id
                ? <ActivityIndicator color="#fff" size="small" />
                : <Icon name="checkBold" size={15} color="#fff" />}
              <Text style={[s.actionTxt, {color: '#fff'}]}>
                {confirmingTaskId === t.id ? 'Please wait…' : 'Confirm handed to owner'}
              </Text>
            </PressableScale>
          )}
        </View>

        <PerfLine color={colors.border} />
        <View style={s.stub}>
          <Text style={[s.stubLbl, {color: colors.textMuted}]}>{t.type === 'park' ? 'PARK' : 'RETRIEVE'}</Text>
          <Text style={[s.stubToken, {color: colors.textPrimary}]}>#{t.id}</Text>
          <Text style={[s.stubSlot, {color: colors.textMuted}]}>{t.slotId ?? '—'}</Text>
          <View style={[s.stubBar, {backgroundColor: swatch}]} />
        </View>
      </View>
    );
  };

  const filtered = tab === 'visitors' ? visitorsFiltered : tab === 'staff' ? staffFiltered : [];
  const totalCount = tab === 'visitors' ? activeVisitors.length : tab === 'staff' ? staffHistory.length : 0;

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={s.titleRow}>
        <Text style={[s.title, {color: colors.textPrimary}]}>Jobs</Text>
        {tab !== 'map' && (
          <Text style={[s.titleCount, {color: colors.textMuted}]}>{filtered.length} of {totalCount}</Text>
        )}
      </View>

      {/* Top tab switcher — same underline pattern as the Live Map screen.
          Map Layout used to live as a sub-tab of the Map bottom tab; it's a
          record of the hospital's slots, same as Visitors/Staff are records
          of who's using them, so it moved in here alongside them. */}
      <View style={[s.tabBar, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        <PressableScale style={s.tabItem} onPress={() => setTab('visitors')}>
          <Text style={[s.tabLabel, {color: tab === 'visitors' ? colors.textPrimary : colors.textMuted}]}>Visitors</Text>
          {tab === 'visitors' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
        <PressableScale style={s.tabItem} onPress={() => setTab('staff')}>
          <Text style={[s.tabLabel, {color: tab === 'staff' ? colors.textPrimary : colors.textMuted}]}>Staff</Text>
          {tab === 'staff' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
        <PressableScale style={s.tabItem} onPress={() => setTab('map')}>
          <Text style={[s.tabLabel, {color: tab === 'map' ? colors.textPrimary : colors.textMuted}]}>Map Layout</Text>
          {tab === 'map' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
      </View>

      {tab === 'map' ? (
        <ParkingMapScreen />
      ) : (
      <>
      <View style={s.searchRow}>
        <View style={[s.searchBox, {backgroundColor: colors.surface}]}>
          <Icon name="search" size={17} color={colors.textMuted} />
          <TextInput
            style={[s.searchInput, {color: colors.textPrimary}]}
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'visitors' ? 'Search name, car, token' : 'Search doctor, car number'}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!!query && (
            <PressableScale onPress={() => setQuery('')}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </PressableScale>
          )}
        </View>
      </View>

      <View style={s.filterRow}>
        {(['active', 'completed', 'all'] as StatusFilter[]).map(f => {
          const on = statusFilter === f;
          return (
            <PressableScale
              key={f}
              onPress={() => { setStatusFilter(f); if (f !== 'active') setStageFilter('all'); }}
              style={[s.statusChip, {backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border}]}
            >
              <Text style={[s.filterChipTxt, {color: on ? colors.textOnPrimary : colors.textSecondary}]}>
                {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed'}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {/* Second-level stage row — only meaningful once "Active" narrows the
          list to still-in-flight tickets; a completed/all list mixes every
          stage together, so a stage chip there wouldn't mean anything.
          Same 4 chips, same meaning, whichever tab (Visitors or Staff) is
          showing — it's one shared vehicle-lifecycle filter, not two. */}
      {statusFilter === 'active' && (
        <HScrollHint fadeColor={colors.background} contentContainerStyle={s.stageRow}>
          {STAGE_FILTERS.map(sf => {
            const on = stageFilter === sf.key;
            return (
              <PressableScale
                key={sf.key}
                onPress={() => setStageFilter(on ? 'all' : sf.key)}
                style={[s.filterChip, {backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border}]}
              >
                <Text style={[s.filterChipTxt, {color: on ? colors.textOnPrimary : colors.textSecondary}]}>
                  {sf.label}
                </Text>
              </PressableScale>
            );
          })}
        </HScrollHint>
      )}

      {/* flexGrow:1 only for the empty states — a real list should never be
          forced to fill the screen (that would stretch a short list's
          bottom item weirdly), but an empty message pinned near the top
          with a wall of dead space below it read as broken, not "just
          short". Centering it in the available height reads as intentional
          instead. */}
      <ScrollView
        contentContainerStyle={filtered.length === 0 ? [s.scroll, s.scrollEmpty] : s.scroll}
        showsVerticalScrollIndicator={false}>
        {tab === 'staff' && historyLoading && staffHistory.length === 0 ? (
          <View style={s.emptyWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[s.emptySub, {color: colors.textMuted, marginTop: 10}]}>Loading staff records…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={[s.emptyTitle, {color: colors.textSecondary}]}>{q ? 'No match found' : `No ${tab} records`}</Text>
            <Text style={[s.emptySub, {color: colors.textMuted}]}>
              {q ? 'Try a different name, plate, or ID' : tab === 'visitors' ? 'New tokens appear here as they are issued' : 'Staff/doctor parking activity appears here'}
            </Text>
          </View>
        ) : tab === 'visitors' ? (filtered as Visitor[]).map(renderVisitorTicket) : (filtered as ParkingTask[]).map(renderStaffTicket)}
      </ScrollView>
      </>
      )}

      {/* Detail sheet — small extra context beyond what fits on the ticket
          card itself, for either tab. Read-only; the actual actions stay on
          the card so there's still exactly one place to do anything. */}
      <Modal visible={!!(detailVisitor || detailTask)} transparent animationType="fade" onRequestClose={() => { setDetailVisitor(null); setDetailTask(null); }}>
        <Pressable style={s.modalOverlay} onPress={() => { setDetailVisitor(null); setDetailTask(null); }}>
          <Pressable style={[s.modalCard, {backgroundColor: colors.surface}]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, {color: colors.textPrimary}]}>
                {detailVisitor ? (detailVisitor.name || 'Visitor') : detailTask?.doctorName}
              </Text>
              <PressableScale style={[s.modalCloseBtn, {backgroundColor: colors.cardAlt}]} onPress={() => { setDetailVisitor(null); setDetailTask(null); }}>
                <Icon name="close" size={16} color={colors.textPrimary} />
              </PressableScale>
            </View>

            {detailVisitor && [
              ['Token', `#${detailVisitor.token}`],
              ['Car number', detailVisitor.carNumber || 'No plate'],
              ['Vehicle', detailVisitor.vehicleType === 'bike' ? 'Bike' : 'Car'],
              ['Mobile', detailVisitor.mobile],
              ['Status', detailVisitor.status],
              ['Slot', detailVisitor.slotId ?? '—'],
              ['Driver', detailVisitor.driverName ?? '—'],
              ['Checked in', fmtTime(detailVisitor.createdAt) ?? '—'],
              ...(detailVisitor.pickedUpAt ? [['Key collected', fmtTime(detailVisitor.pickedUpAt)!]] : []),
              ...(detailVisitor.cancelledAt ? [['Cancelled', fmtTime(detailVisitor.cancelledAt)!]] : []),
              ...(detailVisitor.cancelReason ? [['Reason', detailVisitor.cancelReason.replace('_', ' ')]] : []),
            ].map(([k, v]) => (
              <View key={k} style={[s.detailRow, {borderBottomColor: colors.divider}]}>
                <Text style={[s.detailKey, {color: colors.textMuted}]}>{k}</Text>
                <Text style={[s.detailVal, {color: colors.textPrimary}]} numberOfLines={1}>{v}</Text>
              </View>
            ))}

            {detailTask && [
              ['Type', detailTask.type === 'park' ? 'Park' : 'Retrieve'],
              ['Car number', detailTask.carNumber],
              ['Department', detailTask.doctorDepartment || '—'],
              ['Employee ID', detailTask.doctorEmployeeId || '—'],
              ['Status', detailTask.status.replace('_', ' ')],
              ['Slot', detailTask.slotId ?? '—'],
              ['Driver', detailTask.driverName ?? '—'],
              ['Valet', detailTask.valetName ?? '—'],
              ...(detailTask.assignedAt ? [['Assigned', fmtTime(detailTask.assignedAt)!]] : []),
              ...(detailTask.completedAt ? [['Completed', fmtTime(detailTask.completedAt)!]] : []),
            ].map(([k, v]) => (
              <View key={k} style={[s.detailRow, {borderBottomColor: colors.divider}]}>
                <Text style={[s.detailKey, {color: colors.textMuted}]}>{k}</Text>
                <Text style={[s.detailVal, {color: colors.textPrimary}]} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16},
  title: {fontSize: 26, fontWeight: '900'},
  titleCount: {fontSize: 12, fontWeight: '600'},

  tabBar: {flexDirection: 'row', marginTop: 14, borderBottomWidth: 1},
  tabItem: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12},
  tabLabel: {fontSize: 14, fontWeight: '800'},
  tabUnderline: {position: 'absolute', bottom: 0, left: 0, right: 0, height: 2},

  searchRow: {paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4},
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 15, height: 48,
    shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  searchInput: {flex: 1, fontSize: 15, fontWeight: '500', padding: 0},

  filterRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10},
  // alignItems: 'center' is load-bearing here, unlike filterRow above — a
  // horizontal ScrollView's content container defaults to stretching its
  // children across the ScrollView's own (much taller) measured height,
  // which blew these chips up into tall ovals instead of flat pills.
  stageRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 10},
  stageRowWrap: {position: 'relative', overflow: 'hidden'},
  stageRowFade: {position: 'absolute', top: 0, right: 0, bottom: 0, width: 32},
  filterChip: {borderRadius: 99, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7},
  // Active/Completed/All specifically — unlike the stage chips (which sit in
  // a horizontally-scrolling row and must stay content-width), this row has
  // exactly 3 fixed options and nothing else, so each one should fill an
  // equal share of the full width instead of leaving dead space on the right.
  statusChip: {flex: 1, borderRadius: 99, borderWidth: 1, paddingVertical: 9, alignItems: 'center'},
  filterChipTxt: {fontSize: 12, fontWeight: '900', fontFamily: Platform.select({ios: 'Arial', android: 'sans-serif-black', default: 'Arial'})},

  scroll: {padding: 20, paddingTop: 14, paddingBottom: 40},
  scrollEmpty: {flexGrow: 1, justifyContent: 'center'},

  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20},
  skipBtn: {borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8},
  skipTxt: {fontSize: 13, fontWeight: '700'},
  headerTitle: {fontSize: 17, fontWeight: '900'},
  stepDesc: {fontSize: 16, fontWeight: '700', marginBottom: 20},

  ticket: {
    flexDirection: 'row', borderRadius: 22, marginBottom: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  notch: {position: 'absolute', right: STUB_W - NOTCH / 2, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, zIndex: 2},
  notchTop: {top: -NOTCH / 2},
  notchBottom: {bottom: -NOTCH / 2},

  ticketBody: {flex: 1, paddingVertical: 16, paddingLeft: 18, paddingRight: 12},
  nameRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
  name: {fontSize: 18, fontWeight: '800'},
  chip: {flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4},
  chipDot: {width: 5, height: 5, borderRadius: 3},
  chipTxt: {fontSize: 11.5, fontWeight: '700'},
  infoBtn: {width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center'},
  carRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7},
  carSwatch: {width: 22, height: 10, borderRadius: 3},
  carReg: {fontSize: 13, fontWeight: '700', letterSpacing: 1.2},
  metaRow: {marginTop: 8, gap: 2},
  driverTxt: {fontSize: 12, fontWeight: '600'},
  actionBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, marginTop: 14},
  actionGhost: {backgroundColor: 'transparent', borderWidth: 1.5},
  actionTxt: {fontSize: 14, fontWeight: '700'},

  perfLine: {width: 2, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12},
  perfDash: {width: 2, height: 6, borderRadius: 1},

  stub: {width: STUB_W - 2, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 16},
  stubLbl: {fontSize: 9.5, fontWeight: '700', letterSpacing: 2},
  stubToken: {fontSize: 24, fontWeight: '800'},
  stubSlot: {fontSize: 10.5, fontWeight: '600'},
  stubBar: {marginTop: 6, width: 22, height: 5, borderRadius: 99, opacity: 0.7},

  emptyWrap: {alignItems: 'center', gap: 6},
  emptyTitle: {fontSize: 14, fontWeight: '600'},
  emptySub: {fontSize: 12.5, fontWeight: '500'},

  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24},
  modalCard: {width: '100%', maxWidth: 420, borderRadius: 22, padding: 20},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14},
  modalTitle: {fontSize: 17, fontWeight: '900', flex: 1, marginRight: 12},
  modalCloseBtn: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  detailRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 12},
  detailKey: {fontSize: 12, fontWeight: '700'},
  detailVal: {fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right', textTransform: 'capitalize'},
});
