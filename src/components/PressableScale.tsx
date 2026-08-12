import React, {useRef, useState, useCallback} from 'react';
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
//
// Also the one place a blanket fix for double-tap duplicate requests could
// actually land: this is the button primitive nearly every actionable
// button in the app is built on (assign driver, confirm handover, cancel,
// etc.), so a single re-entrancy guard here protects all of them at once
// instead of relying on every screen remembering its own
// isSubmitting/assigningId-style state (most do, some didn't, and a second
// tap landing in the gap before that state's first setState even commits
// could still slip a duplicate call through either way). If onPress
// returns a promise, further taps are swallowed until it settles — no
// visual change for callers that already show their own spinner/disabled
// state, and a real fix for the ones that don't.
export function PressableScale({scaleTo = 0.96, style, onPressIn, onPressOut, onPress, disabled, children, ...rest}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  // Ref for the synchronous guard inside handlePress (state updates aren't
  // visible until the next render, which is too late to block a second tap
  // landing before that render happens); state alongside it purely to
  // reflect the pending press in `disabled` for React Native's own
  // Pressable-level tap suppression too.
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  const handlePress = useCallback((e: GestureResponderEvent) => {
    if (pendingRef.current) return;
    const result = onPress?.(e);
    if (result && typeof (result as unknown as PromiseLike<unknown>)?.then === 'function') {
      pendingRef.current = true;
      setPending(true);
      (result as unknown as Promise<unknown>).finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
    }
  }, [onPress]);

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
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || pending}
      style={[style, {transform: [{scale}], opacity}]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
