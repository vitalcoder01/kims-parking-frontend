import React from 'react';
import {View, StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../../context/ThemeContext';

interface Props {
  /** 0–1. Clamped. */
  value: number;
  height?: number;
  color?: string;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** A slim progress track — retrieval ETA, job progress. */
export function ProgressBar({value, height = 6, color, trackColor, style}: Props) {
  const {colors} = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[{width: '100%', height, borderRadius: height, overflow: 'hidden', backgroundColor: trackColor ?? colors.cardAlt}, style]}>
      <View style={{width: `${pct}%`, height: '100%', borderRadius: height, backgroundColor: color ?? colors.primary}} />
    </View>
  );
}
