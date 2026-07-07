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
    emailVerified?: boolean;
  };
  accessToken: string;
  refreshToken: string;
}

/** Optional name Apple hands us on the FIRST authorization only. */
export interface AppleFullName {
  givenName?: string | null;
  familyName?: string | null;
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
 * Create a new account.
 *
 * The backend /register endpoint is intentionally enumeration-resistant: it
 * creates the user with emailVerified=false, emails a 6-digit OTP, and returns a
 * generic { message } (never tokens, never "user already exists") so an attacker
 * can't probe which emails are registered. It does NOT auto-login — the caller
 * routes the user to the verify screen with their email; entering the OTP there
 * (via {@link verifyOtp}) is what finally issues tokens and signs them in.
 */
export async function register(
  payload: RegisterPayload,
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    '/v1/auth/register',
    payload,
  );
  return data;
}

/**
 * Verify a Google ID token with the backend, which find-or-creates the user and
 * returns the standard { user, accessToken, refreshToken } shape (identical to
 * login()). Tokens are persisted to SecureStore so the store contract is
 * unchanged.
 */
export async function googleSignIn(idToken: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/v1/auth/oauth/google', {
    idToken,
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Verify an Apple identity token with the backend, which find-or-creates the
 * user and returns the standard auth shape. `fullName` is only present on the
 * FIRST authorization (Apple omits it on repeat sign-ins) — the backend persists
 * it then and looks the user up by the stable `sub` thereafter.
 */
export async function appleSignIn(
  identityToken: string,
  fullName?: AppleFullName,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/v1/auth/oauth/apple', {
    identityToken,
    ...(fullName ? { fullName } : {}),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Verify the 6-digit registration OTP emailed to `email`. On success the backend
 * flips emailVerified=true and returns the standard { user, accessToken,
 * refreshToken } shape — this is the step that signs a new user in. Tokens are
 * persisted to SecureStore.
 */
export async function verifyOtp(
  email: string,
  code: string,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/v1/auth/verify-otp', {
    email,
    code,
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Re-send the registration OTP. Anti-enumeration by design: the backend always
 * responds 200 with a generic { message } regardless of whether the email exists
 * (and enforces a resend cooldown server-side), so this never reveals account
 * existence.
 */
export async function resendOtp(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    '/v1/auth/resend-otp',
    { email },
  );
  return data;
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
 * Complete a password reset using the token from the emailed reset link.
 *
 * The backend validates the token (existence / not used / not expired), sets
 * the new password, and revokes all of the user's refresh tokens (so any old
 * sessions are forced to re-login). An invalid/expired token returns 400 — the
 * caller surfaces the expired state and routes the user back to forgot-password.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    '/v1/auth/reset-password',
    { token, newPassword },
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
