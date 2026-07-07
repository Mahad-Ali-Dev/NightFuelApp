import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default gateway URL — routes through Nginx, not a single microservice. */
const DEFAULT_BASE_URL = __DEV__
  ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native') as typeof import('react-native');

    // Try to get the dev-server host IP from Expo (works for physical devices)
    let devHost: string | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Constants = require('expo-constants').default;
      // hostUri is like "192.168.100.31:8081" when running on a physical device
      const hostUri: string | undefined = Constants?.expoConfig?.hostUri;
      if (hostUri) {
        devHost = hostUri.split(':')[0]; // extract just the IP
      }
    } catch {
      // expo-constants may not be available
    }

    if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
      // Physical device — use the dev machine's actual IP
      return `http://${devHost}:3000/api`;
    }

    // Fallback: emulator/simulator addresses
    // Android emulator maps 10.0.2.2 → host machine; iOS simulator uses localhost
    return Platform.OS === 'android'
      ? 'http://10.0.2.2:3000/api'
      : 'http://localhost:3000/api';
  })()
  : 'https://api.zeitra.app';

/**
 * Resolve the base URL at module-load time.
 * In production builds you would typically set `NF_API_BASE_URL` via
 * `expo-constants` / `app.config.ts` `extra` field.
 */
function resolveBaseUrl(): string {
  // 1. Standard Expo EXPO_PUBLIC variables
  if (process.env.EXPO_PUBLIC_NF_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_NF_API_BASE_URL;
  }

  try {
    // 2. Fallback to older Constants parsing
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const envUrl: unknown =
      Constants?.expoConfig?.extra?.NF_API_BASE_URL ??
      Constants?.manifest?.extra?.NF_API_BASE_URL;
    if (typeof envUrl === 'string' && envUrl.length > 0) return envUrl;
  } catch {
    // expo-constants may not be resolvable in bare RN or tests
  }
  return DEFAULT_BASE_URL;
}

export const API_BASE_URL = resolveBaseUrl();

/**
 * URL prefix policy. The mobile app calls paths like `/v1/auth/login`. Two
 * deployment targets resolve those differently:
 *   - Dev via Next.js gateway (port 3000):  /api + /auth/login   (strip /v1)
 *   - Direct production service:            /v1/auth/login        (keep /v1)
 *
 * The previous heuristic was `if (baseURL.includes(':3000')) strip /v1` which
 * silently broke when staging exposed the gateway on port 443. We now use an
 * explicit env switch with a port-3000 fallback for backwards compatibility.
 *
 * Set EXPO_PUBLIC_API_STRIP_V1_PREFIX=true|false to override; otherwise we
 * infer from the URL.
 */
function shouldStripV1Prefix(baseURL: string): boolean {
  const explicit = process.env.EXPO_PUBLIC_API_STRIP_V1_PREFIX;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  // Infer: if the baseURL ends in `/api` (the Next.js gateway pattern), the
  // gateway re-adds the version prefix server-side, so strip on the client.
  return /\/api\/?$/.test(baseURL) || baseURL.includes(':3000');
}

const STRIP_V1_PREFIX = shouldStripV1Prefix(API_BASE_URL);

/**
 * Resolve a `/v1/...`-style logical path into the exact same absolute URL the
 * {@link apiClient} interceptor would produce, honoring the gateway prefix
 * policy (see {@link shouldStripV1Prefix}).
 *
 * Use this for requests made *outside* of axios — e.g. the XHR-based SSE
 * streamer in `api/ai.ts` — so the base URL + `/v1` strip behaviour stays in
 * one place and never drifts from the interceptor.
 */
export function resolveApiUrl(path: string): string {
  let p = path;
  if (STRIP_V1_PREFIX && p.startsWith('/v1/')) {
    p = p.replace(/^\/v1\//, '/');
  }
  return `${API_BASE_URL}${p}`;
}

// ---------------------------------------------------------------------------
// Secure-store token helpers
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_KEY = 'nf_access_token';
const REFRESH_TOKEN_KEY = 'nf_refresh_token';

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Request interceptor -- attach JWT
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 1. JWT attachment
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 2. Gateway-mode prefix stripping (see shouldStripV1Prefix above).
    if (STRIP_V1_PREFIX && config.url?.startsWith('/v1/')) {
      config.url = config.url.replace(/^\/v1\//, '/');
    }

    if (__DEV__) {
      // Dev-only request log. Disabled in prod to avoid leaking URLs to
      // Android logcat (any app with READ_LOGS can read those).
      console.log(`[API Request] -> ${config.baseURL} + ${config.url}`);
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor -- automatic token refresh on 401
// ---------------------------------------------------------------------------

interface QueueItem {
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((item) => {
    if (error) {
      item.reject(error);
    } else {
      item.resolve(token);
    }
  });
  failedQueue = [];
}

/**
 * Callback invoked when token refresh fails irrecoverably.
 * Consumers can replace this with their own navigation logic
 * (e.g. `router.replace('/login')`).
 */
export let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(cb: () => void): void {
  onSessionExpired = cb;
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Don't run token-refresh on the auth endpoints themselves: a 401 from
    // login/register/refresh/forgot-password is a real credential error, not an
    // expired session. Refreshing + replaying it would wrongly log the user out
    // (or loop) on a simple wrong-password attempt.
    const reqUrl = originalRequest.url || '';
    const isAuthEndpoint = /\/auth\/(login|register|refresh|forgot-password)/.test(reqUrl);

    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If another refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise<string | null>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        processQueue(error, null);
        await clearTokens();
        onSessionExpired?.();
        return Promise.reject(error);
      }

      // Call the refresh endpoint directly (skip interceptors to avoid loops)
      const refreshPath = STRIP_V1_PREFIX ? '/auth/refresh' : '/v1/auth/refresh';
      const { data } = await axios.post<{
        accessToken: string;
        refreshToken: string;
      }>(`${API_BASE_URL}${refreshPath}`, { refreshToken });

      await setTokens(data.accessToken, data.refreshToken);

      // Update default header for future requests
      apiClient.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;

      // Retry the original request
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

      processQueue(null, data.accessToken);
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await clearTokens();
      onSessionExpired?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
