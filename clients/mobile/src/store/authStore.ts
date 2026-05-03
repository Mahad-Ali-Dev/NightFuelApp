import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '@/api/auth';

// ─── Types ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'user' | 'coach' | 'admin';
  onboardingComplete: boolean;
  shiftType: 'night' | 'rotating' | 'on-call' | null;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
  region: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── Token storage keys ──────────────────────────────────────────────

const TOKEN_KEYS = {
  access: 'nf_access_token',
  refresh: 'nf_refresh_token',
} as const;

// ─── Token helpers ───────────────────────────────────────────────────

async function persistTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEYS.access, tokens.accessToken);
  await SecureStore.setItemAsync(TOKEN_KEYS.refresh, tokens.refreshToken);
}

async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEYS.access);
  await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh);
}

async function getStoredTokens(): Promise<AuthTokens | null> {
  const accessToken = await SecureStore.getItemAsync(TOKEN_KEYS.access);
  const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh);

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

// ─── Store ───────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: 'user' | 'coach' | 'admin';
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setUser: (user: User) => void;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  role: 'user',

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(email, password);
      // auth.ts login() already persists tokens via setTokens.
      // Fetch the full profile so onboardingComplete / shiftType are correct
      // for returning users who already completed onboarding.
      let user: User;
      try {
        const raw = (await authApi.getMe()) as any;
        user = {
          id: raw.userId ?? raw.id,
          email: raw.email ?? '',
          name: raw.displayName ?? raw.name ?? 'User',
          avatarUrl: raw.avatarUrl ?? null,
          role: (raw.role ?? 'user').toLowerCase() as User['role'],
          onboardingComplete: raw.onboardingComplete ?? raw.preferences?.onboardingCompleted ?? false,
          shiftType: raw.shiftType ?? null,
        };
      } catch {
        // getMe failed (unlikely right after login); fall back to minimal data
        user = {
          ...response.user,
          avatarUrl: null,
          onboardingComplete: false,
          shiftType: null,
        } as User;
      }
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        role: user.role,
      });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.error || error.response?.data?.message || error.message);
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true });
    try {
      const response = await authApi.register(data);
      // auth.ts register() already persists tokens via setTokens
      const user = {
        ...response.user,
        avatarUrl: null,
        onboardingComplete: false,
        shiftType: null,
      } as User;
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        role: user.role,
      });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.error || error.response?.data?.message || error.message);
    }
  },

  logout: async () => {
    try {
      // Best-effort — no server logout endpoint wired yet
    } catch {
      // Ignore server errors
    } finally {
      await clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        role: 'user',
      });
    }
  },

  loadSession: async () => {
    set({ isLoading: true });
    try {
      const tokens = await getStoredTokens();
      if (!tokens) {
        set({ isLoading: false });
        return;
      }

      // Try to hydrate user profile from the backend
      try {
        const raw = (await authApi.getMe()) as any;
        const user: User = {
          id: raw.userId ?? raw.id,
          email: raw.email ?? '',
          name: raw.displayName ?? raw.name ?? 'User',
          avatarUrl: raw.avatarUrl ?? null,
          role: (raw.role ?? 'user').toLowerCase() as User['role'],
          onboardingComplete: raw.onboardingComplete ?? raw.preferences?.onboardingCompleted ?? false,
          shiftType: raw.shiftType ?? null,
        };
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          role: user.role,
        });
      } catch {
        // Token might be expired — still mark as authenticated
        // The apiClient interceptor will handle token refresh
        set({
          isAuthenticated: true,
          isLoading: false,
        });
      }
    } catch {
      // Token expired or invalid — clear everything
      await clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        role: 'user',
      });
    }
  },

  setUser: (user: User) => {
    set({ user, role: user.role });
  },
  updateUser: (data: Partial<User>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...data } : null,
      role: data.role || state.role,
    }));
  },
}));

