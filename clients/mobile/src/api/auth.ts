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
    name: string;
    role: string;
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
 * Create a new account.
 * Automatically persists tokens to SecureStore.
 */
export async function register(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    '/v1/auth/register',
    payload,
  );
  await setTokens(data.accessToken, data.refreshToken);
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
 * Get the currently authenticated user's profile.
 */
export async function getMe() {
  const { data } = await apiClient.get('/v1/users/me');
  return data;
}
