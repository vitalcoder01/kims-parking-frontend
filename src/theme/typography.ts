import {Platform} from 'react-native';

const fontFamily = Platform.select({
  ios: {
    black: 'System',
    bold: 'System',
    semibold: 'System',
    medium: 'System',
    regular: 'System',
  },
  android: {
    black: 'sans-serif-black',
    bold: 'sans-serif-medium',
    semibold: 'sans-serif-medium',
    medium: 'sans-serif-medium',
    regular: 'sans-serif',
  },
  default: {
    black: 'System',
    bold: 'System',
    semibold: 'System',
    medium: 'System',
    regular: 'System',
  },
})!;

export const typography = {
  // Font families
  fonts: fontFamily,

  // Scale
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 34,
  },

  // Weights (cast for RN)
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },

  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },

  // Letter spacings
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1.2,
    widest: 2,
  },
};
