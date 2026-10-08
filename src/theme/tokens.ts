// ─────────────────────────────────────────────────────────────
// KIMS Parking (mobile) — elevation, motion & type tokens
//
// The React Native sibling of the web app's theme/tokens.ts. Same names,
// same intent, platform-correct shapes: elevation is a ViewStyle shadow
// (iOS shadow* + Android elevation), motion is durations (ms) + Easing
// curves, and the type ramp returns TextStyle presets with pixel line
// heights (RN's lineHeight is absolute, not a multiplier).
//
// Additive on top of theme/colors.ts — the warm-mono palette is unchanged.
// ─────────────────────────────────────────────────────────────

import {Easing, type TextStyle, type ViewStyle} from 'react-native';
import {typography} from './typography';

// ── Elevation ────────────────────────────────────────────────
export type ElevationLevel = 'e0' | 'e1' | 'e2' | 'e3' | 'e4';

const lightElevation: Record<ElevationLevel, ViewStyle> = {
  e0: {},
  e1: {shadowColor: '#15161A', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1},
  e2: {shadowColor: '#15161A', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.10, shadowRadius: 12, elevation: 3},
  e3: {shadowColor: '#15161A', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.14, shadowRadius: 24, elevation: 8},
  e4: {shadowColor: '#15161A', shadowOffset: {width: 0, height: 20}, shadowOpacity: 0.22, shadowRadius: 40, elevation: 16},
};

const darkElevation: Record<ElevationLevel, ViewStyle> = {
  e0: {},
  e1: {shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.40, shadowRadius: 3, elevation: 1},
  e2: {shadowColor: '#000000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.50, shadowRadius: 14, elevation: 3},
  e3: {shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.55, shadowRadius: 28, elevation: 8},
  e4: {shadowColor: '#000000', shadowOffset: {width: 0, height: 20}, shadowOpacity: 0.70, shadowRadius: 40, elevation: 16},
};

/** Shadow style for a level, picked for the active theme. */
export function shadow(isDark: boolean, level: ElevationLevel): ViewStyle {
  return (isDark ? darkElevation : lightElevation)[level];
}

export const elevation = {light: lightElevation, dark: darkElevation};

// ── Motion ───────────────────────────────────────────────────
export const duration = {
  instant: 80,
  fast: 140,
  base: 220,
  slow: 360,
  slower: 520,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0, 0, 0, 1),
  accelerate: Easing.bezier(0.3, 0, 1, 1),
  spring: Easing.bezier(0.34, 1.4, 0.64, 1),
};

// ── Type ramp ────────────────────────────────────────────────
export interface TypePreset {
  fontSize: number;
  fontWeight: TextStyle['fontWeight'];
  lineHeight: number;
  letterSpacing: number;
}

const w = typography.weights;
const ramp = (fontSize: number, fontWeight: TextStyle['fontWeight'], ratio: number, letterSpacing: number): TypePreset => ({
  fontSize,
  fontWeight,
  lineHeight: Math.round(fontSize * ratio),
  letterSpacing,
});

export const text = {
  display: ramp(34, w.black, 1.05, -0.8),
  title:   ramp(24, w.bold, 1.12, -0.5),
  heading: ramp(18, w.bold, 1.2, -0.2),
  subhead: ramp(15.5, w.bold, 1.3, -0.1),
  body:    ramp(14.5, w.medium, 1.45, 0),
  bodySm:  ramp(13, w.medium, 1.45, 0),
  label:   ramp(13, w.bold, 1.3, 0.1),
  caption: ramp(12, w.semibold, 1.35, 0),
  overline: ramp(11, w.black, 1.2, 0.6),
} satisfies Record<string, TypePreset>;

export type TextVariant = keyof typeof text;
