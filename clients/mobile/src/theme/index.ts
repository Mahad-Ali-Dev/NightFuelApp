import React, { createContext, useContext } from 'react';
import { colors, ColorScheme } from './colors';
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
