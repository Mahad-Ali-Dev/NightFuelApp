import { useMemo } from 'react';
import { useTheme } from './index';
import { withAlpha } from './utils';

// Fixed semantic data hues (NOT brand): sleep = blue, water = cyan. These stay
// constant across every theme so a data category stays recognizable — the exact
// policy the theme already applies to macro carbs/fat/water (MACRO_FIXED). Only
// brand + surface tokens recolor with the selected variant.
const SLEEP_BLUE = '#7C9CFF';
const WATER_CYAN = '#4FC9E8';

/**
 * Theme-derived replacement for the per-screen hardcoded `const D = {…}` mockup
 * palettes (Home / Meals / Train / Profile / onboarding shift-type). It maps the
 * ACTIVE theme's tokens — which recolor per the selected variant (Midnight Lime,
 * Ember, Daylight, …) — onto the `D` shape those screens consume, so picking a
 * theme in Settings now recolors the main tabs too.
 *
 * On the default `midnight-lime` variant the seven core keys (bg/card/border/
 * lime/ink/text/muted) are byte-identical to the original hardcoded values, so
 * the default look is preserved; the handful of derived tint/surface keys are
 * imperceptibly close on default and now recolor on-brand (e.g. the lime-tinted
 * avatar disc becomes orange-tinted under Ember).
 *
 * Returned as a superset of every screen's keys — each screen reads the subset
 * it needs. Memoized on `colors` so it only recomputes when the theme changes.
 */
export function useThemedPalette() {
  const { colors } = useTheme();
  return useMemo(() => {
    const accent = colors.accent.lime; // the variant's brand accent
    return {
      // ── Core (byte-identical to the old hardcoded D on midnight-lime) ──────
      bg: colors.background.primary,
      card: colors.background.secondary,
      border: colors.border.default,
      lime: accent,
      ink: colors.text.inverse,        // ink-on-accent label colour
      text: colors.text.primary,
      muted: colors.text.secondary,
      // ── Secondary text ────────────────────────────────────────────────────
      sub: withAlpha(colors.text.primary, 0.82), // brighter-than-muted body text
      // ── Fixed semantic data hues (do not recolor — see note above) ─────────
      blue: SLEEP_BLUE,
      cyan: WATER_CYAN,
      // ── Surfaces / tints (derived → recolor with the theme) ────────────────
      tile: colors.background.tertiary,
      avBg: withAlpha(accent, 0.12),   // accent-tinted avatar / icon disc
      avBd: withAlpha(accent, 0.28),
      riaBg: withAlpha(accent, 0.1),
      riaBd: withAlpha(accent, 0.3),
      dotOff: colors.background.quaternary,
      streakOff: colors.background.quaternary,
      heroA: colors.background.tertiary,
      heroB: colors.background.secondary,
      ringTrack: colors.background.tertiary,
      menuDiv: colors.border.default,
      emptyBd: colors.border.light,
      selA: colors.background.tertiary,
      selB: colors.background.secondary,
    } as const;
  }, [colors]);
}

export type ThemedPalette = ReturnType<typeof useThemedPalette>;
