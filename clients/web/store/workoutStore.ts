import { create } from 'zustand';

export type SetLog = {
    exerciseId: string;
    setIndex: number;
    weight: number;
    reps: number;
    rpe?: number;
    isCompleted: boolean;
};

interface WorkoutState {
    isActive: boolean;
    activeWorkoutPlan: any | null; // Replace with proper Plan Type later if available
    currentExerciseIndex: number;
    currentSetIndex: number;

    // Timer State
    restTimeLeft: number;
    isResting: boolean;
    restDurationSettings: number; // e.g., 60s, 90s, 120s

    // Logs
    completedSets: SetLog[];

    // Actions
    startWorkout: (plan: any) => void;
    endWorkout: () => void;

    // Progression
    startRestTimer: (duration: number) => void;
    decrementTimer: () => void;
    skipRest: () => void;

    nextSet: () => void;
    prevSet: () => void;
    nextExercise: () => void;
    prevExercise: () => void;

    logSet: (log: SetLog) => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
    isActive: false,
    activeWorkoutPlan: null,
    currentExerciseIndex: 0,
    currentSetIndex: 0,

    restTimeLeft: 0,
    isResting: false,
    restDurationSettings: 60,

    completedSets: [],

    startWorkout: (plan) => set({
        isActive: true,
        activeWorkoutPlan: plan,
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        restTimeLeft: 0,
        isResting: false,
        completedSets: [],
    }),

    endWorkout: () => set({
        isActive: false,
        activeWorkoutPlan: null,
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        restTimeLeft: 0,
        isResting: false,
    }),

    startRestTimer: (duration) => set({
        isResting: true,
        restTimeLeft: duration,
    }),

    decrementTimer: () => set((state) => {
        if (state.restTimeLeft <= 1) {
            return { restTimeLeft: 0, isResting: false };
        }
        return { restTimeLeft: state.restTimeLeft - 1 };
    }),

    skipRest: () => set({ isResting: false, restTimeLeft: 0 }),

    nextSet: () => set((state) => ({ currentSetIndex: state.currentSetIndex + 1 })),
    prevSet: () => set((state) => ({ currentSetIndex: Math.max(0, state.currentSetIndex - 1) })),

    nextExercise: () => set((state) => ({
        currentExerciseIndex: state.currentExerciseIndex + 1,
        currentSetIndex: 0
    })),

    prevExercise: () => set((state) => ({
        currentExerciseIndex: Math.max(0, state.currentExerciseIndex - 1),
        currentSetIndex: 0
    })),

    logSet: (log) => set((state) => {
        // Find existing log for this set, or append
        const filtered = state.completedSets.filter(
            s => !(s.exerciseId === log.exerciseId && s.setIndex === log.setIndex)
        );
        return { completedSets: [...filtered, log] };
    }),
}));
