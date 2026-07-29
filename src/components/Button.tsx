import React from 'react';
import {Text, StyleSheet, ActivityIndicator, PressableProps, StyleProp, ViewStyle} from 'react-native';
import {PressableScale} from './PressableScale';
import {useTheme} from '../context/ThemeContext';
import {typography, spacing, radius} from '../theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  label: string;
  variant?: 'primary' | 'ghost' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const {colors} = useTheme();

  const bg = {
    primary: colors.primary,
    ghost: 'transparent',
    success: colors.success,
    danger: colors.error,
  }[variant];

  const textColor = variant === 'ghost' ? colors.textSecondary : '#FFFFFF';

  const borderColor = variant === 'ghost' ? colors.border : 'transparent';

  const pad = {
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.base,
  }[size];

  const fontSize = {
    sm: typography.sizes.sm,
    md: typography.sizes.base,
    lg: typography.sizes.md,
  }[size];

  return (
    <PressableScale
      disabled={disabled || loading}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderColor,
          paddingVertical: pad,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text
          style={[
            styles.label,
            {color: textColor, fontSize},
          ]}>
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  label: {
    fontWeight: typography.weights.bold,
    letterSpacing: 0.2,
  },
});
