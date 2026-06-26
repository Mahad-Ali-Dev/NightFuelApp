import { createContext, useContext } from 'react';
import { colors, ColorScheme, getThemeVariantColors, DEFAULT_THEME_VARIANT } from './colors';
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
      macro: colors.macro,
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
    macro: colors.macro,
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
    macro: nightReadColors.macro,
    success: nightReadColors.success,
    error: nightReadColors.error,
    warning: nightReadColors.warning,
    info: nightReadColors.info,
    gradients: nightReadColors.gradients,
    brand: nightReadColors.accent.coral, // coral → brand, exactly as getThemeColors does
  } as unknown as ThemeColors;
}

/**
 * Single entry point the provider uses: pick the active palette from the Night
 * Read flag and the selected color-theme variant.
 *
 * Priority (highest first):
 *   1. `nightRead` ON  → the deep-red Night Read palette, regardless of scheme
 *      or variant (Night Read is a single dark variant; behaviour UNCHANGED).
 *   2. otherwise        → the selected `themeVariant` palette (one of the 9 in
 *      colors.ts). Defaults to `'midnight-lime'`, which is byte-identical to
 *      `getThemeColors('dark')`, so the historical default look is preserved.
 *
 * Backward-compat: `themeVariant` is OPTIONAL and defaults to the Aurora-dark
 * variant. Any unknown id falls back to that default (never crashes). The
 * legacy `scheme` argument is still accepted; when the caller passes the default
 * variant it is honoured only by `midnight-lime` matching Aurora dark — explicit
 * variants own their own light/dark identity, so the picker is the source of
 * truth for palette while `scheme` continues to drive StatusBar/keyboard styling
 * elsewhere. With no `themeVariant` and `nightRead` false the result is exactly
 * `getThemeColors('dark')` (the equality the theme tests assert) — and for a
 * 'light' scheme it stays `getThemeColors('light')` so older call sites are safe.
 */
export function resolveThemeColors(
  scheme: ColorScheme,
  nightRead: boolean,
  themeVariant: string = DEFAULT_THEME_VARIANT,
): ThemeColors {
  if (nightRead) return getNightReadColors();
  // Preserve the pre-variant contract for callers that don't pass a variant:
  // default variant → fall through to the scheme-driven Aurora palette so a
  // 'light' scheme still yields the light palette (and dark yields midnight-lime,
  // which IS Aurora dark). An explicit non-default variant owns its palette.
  if (themeVariant === DEFAULT_THEME_VARIANT) return getThemeColors(scheme);
  return getThemeVariantColors(themeVariant) as unknown as ThemeColors;
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
