import { useQuery } from '@tanstack/react-query';
import {
    getToday,
    getStreak,
    getWeeklyStats,
    getHistory,
    getStats,
    getBodyMetrics,
    TodayProgress,
} from '@/api/progress';

/**
 * Derive the 0–100 performance score the UI displays from the fields
 * GET /v1/progress/today ACTUALLY returns. The server's
 * `dailyProgressResponseSchema` carries NO `score` field — only the raw
 * adherence signals (calories/protein actual-vs-target, `isAdherent`,
 * `fatigueScore`) — so reading `progress.score` was always `undefined → 0`,
 * pinning the hero ring at 0/coral. This re-derives a real value on the client.
 *
 * Formula (deterministic, same input → same output, no I/O):
 *   - Per macro with a positive target, an adherence ratio
 *     min(actual / target, 1) ∈ [0, 1] — overshooting a target caps at 1.0
 *     (hitting the goal, not exceeding it, is what scores).
 *   - The score is the mean of the available calorie + protein ratios × 100,
 *     rounded to a whole percent.
 *   - When NO macro target is set yet (a fresh day before a plan computes
 *     targets), fall back to the server's own boolean verdict:
 *     `isAdherent ? 100 : 0` — honest, never a misleading mid-range number.
 *
 * Always returns a finite integer in [0, 100]; missing/NaN inputs floor to 0.
 */
export function deriveTodayScore(today: TodayProgress | undefined): number {
    if (!today) return 0;

    const ratio = (actual: unknown, target: unknown): number | null => {
        const a = Number(actual);
        const t = Number(target);
        if (!Number.isFinite(a) || !Number.isFinite(t) || t <= 0) return null;
        return Math.min(Math.max(a / t, 0), 1);
    };

    const components = [
        ratio(today.caloriesActual, today.caloriesTarget),
        ratio(today.proteinActual, today.proteinTarget),
    ].filter((r): r is number => r !== null);

    if (components.length === 0) {
        // No targets to measure against yet — defer to the server's verdict.
        return today.isAdherent ? 100 : 0;
    }

    const mean = components.reduce((sum, r) => sum + r, 0) / components.length;
    const score = Math.round(mean * 100);
    return Number.isFinite(score) ? Math.min(Math.max(score, 0), 100) : 0;
}

/**
 * Stats, streaks, and history hook.
 * Aggregates multiple progress endpoints into a unified view.
 */
export function useProgress() {
    const todayQuery = useQuery({
        queryKey: ['progress', 'today'],
        queryFn: getToday,
        staleTime: 5 * 60 * 1000,
        refetchInterval: 60 * 1000,
    });

    const streakQuery = useQuery({
        queryKey: ['progress', 'streak'],
        queryFn: getStreak,
        staleTime: 10 * 60 * 1000,
    });

    const weeklyQuery = useQuery({
        queryKey: ['progress', 'weekly'],
        queryFn: getWeeklyStats,
        staleTime: 10 * 60 * 1000,
    });

    return {
        today: todayQuery.data,
        streak: streakQuery.data,
        weekly: weeklyQuery.data,

        score: deriveTodayScore(todayQuery.data),
        currentStreak: streakQuery.data?.current ?? 0,
        longestStreak: streakQuery.data?.longest ?? 0,

        isLoadingToday: todayQuery.isLoading,
        isLoadingStreak: streakQuery.isLoading,
        isLoadingWeekly: weeklyQuery.isLoading,

        refetchAll: async () => {
            await Promise.all([
                todayQuery.refetch(),
                streakQuery.refetch(),
                weeklyQuery.refetch(),
            ]);
        },

        // Lazy loaders (call these when navigating to analytics)
        fetchHistory: getHistory,
        fetchStats: getStats,
        fetchBodyMetrics: getBodyMetrics,
    };
}
