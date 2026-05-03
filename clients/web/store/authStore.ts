import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setTokens, clearTokens, getAccessToken } from '../lib/api';

export interface User {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    timezone: string;
    locale: string;
    region: string;
    role: string;
    onboardingCompleted: boolean;
    emailVerified: boolean;
    currentShiftId?: string | null;
    primaryGoal?: string | null;
    dietaryPreference?: string | null;
    lifestyleType?: string | null;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (user: User, accessToken: string, refreshToken: string) => void;
    logout: () => void;
    updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: getAccessToken() || null,
            isAuthenticated: !!getAccessToken(),
            login: (user, accessToken, refreshToken) => {
                setTokens(accessToken, refreshToken);
                set({ user, token: accessToken, isAuthenticated: true });
            },
            logout: () => {
                clearTokens();
                set({ user: null, token: null, isAuthenticated: false });
            },
            updateUser: (updatedUser) => {
                set((state) => ({
                    user: state.user ? { ...state.user, ...updatedUser } : null,
                }));
            },
        }),
        {
            name: 'auth-storage',
        }
    )
);
