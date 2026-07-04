import type { ImageSourcePropType } from 'react-native';
import type { Exercise, SearchLibraryFilters } from '@/api/exercises';

/**
 * "30-Day Challenges" — Leap-style, gender-specific, day-by-day plans built
 * ENTIRELY over the EXISTING seeded exercise library. There is no new backend:
 * each challenge carries a ready-made `searchLibrary` `filter` for its body area
 * (the same taxonomy Body Focus uses — see womensPrograms.ts) and a pure,
 * deterministic {@link buildThirtyDayPlan} slices those catalog rows into 30
 * days of workouts with an escalating rep/set progression + weekly rest days.
 *
 * FILTER RESOLUTION (matches womensPrograms.ts / exercise-service taxonomy):
 * The catalog's `bodyPart` set is the fixed ExerciseDB list — `back · cardio ·
 * chest · lower arms · lower legs · neck · shoulders · upper arms · upper legs ·
 * waist · pelvic floor`. There is NO `abs`/`glutes` bodyPart, so those areas
 * resolve to a filter the backend actually returns rows for:
 *   • Abs      → `bodyPart: 'waist'`   (wger "Abs" → bodyPart 'waist', ~776 rows)
 *   • Glutes   → `muscleGroup: 'glute'` (glutes live under 'upper legs'; the
 *                backend contains-matches muscleGroup case-insensitively)
 *   • Legs     → `bodyPart: 'upper legs'`
 *   • Chest    → `bodyPart: 'chest'`   (~480 rows)
 *   • Arms     → `bodyPart: 'upper arms'`
 *   • Full body→ `category: 'cardio'`  (full-body burn / conditioning)
 *
 * The `gender` field drives which set shows by default (from the profile's
 * biologicalSex) and is forwarded to the exercise-detail demo route so the
 * clip/anatomy matches; the filter itself stays gender-agnostic so the pool is
 * never starved (the catalog is Male-skewed — hard gender filtering thins it).
 */
export interface ThirtyDayChallenge {
  /** Stable key — also the c30-<id>.jpg hero basename. */
  id: string;
  title: string;
  /** Who the challenge is framed for; drives the default gallery set + demo gender. */
  gender: 'Male' | 'Female';
  /** Human body-area label (e.g. "Abs", "Glutes"). */
  area: string;
  /** Short chip label rendered over the hero. */
  tag: string;
  /** One-liner selling the focus — shown under the title on the card. */
  blurb: string;
  /** Card accent (hex) — tag chip + subtle border + progress fill. */
  accent: string;
  /** Bundled hero art (require → RN module number). */
  hero: ImageSourcePropType;
  /** Ready-made searchLibrary filter for the area — fetched once, fed to buildThirtyDayPlan. */
  filter: SearchLibraryFilters;
}

