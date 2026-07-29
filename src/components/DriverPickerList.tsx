import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';
import {PressableScale} from './PressableScale';
import {Driver} from '../context/AppStateContext';

interface Props {
  drivers: Driver[];
  onAssign: (driverId: number) => void;
}

// Shared "pick an available driver" list — same interaction whether it's
// for a fresh park task, a retrieval request, or a visitor pickup.
export function DriverPickerList({drivers, onAssign}: Props) {
  const {colors} = useTheme();

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
      {drivers.map((d, i) => (
        <PressableScale key={d.id} style={[s.driverCard, {backgroundColor: colors.surface, borderColor: i === 0 ? colors.primary + '80' : colors.success + '44'}]}
          onPress={() => onAssign(d.id)}>
          <View style={[s.driverStripe, {backgroundColor: i === 0 ? colors.primary : colors.success}]} />
          <View style={[s.avatar, {backgroundColor: colors.primary + '18'}]}>
            <Text style={[s.avatarTxt, {color: colors.primary}]}>{d.name[0]}</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={[s.driverName, {color: colors.textPrimary}]}>{d.name}</Text>
            <View style={s.suggestedRow}>
              {i === 0 && <Icon name="sparkle" size={12} color={colors.success} />}
              <Text style={[s.driverStatusTxt, {color: colors.success}]}>
                {i === 0 ? 'Suggested · ' : ''}{d.completedToday ?? 0} done today
              </Text>
            </View>
          </View>
          <View style={s.assignRow}>
            <Text style={[s.assignArrow, {color: colors.primary}]}>Assign</Text>
            <Icon name="arrowRight" size={14} color={colors.primary} />
          </View>
        </PressableScale>
      ))}
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
  assignRow: {flexDirection: 'row', alignItems: 'center', gap: 4},
  assignArrow: {fontSize: 13, fontWeight: '700'},
});
