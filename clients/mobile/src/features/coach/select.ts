/**
 * Selection engine (deterministic half of the hybrid plan) — the rules that turn
 * a day's `focus` into real, well-chosen exercises + a sets/reps prescription.
 *
 * The catalog (4,562 moves) mixes staple lifts with stretches/mobility/warm-ups,
 * so picking the FIRST rows returns junk. `scoreExercise` ranks staples up
 * (compound patterns + real equipment) and demotes stretches/assisted variants;
 * the async fill (Phase 2b) pulls a focus group via searchLibrary, sorts by this
 * score, and takes the top few. Pure + unit-tested here; no API import.
 */
import type { CoachLevel } from './types';

/** Maps a day-split focus key to the catalog filter that pulls its exercises. */
export type FocusFilter = { bodyPart?: string; muscleGroup?: string; category?: string };

export const FOCUS_FILTER: Record<string, FocusFilter> = {
  chest: { bodyPart: 'chest' },
  back: { bodyPart: 'back' },
  shoulders: { bodyPart: 'shoulders' },
  legs: { bodyPart: 'upper legs' },
  core: { bodyPart: 'waist' },
  triceps: { muscleGroup: 'tricep' },
  biceps: { muscleGroup: 'bicep' },
  arms: { bodyPart: 'upper arms' },
  cardio: { category: 'cardio' },
};

const STRETCH_RE = /\b(stretch|mobility|warm[\s-]?up|foam roll|myofascial)\b/i;
const ASSISTED_RE = /(\bassisted\b|on a support|\(with (?:band|towel)\))/i;
const COMPOUND_RE = /\b(press|row|squat|deadlift|pull[\s-]?up|lunge|push[\s-]?up|dip|clean|snatch|thruster|chin[\s-]?up|curl|extension|raise|pulldown)\b/i;
const EQUIP_RE = /\b(barbell|dumbbell|cable|machine|kettlebell|smith|trap bar|ez bar|leg press|lever)\b/i;

/** A move whose name reads as a stretch / mobility drill rather than a working set. */
export const isStretchy = (name: string): boolean => STRETCH_RE.test(name || '');

export interface RankableExercise {
  name: string;
  equipment?: string | null;
}

/** Higher = a better "best pick". Compounds + real equipment up; stretches down. */
export function scoreExercise(ex: RankableExercise): number {
  const n = ex.name || '';
  let s = 0;
  if (isStretchy(n)) s -= 10;
  if (ASSISTED_RE.test(n)) s -= 4;
  if (COMPOUND_RE.test(n)) s += 5;
  if (EQUIP_RE.test(n)) s += 3;
  const eq = (ex.equipment || '').toLowerCase();
  if (eq && eq !== 'body weight' && eq !== 'assisted') s += 2;
  // Staple moves tend to have short canonical names; long names are odd variants.
  s -= Math.min(3, Math.floor(n.length / 30));
  return s;
}

/** Rank a pool of exercises best-first (stable, quality-scored). */
export function rankExercises<T extends RankableExercise>(pool: T[]): T[] {
  return [...pool].sort((a, b) => scoreExercise(b) - scoreExercise(a));
}

export type Kind = 'strength' | 'core' | 'cardio';

export function kindForFocus(focus: string): Kind {
  if (focus === 'cardio') return 'cardio';
  if (focus === 'core') return 'core';
  return 'strength';
}

/** Sets/reps by level + movement kind. `reps` is a label (range / hold / duration). */
export function prescribe(level: CoachLevel, kind: Kind): { sets: number; reps: string } {
  if (kind === 'cardio') {
    return { sets: 1, reps: level === 'beginner' ? '15 min' : level === 'advanced' ? '30 min' : '20 min' };
  }
  if (kind === 'core') {
    return { sets: 3, reps: level === 'beginner' ? '12' : level === 'advanced' ? '20' : '15' };
  }
  if (level === 'beginner') return { sets: 3, reps: '12' };
  if (level === 'advanced') return { sets: 4, reps: '8' };
  return { sets: 4, reps: '10' };
}

/** How many exercises to prescribe for a day, by level. */
export const exercisesPerDay = (level: CoachLevel): number =>
  level === 'beginner' ? 4 : level === 'advanced' ? 6 : 5;
