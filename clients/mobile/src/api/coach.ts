/**
 * Coach plan persistence — a per-user blob stored by the exercise-service
 * (GET/PUT /v1/exercises/coach-plan), so the AI Coach plan survives reinstalls
 * and syncs across devices. The on-device store (coachStore) stays the working
 * copy; this is its backup/sync channel.
 */
import { apiClient } from './client';
import type { CoachPlan } from '@/features/coach/types';

/** The user's saved plan, or null if they've never built one. */
export const getCoachPlan = async (): Promise<CoachPlan | null> => {
    const { data } = await apiClient.get('/v1/exercises/coach-plan');
    return (data as CoachPlan) ?? null;
};

/** Upsert the user's plan blob. */
export const saveCoachPlan = async (plan: CoachPlan): Promise<void> => {
    await apiClient.put('/v1/exercises/coach-plan', { plan });
};
