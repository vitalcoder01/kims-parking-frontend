import React from 'react';
import {View, StyleSheet, ViewProps, StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {radius, spacing} from '../theme';

interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'alt' | 'primary';
}

export function Card({style, variant = 'default', children, ...rest}: CardProps) {
  const {colors} = useTheme();

  const bg =
    variant === 'primary'
      ? colors.primaryLight
      : variant === 'alt'
      ? colors.cardAlt
      : colors.card;

  const borderColor =
    variant === 'primary' ? colors.primary + '44' : colors.border;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
});
