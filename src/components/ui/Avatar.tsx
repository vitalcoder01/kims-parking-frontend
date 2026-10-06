import React from 'react';
import {View, Text as RNText, StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {Icon, IconName} from '../Icon';

interface Props {
  name?: string;
  icon?: IconName;
  size?: number;
  tone?: 'ink' | 'neutral';
  status?: 'online' | 'busy' | 'off';
  style?: StyleProp<ViewStyle>;
}

/** Initials / icon avatar with an optional presence dot. */
export function Avatar({name, icon, size = 40, tone = 'ink', status, style}: Props) {
  const {colors} = useTheme();
  const bg = tone === 'ink' ? colors.primary : colors.cardAlt;
  const fg = tone === 'ink' ? colors.textOnPrimary : colors.textSecondary;
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '';

  const statusColor =
    status === 'online' ? colors.success
    : status === 'busy' ? colors.warning
    : status === 'off'  ? colors.textMuted
    : undefined;
  const dot = Math.max(10, size * 0.28);

  return (
    <View style={[{width: size, height: size}, style]}>
      <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center'}}>
        {icon
          ? <Icon name={icon} size={size * 0.46} color={fg} />
          : <RNText style={{fontSize: size * 0.4, fontWeight: '800', color: fg}}>{initial}</RNText>}
      </View>
      {statusColor && (
        <View style={{
          position: 'absolute', right: -1, bottom: -1, width: dot, height: dot, borderRadius: dot / 2,
          backgroundColor: statusColor, borderWidth: 2, borderColor: colors.surface,
        }} />
      )}
    </View>
  );
}
