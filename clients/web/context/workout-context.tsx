'use client';

import { useWorkoutStore } from '../store/workoutStore';

export const useWorkout = () => {
    // We can pull specific slices or the whole store
    const store = useWorkoutStore();

    // Derived state or helper functions can be added here if needed
    // e.g. calculating total volume from completedSets
    const totalVolume = store.completedSets.reduce((acc, set) => acc + (set.weight * set.reps), 0);
    const progressPercentage = store.activeWorkoutPlan
        ? ((store.currentExerciseIndex) / (store.activeWorkoutPlan.exercises?.length || 1)) * 100
        : 0;

    return {
        ...store,
        totalVolume,
        progressPercentage
    };
};
