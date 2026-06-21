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
    // HIGH #1: refreshToken is no longer accepted/stored here — it lives ONLY in
    // the httpOnly nf_refresh cookie. login() takes just the short-lived access
    // token, which is held in memory (lib/api.ts) and NOT persisted.
    login: (user: User, accessToken: string) => void;
    logout: () => void;
    updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            // The access token lives in lib/api's in-memory variable; mirror it
            // into the store for reactive consumers, but it is never persisted
            // (see `partialize` below), so a reload starts with token=null and the
            // axios interceptor silently refreshes from the cookie.
            token: getAccessToken(),
            isAuthenticated: false,
            login: (user, accessToken) => {
                setTokens(accessToken);
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
            // HIGH #1: persist ONLY non-secret profile state. The access token is
            // deliberately EXCLUDED from localStorage so no JWT is sittable for an
            // XSS to read; it is re-minted from the httpOnly refresh cookie on load.
            partialize: (state) => ({ user: state.user }),
        }
    )
);