export const THIRTY_DAY_CHALLENGES: ThirtyDayChallenge[] = [
  // ── Female ────────────────────────────────────────────────────────────────
  {
    id: 'abs-female',
    title: '30-Day Abs',
    gender: 'Female',
    area: 'Abs',
    tag: 'ABS',
    blurb: 'A month of progressive core work to carve visible, defined abs.',
    accent: '#4FC9E8',
    hero: require('../../../assets/images/c30-abs-female.jpg'),
    // Abs live under bodyPart 'waist' (~776 rows) — the broad midsection pool.
    filter: { bodyPart: 'waist' },
  },
  {
    id: 'glutes-female',
    title: '30-Day Glutes',
    gender: 'Female',
    area: 'Glutes',
    tag: 'GLUTES',
    blurb: 'Thirty days of thrusts, bridges and kickbacks for rounder, stronger glutes.',
    accent: '#F072C4',
    hero: require('../../../assets/images/c30-glutes-female.jpg'),
    // No 'glutes' bodyPart — match the primary muscle instead.
    filter: { muscleGroup: 'glute' },
  },
  {
    id: 'legs-female',
    title: '30-Day Legs',
    gender: 'Female',
    area: 'Legs',
    tag: 'LEGS',
    blurb: 'Squat, lunge and lower-body work to sculpt lean, toned legs in a month.',
    accent: '#A855F7',
    hero: require('../../../assets/images/c30-legs-female.jpg'),
    filter: { bodyPart: 'upper legs' },
  },
  {
    id: 'fullbody-female',
    title: '30-Day Full Body',
    gender: 'Female',
    area: 'Full Body',
    tag: 'FULL BODY',
    blurb: 'A head-to-toe fat-burning conditioning challenge to lean out and tone up.',
    accent: '#C2F03C',
    hero: require('../../../assets/images/c30-fullbody-female.jpg'),
    // Full-body burn / conditioning.
    filter: { category: 'cardio' },
  },
  // ── Male ──────────────────────────────────────────────────────────────────
  {
    id: 'abs-male',
    title: '30-Day Abs',
    gender: 'Male',
    area: 'Abs',
    tag: 'ABS',
    blurb: 'Thirty days of escalating core training to build a hard, defined six-pack.',
    accent: '#00D4AA',
    hero: require('../../../assets/images/c30-abs-male.jpg'),
    filter: { bodyPart: 'waist' },
  },
  {
    id: 'chest-male',
    title: '30-Day Chest',
    gender: 'Male',
    area: 'Chest',
    tag: 'CHEST',
    blurb: 'A month of presses and flyes to build a thicker, stronger chest.',
    accent: '#4FC3F7',
    hero: require('../../../assets/images/c30-chest-male.jpg'),
    filter: { bodyPart: 'chest' },
  },
  {
    id: 'arms-male',
    title: '30-Day Arms',
    gender: 'Male',
    area: 'Arms',
    tag: 'ARMS',
    blurb: 'Curls, extensions and pressing work to add size to your biceps and triceps.',
    accent: '#F97316',
    hero: require('../../../assets/images/c30-arms-male.jpg'),
    filter: { bodyPart: 'upper arms' },
  },
  {
    id: 'fullbody-male',
    title: '30-Day Full Body',
    gender: 'Male',
    area: 'Full Body',
    tag: 'FULL BODY',
    blurb: 'A total-body conditioning challenge to burn fat and build athletic shape.',
    accent: '#C2F03C',
    hero: require('../../../assets/images/c30-fullbody-male.jpg'),
    filter: { category: 'cardio' },
  },
];

/** Look a challenge up by its stable id (for the detail screen's route param). */
export function getChallengeById(id: string | undefined | null): ThirtyDayChallenge | undefined {
  if (!id) return undefined;
  return THIRTY_DAY_CHALLENGES.find((c) => c.id === id);
}

// ── Plan builder ─────────────────────────────────────────────────────────────

/** Total days in every challenge. */
export const CHALLENGE_LENGTH = 30;

/** Days that are scheduled rest (recovery) — end of each of the four weeks. */
export const REST_DAYS: readonly number[] = [7, 14, 21, 28];

export function isRestDay(day: number): boolean {
  return REST_DAYS.includes(day);
}

/** A single prescribed exercise within a challenge day. */
export interface PlannedExercise {
  /** Library exercise id — tappable through to the existing detail/demo route. */
  id: string;
  name: string;
  /** Best-effort thumbnail/context from the library row. */
  imageUrl?: string;
  videoUrl?: string;
  demoGifUrl?: string;
  bodyPart?: string;
  /** Prescription for this day (escalates across the 30 days). */
  sets: number;
  reps: number;
}

/** One day of the 30-day plan. Rest days carry no exercises. */
export interface PlannedDay {
  /** 1-based day index (1…30). */
  day: number;
  /** Short title, e.g. "Day 3 · Abs" or "Recovery". */
  title: string;
  rest: boolean;
  exercises: PlannedExercise[];
  /** Prescription summary for the day header (e.g. "3 × 12"), '' on rest days. */
  target: string;
}

