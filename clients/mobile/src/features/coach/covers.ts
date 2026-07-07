import type { ImageSourcePropType } from 'react-native';
import type { DayCover } from './types';

/**
 * Bundled day-card cover photos — one per focus type, generated via Replicate
 * (dark cinematic athletic shots, 640×640 ~30KB each). Kept OUT of plan.ts so the
 * split engine stays pure (asset-free) + unit-testable; screens import this to
 * resolve a day's `cover` key to its image.
 */
export const DAY_COVERS: Record<DayCover, ImageSourcePropType> = {
  chest: require('../../../assets/images/day-chest.jpg'),
  back: require('../../../assets/images/day-back.jpg'),
  legs: require('../../../assets/images/day-legs.jpg'),
  shoulders: require('../../../assets/images/day-shoulders.jpg'),
  core: require('../../../assets/images/day-core.jpg'),
  cardio: require('../../../assets/images/day-cardio.jpg'),
  fullbody: require('../../../assets/images/day-fullbody.jpg'),
  recovery: require('../../../assets/images/day-recovery.jpg'),
};

export const dayCover = (key: DayCover): ImageSourcePropType => DAY_COVERS[key];

/**
 * Bespoke hero art for each themed challenge (Phase 5), generated via Replicate
 * (dark cinematic, matching the day covers; cycle-sync uses a soft coral rim,
 * better-sleep a moonlit blue). Keyed by the challenge template `id`. The gallery
 * prefers these; `challengeHero` returns undefined for an unknown id so callers
 * can fall back to a day cover.
 */
export const CHALLENGE_HEROES: Record<string, ImageSourcePropType> = {
  'fat-loss-blitz': require('../../../assets/images/challenge-fat-loss-blitz.jpg'),
  'night-shift-reset': require('../../../assets/images/challenge-night-shift-reset.jpg'),
  'cycle-sync': require('../../../assets/images/challenge-cycle-sync.jpg'),
  'build-muscle': require('../../../assets/images/challenge-build-muscle.jpg'),
  'better-sleep': require('../../../assets/images/challenge-better-sleep.jpg'),
  'core-abs': require('../../../assets/images/challenge-core-abs.jpg'),
};

/**
 * Light-theme variants (bright/airy) of the same six heroes — used on light
 * themes so the card is an airy panel rather than a dark slab. Pair with
 * `heroCardTint(true)` for the matching light scrim + dark text.
 */
export const CHALLENGE_HEROES_LIGHT: Record<string, ImageSourcePropType> = {
  'fat-loss-blitz': require('../../../assets/images/challenge-fat-loss-blitz-light.jpg'),
  'night-shift-reset': require('../../../assets/images/challenge-night-shift-reset-light.jpg'),
  'cycle-sync': require('../../../assets/images/challenge-cycle-sync-light.jpg'),
  'build-muscle': require('../../../assets/images/challenge-build-muscle-light.jpg'),
  'better-sleep': require('../../../assets/images/challenge-better-sleep-light.jpg'),
  'core-abs': require('../../../assets/images/challenge-core-abs-light.jpg'),
};

/** Bespoke hero for a challenge id; `light` picks the bright variant (dark fallback). */
export const challengeHero = (id: string, light = false): ImageSourcePropType | undefined =>
  (light ? CHALLENGE_HEROES_LIGHT[id] : undefined) ?? CHALLENGE_HEROES[id];
