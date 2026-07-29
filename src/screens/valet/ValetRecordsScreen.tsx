import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, StatusBar, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {Visitor, ParkingTask} from '../../context/AppStateContext';
import {Icon} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {DriverPickerList} from '../../components/DriverPickerList';
import {useValetActions} from './useValetActions';

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

type RecordsTab = 'visitors' | 'staff';
type StatusFilter = 'all' | 'active' | 'completed';

export function ValetRecordsScreen() {
  const {colors, isDark} = useTheme();
  const {tasks, activeVisitors, availableDrivers, hasActiveRetrievalDriver,
    assignVisitorPickupDriver, assignVisitorRetrievalDriver, cancelVisitor, confirmVisitorDelivered,
    confirmTaskDelivered} = useValetActions();

  const [tab, setTab] = useState<RecordsTab>('visitors');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [pendingVisitorId, setPendingVisitorId] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<'park' | 'retrieve' | null>(null);

  const q = query.trim().toLowerCase();

  const visitorsFiltered = activeVisitors
    .filter(v => statusFilter === 'all' || (statusFilter === 'completed' ? v.status === 'retrieved' : v.status !== 'retrieved'))
    .filter(v => !q || v.name?.toLowerCase().includes(q) || v.carNumber?.toLowerCase().includes(q) || v.token.toLowerCase().includes(q));

  // Staff/doctor tab is the actual "how many doctors" record — every park +
  // retrieve task, not just the ones still in progress (that live view is
  // the Home tab's Job Queue; this one's a searchable log).
  const staffFiltered = tasks
    .filter(t => statusFilter === 'all' || (statusFilter === 'completed' ? t.status === 'completed' : t.status !== 'completed'))
    .filter(t => !q || t.doctorName?.toLowerCase().includes(q) || t.carNumber?.toLowerCase().includes(q));

  const pendingVisitor = pendingVisitorId ? activeVisitors.find(v => v.id === pendingVisitorId) ?? null : null;

  const handleAssign = async (driverId: number) => {
    if (!pendingVisitorId || !pendingMode) return;
    try {
      if (pendingMode === 'retrieve') await assignVisitorRetrievalDriver(pendingVisitorId, driverId);
      else await assignVisitorPickupDriver(pendingVisitorId, driverId);
      setPendingVisitorId(null); setPendingMode(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    }
  };

  const handleConfirmVisitorDelivered = async (visitorId: number) => {
    try {
      await confirmVisitorDelivered(visitorId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not confirm handover');
    }
  };

  const handleConfirmTaskDelivered = async (taskId: number) => {
    try {
      await confirmTaskDelivered(taskId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not confirm handover');
    }
  };

  const handleCancel = (visitorId: number) => {
    Alert.alert('Cancel Visitor Token', 'Why is this being cancelled?', [
      {text: 'Never mind', style: 'cancel'},
      {text: 'No-Show', onPress: () => cancelVisitor(visitorId, 'no_show').catch(err => Alert.alert('Error', err.message || 'Something went wrong'))},
      {text: 'Cancel Visit', style: 'destructive', onPress: () => cancelVisitor(visitorId, 'valet_cancelled').catch(err => Alert.alert('Error', err.message || 'Something went wrong'))},
    ]);
  };

  if (pendingVisitor) {
    return (
      <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={s.header}>
          <PressableScale onPress={() => { setPendingVisitorId(null); setPendingMode(null); }} style={[s.skipBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.skipTxt, {color: colors.textPrimary}]}>Cancel</Text>
          </PressableScale>
          <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Assign Driver</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={[s.stepDesc, {color: colors.textPrimary}]}>
            {pendingMode === 'retrieve'
              ? `Assign a driver to retrieve ${pendingVisitor.carNumber} from slot ${pendingVisitor.slotId} for ${pendingVisitor.name}`
              : `Tap a driver to collect the key and park ${pendingVisitor.name}'s car (${pendingVisitor.carNumber})`}
          </Text>
          <DriverPickerList drivers={availableDrivers} onAssign={handleAssign} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const renderVisitorTicket = (v: Visitor) => {
    const needsDriver = v.status === 'parked' && v.retrievalRequested && !hasActiveRetrievalDriver(v);
    const retrieving = v.status === 'parked' && v.retrievalRequested && !needsDriver;
    const parkedIdle = v.status === 'parked' && !v.retrievalRequested;
    const delivered = v.status === 'delivered';
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
            <Text style={[s.name, {color: colors.textPrimary}]}>{v.name}</Text>
            <View style={[s.chip, {backgroundColor: chipBg}]}>
              <View style={[s.chipDot, {backgroundColor: chipTone}]} />
              <Text style={[s.chipTxt, {color: chipTone}]}>{chipLabel}</Text>
            </View>
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
            <PressableScale style={[s.actionBtn, {backgroundColor: colors.success}]}
              onPress={() => handleConfirmVisitorDelivered(v.id)}>
              <Icon name="checkBold" size={15} color="#fff" />
              <Text style={[s.actionTxt, {color: '#fff'}]}>Confirm handed to owner</Text>
            </PressableScale>
          )}
          {v.status === 'pending' && (
            <PressableScale style={[s.actionBtn, s.actionGhost, {borderColor: colors.border}]}
              onPress={() => handleCancel(v.id)}>
              <Icon name="close" size={14} color={colors.textSecondary} />
              <Text style={[s.actionTxt, {color: colors.textSecondary}]}>Cancel / No-Show</Text>
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
    const needsDriver = t.status === 'assigned' && !t.driverId;
    const delivered = t.status === 'delivered';
    const chipTone = t.status === 'completed' ? colors.success : delivered ? colors.warning : colors.warning;
    const chipBg = t.status === 'completed' ? colors.successLight : colors.warningLight;
    const chipLabel = t.status === 'completed' ? (t.type === 'park' ? `Parked · ${t.slotId ?? ''}` : 'Retrieved')
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
          </View>

          <View style={s.carRow}>
            <View style={[s.carSwatch, {backgroundColor: swatch}]} />
            <Text style={[s.carReg, {color: colors.textSecondary}]}>{t.carNumber}</Text>
          </View>

          {!!t.driverName && <Text style={[s.driverTxt, {color: colors.textMuted}]}>Driver: {t.driverName}</Text>}

          {delivered && (
            <PressableScale style={[s.actionBtn, {backgroundColor: colors.success}]}
              onPress={() => handleConfirmTaskDelivered(t.id)}>
              <Icon name="checkBold" size={15} color="#fff" />
              <Text style={[s.actionTxt, {color: '#fff'}]}>Confirm handed to owner</Text>
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

  const filtered = tab === 'visitors' ? visitorsFiltered : staffFiltered;
  const totalCount = tab === 'visitors' ? activeVisitors.length : tasks.length;

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={s.titleRow}>
        <Text style={[s.title, {color: colors.textPrimary}]}>Records</Text>
        <Text style={[s.titleCount, {color: colors.textMuted}]}>{filtered.length} of {totalCount}</Text>
      </View>

      {/* Top tab switcher — same underline pattern as the Live Map screen */}
      <View style={[s.tabBar, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        <PressableScale style={s.tabItem} onPress={() => setTab('visitors')}>
          <Text style={[s.tabLabel, {color: tab === 'visitors' ? colors.textPrimary : colors.textMuted}]}>Visitors</Text>
          {tab === 'visitors' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
        <PressableScale style={s.tabItem} onPress={() => setTab('staff')}>
          <Text style={[s.tabLabel, {color: tab === 'staff' ? colors.textPrimary : colors.textMuted}]}>Staff</Text>
          {tab === 'staff' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
      </View>

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
              onPress={() => setStatusFilter(f)}
              style={[s.filterChip, {backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border}]}
            >
              <Text style={[s.filterChipTxt, {color: on ? colors.textOnPrimary : colors.textSecondary}]}>
                {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed'}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={[s.emptyTitle, {color: colors.textSecondary}]}>{q ? 'No match found' : `No ${tab} records`}</Text>
            <Text style={[s.emptySub, {color: colors.textMuted}]}>
              {q ? 'Try a different name, plate, or ID' : tab === 'visitors' ? 'New tokens appear here as they are issued' : 'Staff/doctor parking activity appears here'}
            </Text>
          </View>
        ) : tab === 'visitors' ? (filtered as Visitor[]).map(renderVisitorTicket) : (filtered as ParkingTask[]).map(renderStaffTicket)}
      </ScrollView>
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
  tabUnderline: {position: 'absolute', bottom: 0, left: 16, right: 16, height: 2, borderRadius: 1},

  searchRow: {paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4},
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 15, height: 48,
    shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  searchInput: {flex: 1, fontSize: 15, fontWeight: '500', padding: 0},

  filterRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10},
  filterChip: {borderRadius: 99, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7},
  filterChipTxt: {fontSize: 12, fontWeight: '700'},

  scroll: {padding: 20, paddingTop: 14, paddingBottom: 40},

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
  carRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7},
  carSwatch: {width: 22, height: 10, borderRadius: 3},
  carReg: {fontSize: 13, fontWeight: '700', letterSpacing: 1.2},
  driverTxt: {fontSize: 12, fontWeight: '600', marginTop: 8},
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

  emptyWrap: {alignItems: 'center', gap: 6, paddingTop: 48},
  emptyTitle: {fontSize: 14, fontWeight: '600'},
  emptySub: {fontSize: 12.5, fontWeight: '500'},
});
