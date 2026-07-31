import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View, ViewStyle, StyleProp, Easing} from 'react-native';
import {useTheme} from '../context/ThemeContext';

// Placeholder blocks shown while the first fetch is still in flight.
//
// Deliberately NOT a spinner in the middle of an empty screen: a spinner
// says "something is happening somewhere", whereas blocks in the shape of
// the content say "your card is coming, here is where it will be" — and the
// layout doesn't jump when the real data lands. The pulse is what stops it
// reading as genuinely empty grey boxes.

function usePulse() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
        Animated.timing(v, {toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v.interpolate({inputRange: [0, 1], outputRange: [0.45, 1]});
}

export function SkeletonBlock({height = 16, width, radius = 8, style}: {
  height?: number; width?: ViewStyle['width']; radius?: number; style?: StyleProp<ViewStyle>;
}) {
  const opacity = usePulse();
  const {colors} = useTheme();
  return (
    <Animated.View
      style={[{height, width: width ?? '100%', borderRadius: radius, backgroundColor: colors.cardAlt, opacity}, style]}
    />
  );
}

/** Card-shaped placeholder — matches the real cards so nothing shifts. */
export function SkeletonCard({lines = 2, style}: {lines?: number; style?: StyleProp<ViewStyle>}) {
  const {colors} = useTheme();
  return (
    <View style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border}, style]}>
      <SkeletonBlock height={26} width="55%" radius={7} />
      {Array.from({length: lines}, (_, i) => (
        <SkeletonBlock key={i} height={12} width={i === lines - 1 ? '40%' : '75%'} radius={6} style={{marginTop: 10}} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {borderRadius: 20, borderWidth: 1, padding: 20},
});
