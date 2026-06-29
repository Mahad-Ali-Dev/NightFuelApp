/**
 * Coach plan store — the single source of truth for the active challenge.
 *
 * Persisted (AsyncStorage) so a plan survives app restarts. Only the `plan` is
 * persisted; `status` is transient. Days fill LAZILY (the active day fills on
 * generate; later days fill when first opened) so we don't fire 30× the API up
 * front. Gating lives here: only day 1 starts active; completing a day unlocks
 * the next.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CoachInputs, CoachPlan, ChallengeDay } from './types';
import { buildDaySplit } from './plan';
import { fillDayExercises, fillDayMeals } from './fill';

interface CoachState {
  plan: CoachPlan | null;
  status: 'idle' | 'generating' | 'ready';
  /** ISO timestamps of every plan generation (for the monthly quota). */
  generations: string[];
  /** Returns false when the monthly generation limit is reached (no new plan). */
  generate: (inputs: CoachInputs) => Promise<boolean>;
  ensureDayFilled: (day: number) => Promise<void>;
  toggleExercise: (day: number, exerciseId: string) => void;
  addMeal: (day: number, recipeId: string) => void;
  completeDay: (day: number) => void;
  reset: () => void;
}

/** A user may generate a fresh plan at most this many times per calendar month. */
export const MONTHLY_PLAN_LIMIT = 3;

/** Count of generations in the current calendar month (the quota window). */
export function generationsThisMonth(generations: string[], now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  return (generations ?? []).filter((iso) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}

function newPlan(inputs: CoachInputs): CoachPlan {
  const days: ChallengeDay[] = buildDaySplit(inputs.goal, inputs.duration).map((s) => ({
    ...s,
    status: s.day === 1 ? 'active' : 'locked',
    exercises: [],
    meals: [],
  }));
  return {
    id: `plan-${Date.now()}`,
    inputs,
    durationDays: inputs.duration,
    createdAt: new Date().toISOString(),
    days,
  };
}

export const useCoachStore = create<CoachState>()(
  persist(
    (set, get) => ({
      plan: null,
      status: 'idle',
      generations: [],

      generate: async (inputs) => {
        // Monthly quota: 3 generations per calendar month. At the limit the user
        // keeps their existing plan (no new generation).
        if (generationsThisMonth(get().generations) >= MONTHLY_PLAN_LIMIT) return false;
        set((st) => ({
          status: 'generating',
          plan: newPlan(inputs),
          generations: [...st.generations, new Date().toISOString()],
        }));
        await get().ensureDayFilled(1);
        set({ status: 'ready' });
        return true;
      },

      ensureDayFilled: async (day) => {
        const plan = get().plan;
        const d = plan?.days.find((x) => x.day === day);
        if (!plan || !d || d.status === 'locked' || d.exercises.length > 0) return;
        const [exercises, meals] = await Promise.all([
          fillDayExercises(d.focus, plan.inputs),
          fillDayMeals(plan.inputs),
        ]);
        set((st) =>
          st.plan
            ? { plan: { ...st.plan, days: st.plan.days.map((x) => (x.day === day ? { ...x, exercises, meals } : x)) } }
            : {},
        );
      },

      toggleExercise: (day, exerciseId) =>
        set((st) =>
          st.plan
            ? {
                plan: {
                  ...st.plan,
                  days: st.plan.days.map((d) =>
                    d.day === day
                      ? { ...d, exercises: d.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, done: !e.done } : e)) }
                      : d,
                  ),
                },
              }
            : {},
        ),

      addMeal: (day, recipeId) =>
        set((st) =>
          st.plan
            ? {
                plan: {
                  ...st.plan,
                  days: st.plan.days.map((d) =>
                    d.day === day ? { ...d, meals: d.meals.map((m) => (m.recipeId === recipeId ? { ...m, added: true } : m)) } : d,
                  ),
                },
              }
            : {},
        ),

      completeDay: (day) =>
        set((st) => {
          const d = st.plan?.days.find((x) => x.day === day);
          if (!st.plan || !d || d.exercises.length === 0 || !d.exercises.every((e) => e.done)) return {};
          const days = st.plan.days.map((x) => {
            if (x.day === day) return { ...x, status: 'done' as const, completedAt: new Date().toISOString() };
            if (x.day === day + 1 && x.status === 'locked') return { ...x, status: 'active' as const };
            return x;
          });
          // Workout-records logging happens in the day screen's onComplete
          // (logWorkout) just before this — keeps the store free of API calls.
          return { plan: { ...st.plan, days } };
        }),

      reset: () => set({ plan: null, status: 'idle' }),
    }),
    {
      name: 'nf-coach-plan',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ plan: s.plan, generations: s.generations }),
    },
  ),
);
