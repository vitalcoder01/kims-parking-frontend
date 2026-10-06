import React from 'react';
import {Text as RNText, StyleProp, TextStyle} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {text as ramp, type TextVariant} from '../../theme';

type Tone = 'primary' | 'secondary' | 'muted' | 'inverse' | 'onPrimary' | 'success' | 'warning' | 'error' | 'info';

interface Props {
  variant?: TextVariant;
  tone?: Tone;
  color?: string;
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/**
 * Typed text — the RN sibling of the web Text. A screen writes
 * <AppText variant="title"> instead of re-deciding size/weight/line-height/
 * tracking, and colour follows the theme via `tone`.
 */
export function AppText({variant = 'body', tone = 'primary', color, align, uppercase, numberOfLines, style, children}: Props) {
  const {colors} = useTheme();
  const preset = ramp[variant];
  const toneColor: Record<Tone, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    inverse: colors.textInverse,
    onPrimary: colors.textOnPrimary,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
  };
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: preset.fontSize,
          fontWeight: preset.fontWeight,
          lineHeight: preset.lineHeight,
          letterSpacing: preset.letterSpacing,
          color: color ?? toneColor[tone],
          textAlign: align,
          textTransform: uppercase ? 'uppercase' : undefined,
        },
        style,
      ]}>
      {children}
    </RNText>
  );
}
