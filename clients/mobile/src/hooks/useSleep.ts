import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { log as logSleep, getQuality, getAnalytics } from '@/api/sleep';

/**
 * Sleep logs & scoring hook.
 */
export function useSleep() {
    const queryClient = useQueryClient();

    const qualityQuery = useQuery({
        queryKey: ['sleep', 'quality'],
        queryFn: async () => {
            const { data } = await getQuality();
            return data;
        },
        staleTime: 10 * 60 * 1000,
    });

    const analyticsQuery = useQuery({
        queryKey: ['sleep', 'analytics'],
        queryFn: async () => {
            const { data } = await getAnalytics();
            return data;
        },
        staleTime: 10 * 60 * 1000,
    });

    const logMutation = useMutation({
        mutationFn: (payload: { startTime: string; endTime: string; quality?: number }) =>
            logSleep(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sleep'] });
        },
        onError: (err: any) => {
            console.error('[useSleep] logSleep failed:', err);
        },
    });

    return {
        quality: qualityQuery.data,
        analytics: analyticsQuery.data,
        isLoadingQuality: qualityQuery.isLoading,
        isLoadingAnalytics: analyticsQuery.isLoading,

        logSleep: logMutation.mutateAsync,
        isLogging: logMutation.isPending,

        refetchSleep: async () => {
            await Promise.all([qualityQuery.refetch(), analyticsQuery.refetch()]);
        },
    };
}
