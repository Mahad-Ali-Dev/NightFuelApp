import type { ImageSourcePropType } from 'react-native';
import type { SearchLibraryFilters } from '@/api/exercises';

/**
 * "Body Focus" — a curated gallery of women's body-area workout collections.
 *
 * Each program is presentation-only metadata (title/blurb/accent/hero) PLUS a
 * ready-made `filter` that is spread straight into `searchLibrary`, so tapping a
 * card lands on the SAME pre-filtered exercise list the guided Train flow uses
 * (app/(exercises)/results.tsx) — no new list screen, no new data path.
 *
 * FILTER RESOLUTION (important):
 * The seeded catalog's `bodyPart` taxonomy is a fixed ExerciseDB set — exactly
 * `back · cardio · chest · lower arms · lower legs · neck · shoulders ·
 * upper arms · upper legs · waist · pelvic floor` (see exercise-service
 * BODY_PART_LABELS / WGER_CATEGORY_TO_BODY_PART). There is NO `hips`, `glutes`,
 * `abs`, or `belly` bodyPart, so those areas resolve to a REAL filter that the
 * backend actually returns rows for:
 *   • Glutes  → `muscleGroup: 'glute'` (wger "Glutes" seed → bodyPart 'upper legs'
 *               with primary muscle "glutes"; the backend contains-matches
 *               muscleGroup case-insensitively). Mirrors GROUP_FILTER.hips, which
 *               is documented as verified against live catalog counts.
 *   • Abs     → `bodyPart: 'waist'` (wger "Abs" category maps to bodyPart 'waist';
 *               ~776 rows). Distinguished from Waist below by a name `query`.
 *   • Waist   → `bodyPart: 'waist'` (same broad, well-populated core pool).
 *   • Hips    → `muscleGroup: 'glute'` (hips/glutes share the 'upper legs' area;
 *               glute-focused shaping is the closest real filter). See NOTE.
 *   • Chest   → `bodyPart: 'chest'` (~480 rows) — upper-body / bust-lift work.
 *   • Belly   → `bodyPart: 'waist'` + a fat-burn framing (no distinct "belly"
 *               bodyPart; the flat-belly angle is core + midsection). See NOTE.
 *   • Kegel   → `category: 'kegel'` (the seeded pelvic-floor set).
 *   • Flex    → `bodyPart: 'waist'` is wrong for stretching; the catalog has no
 *               'stretch' bodyPart, so flexibility filters by name `query:
 *               'stretch'` (contains-match on exercise name catches the seeded
 *               stretch/mobility moves). See NOTE.
 *   • Tone    → `category: 'cardio'` (full-body burn / lose-weight-&-tone).
 *
 * THIN / APPROXIMATED AREAS (surfaced honestly rather than shipping empties):
 *   - Hips reuses the glute filter (no dedicated hip-abductor bodyPart).
 *   - Belly reuses the waist filter (no dedicated "belly" bodyPart; framed as a
 *     flat-belly / core burn).
 *   - Flexibility relies on a name-`query` match ('stretch') — thinner than the
 *     muscle pools; if it reads sparse, the follow-up is a seeded 'stretching'
 *     category or a `bodyPart`-agnostic mobility tag.
 */
export interface WomensProgram {
  /** Stable key — also the women-<id>.jpg hero basename. */
  id: string;
  title: string;
  subtitle: string;
  /** One-liner selling the focus — shown under the title on the card. */
  blurb: string;
  /** Short chip label rendered over the hero. */
  tag: string;
  /** Card accent (hex) — tag chip + subtle border. */
  accent: string;
  /** Bundled hero art (require → RN module number). */
  hero: ImageSourcePropType;
  /** Ready-made searchLibrary filter — spread into the results query. */
  filter: SearchLibraryFilters;
}

