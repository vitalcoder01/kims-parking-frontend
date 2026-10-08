import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {PressableScale} from '../PressableScale';
import {useTheme} from '../../context/ThemeContext';
import {Icon, IconName} from '../Icon';
import {AppText} from './Text';
import {radius as radiusTokens, shadow} from '../../theme';

export interface Segment<T extends string> {
  key: T;
  label: string;
  icon?: IconName;
  count?: number;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * In-screen view switcher — a track of segments with the active one raised on
 * a surface pill. The RN sibling of the web SegmentedControl (active-cell fill
 * instead of a measured sliding indicator, so it needs no layout pass).
 */
export function SegmentedControl<T extends string>({segments, value, onChange, style}: Props<T>) {
  const {colors, isDark} = useTheme();
  return (
    <View style={[{flexDirection: 'row', padding: 4, backgroundColor: colors.cardAlt, borderRadius: radiusTokens.full}, style]}>
      {segments.map(seg => {
        const active = seg.key === value;
        return (
          <PressableScale
            key={seg.key}
            onPress={() => onChange(seg.key)}
            style={[{
              flex: 1, height: 36, borderRadius: radiusTokens.full,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: active ? colors.surface : 'transparent',
            }, active ? shadow(isDark, 'e1') : null]}>
            {seg.icon && <Icon name={seg.icon} size={16} color={active ? colors.textPrimary : colors.textMuted} />}
            <AppText variant="label" color={active ? colors.textPrimary : colors.textMuted}>{seg.label}</AppText>
            {seg.count != null && seg.count > 0 && (
              <View style={{
                minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? colors.primary : colors.borderStrong,
              }}>
                <AppText variant="caption" color={active ? colors.textOnPrimary : colors.textSecondary} style={{fontWeight: '800'}}>{seg.count}</AppText>
              </View>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}
