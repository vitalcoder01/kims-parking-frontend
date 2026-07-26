import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {typography, spacing} from '../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function ScreenHeader({title, subtitle, onBack, right}: ScreenHeaderProps) {
  const {colors} = useTheme();

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          style={[styles.backBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
          <Text style={{color: colors.textPrimary, fontSize: 16}}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtn} />
      )}

      <View style={styles.titleWrap}>
        <Text
          style={[styles.title, {color: colors.textPrimary}]}
          numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.rightSlot}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.black,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 1,
  },
  rightSlot: {
    width: 34,
    alignItems: 'flex-end',
  },
});
