import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import {PressableScale} from '../PressableScale';
import {useTheme} from '../../context/ThemeContext';
import {Icon, IconName} from '../Icon';

type Variant = 'plain' | 'soft' | 'solid';

interface Props {
  icon: IconName;
  onPress?: () => void | Promise<unknown>;
  size?: number;
  variant?: Variant;
  color?: string;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** A circular icon-only control — back / close / overflow / quick actions. */
export function IconButton({icon, onPress, size = 40, variant = 'soft', color, disabled, accessibilityLabel, style}: Props) {
  const {colors} = useTheme();
  const bg = variant === 'solid' ? colors.primary : variant === 'soft' ? colors.cardAlt : 'transparent';
  const fg = color ?? (variant === 'solid' ? colors.textOnPrimary : colors.textSecondary);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={[{
        width: size, height: size, borderRadius: size / 2,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg, opacity: disabled ? 0.45 : 1,
      }, style]}>
      <Icon name={icon} size={Math.round(size * 0.46)} color={fg} />
    </PressableScale>
  );
}
