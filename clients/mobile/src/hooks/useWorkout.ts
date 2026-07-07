import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    searchLibrary,
    getRoutines,
    getActiveSession,
    startSession,
    endSession,
    logSessionExercise,
    getOneRepMaxes,
} from '@/api/exercises';

/**
 * Active workout session, exercise library, and 1RM data hook.
 */
export function useWorkout() {
    const queryClient = useQueryClient();

    const activeSessionQuery = useQuery({
        queryKey: ['workout-active-session'],
        queryFn: getActiveSession,
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
    });

    const routinesQuery = useQuery({
        queryKey: ['workout-routines'],
        queryFn: getRoutines,
        staleTime: 10 * 60 * 1000,
    });

    const oneRepMaxQuery = useQuery({
        queryKey: ['workout-1rm'],
        queryFn: getOneRepMaxes,
        staleTime: 10 * 60 * 1000,
    });

    const startMutation = useMutation({
        mutationFn: (routineId?: string) => startSession(routineId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-active-session'] });
        },
        onError: (err: any) => {
            console.error('[useWorkout] startSession failed:', err);
        },
    });

    const endMutation = useMutation({
        mutationFn: (sessionId: string) => endSession(sessionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-active-session'] });
            queryClient.invalidateQueries({ queryKey: ['workout-1rm'] });
        },
        onError: (err: any) => {
            console.error('[useWorkout] endSession failed:', err);
        },
    });

    const logExerciseMutation = useMutation({
        mutationFn: ({
            sessionId,
            ...payload
        }: {
            sessionId: string;
            exerciseName: string;
            sets: number;
            reps: number;
            weightKg: number;
            durationSecs: number;
        }) => logSessionExercise(sessionId, payload),
        onError: (err: any) => {
            console.error('[useWorkout] logExercise failed:', err);
        },
    });

    return {
        // Active session
        activeSession: activeSessionQuery.data ?? null,
        hasActiveSession: !!activeSessionQuery.data,
        isLoadingSession: activeSessionQuery.isLoading,
        isErrorSession: activeSessionQuery.isError,
        refetchSession: activeSessionQuery.refetch,

        // Routines
        routines: routinesQuery.data ?? [],
        isLoadingRoutines: routinesQuery.isLoading,
        isErrorRoutines: routinesQuery.isError,
        refetchRoutines: routinesQuery.refetch,

        // 1RM
        oneRepMaxes: oneRepMaxQuery.data ?? [],

        // Actions
        searchExercises: searchLibrary,
        startWorkout: startMutation.mutateAsync,
        endWorkout: endMutation.mutateAsync,
        logExercise: logExerciseMutation.mutateAsync,
        isStarting: startMutation.isPending,
        isEnding: endMutation.isPending,
        isLogging: logExerciseMutation.isPending,
    };
}
