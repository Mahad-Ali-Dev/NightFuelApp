import type { ImageSourcePropType } from 'react-native';

/**
 * Cycle-phase + pregnancy hero art (Phase 6), generated via Replicate in the
 * dark-cinematic Zeitra aesthetic (coral rim) — the same look as the challenge
 * heroes. Used as a subtle full-bleed backdrop behind the phase ring and as the
 * pregnancy-mode banner, giving the period module the illustrated richness of
 * consumer period apps while staying on-brand (dark/premium, not pastel).
 *
 * Keyed by the concrete cycle phase. `phaseArt` returns undefined for UNKNOWN /
 * any non-concrete value so callers render their plain (art-free) fallback.
 */
export const PHASE_ART: Record<'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL', ImageSourcePropType> = {
  MENSTRUAL: require('../../../assets/images/phase-menstrual.jpg'),
  FOLLICULAR: require('../../../assets/images/phase-follicular.jpg'),
  OVULATORY: require('../../../assets/images/phase-ovulatory.jpg'),
  LUTEAL: require('../../../assets/images/phase-luteal.jpg'),
};

/** Bright/airy light-theme variants of the four phase visuals. */
export const PHASE_ART_LIGHT: Record<'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL', ImageSourcePropType> = {
  MENSTRUAL: require('../../../assets/images/phase-menstrual-light.jpg'),
  FOLLICULAR: require('../../../assets/images/phase-follicular-light.jpg'),
  OVULATORY: require('../../../assets/images/phase-ovulatory-light.jpg'),
  LUTEAL: require('../../../assets/images/phase-luteal-light.jpg'),
};

/** Phase backdrop; `light` picks the bright variant (both grounds legible under
 *  the theme-aware scrim the hero already applies). */
export const phaseArt = (phase: string | null | undefined, light = false): ImageSourcePropType | undefined => {
  if (!phase) return undefined;
  const map = light ? PHASE_ART_LIGHT : PHASE_ART;
  return (map as Record<string, ImageSourcePropType>)[phase];
};

/** Pregnancy-mode hero — dark cinematic + a bright light-theme variant. */
export const PREGNANCY_HERO: ImageSourcePropType = require('../../../assets/images/pregnancy-hero.jpg');
export const PREGNANCY_HERO_LIGHT: ImageSourcePropType = require('../../../assets/images/pregnancy-hero-light.jpg');
export const pregnancyHero = (light = false): ImageSourcePropType => (light ? PREGNANCY_HERO_LIGHT : PREGNANCY_HERO);
