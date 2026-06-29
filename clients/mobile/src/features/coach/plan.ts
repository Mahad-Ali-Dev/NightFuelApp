/**
 * Day-split engine — the "what trains on which day" half of the hybrid plan.
 *
 * Each goal has a repeating training CYCLE (a real program repeats its split each
 * week). `buildDaySplit` lays that cycle across the chosen duration (3/7/15/30),
 * producing the gated day skeletons. Phase 2's selector then fills each day's
 * `focus` with real exercises + meals from the catalog.
 *
 * These curated cycles are the deterministic baseline; the LLM hand-off (Phase 2)
 * can REPLACE `buildDaySplit` with a model-designed split while keeping the same
 * DaySkeleton shape, so nothing downstream changes.
 */
import type { CoachGoal, DayCover, DaySkeleton, PlanDuration } from './types';

interface DayTemplate {
  title: string;
  /** Muscle-group / modality keys the selector maps to catalog filters. */
  focus: string[];
  /** Tabler icon key for the day tile. */
  icon: string;
  /** Cover-image key (→ day-<cover>.jpg via covers.ts). */
  cover: DayCover;
}

const SPLITS: Record<CoachGoal, DayTemplate[]> = {
  'muscle-gain': [
    { title: 'Chest & triceps', focus: ['chest', 'triceps'], icon: 'barbell', cover: 'chest' },
    { title: 'Back & biceps', focus: ['back', 'biceps'], icon: 'barbell', cover: 'back' },
    { title: 'Legs & core', focus: ['legs', 'core'], icon: 'run', cover: 'legs' },
    { title: 'Shoulders & abs', focus: ['shoulders', 'core'], icon: 'barbell', cover: 'shoulders' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  'fat-loss': [
    { title: 'Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Cardio burn', focus: ['cardio'], icon: 'run', cover: 'cardio' },
    { title: 'HIIT & core', focus: ['core', 'cardio'], icon: 'bolt', cover: 'core' },
    { title: 'Lower body', focus: ['legs'], icon: 'run', cover: 'legs' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  endurance: [
    { title: 'Cardio base', focus: ['cardio'], icon: 'run', cover: 'cardio' },
    { title: 'Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Tempo & core', focus: ['core', 'cardio'], icon: 'bolt', cover: 'core' },
    { title: 'Cross-train', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  maintain: [
    { title: 'Upper body', focus: ['chest', 'back', 'shoulders', 'arms'], icon: 'barbell', cover: 'chest' },
    { title: 'Lower body', focus: ['legs', 'core'], icon: 'run', cover: 'legs' },
    { title: 'Cardio & core', focus: ['cardio', 'core'], icon: 'bolt', cover: 'cardio' },
    { title: 'Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
};

/** True when a day is a rest / active-recovery day (no resistance focus). */
export const isRestDay = (focus: string[]): boolean => focus.length === 0;

/**
 * Lay the goal's training cycle across `duration` days. Day numbers are 1-based.
 * The cycle repeats (a 5-day cycle over 30 days = 6 rounds) — exactly how a real
 * weekly program recurs — so titles intentionally recur across rounds.
 */
export function buildDaySplit(goal: CoachGoal, duration: PlanDuration): DaySkeleton[] {
  const cycle = SPLITS[goal];
  return Array.from({ length: duration }, (_, i) => {
    const t = cycle[i % cycle.length]!;
    return { day: i + 1, title: t.title, focus: [...t.focus], icon: t.icon, cover: t.cover };
  });
}
