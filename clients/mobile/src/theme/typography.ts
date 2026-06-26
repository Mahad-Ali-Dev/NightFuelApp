// Zeitra Design System — Typography
// Saira is the brand face (per the app_images mockups): a clean, slightly
// technical geometric sans used for BOTH titles and body/UI — one family, the
// whole product. Loaded in app/_layout.tsx via @expo-google-fonts/saira.
// Barlow + Barlow Condensed remain loaded and defined below: Barlow as a
// humanist-sans fallback, Barlow Condensed kept ONLY for the deliberate
// condensed-numeral case (e.g. the analytics bar labels) where a tall, narrow
// figure is wanted. Sizes/line-heights are unchanged from the previous scale so
// layouts don't shift — only the family swaps to Saira. `mono` stays as an alias
// (now → Saira) so any generic stat reference still resolves to the brand face.

export const fontFamilies = {
  // Saira — the brand face. Titles + body + stats all use this.
  saira: {
    regular: 'Saira_400Regular',
    medium: 'Saira_500Medium',
    semiBold: 'Saira_600SemiBold',
    bold: 'Saira_700Bold',
  },
  // Barlow — humanist-sans fallback (kept loaded; no longer the primary).
  barlow: {
    regular: 'Barlow_400Regular',
    medium: 'Barlow_500Medium',
    semiBold: 'Barlow_600SemiBold',
    bold: 'Barlow_700Bold',
  },
  // Barlow Condensed — kept ONLY for the deliberate condensed-numeral case
  // (tall, narrow figures, e.g. analytics bar labels). Not the brand face.
  barlowCondensed: {
    semiBold: 'BarlowCondensed_600SemiBold',
    bold: 'BarlowCondensed_700Bold',
    extraBold: 'BarlowCondensed_800ExtraBold',
  },
  // Legacy alias — older code may still reference `mono` for stat numerals.
  // Now points at Saira so a generic stat reference renders in the brand face.
  mono: {
    regular: 'Saira_500Medium',
    semiBold: 'Saira_600SemiBold',
    bold: 'Saira_700Bold',
  },
} as const;

export const typography = {
  display: {
    fontFamily: fontFamilies.saira.bold,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: 0,
  },
  h1: {
    fontFamily: fontFamilies.saira.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 0,
  },
  h2: {
    fontFamily: fontFamilies.saira.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 0,
  },
  h3: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  // Aliases for compatibility
  heading: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  subhead: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    fontFamily: fontFamilies.saira.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fontFamilies.saira.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: fontFamilies.saira.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.saira.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  captionMedium: {
    fontFamily: fontFamilies.saira.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  overline: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  // Big hero numerals — Saira (the brand face) reads clean and modern at scale.
  statLarge: {
    fontFamily: fontFamilies.saira.bold,
    fontSize: 48,
    lineHeight: 56,
  },
  statMedium: {
    fontFamily: fontFamilies.saira.bold,
    fontSize: 32,
    lineHeight: 40,
  },
  statSmall: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 24,
    lineHeight: 32,
  },
  statTiny: {
    fontFamily: fontFamilies.saira.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
} as const;
