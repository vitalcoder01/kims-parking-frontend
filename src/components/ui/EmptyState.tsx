import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {AppText} from './Text';
import {Icon, IconName} from '../Icon';
import {useTheme} from '../../context/ThemeContext';

interface Props {
  icon?: IconName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The shared "nothing here (yet)" state — medallion, title, calm one-liner. */
export function EmptyState({icon = 'inbox', title, subtitle, action, compact, style}: Props) {
  const {colors} = useTheme();
  return (
    <View style={[{alignItems: 'center', paddingVertical: compact ? 28 : 52, paddingHorizontal: 24, gap: 6}, style]}>
      <View style={{width: 64, height: 64, borderRadius: 20, marginBottom: 10, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center'}}>
        <Icon name={icon} size={30} color={colors.textMuted} />
      </View>
      <AppText variant="heading" align="center">{title}</AppText>
      {subtitle && <AppText variant="body" tone="muted" align="center" style={{maxWidth: 320}}>{subtitle}</AppText>}
      {action && <View style={{marginTop: 16}}>{action}</View>}
    </View>
  );
}
