import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getModel, compute, CircadianComputePayload } from '@/api/circadian';

/**
 * Circadian clock data hook.
 * Provides the current circadian model and a mutation to recompute it.
 */
export function useCircadian() {
    const queryClient = useQueryClient();

    const modelQuery = useQuery({
        queryKey: ['circadian-model'],
        queryFn: getModel,
        staleTime: 10 * 60 * 1000, // 10 min — model doesn't change often
    });

    const computeMutation = useMutation({
        mutationFn: (payload: CircadianComputePayload) => compute(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['circadian-model'] });
        },
        onError: (err: any) => {
            console.error('[useCircadian] compute failed:', err);
        },
    });

    return {
        model: modelQuery.data,
        phases: modelQuery.data?.phases ?? [],
        melatoninOnset: modelQuery.data?.melatoninOnset ?? null,
        isLoadingModel: modelQuery.isLoading,
        refetchModel: modelQuery.refetch,

        computeModel: computeMutation.mutateAsync,
        isComputing: computeMutation.isPending,
    };
}