/**
 * A deterministic 30-day plan. Same `challenge` + same catalog `exercises` in →
 * byte-identical plan out (no `Math.random`; everything varies by day index).
 *
 * HOW IT IS BUILT (all pure/stable):
 *  • Exercise pool — the library rows are sorted stably (image-first, then by
 *    name) so ordering never depends on the API's row order. Rows without an id
 *    are dropped (they can't deep-link to a detail page).
 *  • Per-day picks — each training day takes a window of ~4–6 exercises from the
 *    pool, its SIZE and its START both derived from the day index (a fixed
 *    stride marches the window through the pool and wraps), so consecutive days
 *    rotate through different movements rather than repeating the same four.
 *    Day count grows slightly over the month (4 early → 6 late) as a volume ramp.
 *  • Progression — sets/reps come from an escalating table keyed to the "training
 *    week" (days 1–6 → wk0, 8–13 → wk1, …): reps climb 10→12→14→16 and sets
 *    3→3→4→4 across the four weeks, so total volume ramps up as the challenge
 *    goes on. A tiny +reps nudge on the last day of each block adds a "finisher".
 *  • Rest — days 7/14/21/28 are recovery: no exercises, title "Recovery".
 *
 * Empty pool (e.g. a filter returned nothing) → training days still render with
 * an empty exercise list, so the calendar/gating is intact and the screen shows
 * an honest "no exercises" state rather than crashing.
 */
export function buildThirtyDayPlan(
  challenge: Pick<ThirtyDayChallenge, 'area'>,
  exercises: Exercise[],
): PlannedDay[] {
  // Stable pool: image-first (nicer cards), then alphabetical; drop id-less rows.
  const pool: Exercise[] = [...(exercises ?? [])]
    .filter((e) => !!e && !!e.id)
    .sort((a, b) => {
      const ai = a.imageUrl ? 0 : 1;
      const bi = b.imageUrl ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

  const days: PlannedDay[] = [];

  for (let day = 1; day <= CHALLENGE_LENGTH; day++) {
    if (isRestDay(day)) {
      days.push({ day, title: 'Recovery', rest: true, exercises: [], target: '' });
      continue;
    }

    // "Training week" 0..3 — which block of the ramp this day belongs to. Day 30
    // (past the 4th rest on 28) folds into the final week's top volume.
    const week = Math.min(3, Math.floor((day - 1) / 7));

    // Escalating volume table (varies by week only → deterministic). `week` is
    // clamped 0..3 so these always hit; the `?? ` fallbacks satisfy
    // noUncheckedIndexedAccess and keep the values provably numeric.
    const SET_BY_WEEK = [3, 3, 4, 4] as const;
    const REP_BY_WEEK = [10, 12, 14, 16] as const;
    const sets = SET_BY_WEEK[week] ?? 3;
    // Finisher bump on the last training day before each rest (days 6/13/20/27)
    // and on the closing day 30 — a couple extra reps to cap the block.
    const isBlockFinish = day === 6 || day === 13 || day === 20 || day === 27 || day === 30;
    const reps = (REP_BY_WEEK[week] ?? 10) + (isBlockFinish ? 2 : 0);
    const target = `${sets} × ${reps}`;

    // Day size ramps 4 → 6 across the month (a stable function of the day index).
    const size = 4 + Math.min(2, Math.floor((day - 1) / 11)); // 4 for d1-11, 5 for d12-22, 6 for d23-30.

    const picks: PlannedExercise[] = [];
    if (pool.length > 0) {
      // March a window through the pool: a fixed stride per day + a rotating
      // offset within the day. Both keyed to `day`, so no randomness and every
      // day rotates onto a fresh slice (wrapping around the pool).
      const stride = 5; // coprime-ish with typical pool sizes → good spread.
      const base = ((day - 1) * stride) % pool.length;
      const seen = new Set<string>();
      for (let k = 0; k < size && seen.size < pool.length; k++) {
        const ex = pool[(base + k) % pool.length];
        if (!ex || seen.has(ex.id)) continue; // skip dupes when size > pool length
        seen.add(ex.id);
        picks.push({
          id: ex.id,
          name: ex.name,
          imageUrl: ex.imageUrl,
          videoUrl: ex.videoUrl,
          demoGifUrl: ex.demoGifUrl,
          bodyPart: ex.bodyPart,
          sets,
          reps,
        });
      }
    }

    days.push({
      day,
      title: `Day ${day} · ${challenge.area}`,
      rest: false,
      exercises: picks,
      target,
    });
  }

  return days;
}
