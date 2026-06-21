import { apiClient, setTokens } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  region: string;
  timezone?: string;
  locale?: string;
  role?: 'USER' | 'COACH' | 'TRAINER' | 'NUTRITIONIST';
  shiftType?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    /** Backend returns `displayName` (not `name`) */
    displayName: string;
    name?: string;
    role: string;
    onboardingCompleted?: boolean;
  };
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Authenticate with email + password.
 * Automatically persists tokens to SecureStore.
 */
export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/v1/auth/login', {
    email,
    password,
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Create a new account, then sign in.
 *
 * The backend /register endpoint is intentionally enumeration-resistant: it
 * returns a generic { message } (never tokens, never "user already exists") so
 * an attacker can't probe which emails are registered. We therefore complete the
 * flow with an explicit login using the same credentials — a brand-new account
 * logs in cleanly; a duplicate email with a non-matching password fails exactly
 * like any other bad login, leaking no account-existence signal. `login()`
 * persists the tokens to SecureStore, so the screen contract is unchanged.
 */
export async function register(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  await apiClient.post('/v1/auth/register', payload);
  return login(payload.email, payload.password);
}

/**
 * Exchange a refresh token for a new token pair.
 * Typically used internally by the interceptor, but exposed for manual use.
 */
export async function refreshToken(token: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/v1/auth/refresh', {
    refreshToken: token,
  });
  return data;
}

/**
 * Request a password-reset email.
 */
export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    '/v1/auth/forgot-password',
    { email },
  );
  return data;
}

/**
 * Get the currently authenticated user's profile.
 */
export async function getMe() {
  const { data } = await apiClient.get('/v1/users/me');
  return data;
}

/**
 * Server-side logout — revokes the refresh token row in the auth-service DB.
 *
 * Best-effort: we don't surface failures to the user. If the network is down
 * or the server returns 5xx, the local SecureStore tokens are still cleared
 * by `authStore.logout()`. The worst case is a leaked refresh token that's
 * still valid until its 30-day TTL — a known trade-off, documented in
 * PRODUCTION_READINESS.md → A5.
 */
export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post(
    '/v1/auth/logout',
    { refreshToken },
    { timeout: 3_000 }, // 3s — don't make the user wait if the server is sluggish
  );
}
