/**
 * Coach (agentic challenge) feature — shared types.
 *
 * A "plan" is an N-day challenge (3/7/15/30) Ria builds from the user's inputs.
 * The HYBRID model: a per-goal day SPLIT (Day 1 = Chest, Day 2 = Cardio, …) is
 * designed up front (curated templates now, LLM-assisted later — see plan.ts),
 * then each day is FILLED with real exercises + meals selected from the existing
 * catalog by goal/level/gender/diet (see selectDay — Phase 2).
 *
 * Days are GATED: only day 1 starts `active`; day N+1 unlocks when day N is
 * `done`. Completing a day's exercises logs them to the workout records.
 */

export type CoachGoal = 'fat-loss' | 'muscle-gain' | 'endurance' | 'maintain';
export type CoachLevel = 'beginner' | 'intermediate' | 'advanced';
export type CoachDiet = 'balanced' | 'keto' | 'vegan' | 'high-protein';
export type CoachGender = 'Male' | 'Female';
export type PlanDuration = 3 | 7 | 15 | 30;

/** What the user picks on the "Build my plan" screen. */
export interface CoachInputs {
  gender: CoachGender;
  level: CoachLevel;
  goal: CoachGoal;
  diet: CoachDiet;
  duration: PlanDuration;
}

export type DayStatus = 'locked' | 'active' | 'done';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
/** Cover-image key for a day card — one of the 8 generated day-<key>.jpg assets. */
export type DayCover =
  | 'chest' | 'back' | 'legs' | 'shoulders' | 'core' | 'cardio' | 'fullbody' | 'recovery';

/** One AI-picked exercise within a day, with its prescribed volume + done state. */
export interface DayExercise {
  exerciseId: string;
  name: string;
  imageUrl?: string;
  /** Targeted body part / muscle group this slot was filled for (debug + UI). */
  focus?: string;
  sets: number;
  /** Reps as a label so it can be a range or a hold: "10", "12-15", "30s". */
  reps: string;
  done: boolean;
}

/** One AI-picked meal within a day. */
export interface DayMeal {
  recipeId: string;
  title: string;
  imageUrl?: string;
  mealType: MealType;
  kcal?: number;
  /** Macros (per serving) so "Add" can log it + feed the macros tracker. */
  protein?: number;
  carbs?: number;
  fat?: number;
  /** Whether the user accepted it into their meal log for the day. */
  added: boolean;
}

/** A single day of the challenge. `focus` drives exercise selection. */
export interface ChallengeDay {
  day: number; // 1-based
  title: string; // "Chest & triceps", "Cardio burn", "Active recovery"
  /** Muscle-group keys for selection ('chest','back',…), ['cardio'], or [] (rest). */
  focus: string[];
  /** A Tabler icon key for the day tile (e.g. 'barbell','run','stretching'). */
  icon: string;
  /** Cover-image key → resolved to a bundled day-<key>.jpg via covers.ts. */
  cover: DayCover;
  status: DayStatus;
  exercises: DayExercise[];
  meals: DayMeal[];
  completedAt?: string;
}

/** The skeleton a split template produces, before days are filled with content. */
export type DaySkeleton = Pick<ChallengeDay, 'day' | 'title' | 'focus' | 'icon' | 'cover'>;

export interface CoachPlan {
  id: string;
  inputs: CoachInputs;
  durationDays: PlanDuration;
  createdAt: string;
  days: ChallengeDay[];
}

export const GOAL_LABELS: Record<CoachGoal, string> = {
  'fat-loss': 'Fat loss',
  'muscle-gain': 'Muscle gain',
  endurance: 'Endurance',
  maintain: 'Maintain',
};
