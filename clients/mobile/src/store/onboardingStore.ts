import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
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

/**
 * SecureStore-backed persistence adapter.
 *
 * The onboarding draft holds health PII (weightKg / heightCm / dateOfBirth /
 * biologicalSex / healthConditions). Persisting it to plaintext AsyncStorage
 * leaves that PII readable on a compromised / rooted device, so we keep it in
 * the OS keychain/keystore instead. The draft is a handful of scalars plus a
 * short array — comfortably under SecureStore's size limit. On a successful
 * profile submit `reset()` clears the value (see profile-summary.tsx).
 */
const secureStorage: StateStorage = {
    getItem: (name) => SecureStore.getItemAsync(name),
    setItem: (name, value) => SecureStore.setItemAsync(name, value),
    removeItem: (name) => SecureStore.deleteItemAsync(name),
};

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
            // SecureStore key constraint: alphanumerics, '.', '-', '_' only.
            name: 'nf-onboarding-storage',
            storage: createJSONStorage(() => secureStorage),
        }
    )
);
