import React, {useEffect, useRef} from 'react';
import {Animated, Easing, View, StyleSheet} from 'react-native';
import type {InsightSeverity} from '../../core/copilot/insights';

/*
 * The creature.
 *
 * Drawn rather than imported: no lottie, no svg, no reanimated in this
 * project, and adding a native dependency for a mascot would mean every user
 * downloading a new APK for decoration. A rounded body, two eyes and a
 * highlight is enough — what makes it read as alive is how it moves, not how
 * it is drawn.
 *
 * ── Why every animation here is native-driven ────────────────────────────
 *
 * useNativeDriver: true means transform and opacity are handed to the UI
 * thread once and animate there. No JS runs per frame, no component
 * re-renders, nothing touches the bridge while it breathes.
 *
 * That is not a nice-to-have. This same app had a valet screen re-rendering
 * 1,900 lines sixty times a minute off a one-second clock, and a doctor
 * screen doing the same for a value that was never displayed. Both were
 * removed. Adding a mascot that reintroduced per-frame JS work would undo
 * that for the sake of a cartoon.
 *
 * The consequence to respect: colour cannot be native-driven, so severity
 * tint is a plain prop, changing only when severity actually changes.
 */

export type CreatureMood = 'asleep' | 'idle' | 'noticing' | 'working';

interface Props {
  mood: CreatureMood;
  /** Tints the body when it has something to say. */
  severity?: InsightSeverity | null;
  size?: number;
  /** Themed fallback body colour for when there is nothing to report. */
  restColor: string;
  eyeColor: string;
}

const SEVERITY_TINT: Record<InsightSeverity, string> = {
  critical: '#E5484D',
  warn: '#F5A524',
  info: '#4C8DF6',
};

export function Creature({mood, severity, size = 46, restColor, eyeColor}: Props) {
  // One value per behaviour rather than one shared value, so a blink cannot
  // interrupt a breath and a hop cannot cancel a blink.
  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(mood === 'asleep' ? 0.4 : 1)).current;

  // Breathing — the baseline "this thing is alive" signal. Runs while awake
  // and is stopped outright when asleep so a backgrounded or idle app is not
  // holding the compositor awake for nothing.
  useEffect(() => {
    if (mood === 'asleep') {
      breathe.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
        Animated.timing(breathe, {toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mood, breathe]);

  // Blinking. Deliberately irregular — a perfectly periodic blink reads as a
  // loading spinner, not a creature.
  useEffect(() => {
    if (mood === 'asleep') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          Animated.timing(blink, {toValue: 0.1, duration: 90, useNativeDriver: true}),
          Animated.timing(blink, {toValue: 1, duration: 110, useNativeDriver: true}),
        ]).start(() => { if (!cancelled) schedule(); });
      }, 2200 + Math.random() * 3600);
    };
    schedule();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mood, blink]);

  // A single hop when it first notices something. Fires on the transition
  // into 'noticing', never repeatedly, so it draws the eye once instead of
  // pulling at it.
  useEffect(() => {
    if (mood !== 'noticing') return;
    hop.setValue(0);
    Animated.sequence([
      Animated.timing(hop, {toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true}),
      Animated.spring(hop, {toValue: 0, friction: 4, tension: 90, useNativeDriver: true}),
    ]).start();
  }, [mood, hop]);

  // Working: a slow pulse while it repairs something in the background.
  useEffect(() => {
    if (mood !== 'working') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dim, {toValue: 0.55, duration: 500, useNativeDriver: true}),
        Animated.timing(dim, {toValue: 1, duration: 500, useNativeDriver: true}),
      ]),
    );
    loop.start();
    // Reset to full only. Whatever mood we are leaving for, the effect
    // below owns settling opacity for it — deciding that here as well
    // meant reading `mood`, which TypeScript correctly points out is
    // narrowed to 'working' inside this effect and can never be 'asleep'.
    return () => { loop.stop(); dim.setValue(1); };
  }, [mood, dim]);

  useEffect(() => {
    if (mood === 'working') return;
    Animated.timing(dim, {
      toValue: mood === 'asleep' ? 0.4 : 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [mood, dim]);

  const body = severity ? SEVERITY_TINT[severity] : restColor;
  const eye = size * 0.13;

  return (
    <Animated.View
      style={[
        s.body,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: body,
          opacity: dim,
          transform: [
            {scale: breathe.interpolate({inputRange: [0, 1], outputRange: [1, 1.045]})},
            {translateY: hop.interpolate({inputRange: [0, 1], outputRange: [0, -size * 0.28]})},
          ],
        },
      ]}
    >
      {/* Highlight — one soft spot is what stops a flat circle reading as a
          button rather than a face. */}
      <View style={[s.gloss, {
        width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17,
        top: size * 0.13, left: size * 0.17,
      }]} />

      <Animated.View style={[s.eyes, {gap: size * 0.19, transform: [{scaleY: blink}]}]}>
        <View style={{width: eye, height: eye, borderRadius: eye / 2, backgroundColor: eyeColor}} />
        <View style={{width: eye, height: eye, borderRadius: eye / 2, backgroundColor: eyeColor}} />
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  body: {alignItems: 'center', justifyContent: 'center'},
  gloss: {position: 'absolute', backgroundColor: 'rgba(255,255,255,0.28)'},
  eyes: {flexDirection: 'row', alignItems: 'center', marginTop: '6%'},
});
