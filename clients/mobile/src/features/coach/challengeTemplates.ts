/**
 * Pre-built themed challenge templates — the "gallery" shortcut into the Coach
 * flow. Instead of picking gender/level/goal/diet/duration by hand on Build my
 * plan, the user taps a curated card (Fat Loss Blitz, Night-Shift Reset, …) and
 * we hand the SAME `generate(inputs)` store action a ready-made CoachInputs.
 *
 * A template is presentation-only metadata (title/blurb/accent/hero) PLUS the two
 * inputs that actually shape the plan (goal + duration, and an optional pinned
 * gender). Everything else (level/diet) is defaulted in `challengeInputs` so the
 * gallery reuses the existing split + fill pipeline unchanged — no new day
 * generator. Hero images reuse the 8 bundled day-<key>.jpg covers as placeholders;
 * bespoke challenge artwork is generated later (see follow-ups).
 */
import type { CoachGoal, CoachGender, CoachInputs, DayCover, PlanDuration, PlanSplit } from './types';

export interface ChallengeTemplate {
  id: string;
  title: string;
  subtitle: string;
  /** Short chip label (duration/focus) rendered over the hero. */
  tag: string;
  /** One-liner selling the angle — shown under the title on the card. */
  blurb: string;
  goal: CoachGoal;
  duration: PlanDuration;
  /** Selects a dedicated day-split in plan.ts (circadian / cycle-sync). Absent →
   * the goal-based split, exactly like the generic build flow. */
  split?: PlanSplit;
  /** Pins the plan to a gender when the challenge is gender-specific (Cycle Sync). */
  gender?: CoachGender;
  /** Card accent (hex) — used for the tag chip + subtle borders. */
  accent: string;
  /** Placeholder hero → resolved to a bundled day-<key>.jpg via covers.ts. */
  heroCover: DayCover;
}

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'fat-loss-blitz',
    title: 'Fat Loss Blitz',
    subtitle: '15 days · high burn',
    tag: '15 DAYS',
    blurb: 'Cardio-forward days that torch calories and lean you out fast.',
    goal: 'fat-loss',
    duration: 15,
    accent: '#FF6B4A',
    heroCover: 'cardio',
  },
  {
    id: 'night-shift-reset',
    title: 'Night-Shift Reset',
    subtitle: '7 days · circadian',
    tag: '7 DAYS',
    blurb: 'Movement + meals timed to your shift to reset your body clock and beat the 3am slump.',
    goal: 'maintain',
    duration: 7,
    split: 'circadian',
    accent: '#7C9CFF',
    heroCover: 'fullbody',
  },
  {
    id: 'cycle-sync',
    title: 'Cycle Sync',
    subtitle: '7 days · phase-aware',
    tag: 'FOR HER',
    blurb: 'Workouts synced to your menstrual phase — train hard when you can, recover when you should.',
    goal: 'maintain',
    duration: 7,
    split: 'cycle-sync',
    gender: 'Female',
    accent: '#F072C4',
    heroCover: 'recovery',
  },
  {
    id: 'build-muscle',
    title: 'Build Muscle',
    subtitle: '30 days · hypertrophy',
    tag: '30 DAYS',
    blurb: 'A full month split that adds size with progressive push, pull and leg days.',
    goal: 'muscle-gain',
    duration: 30,
    accent: '#C2F03C',
    heroCover: 'chest',
  },
  {
    id: 'better-sleep',
    title: 'Better Sleep',
    subtitle: '7 days · wind-down',
    tag: '7 DAYS',
    blurb: 'Gentle sessions and evening routines that deepen your sleep, night after night.',
    goal: 'maintain',
    duration: 7,
    accent: '#8B7CF6',
    heroCover: 'recovery',
  },
  {
    id: 'core-abs',
    title: 'Core & Abs',
    subtitle: '15 days · midsection',
    tag: '15 DAYS',
    blurb: 'Focused core work plus fat-burn days to carve out a stronger, tighter midsection.',
    goal: 'fat-loss',
    duration: 15,
    accent: '#4FC9E8',
    heroCover: 'core',
  },
];

/**
 * Map a template → the CoachInputs the store's `generate` action expects.
 * Goal + duration come from the template; a challenge may pin a gender (Cycle
 * Sync), otherwise the caller can pass one (opts.gender), falling back to 'Male'.
 * Level + diet are sensible defaults so the existing split + fill pipeline runs
 * unchanged — the user can still Build a fully custom plan the long way.
 */
export function challengeInputs(
  template: ChallengeTemplate,
  opts?: { gender?: CoachGender },
): CoachInputs {
  return {
    gender: template.gender ?? opts?.gender ?? 'Male',
    level: 'beginner',
    goal: template.goal,
    diet: 'balanced',
    duration: template.duration,
    // Carries the themed split (if any) so the store routes buildDaySplit onto the
    // circadian / cycle-sync builder; undefined for the plain goal challenges.
    split: template.split,
  };
}
