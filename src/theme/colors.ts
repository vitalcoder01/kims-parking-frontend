// ─────────────────────────────────────────────────────────────
// KIMS Parking — Unified Design System
// One brand palette across every role & screen.
// Brand: Premium Indigo #4F46E5  ·  Accent: Cyan #06B6D4
// ─────────────────────────────────────────────────────────────

export const lightColors = {
  // Backgrounds
  background:  '#F8FAFC',
  surface:     '#FFFFFF',
  card:        '#FFFFFF',
  cardAlt:     '#F1F5F9',

  // Brand — premium indigo
  primary:      '#4F46E5',
  primaryLight: '#EEF2FF',
  primaryDark:  '#4338CA',
  accent:       '#06B6D4',
  accentLight:  '#CFFAFE',

  // Gradient stops (used everywhere for headers / hero / buttons)
  gradFrom: '#4F46E5',
  gradMid:  '#6366F1',
  gradTo:   '#818CF8',

  // Status
  success:      '#059669',
  successLight: '#D1FAE5',
  warning:      '#D97706',
  warningLight: '#FEF3C7',
  error:        '#DC2626',
  errorLight:   '#FEE2E2',
  info:         '#0EA5E9',
  infoLight:    '#E0F2FE',

  // Text
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#94A3B8',
  textInverse:   '#FFFFFF',
  textOnPrimary: '#FFFFFF',

  // Borders
  border:       '#E2E8F0',
  borderStrong: '#CBD5E1',
  divider:      '#E2E8F0',

  // Navigation
  tabBar:          '#FFFFFF',
  tabBarBorder:    '#E2E8F0',
  tabIconActive:   '#4F46E5',
  tabIconInactive: '#94A3B8',

  // Switch
  switchTrackOn:  '#4F46E5',
  switchTrackOff: '#CBD5E1',
  switchThumb:    '#FFFFFF',

  // Misc
  overlay: 'rgba(15,23,42,0.5)',
  shadow:  'rgba(79,70,229,0.14)',
};

export const darkColors = {
  // Backgrounds
  background:  '#0B1120',
  surface:     '#111827',
  card:        '#1A2236',
  cardAlt:     '#232D45',

  // Brand
  primary:      '#818CF8',
  primaryLight: 'rgba(99,102,241,0.16)',
  primaryDark:  '#A5B4FC',
  accent:       '#22D3EE',
  accentLight:  'rgba(34,211,238,0.16)',

  // Gradient stops
  gradFrom: '#4338CA',
  gradMid:  '#4F46E5',
  gradTo:   '#6366F1',

  // Status
  success:      '#10B981',
  successLight: 'rgba(16,185,129,0.16)',
  warning:      '#F59E0B',
  warningLight: 'rgba(245,158,11,0.16)',
  error:        '#F87171',
  errorLight:   'rgba(248,113,113,0.16)',
  info:         '#38BDF8',
  infoLight:    'rgba(56,189,248,0.16)',

  // Text
  textPrimary:   '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted:     '#64748B',
  textInverse:   '#0F172A',
  textOnPrimary: '#FFFFFF',

  // Borders
  border:       'rgba(148,163,184,0.14)',
  borderStrong: 'rgba(148,163,184,0.24)',
  divider:      'rgba(255,255,255,0.06)',

  // Navigation
  tabBar:          '#111827',
  tabBarBorder:    'rgba(148,163,184,0.14)',
  tabIconActive:   '#818CF8',
  tabIconInactive: '#64748B',

  // Switch
  switchTrackOn:  '#6366F1',
  switchTrackOff: '#334155',
  switchThumb:    '#FFFFFF',

  // Misc
  overlay: 'rgba(0,0,0,0.7)',
  shadow:  'rgba(0,0,0,0.5)',
};

// Shared gradient tuples so every screen uses the identical brand gradient.
export const BRAND_GRADIENT = ['#4F46E5', '#6366F1', '#818CF8'] as [string, string, string];
export const BRAND_GRADIENT_DARK = ['#4338CA', '#4F46E5', '#6366F1'] as [string, string, string];

export type AppColors = typeof lightColors;
