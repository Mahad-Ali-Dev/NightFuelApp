import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    ShiftType,
    DietaryPreference,
    ActivityLevel,
    FitnessGoal,
    ExperienceLevel,
    LifestyleType,
    DietMode,
    HealthCondition,
} from '@/types/enums';

export interface OnboardingData {
    shiftType: ShiftType | null;
    sleepTargetHours: number | null;
    sleepWindowStart: string | null;
    sleepWindowEnd: string | null;
    weightKg: number | null;
    heightCm: number | null;
    age: number | null;
    dateOfBirth: string | null;
    biologicalSex: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
    fitnessGoal: FitnessGoal | null;
    dietaryPreference: DietaryPreference | null;
    dietMode: DietMode | null;
    activityLevel: ActivityLevel | null;
    experienceLevel: ExperienceLevel | null;
    lifestyleType: LifestyleType | null;
    healthConditions: HealthCondition[] | null;
    aiOptimizationLevel: 'low' | 'medium' | 'high';
}

interface OnboardingState {
    data: OnboardingData;
    updateData: (partial: Partial<OnboardingData>) => void;
    reset: () => void;
}

const initialState: OnboardingData = {
    shiftType: null,
    sleepTargetHours: null,
    sleepWindowStart: null,
    sleepWindowEnd: null,
    weightKg: null,
    heightCm: null,
    age: null,
    dateOfBirth: null,
    biologicalSex: null,
    fitnessGoal: null,
    dietaryPreference: null,
    dietMode: null,
    activityLevel: null,
    experienceLevel: null,
    lifestyleType: null,
    healthConditions: [],
    aiOptimizationLevel: 'medium',
};

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set) => ({
            data: initialState,
            updateData: (partial) =>
                set((state) => ({ data: { ...state.data, ...partial } })),
            reset: () => set({ data: initialState }),
        }),
        {
            name: 'nf-onboarding-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
