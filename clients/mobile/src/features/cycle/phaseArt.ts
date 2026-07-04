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

export const phaseArt = (phase: string | null | undefined): ImageSourcePropType | undefined =>
  phase ? (PHASE_ART as Record<string, ImageSourcePropType>)[phase] : undefined;

/** Pregnancy-mode hero (dark cinematic, fitted activewear — on-brand). */
export const PREGNANCY_HERO: ImageSourcePropType = require('../../../assets/images/pregnancy-hero.jpg');
