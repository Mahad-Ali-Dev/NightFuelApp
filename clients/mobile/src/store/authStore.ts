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
  emailVerified: boolean;
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
  /**
   * Create the account. Does NOT authenticate — the backend emails an OTP and
   * the caller routes to the verify screen, where {@link socialLogin} runs on a
   * successful verify-otp to sign the user in. Returns the generic
   * anti-enumeration message the server hands back.
   */
  register: (data: RegisterData) => Promise<{ message: string }>;
  /**
   * Hydrate the store from an already-issued token pair (Google / Apple /
   * verify-otp). Mirrors login()'s /me hydration so onboardingComplete / role /
   * emailVerified are correct, then flips isAuthenticated. `authResponse` is the
   * { user, accessToken, refreshToken } the api layer already persisted.
   */
  socialLogin: (authResponse: authApi.AuthResponse) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setUser: (user: User) => void;
  updateUser: (data: Partial<User>) => void;
}

/**
 * Shared /me hydration used by login() and socialLogin(). Fetches the full
 * profile so onboardingComplete / shiftType / emailVerified are correct for
 * returning users, falling back to the auth-response fields if /me is briefly
 * unreachable right after auth. `authUser` carries the role/email/emailVerified
 * the auth endpoint returns (the /me profile omits some of them).
 */
async function hydrateUserFromMe(
  authUser: authApi.AuthResponse['user'],
): Promise<User> {
  try {
    const raw = (await authApi.getMe()) as any;
    return {
      id: raw.userId ?? raw.id,
      email: authUser.email ?? raw.email ?? '',
      name: raw.displayName ?? authUser.displayName ?? raw.name ?? 'User',
      avatarUrl: raw.avatarUrl ?? null,
      role: (authUser.role ?? raw.role ?? 'user').toLowerCase() as User['role'],
      onboardingComplete:
        raw.onboardingCompleted ??
        raw.onboardingComplete ??
        raw.preferences?.onboardingCompleted ??
        false,
      emailVerified: raw.emailVerified ?? authUser.emailVerified ?? false,
      shiftType: raw.shiftType ?? null,
    };
  } catch {
    // getMe failed (unlikely right after auth); fall back to minimal data.
    return {
      id: authUser.id,
      email: authUser.email ?? '',
      name: authUser.displayName ?? authUser.name ?? 'User',
      avatarUrl: null,
      role: (authUser.role ?? 'user').toLowerCase() as User['role'],
      onboardingComplete: authUser.onboardingCompleted ?? false,
      emailVerified: authUser.emailVerified ?? false,
      shiftType: null,
    };
  }
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
      // Fetch the full profile so onboardingComplete / shiftType / emailVerified
      // are correct for returning users who already completed onboarding.
      const user = await hydrateUserFromMe(response.user);
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
    // The account is created but NOT signed in — the backend emails a 6-digit
    // OTP and returns a generic anti-enumeration message. The caller routes to
    // the verify screen; socialLogin() runs on a successful verify-otp. We keep
    // isLoading untouched (no session change here) so the auth gate doesn't
    // flicker while the user is mid-signup.
    try {
      return await authApi.register(data);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.response?.data?.message || error.message);
    }
  },

  socialLogin: async (authResponse: authApi.AuthResponse) => {
    // Tokens are already persisted by the api layer (googleSignIn / appleSignIn
    // / verifyOtp). Hydrate the profile exactly like login() so the redirect
    // gate sees onboardingComplete / role, then flip isAuthenticated.
    set({ isLoading: true });
    try {
      const user = await hydrateUserFromMe(authResponse.user);
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
      // Best-effort server-side revocation: deletes the refresh-token row
      // in the auth-service DB so a stolen token can't be reused.
      const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh);
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Server unreachable / token already revoked / 5xx — proceed with
      // local logout regardless. Local clearTokens() below is what makes
      // the device "logged out" from the user's perspective.
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
          onboardingComplete: raw.onboardingCompleted ?? raw.onboardingComplete ?? raw.preferences?.onboardingCompleted ?? false,
          emailVerified: raw.emailVerified ?? false,
          shiftType: raw.shiftType ?? null,
        };
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          role: user.role,
        });
      } catch (err: any) {
        // Distinguish "token bad" from "couldn't reach server / server 5xx".
        // - 401: the apiClient interceptor will have already tried (and failed)
        //   to refresh — clear the session so the user is bounced to /login.
        //   onSessionExpired in client.ts handles the navigation.
        // - Anything else (network drop, 502, etc.): keep the cached auth so
        //   the user can still see their offline-cached UI; we just couldn't
        //   refresh the profile this time.
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          await clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            role: 'user',
          });
          return;
        }
        // Soft failure: tokens are still valid, just couldn't reach /me.
        set({ isAuthenticated: true, isLoading: false });
      }
    } catch {
      // Storage / SecureStore access threw — treat as logged out.
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

