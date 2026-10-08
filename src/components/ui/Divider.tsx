import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {AppText} from './Text';
import {useTheme} from '../../context/ThemeContext';

interface Props {
  label?: string;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}

/** A hairline rule, optionally with a centered label. */
export function Divider({label, spacing = 16, style}: Props) {
  const {colors} = useTheme();
  if (!label) {
    return <View style={[{height: 1, backgroundColor: colors.divider, marginVertical: spacing}, style]} />;
  }
  return (
    <View style={[{flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: spacing}, style]}>
      <View style={{flex: 1, height: 1, backgroundColor: colors.divider}} />
      <AppText variant="overline" tone="muted" uppercase>{label}</AppText>
      <View style={{flex: 1, height: 1, backgroundColor: colors.divider}} />
    </View>
  );
}
