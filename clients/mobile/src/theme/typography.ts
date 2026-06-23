// Zeitra Design System — Typography
// Athletic pairing: Barlow Condensed (display / headings / big stats — tall,
// condensed, energetic) + Barlow (clean humanist sans for body/UI). Loaded in
// app/_layout.tsx via @expo-google-fonts. Sizes/line-heights are unchanged from
// the previous (system-fallback) scale so layouts don't shift — only the family
// swaps. `mono` is kept as an alias → condensed so any stat reference still resolves.

export const fontFamilies = {
  // Barlow — body / UI text.
  barlow: {
    regular: 'Barlow_400Regular',
    medium: 'Barlow_500Medium',
    semiBold: 'Barlow_600SemiBold',
    bold: 'Barlow_700Bold',
  },
  // Barlow Condensed — display, headings, hero numbers (athletic).
  barlowCondensed: {
    semiBold: 'BarlowCondensed_600SemiBold',
    bold: 'BarlowCondensed_700Bold',
    extraBold: 'BarlowCondensed_800ExtraBold',
  },
  // Legacy alias — older code may still reference `mono` for big stat numerals.
  mono: {
    regular: 'BarlowCondensed_600SemiBold',
    semiBold: 'BarlowCondensed_600SemiBold',
    bold: 'BarlowCondensed_700Bold',
  },
} as const;

export const typography = {
  display: {
    fontFamily: fontFamilies.barlowCondensed.extraBold,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: 0,
  },
  h1: {
    fontFamily: fontFamilies.barlowCondensed.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 0,
  },
  h2: {
    fontFamily: fontFamilies.barlowCondensed.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 0,
  },
  h3: {
    fontFamily: fontFamilies.barlowCondensed.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: fontFamilies.barlowCondensed.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  // Aliases for compatibility
  heading: {
    fontFamily: fontFamilies.barlowCondensed.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  subhead: {
    fontFamily: fontFamilies.barlowCondensed.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    fontFamily: fontFamilies.barlow.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fontFamilies.barlow.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: fontFamilies.barlow.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.barlow.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  captionMedium: {
    fontFamily: fontFamilies.barlow.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  overline: {
    fontFamily: fontFamilies.barlow.semiBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  // Big hero numerals — Barlow Condensed reads tall + athletic.
  statLarge: {
    fontFamily: fontFamilies.barlowCondensed.bold,
    fontSize: 48,
    lineHeight: 56,
  },
  statMedium: {
    fontFamily: fontFamilies.barlowCondensed.bold,
    fontSize: 32,
    lineHeight: 40,
  },
  statSmall: {
    fontFamily: fontFamilies.barlowCondensed.semiBold,
    fontSize: 24,
    lineHeight: 32,
  },
  statTiny: {
    fontFamily: fontFamilies.barlow.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
} as const;
