// NightFuel Design System — Typography
// Fonts: Inter (UI) + JetBrains Mono (Stats/Data)

import { Platform } from 'react-native';

export const fontFamilies = {
  // Inter weights mapped to font file names
  inter: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extraBold: 'Inter_800ExtraBold',
  },
  mono: {
    regular: 'JetBrainsMono_400Regular',
    semiBold: 'JetBrainsMono_600SemiBold',
    bold: 'JetBrainsMono_700Bold',
  },
} as const;

export const typography = {
  display: {
    fontFamily: fontFamilies.inter.extraBold,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  h1: {
    fontFamily: fontFamilies.inter.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  h2: {
    fontFamily: fontFamilies.inter.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  h3: {
    fontFamily: fontFamilies.inter.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: fontFamilies.inter.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  // Aliases for compatibility
  heading: {
    fontFamily: fontFamilies.inter.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  subhead: {
    fontFamily: fontFamilies.inter.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    fontFamily: fontFamilies.inter.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fontFamilies.inter.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: fontFamilies.inter.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.inter.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  captionMedium: {
    fontFamily: fontFamilies.inter.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  overline: {
    fontFamily: fontFamilies.inter.semiBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  // Monospace stats
  statLarge: {
    fontFamily: fontFamilies.mono.bold,
    fontSize: 48,
    lineHeight: 56,
  },
  statMedium: {
    fontFamily: fontFamilies.mono.semiBold,
    fontSize: 32,
    lineHeight: 40,
  },
  statSmall: {
    fontFamily: fontFamilies.mono.semiBold,
    fontSize: 24,
    lineHeight: 32,
  },
  statTiny: {
    fontFamily: fontFamilies.mono.regular,
    fontSize: 16,
    lineHeight: 22,
  },
} as const;