export const WOMENS_PROGRAMS: WomensProgram[] = [
  {
    id: 'glutes',
    title: 'Peachy Glutes',
    subtitle: 'Lift & shape',
    tag: 'GLUTES',
    blurb: 'Hip thrusts, bridges and kickbacks to build rounder, stronger glutes.',
    accent: '#F072C4',
    hero: require('../../../assets/images/women-glutes.jpg'),
    // No 'glutes'/'hips' bodyPart in the catalog → match the primary muscle.
    filter: { muscleGroup: 'glute' },
  },
  {
    id: 'abs',
    title: 'Abs Sculpt',
    subtitle: 'Core definition',
    tag: 'ABS',
    blurb: 'Targeted crunch, hold and raise work to carve visible ab definition.',
    accent: '#4FC9E8',
    hero: require('../../../assets/images/women-abs.jpg'),
    // Abs live under bodyPart 'waist'; a name query narrows toward crunch/ab moves.
    filter: { bodyPart: 'waist', query: 'crunch' },
  },
  {
    id: 'waist',
    title: 'Snatched Waist',
    subtitle: 'Obliques & core',
    tag: 'WAIST',
    blurb: 'Oblique twists and anti-rotation work to cinch and define your waistline.',
    accent: '#A855F7',
    hero: require('../../../assets/images/women-waist.jpg'),
    // Broad, well-populated core pool (~776 rows) for the whole midsection.
    filter: { bodyPart: 'waist' },
  },
  {
    id: 'hips',
    title: 'Hip Sculpt',
    subtitle: 'Curves & mobility',
    tag: 'HIPS',
    blurb: 'Abductor and glute-med work to sculpt fuller hips and stronger side-glutes.',
    accent: '#FF6B4A',
    hero: require('../../../assets/images/women-hips.jpg'),
    // Hips/glutes share the 'upper legs' area — glute is the closest real filter.
    filter: { muscleGroup: 'glute' },
  },
  {
    id: 'chest',
    title: 'Chest Lift',
    subtitle: 'Upper body',
    tag: 'CHEST',
    blurb: 'Presses and flyes that firm the chest wall for a lifted upper body.',
    accent: '#7C9CFF',
    hero: require('../../../assets/images/women-chest.jpg'),
    filter: { bodyPart: 'chest' },
  },
  {
    id: 'belly',
    title: 'Flat-Belly Burn',
    subtitle: 'Lose & tighten',
    tag: 'BELLY',
    blurb: 'Core-and-cardio midsection work to burn belly fat and tighten your tummy.',
    accent: '#2ECC71',
    hero: require('../../../assets/images/women-belly.jpg'),
    // No dedicated 'belly' bodyPart → the flat-belly angle is core / midsection.
    filter: { bodyPart: 'waist' },
  },
  {
    id: 'kegel',
    title: 'Kegel & Pelvic Floor',
    subtitle: 'Core stability',
    tag: 'PELVIC FLOOR',
    blurb: 'Guided pelvic-floor squeezes to build core stability and control.',
    accent: '#8B7CF6',
    hero: require('../../../assets/images/women-kegel.jpg'),
    // The seeded pelvic-floor set (category === 'kegel').
    filter: { category: 'kegel' },
  },
  {
    id: 'flexibility',
    title: 'Flexibility & Stretch',
    subtitle: 'Mobility & recovery',
    tag: 'STRETCH',
    blurb: 'Full-body stretch and mobility flows to loosen tight muscles and recover.',
    accent: '#F5A623',
    hero: require('../../../assets/images/women-flexibility.jpg'),
    // No 'stretch' bodyPart — name contains-match catches the seeded stretch moves.
    filter: { query: 'stretch' },
  },
  {
    id: 'tone',
    title: 'Full-Body Tone',
    subtitle: 'Lose weight & tone',
    tag: 'FULL BODY',
    blurb: 'Fat-burning full-body cardio to lean out and tone from head to toe.',
    accent: '#C2F03C',
    hero: require('../../../assets/images/women-tone.jpg'),
    // Full-body burn for weight loss & tone.
    filter: { category: 'cardio' },
  },
];
