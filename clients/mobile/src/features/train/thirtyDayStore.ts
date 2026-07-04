/**
 * 30-Day Challenge progress store — the persisted source of truth for which
 * challenges the user has started and which days they've completed.
 *
 * Mirrors coachStore's Zustand + AsyncStorage `persist` pattern (REFERENCE
 * ONLY — no coach code is imported). Unlike the coach plan, the challenge PLAN
 * itself is NOT persisted here: it's rebuilt deterministically on demand by
 * buildThirtyDayPlan from the live library (same input → same plan), so all we
 * need to keep is lightweight PER-CHALLENGE progress:
 *   • startedAt — ISO timestamp of the first `start(id)` (undefined = not begun)
 *   • completed — the set of completed day numbers, stored as a sorted array
 *                 (JSON has no Set; we normalize to a de-duped sorted array).
 *
 * GATING is derived, not stored: day N is unlocked once every NON-rest day
 * before it is complete (rest days auto-count). {@link isDayUnlocked} /
 * {@link challengeProgress} compute this from the saved `completed` array, so
 * the store stays tiny and the calendar screen reads one selector.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHALLENGE_LENGTH, REST_DAYS, isRestDay } from './thirtyDayChallenges';

/** Persisted progress for a single challenge id. */
export interface ChallengeProgress {
  /** ISO timestamp of the first start; absent until the user begins. */
  startedAt?: string;
  /** Completed day numbers (1…30), kept de-duped + ascending. */
  completed: number[];
}

interface ThirtyDayState {
  /** Keyed by challenge id. Absent id = never started. */
  progress: Record<string, ChallengeProgress>;
  /** Begin a challenge (idempotent — keeps the original startedAt/day 1). */
  start: (id: string) => void;
  /** Mark a day done (also stamps startedAt if this is the first interaction). */
  completeDay: (id: string, day: number) => void;
  /** Clear a single challenge's progress back to un-started. */
  reset: (id: string) => void;
}

/** Normalize a day list: integers in 1..30, de-duped, ascending. */
function normalizeDays(days: number[]): number[] {
  const seen = new Set<number>();
  for (const d of days) {
    const n = Math.round(Number(d));
    if (Number.isFinite(n) && n >= 1 && n <= CHALLENGE_LENGTH) seen.add(n);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export const useThirtyDayStore = create<ThirtyDayState>()(
  persist(
    (set, get) => ({
      progress: {},

      start: (id) =>
        set((st) => {
          if (st.progress[id]?.startedAt) return {}; // already started → no-op
          return {
            progress: {
              ...st.progress,
              [id]: { startedAt: new Date().toISOString(), completed: st.progress[id]?.completed ?? [] },
            },
          };
        }),

      completeDay: (id, day) =>
        set((st) => {
          const prev = st.progress[id] ?? { completed: [] };
          const completed = normalizeDays([...(prev.completed ?? []), day]);
          return {
            progress: {
              ...st.progress,
              [id]: { startedAt: prev.startedAt ?? new Date().toISOString(), completed },
            },
          };
        }),

      reset: (id) =>
        set((st) => {
          const next = { ...st.progress };
          delete next[id];
          return { progress: next };
        }),
    }),
    {
      name: 'nf-30day-progress',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ progress: s.progress }),
    },
  ),
);

// ── Derived helpers (pure — used by the screens; safe to call outside React) ──

/** Empty-safe read of a challenge's progress. */
export function getProgress(
  state: Pick<ThirtyDayState, 'progress'>,
  id: string,
): ChallengeProgress {
  return state.progress[id] ?? { completed: [] };
}

/** True if `day` is recorded complete. */
export function isDayComplete(progress: ChallengeProgress, day: number): boolean {
  return (progress.completed ?? []).includes(day);
}

/**
 * A day is UNLOCKED when every earlier NON-rest day is complete (rest days don't
 * block). Day 1 is always unlocked; a completed day stays unlocked/tappable.
 */
export function isDayUnlocked(progress: ChallengeProgress, day: number): boolean {
  if (day <= 1) return true;
  if (isDayComplete(progress, day)) return true;
  for (let d = 1; d < day; d++) {
    if (isRestDay(d)) continue; // rest days auto-satisfy
    if (!isDayComplete(progress, d)) return false;
  }
  return true;
}

/** The lowest non-rest, not-yet-done, unlocked day — the "Continue" target. */
export function activeDay(progress: ChallengeProgress): number | null {
  for (let d = 1; d <= CHALLENGE_LENGTH; d++) {
    if (isRestDay(d)) continue;
    if (!isDayComplete(progress, d) && isDayUnlocked(progress, d)) return d;
  }
  return null; // all training days done
}

/** Number of NON-rest ("workout") days in the challenge — the % denominator. */
export const WORKOUT_DAY_COUNT = CHALLENGE_LENGTH - REST_DAYS.length; // 26

/**
 * Completion %, measured over WORKOUT days only (rest days aren't "progress").
 * Returns 0…100 (integer).
 */
export function challengeProgress(progress: ChallengeProgress): number {
  const doneWorkoutDays = (progress.completed ?? []).filter((d) => !isRestDay(d)).length;
  return Math.round((Math.min(doneWorkoutDays, WORKOUT_DAY_COUNT) / WORKOUT_DAY_COUNT) * 100);
}
