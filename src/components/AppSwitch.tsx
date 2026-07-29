import React from 'react';
import {Switch, SwitchProps, View, Text, StyleSheet} from 'react-native';
import {PressableScale} from './PressableScale';
import {useTheme} from '../context/ThemeContext';
import {typography, spacing, radius} from '../theme';
import {Icon} from './Icon';

// ── Simple wrapped Switch ──────────────────────────────────────────
interface AppSwitchProps extends Omit<SwitchProps, 'trackColor' | 'thumbColor'> {
  label?: string;
  description?: string;
}

export function AppSwitch({label, description, ...props}: AppSwitchProps) {
  const {colors} = useTheme();

  return (
    <View style={styles.row}>
      {(label || description) && (
        <View style={styles.labelWrap}>
          {label && (
            <Text style={[styles.label, {color: colors.textPrimary}]}>
              {label}
            </Text>
          )}
          {description && (
            <Text style={[styles.desc, {color: colors.textSecondary}]}>
              {description}
            </Text>
          )}
        </View>
      )}
      <Switch
        trackColor={{
          false: colors.switchTrackOff,
          true: colors.switchTrackOn,
        }}
        thumbColor={colors.switchThumb}
        ios_backgroundColor={colors.switchTrackOff}
        {...props}
      />
    </View>
  );
}

// ── Theme toggle row (the main light/dark switch) ──────────────────
export function ThemeToggleRow() {
  const {isDark, toggle, colors} = useTheme();

  return (
    <PressableScale
      onPress={toggle}
      style={[
        styles.toggleCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.toggleLeft}>
        <View style={[styles.toggleIconWrap, {backgroundColor: colors.cardAlt}]}>
          <Icon name={isDark ? 'moon' : 'sun'} size={18} color={colors.textPrimary} />
        </View>
        <View>
          <Text style={[styles.toggleLabel, {color: colors.textPrimary}]}>
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </Text>
          <Text style={[styles.toggleDesc, {color: colors.textSecondary}]}>
            {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          </Text>
        </View>
      </View>
      <Switch
        value={isDark}
        onValueChange={toggle}
        trackColor={{false: colors.switchTrackOff, true: colors.switchTrackOn}}
        thumbColor={colors.switchThumb}
        ios_backgroundColor={colors.switchTrackOff}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  labelWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  label: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
  desc: {
    fontSize: typography.sizes.sm,
    marginTop: 2,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  toggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
  },
  toggleDesc: {
    fontSize: typography.sizes.sm,
    marginTop: 2,
  },
});
