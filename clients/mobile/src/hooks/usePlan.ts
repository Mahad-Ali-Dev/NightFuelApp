import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToday, generate, GeneratePlanPayload } from '@/api/plans';

/**
 * Daily plan & timeline hook.
 * Fetches today's plan and provides a mutation to generate a new one.
 */
export function usePlan() {
    const queryClient = useQueryClient();

    const todayQuery = useQuery({
        queryKey: ['plan', 'today'],
        queryFn: getToday,
        staleTime: 5 * 60 * 1000, // 5 min
    });

    const generateMutation = useMutation({
        mutationFn: (payload: GeneratePlanPayload) => generate(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['plan', 'today'] });
        },
        onError: (err: any) => {
            console.error('[usePlan] generate failed:', err);
        },
    });

    const plan = todayQuery.data;
    const meals = plan?.meals ?? [];
    const nextMeal = meals.length > 0 ? meals[0] : null;

    return {
        plan,
        meals,
        nextMeal,
        hydrationTarget: plan?.hydrationTargetMl ?? 2500,
        isLoadingPlan: todayQuery.isLoading,
        refetchPlan: todayQuery.refetch,

        generatePlan: generateMutation.mutateAsync,
        isGenerating: generateMutation.isPending,
    };
}
