import { Platform, ViewStyle } from 'react-native';

// Zeitra Design System — Elevation Shadows

export const shadows = {
  sm: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.16,
      shadowRadius: 2,
    },
    android: {
      elevation: 2,
    },
  })!,

  md: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    android: {
      elevation: 4,
    },
  })!,

  lg: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.24,
      shadowRadius: 8,
    },
    android: {
      elevation: 8,
    },
  })!,

  xl: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 16,
    },
    android: {
      elevation: 12,
    },
  })!,

  glow: (color: string): ViewStyle =>
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        // Softened from 0.35/12 — a subtle premium halo, not a neon glow.
        shadowOpacity: 0.18,
        shadowRadius: 9,
      },
      android: {
        elevation: 4,
      },
    })!,
} as const;

/**
 * Scheme-aware shadows. The default `shadows` above are tuned for DARK surfaces;
 * on LIGHT themes (daylight/mist/pearl/blush) those same tokens read as ugly
 * halos/boxes — a dark `#000` cast + (worse) the Android `elevation` system
 * shadow paint gray rectangles on near-white surfaces, and `glow(accent)` paints
 * a saturated colored smudge. For light schemes we therefore DROP the Android
 * elevation (the main offender) and soften the iOS cast/halo so cards still read
 * lifted without a smear. Dark schemes pass through unchanged (byte-identical).
 *
 * Consumed via the theme provider so `useTheme().shadows` is already correct for
 * the active variant; the static `shadows` export stays dark-tuned for the few
 * call sites that import it directly.
 */
export function makeShadows(isLight: boolean): typeof shadows {
  if (!isLight) return shadows;
  const soft = (height: number, opacity: number, radius: number): ViewStyle =>
    Platform.select<ViewStyle>({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height }, shadowOpacity: opacity, shadowRadius: radius },
      android: { elevation: 0 },
    })!;
  return {
    sm: soft(1, 0.06, 3),
    md: soft(2, 0.08, 6),
    lg: soft(4, 0.1, 10),
    xl: soft(6, 0.12, 14),
    glow: (color: string): ViewStyle =>
      Platform.select<ViewStyle>({
        ios: { shadowColor: color, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
        android: { elevation: 0 },
      })!,
  } as const;
}
