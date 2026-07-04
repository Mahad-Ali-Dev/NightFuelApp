import { useMemo } from 'react';
import { useTheme } from './index';
import { isLightHex, withAlpha } from './utils';

export interface CycleAccents {
  /** Period/menstrual signature colour (theme-aware). */
  coral: string;
  /** Lime brand accent (theme-aware). */
  lime: string;
  /** Soft coral tint for chip / card washes. */
  coralSoft: string;
  /** Soft lime tint for chip / card washes. */
  limeSoft: string;
  /** `true` on light themes. */
  isLight: boolean;
}

/**
 * PURE resolver: map a background hex to the cycle accent set. Exported so the
 * dark-safe invariant can be unit-tested WITHOUT a React renderer (the app has
 * no @testing-library/renderHook). `useCycleAccents` is a thin memoized wrapper.
 *
 * HARD INVARIANT — a DARK background returns the EXACT values that ship today
 * (coral #FF7A90, lime #A8CC3C), so routing the cycle components through this
 * cannot regress the (already-good) dark UI. Only the LIGHT branch is new: on a
 * near-white surface the raw coral/lime fail WCAG contrast for text + icons
 * (the "light theme needs fixing" the owner flagged), so they darken to
 * AA-passing shades (coral #C93B60 ≈ 4.6:1, lime #557A0F ≈ 4.8:1 on #F4F5F7).
 */
export function cycleAccentsForBackground(backgroundPrimary: string): CycleAccents {
  const light = isLightHex(backgroundPrimary);
  // Dark → ship-identical. Light → darkened for AA contrast on a light surface.
  const coral = light ? '#C93B60' : '#FF7A90';
  const lime = light ? '#557A0F' : '#A8CC3C';
  return {
    coral,
    lime,
    // Slightly stronger alpha on light so the wash stays visible against white.
    coralSoft: withAlpha(coral, light ? 0.1 : 0.14),
    limeSoft: withAlpha(lime, light ? 0.1 : 0.14),
    isLight: light,
  };
}

/**
 * Cycle / period accent palette — the theme-aware replacement for the
 * per-component hardcoded `const CORAL = '#FF7A90'` / `const LIME = '#A8CC3C'`
 * literals across `components/cycle/*` and `(performance)/cycle.tsx`.
 *
 * Light is detected from the ACTIVE theme's background luminance (`isLightHex`)
 * — the same signal `useThemedPalette` / GlassCard use — so it tracks whichever
 * variant the user selects.
 */
export function useCycleAccents(): CycleAccents {
  const { colors } = useTheme();
  return useMemo(() => cycleAccentsForBackground(colors.background.primary), [colors]);
}
