import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToday, logHydration } from '@/api/progress';

/**
 * Water + caffeine tracking hook.
 * Wraps hydration-related progress endpoints.
 */
export function useHydration() {
    const queryClient = useQueryClient();

    const progressQuery = useQuery({
        queryKey: ['progress', 'today'],
        queryFn: getToday,
        staleTime: 5 * 60 * 1000,
    });

    const logMutation = useMutation({
        mutationFn: (amountMl: number) => logHydration(amountMl),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['progress', 'today'] });
        },
        onError: (err: any) => {
            console.error('[useHydration] logHydration failed:', err);
        },
    });

    const progress = progressQuery.data;
    const currentMl = progress?.hydrationActual ?? progress?.hydrationMl ?? 0;
    const targetMl = 2500;
    const percentage = targetMl > 0 ? Math.min(1, currentMl / targetMl) : 0;

    return {
        currentMl,
        targetMl,
        percentage,
        currentL: (currentMl / 1000).toFixed(1),
        targetL: (targetMl / 1000).toFixed(1),

        isLoading: progressQuery.isLoading,

        addWater: logMutation.mutateAsync,
        isAdding: logMutation.isPending,
        refetch: progressQuery.refetch,
    };
}
