import { createContext, useContext } from 'react';
import { colors, ColorScheme } from './colors';
import { nightReadColors } from './nightRead';
import { typography } from './typography';
import { spacing, borderRadius, iconSizes } from './spacing';
import { shadows } from './shadows';

export { colors, typography, spacing, borderRadius, iconSizes, shadows };
export type { ColorScheme };

// Resolved theme based on color scheme
export function getThemeColors(scheme: ColorScheme) {
  if (scheme === 'light') {
    return {
      background: colors.light.background,
      border: colors.light.border,
      text: colors.light.text,
      accent: colors.accent,
      success: colors.success,
      error: colors.error,
      warning: colors.warning,
      info: colors.info,
      gradients: colors.gradients,
      brand: colors.accent.coral,
    };
  }

  return {
    background: colors.background,
    border: colors.border,
    text: colors.text,
    accent: colors.accent,
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
    gradients: colors.gradients,
    brand: colors.accent.coral,
  };
}

export type ThemeColors = ReturnType<typeof getThemeColors>;

// "Night Read" resolver — maps the deep-red `nightReadColors` constant into the
// exact ThemeColors shape `getThemeColors` produces, so every `useTheme()`
// consumer re-themes with zero code changes when the flag is ON.
//
// Why a mapping (and not `return nightReadColors`): nightRead.ts has NO `light`
// sub-tree and, unlike ThemeColors, exposes no top-level `brand`. ThemeColors
// derives `brand` from `accent.coral`; we replicate that mapping here (coral →
// brand) so the contract is identical. The remaining keys
// (background/border/text/accent/gradients/success/error/warning/info) pass
// through unchanged.
//
// The cast is the same structural-subset idiom nightRead.ts already uses: the
// assembled object is ThemeColors-shaped key-for-key, but its hex *literal*
// types ('#0A0000' …) differ from Aurora's literals ('#0A0C12' …), so a direct
// annotation would be rejected on the literal mismatch even though the runtime
// shape is correct. Consumers only ever read these keys as strings.
export function getNightReadColors(): ThemeColors {
  return {
    background: nightReadColors.background,
    border: nightReadColors.border,
    text: nightReadColors.text,
    accent: nightReadColors.accent,
    success: nightReadColors.success,
    error: nightReadColors.error,
    warning: nightReadColors.warning,
    info: nightReadColors.info,
    gradients: nightReadColors.gradients,
    brand: nightReadColors.accent.coral, // coral → brand, exactly as getThemeColors does
  } as unknown as ThemeColors;
}

/**
 * Single entry point the provider uses: pick the active palette from the
 * resolved color scheme and the Night Read flag. When `nightRead` is OFF the
 * result is byte-identical to `getThemeColors(scheme)` (Aurora is untouched);
 * when ON it returns the deep-red Night Read palette regardless of scheme
 * (Night Read is a single dark variant, so light/dark collapses to it).
 */
export function resolveThemeColors(scheme: ColorScheme, nightRead: boolean): ThemeColors {
  return nightRead ? getNightReadColors() : getThemeColors(scheme);
}

interface ThemeContextValue {
  scheme: ColorScheme;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
}

export const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'dark',
  colors: getThemeColors('dark'),
  typography,
  spacing,
  borderRadius,
  shadows,
});

export const useTheme = () => useContext(ThemeContext);
