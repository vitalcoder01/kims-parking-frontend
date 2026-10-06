import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {PressableScale} from '../PressableScale';
import {useTheme} from '../../context/ThemeContext';
import {radius as radiusTokens, spacing, shadow, type ElevationLevel} from '../../theme';

type Tone = 'surface' | 'alt' | 'primary';

interface SurfaceProps {
  children?: React.ReactNode;
  elevation?: ElevationLevel;
  tone?: Tone;
  radius?: number;
  padding?: number;
  bordered?: boolean;
  onPress?: () => void | Promise<unknown>;
  style?: StyleProp<ViewStyle>;
}

/**
 * The elevated card primitive (RN sibling of the web Surface). One place
 * decides depth (theme-tuned shadow), the warm-mono fill, the border and the
 * radius, so screens stop re-deriving a card by hand. Pass onPress to make it
 * a pressable (keeps PressableScale's tactile feedback + double-tap guard).
 */
export function Surface({
  children,
  elevation = 'e1',
  tone = 'surface',
  radius = radiusTokens.lg,
  padding = spacing.base,
  bordered = true,
  onPress,
  style,
}: SurfaceProps) {
  const {colors, isDark} = useTheme();

  const bg =
    tone === 'primary' ? colors.primaryLight
    : tone === 'alt'   ? colors.cardAlt
    : colors.card;
  const borderColor = tone === 'primary' ? colors.primary + '33' : colors.border;

  const base: ViewStyle = {
    backgroundColor: bg,
    borderWidth: bordered ? 1 : 0,
    borderColor,
    borderRadius: radius,
    padding,
  };
  const sh = shadow(isDark, elevation);

  if (onPress) {
    return <PressableScale onPress={onPress} style={[base, sh, style]}>{children}</PressableScale>;
  }
  return <View style={[base, sh, style]}>{children}</View>;
}
