import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';
import {PressableScale} from './PressableScale';
import {Driver} from '../context/AppStateContext';

interface Props {
  drivers: Driver[];
  onAssign: (driverId: number) => void;
  // Set to the driver id being assigned while that call is in flight —
  // disables every row (not just that one) so a second tap, on the same or
  // a different driver, can't fire a second assignDriver call before the
  // first has even resolved. Without this, a fast double-tap could notify
  // one driver and then immediately bump them for another with no
  // confirmation in between.
  assigningId?: number | null;
}

// Shared "pick an available driver" list — same interaction whether it's
// for a fresh park task, a retrieval request, or a visitor pickup.
export function DriverPickerList({drivers, onAssign, assigningId}: Props) {
  const {colors} = useTheme();
  const disabled = assigningId != null;

  if (drivers.length === 0) {
    return (
      <View style={[s.emptyBox, {borderColor: colors.border}]}>
        <Icon name="timer" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
        <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No drivers available right now</Text>
      </View>
    );
  }

  return (
    <>
      {drivers.map(d => {
        // "N done today" is real now — nothing computed it before, so every
        // driver read "0 done today" and the least-busy ordering compared 0
        // to 0 on every pair. Undefined means the server didn't send a count,
        // which is different from a genuine zero and must not read as one.
        const done = d.completedToday;
        const load = done == null ? '' : done === 0 ? 'No jobs yet today' : `${done} ${done === 1 ? 'job' : 'jobs'} today`;
        return (
          <PressableScale key={d.id}
            style={[s.driverCard, {backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : 1}]}
            onPress={() => { if (!disabled) onAssign(d.id); }}
            disabled={disabled}>
            <View style={[s.avatar, {backgroundColor: colors.primary + '18'}]}>
              <Text style={[s.avatarTxt, {color: colors.primary}]}>{d.name[0]}</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={[s.driverName, {color: colors.textPrimary}]} numberOfLines={1}>{d.name}</Text>
              {!!load && <Text style={[s.driverStatusTxt, {color: colors.textSecondary}]}>{load}</Text>}
            </View>
            <View style={[s.assignBtn, {backgroundColor: colors.primary}]}>
              <Text style={[s.assignArrow, {color: colors.textOnPrimary}]}>
                {assigningId === d.id ? 'Assigning…' : 'Assign'}
              </Text>
              {assigningId !== d.id && <Icon name="arrowRight" size={14} color={colors.textOnPrimary} />}
            </View>
          </PressableScale>
        );
      })}
    </>
  );
}

const s = StyleSheet.create({
  emptyBox: {borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 24, alignItems: 'center', marginBottom: 16},
  emptyTxt: {fontSize: 13, fontWeight: '600'},
  driverCard: {flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12},
  avatar: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  avatarTxt: {fontSize: 16, fontWeight: '800'},
  driverName: {fontSize: 15, fontWeight: '800'},
  driverStatusTxt: {fontSize: 12, fontWeight: '600', marginTop: 2},
  assignBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10},
  assignArrow: {fontSize: 13, fontWeight: '700'},
});
