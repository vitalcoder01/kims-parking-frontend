import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {useTheme} from '../../context/ThemeContext';
import {useAppState, ParkingTask} from '../../context/AppStateContext';
import {useAuth} from '../../context/AuthContext';
import {useMyDriverId, isMyJob} from '../../hooks/useMyDriverId';
import {Icon} from '../../components/Icon';

// No driver GPS any more (drivers don't get an app at all — see the
// two-station handoff model's follow-up: valets assign a driver, confirm
// each end themselves, and that's the whole trip). This used to be a live
// Leaflet map (in a WebView) with a moving car marker, an ETA, and a
// distance-remaining readout, all computed from a continuous GPS feed.
// With no feed, this screen used to show a permanent "Waiting for driver's
// location…" screen that never resolved — worse than no map at all, since
// it hid the status checklist behind it too. Replaced with what the task
// record actually still has: real status transitions with real timestamps,
// pushed live over the same socket this screen already re-renders from —
// "LIVE" still means something, it's just a status feed now, not a
// position one. The isDriver/myDriverId branch below is now structurally
// unreachable (driver accounts can no longer sign in at all — see
// AuthContext), left in place as a harmless fallback rather than ripped out
// along with every other now-dead driver code path.

// How many of the 3 checklist steps (Key Collected / In Transit /
// Parked-or-Delivered) are done, purely from the task's real status. A job
// now skips 'in_transit' entirely (nothing left to advance it there without
// GPS — see task.service.js's widened assertTransition), so this is a
// threshold check, not an exact match: reaching the final status marks
// every earlier step done too, which is the correct picture for a trip
// that had no separate "en route" stage to actually observe.
const STAGE_ORDER: Record<string, number> = {
  requested: -1,
  assigned: -1,
  key_collected: 0,
  in_transit: 1,
  delivered: 2,
  completed: 2,
};

