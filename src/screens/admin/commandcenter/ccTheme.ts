import {createContext, useContext} from 'react';

/*
 * Palette for the admin command-center dashboard — the same colours as the
 * web app's dashboard, which was built against a saturated blue/purple/
 * green/amber reference rather than this app's warm-mono theme. Only the
 * tokens the phone layout reads are here; the desktop shell's sidebar and
 * header colours are not.
 *
 * The dashboard follows the app's own light/dark setting (Settings) rather
 * than carrying a second toggle of its own, so switching the theme changes
 * every admin tab together.
 */
export interface CcKpiVariant {
  bg: string; icon: string;
  /** Text colours for this card specifically — a saturated dark tile wants
   *  near-white text; a pastel light tile wants dark text. */
  valueText: string; labelText: string;
}

export interface CcPalette {
  mode: 'light' | 'dark';
  bg: string; card: string; cardAlt: string; border: string; divider: string;
  textPrimary: string; textSecondary: string; textMuted: string;
  accentBlue: string; accentCyan: string; accentGreen: string; accentPurple: string;
  accentAmber: string; accentIndigo: string;
  success: string; warning: string; danger: string;
  kpi: {tasks: CcKpiVariant; visitors: CcKpiVariant; drivers: CcKpiVariant; users: CcKpiVariant};
}

export const ccDark: CcPalette = {
  mode: 'dark',
  bg: '#0A0E1A',
  card: '#111726',
  cardAlt: '#171E30',
  border: '#212A3D',
  divider: '#1B2233',
  textPrimary: '#F3F5F9',
  textSecondary: '#9AA4B8',
  textMuted: '#66708A',

  accentBlue: '#3B82F6',
  accentCyan: '#22D3EE',
  accentGreen: '#22C55E',
  accentPurple: '#A855F7',
  accentAmber: '#F59E0B',
  accentIndigo: '#6366F1',

  success: '#22C55E',
  warning: '#F0B247',
  danger: '#F1786F',

  kpi: {
    tasks: {bg: '#12294F', icon: '#5B9BF0', valueText: '#FFFFFF', labelText: 'rgba(255,255,255,0.7)'},
    visitors: {bg: '#0E3A2C', icon: '#4ADE9A', valueText: '#FFFFFF', labelText: 'rgba(255,255,255,0.7)'},
    drivers: {bg: '#4A2E0E', icon: '#F0B25B', valueText: '#FFFFFF', labelText: 'rgba(255,255,255,0.7)'},
    users: {bg: '#0E3A44', icon: '#4AD8E9', valueText: '#FFFFFF', labelText: 'rgba(255,255,255,0.7)'},
  },
};

export const ccLight: CcPalette = {
  mode: 'light',
  bg: '#F3F5F9',
  card: '#FFFFFF',
  cardAlt: '#F1F3F8',
  border: '#E1E5EE',
  divider: '#EAEDF4',
  textPrimary: '#12172B',
  textSecondary: '#5B6478',
  textMuted: '#8891A3',

  accentBlue: '#2563EB',
  accentCyan: '#0891B2',
  accentGreen: '#16A34A',
  accentPurple: '#9333EA',
  accentAmber: '#D97706',
  accentIndigo: '#4F46E5',

  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',

  kpi: {
    tasks: {bg: '#DCE8FE', icon: '#1D4ED8', valueText: '#0B1E3F', labelText: 'rgba(11,30,63,0.7)'},
    visitors: {bg: '#DAF3E5', icon: '#15803D', valueText: '#052E17', labelText: 'rgba(5,46,23,0.7)'},
    drivers: {bg: '#FBE9D2', icon: '#B45309', valueText: '#3A2508', labelText: 'rgba(58,37,8,0.7)'},
    users: {bg: '#D8F1F6', icon: '#0E7490', valueText: '#062A31', labelText: 'rgba(6,42,49,0.7)'},
  },
};

export const CcThemeContext = createContext<CcPalette>(ccLight);
export function useCc(): CcPalette {
  return useContext(CcThemeContext);
}
