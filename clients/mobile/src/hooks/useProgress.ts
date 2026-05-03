import { useQuery } from '@tanstack/react-query';
import {
    getToday,
    getStreak,
    getWeeklyStats,
    getHistory,
    getStats,
    getBodyMetrics,
} from '@/api/progress';

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

        score: todayQuery.data?.score ?? 0,
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
