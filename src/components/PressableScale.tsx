import React, {useRef} from 'react';
import {Animated, Pressable, PressableProps, GestureResponderEvent, StyleProp, ViewStyle} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// Standard tactile press feedback (spring scale-down + fade) so every
// primary action reads as actually pressed, not just a static tap target.
// Animates the Pressable itself (no wrapper View) so it's a structural
// drop-in for TouchableOpacity — style (including flex/width) still lands
// on the single real element the parent's flexbox lays out.
export function PressableScale({scaleTo = 0.96, style, onPressIn, onPressOut, children, ...rest}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    Animated.parallel([
      Animated.spring(scale, {toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0}),
      Animated.timing(opacity, {toValue: 0.85, duration: 80, useNativeDriver: true}),
    ]).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    Animated.parallel([
      Animated.spring(scale, {toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6}),
      Animated.timing(opacity, {toValue: 1, duration: 120, useNativeDriver: true}),
    ]).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, {transform: [{scale}], opacity}]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