function fmtTime(epochMs?: number | null): string | null {
  if (!epochMs) return null;
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

interface Props {
  task?: ParkingTask;
  onBack?: () => void;
}

export function LiveTrackingScreen({task: taskProp, onBack}: Props) {
  const {colors} = useTheme();
  const {user} = useAuth();
  const {tasks} = useAppState();

  const isDriver = user?.role === 'driver';
  const myDriverId = useMyDriverId();
  // Used bare (no `task` prop) from the driver's "Track" tab — resolve their
  // own active task instead of rendering an empty/unrelated screen.
  const task = taskProp ?? (isDriver ? tasks.find(t => isMyJob(t.driverId, myDriverId) && t.status !== 'completed' && t.status !== 'delivered' && t.status !== 'cancelled') : undefined);
  // 'delivered' (retrieve trips only) already means the car physically
  // arrived at the valet counter — the trip visually "arrives" there even
  // though the record itself isn't closed out until the valet confirms.
  const arrived = task?.status === 'completed' || task?.status === 'delivered';

  if (!task) {
    return (
      <View style={[s.root, s.emptyRoot, {backgroundColor: colors.background}]}>
        <Icon name="parking" size={40} color={colors.textMuted} style={{marginBottom: 8}} />
        <Text style={[s.emptyTitle, {color: colors.textPrimary}]}>No Active Task</Text>
        <Text style={[s.emptyDesc, {color: colors.textMuted}]}>Tracking will appear here once you have an assigned task.</Text>
      </View>
    );
  }

  // Each checklist step's real timestamp, where one exists. 'In Transit'
  // has none of its own any more (see STAGE_ORDER's comment) — it just
  // inherits "done" from whichever later step actually happened.
  const stepTimes: (string | null)[] = [
    fmtTime(task.keyCollectedAt),
    null,
    fmtTime(task.type === 'park' ? task.completedAt : task.deliveredAt),
  ];

  return (
    <View style={[s.root, {backgroundColor: colors.background}]}>
      {onBack && (
        <View style={s.headerRow}>
          <PressableScale style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]} onPress={onBack}>
            <Icon name="back" size={20} color={colors.textPrimary} />
          </PressableScale>
          {!arrived && (
            <View style={[s.liveBadge, {backgroundColor: colors.error}]}>
              <View style={s.liveDot} />
              <Text style={s.liveTxt}>LIVE</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.centerWrap}>
        <View style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          {arrived ? (
            <View style={s.arrivedRow}>
              <View style={[s.arrivedIconWrap, {backgroundColor: colors.successLight}]}>
                <Icon name="check" size={24} color={colors.success} />
              </View>
              <View>
                <Text style={[s.arrivedTitle, {color: colors.success}]}>
                  {task.type === 'park'
                    ? 'Car Parked Successfully!'
                    : task.status === 'delivered'
                    ? 'Car Has Arrived!'
                    : 'Car Retrieved!'}
                </Text>
                <Text style={[s.arrivedSub, {color: colors.textMuted}]}>
                  {task.type === 'retrieve'
                    ? (task.status === 'delivered' ? 'Please collect it at the valet counter' : 'Waiting at the valet counter')
                    : task.slotId ? `Slot: ${task.slotId}` : 'Delivered to valet counter'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.headerBlock}>
              <Text style={[s.sheetTitle, {color: colors.textPrimary}]}>
                {task.type === 'park' ? 'Parking your car' : 'Retrieving your car'}
              </Text>
              <Text style={[s.sheetSub, {color: colors.textMuted}]}>
                {task.carNumber ?? 'Vehicle'} · {task.driverName ?? 'Driver assigned'}
              </Text>
            </View>
          )}

          <View style={s.stepsRow}>
            {['Key Collected', 'In Transit', task.type === 'park' ? 'Parked' : 'Delivered'].map((step, i) => {
              const done = (STAGE_ORDER[task.status ?? ''] ?? -1) >= i;
              return (
                <View key={step} style={s.step}>
                  <View style={[s.stepDot, {backgroundColor: done ? colors.success : colors.border}]}>
                    {done && <Icon name="checkBold" size={12} color="#fff" />}
                  </View>
                  <Text style={[s.stepLabel, {color: done ? colors.textPrimary : colors.textMuted}]} numberOfLines={1}>{step}</Text>
                  {done && stepTimes[i] && (
                    <Text style={[s.stepTime, {color: colors.textMuted}]}>{stepTimes[i]}</Text>
                  )}
                  {i < 2 && <View style={[s.stepLine, {backgroundColor: done ? colors.success : colors.border}]} />}
                </View>
              );
            })}
          </View>

          {task.slotId && (
            <View style={[s.slotChip, {backgroundColor: colors.primary + '12', borderColor: colors.primary + '30'}]}>
              <Icon name={task.type === 'retrieve' ? 'pin' : 'parking'} size={14} color={colors.primary} />
              <Text style={[s.slotChipTxt, {color: colors.primary}]}>
                {task.type === 'retrieve' ? 'Retrieving from' : 'Destination'}: <Text style={{fontWeight: '900'}}>{task.slotId}</Text>
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1},
  emptyRoot: {alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8},
  emptyTitle: {fontSize: 18, fontWeight: '800'},
  emptyDesc: {fontSize: 13, textAlign: 'center', lineHeight: 19},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 52, paddingHorizontal: 16, paddingBottom: 4},
  backBtn: {width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  liveBadge: {flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6},
  liveDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff'},
  liveTxt: {color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1},
  centerWrap: {flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 32},
  card: {borderRadius: 28, borderWidth: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28},
  headerBlock: {paddingTop: 20, paddingBottom: 4},
  sheetTitle: {fontSize: 17, fontWeight: '800'},
  sheetSub: {fontSize: 12, marginTop: 3},
  stepsRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, marginTop: 20},
  step: {flex: 1, alignItems: 'center', position: 'relative'},
  stepDot: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6},
  stepLabel: {fontSize: 10, fontWeight: '700', textAlign: 'center'},
  stepTime: {fontSize: 9, fontWeight: '600', marginTop: 2},
  stepLine: {position: 'absolute', top: 14, right: '-50%', width: '100%', height: 2},
  slotChip: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, padding: 12},
  slotChipTxt: {fontSize: 13, fontWeight: '600'},
  arrivedRow: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 20},
  arrivedIconWrap: {width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center'},
  arrivedTitle: {fontSize: 17, fontWeight: '800'},
  arrivedSub: {fontSize: 12, marginTop: 4},
});
