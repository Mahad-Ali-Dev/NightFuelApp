import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { search, log, getFasting, LogMealPayload } from '@/api/meals';
import { getToday } from '@/api/progress';

/**
 * Meal logs, macros, and fasting hook.
 * Combines meal API with today's progress for a unified nutrition view.
 */
export function useNutrition() {
    const queryClient = useQueryClient();

    const progressQuery = useQuery({
        queryKey: ['progress', 'today'],
        queryFn: getToday,
        staleTime: 5 * 60 * 1000,
    });

    const fastingQuery = useQuery({
        queryKey: ['fasting-status'],
        queryFn: getFasting,
        staleTime: 60 * 1000, // 1 min — fasting changes in real time
        refetchInterval: 60 * 1000,
    });

    const logMealMutation = useMutation({
        mutationFn: (payload: LogMealPayload) => log(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['progress', 'today'] });
        },
        onError: (err: any) => {
            console.error('[useNutrition] logMeal failed:', err);
        },
    });

    const progress = progressQuery.data;

    return {
        // Daily macros
        caloriesConsumed: progress?.caloriesActual ?? 0,
        caloriesTarget: progress?.caloriesTarget ?? 2450,
        proteinG: progress?.proteinActual ?? 0,
        carbsG: progress?.carbsActual ?? 0,
        fatG: progress?.fatActual ?? 0,
        score: progress?.score ?? 0,

        // Fasting
        fasting: fastingQuery.data,
        isFasting: fastingQuery.data?.isFasting ?? false,
        fastingElapsedMins: fastingQuery.data?.elapsedMinutes ?? 0,

        // Loading states
        isLoadingNutrition: progressQuery.isLoading,
        isLoadingFasting: fastingQuery.isLoading,

        // Actions
        logMeal: logMealMutation.mutateAsync,
        isLoggingMeal: logMealMutation.isPending,
        searchFood: search,
        refetchNutrition: progressQuery.refetch,
    };
}
