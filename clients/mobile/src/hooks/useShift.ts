import { useQuery } from '@tanstack/react-query';
import { useShiftStore } from '@/store/shiftStore';
import { getCurrent } from '@/api/shifts';

/**
 * Current shift info hook.
 * Combines server data from TanStack Query with local Zustand shift state.
 */
export function useShift() {
    const currentShift = useShiftStore((s) => s.currentShift);
    const shiftType = useShiftStore((s) => s.shiftType);
    const shiftEndTime = useShiftStore((s) => s.shiftEndTime);
    const isOnShift = useShiftStore((s) => s.isOnShift);
    const setShift = useShiftStore((s) => s.setShift);
    const clearShift = useShiftStore((s) => s.clearShift);

    const query = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrent,
        staleTime: 5 * 60 * 1000, // 5 min
        refetchInterval: 60 * 1000, // Auto-refresh every 60s
    });

    /** Time remaining in the current shift (ms), or null if no shift. */
    const timeRemainingMs = shiftEndTime
        ? Math.max(0, new Date(shiftEndTime).getTime() - Date.now())
        : null;

    return {
        // Server state
        serverShift: query.data,
        isLoadingShift: query.isLoading,
        refetchShift: query.refetch,

        // Local state
        currentShift,
        shiftType,
        shiftEndTime,
        isOnShift,
        timeRemainingMs,

        // Actions
        setShift,
        clearShift,
    };
}
