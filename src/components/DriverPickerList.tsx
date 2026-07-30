import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';
import {PressableScale} from './PressableScale';
import {Driver} from '../context/AppStateContext';

interface Props {
  drivers: Driver[];
  onAssign: (driverId: number) => void;
  // True when the list is under an explicit alphabetical sort rather than
  // the default least-busy-first order — "Suggested" on the top row would
  // be misleading once the valet has deliberately reordered the list.
  sorted?: boolean;
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
export function DriverPickerList({drivers, onAssign, sorted, assigningId}: Props) {
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
      {drivers.map((d, i) => {
        const isSuggested = i === 0 && !sorted;
        return (
          <PressableScale key={d.id}
            style={[s.driverCard, {backgroundColor: colors.surface, borderColor: isSuggested ? colors.primary + '80' : colors.border, opacity: disabled ? 0.5 : 1}]}
            onPress={() => { if (!disabled) onAssign(d.id); }}
            disabled={disabled}>
            {isSuggested && <View style={[s.driverStripe, {backgroundColor: colors.primary}]} />}
            <View style={[s.avatar, {backgroundColor: colors.primary + '18'}]}>
              <Text style={[s.avatarTxt, {color: colors.primary}]}>{d.name[0]}</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={[s.driverName, {color: colors.textPrimary}]}>{d.name}</Text>
              <View style={s.suggestedRow}>
                {isSuggested && <Icon name="sparkle" size={12} color={colors.primary} />}
                <Text style={[s.driverStatusTxt, {color: isSuggested ? colors.primary : colors.textSecondary}]}>
                  {isSuggested ? 'Suggested · ' : ''}{d.completedToday ?? 0} done today
                </Text>
              </View>
            </View>
            <View style={[s.assignBtn, {backgroundColor: isSuggested ? colors.primary : colors.cardAlt}]}>
              <Text style={[s.assignArrow, {color: isSuggested ? colors.textOnPrimary : colors.primary}]}>
                {assigningId === d.id ? 'Assigning…' : 'Assign'}
              </Text>
              {assigningId !== d.id && <Icon name="arrowRight" size={14} color={isSuggested ? colors.textOnPrimary : colors.primary} />}
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
  driverCard: {flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10, gap: 12, overflow: 'hidden'},
  driverStripe: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 4},
  avatar: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  avatarTxt: {fontSize: 16, fontWeight: '800'},
  driverName: {fontSize: 14, fontWeight: '800'},
  suggestedRow: {flexDirection: 'row', alignItems: 'center', gap: 4},
  driverStatusTxt: {fontSize: 12, fontWeight: '600'},
  assignBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10},
  assignArrow: {fontSize: 13, fontWeight: '700'},
});
