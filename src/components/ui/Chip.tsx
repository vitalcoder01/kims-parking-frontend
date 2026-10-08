import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {PressableScale} from '../PressableScale';
import {useTheme} from '../../context/ThemeContext';
import {Icon, IconName} from '../Icon';
import {AppText} from './Text';
import {radius as radiusTokens} from '../../theme';

interface Props {
  label: string;
  selected?: boolean;
  icon?: IconName;
  count?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** A selectable filter chip (distinct from the read-only Badge). */
export function Chip({label, selected, icon, count, onPress, style}: Props) {
  const {colors} = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        height: 36, paddingHorizontal: 14, borderRadius: radiusTokens.full,
        backgroundColor: selected ? colors.primary : colors.card,
        borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border,
      }, style]}>
      {icon && <Icon name={icon} size={15} color={selected ? colors.textOnPrimary : colors.textSecondary} />}
      <AppText variant="label" color={selected ? colors.textOnPrimary : colors.textSecondary}>{label}</AppText>
      {count != null && (
        <View style={{
          minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
          backgroundColor: selected ? 'rgba(255,255,255,0.2)' : colors.cardAlt,
        }}>
          <AppText variant="caption" color={selected ? colors.textOnPrimary : colors.textMuted} style={{fontWeight: '800'}}>{count}</AppText>
        </View>
      )}
    </PressableScale>
  );
}
