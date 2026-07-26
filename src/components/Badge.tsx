import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {typography, spacing, radius} from '../theme';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({label, variant = 'muted', dot = false}: BadgeProps) {
  const {colors} = useTheme();

  const config: Record<BadgeVariant, {bg: string; text: string; border: string}> = {
    success: {bg: colors.successLight, text: colors.success, border: colors.success + '44'},
    warning: {bg: colors.warningLight, text: colors.warning, border: colors.warning + '44'},
    error:   {bg: colors.errorLight,   text: colors.error,   border: colors.error + '44'},
    info:    {bg: colors.infoLight,    text: colors.info,    border: colors.info + '44'},
    primary: {bg: colors.primaryLight, text: colors.primary, border: colors.primary + '44'},
    muted:   {bg: colors.cardAlt,      text: colors.textSecondary, border: colors.border},
  };

  const {bg, text, border} = config[variant];

  return (
    <View style={[styles.badge, {backgroundColor: bg, borderColor: border}]}>
      {dot && (
        <View style={[styles.dot, {backgroundColor: text}]} />
      )}
      <Text style={[styles.label, {color: text}]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 1,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
