/**
 * Social sign-in helpers (Google + Apple).
 *
 * These wrap the native provider SDKs and the backend exchange behind a single
 * {@link SocialAuthResult} discriminated union so the auth SCREENS (login /
 * register) stay declarative: they call `runGoogleSignIn()` / `runAppleSignIn()`,
 * then `switch` on `result.status` to update the store or show a friendly error.
 *
 * Design decisions:
 *  - GRACEFUL DEGRADATION: if the Google web client ID is still the placeholder
 *    (or unset), we return { status: 'not-configured' } instead of letting the
 *    native SDK throw an opaque error — the mirror of the backend's 503-style
 *    "not configured" response. Same idea for Apple when the platform can't do it.
 *  - CANCELLATION is a first-class, non-error outcome ({ status: 'cancelled' }),
 *    so the screen can no-op silently (no scary red banner when the user just
 *    backs out of the sheet).
 *  - The store hydration (setTokens + isAuthenticated) is intentionally NOT done
 *    here: the api layer persists tokens, and the screen calls
 *    `authStore.socialLogin(result.auth)` so the User hydration path is shared
 *    with email login / verify-otp.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as authApi from '@/api/auth';

/** The placeholder left in app.json until real Google creds are provisioned. */
const GOOGLE_WEB_CLIENT_PLACEHOLDER = 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID';

export type SocialAuthResult =
  | { status: 'success'; auth: authApi.AuthResponse }
  | { status: 'cancelled' }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

/**
 * Resolve the configured Google web client ID from app.json `extra`, or null if
 * it is unset / still the placeholder. Kept as a helper so both the config guard
 * and (potential) callers read the same source of truth.
 */
export function getGoogleWebClientId(): string | null {
  const id = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)
    ?.googleWebClientId;
  if (!id || id === GOOGLE_WEB_CLIENT_PLACEHOLDER) return null;
  return id;
}

let googleConfigured = false;

/**
 * Run the full Google sign-in flow: configure (once) → hasPlayServices →
 * signIn() → exchange the ID token with our backend. Returns a discriminated
 * result; never throws for the expected cases (cancel / not-configured).
 */
export async function runGoogleSignIn(): Promise<SocialAuthResult> {
  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    return {
      status: 'not-configured',
      message: 'Google sign-in isn’t set up yet. Please use email for now.',
    };
  }

  try {
    if (!googleConfigured) {
      GoogleSignin.configure({ webClientId });
      googleConfigured = true;
    }

    // Android: ensure Play Services are present (no-op resolve on iOS).
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return { status: 'cancelled' };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      return {
        status: 'error',
        message: 'Google didn’t return a sign-in token. Please try again.',
      };
    }

    const auth = await authApi.googleSignIn(idToken);
    return { status: 'success', auth };
  } catch (err: any) {
    // The SDK throws a coded NativeModuleError for user-driven outcomes.
    const code = err?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    if (code === statusCodes.IN_PROGRESS) {
      return { status: 'error', message: 'A sign-in is already in progress.' };
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        status: 'not-configured',
        message: 'Google Play Services are required for Google sign-in.',
      };
    }
    const serverMsg =
      err?.response?.data?.error ?? err?.response?.data?.message;
    return {
      status: 'error',
      message: serverMsg ?? 'Google sign-in failed. Please try again.',
    };
  }
}

/**
 * True only on iOS where the Apple auth UI is available. Apple sign-in doesn't
 * exist on Android, so callers should hide/disable the button when this is false.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Run the full Apple sign-in flow: signInAsync (FULL_NAME + EMAIL scopes) →
 * exchange the identity token with our backend. `fullName` is only present on
 * the FIRST authorization; we forward it so the backend can persist the display
 * name then. Cancellation (ERR_REQUEST_CANCELED) resolves to { cancelled }.
 */
export async function runAppleSignIn(): Promise<SocialAuthResult> {
  if (Platform.OS !== 'ios') {
    return {
      status: 'not-configured',
      message: 'Apple sign-in is only available on iOS.',
    };
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const identityToken = credential.identityToken;
    if (!identityToken) {
      return {
        status: 'error',
        message: 'Apple didn’t return a sign-in token. Please try again.',
      };
    }

    // Apple only sends the name on the first authorization; pass it through only
    // when present so we don't send an all-null object on repeat sign-ins.
    const givenName = credential.fullName?.givenName ?? undefined;
    const familyName = credential.fullName?.familyName ?? undefined;
    const fullName =
      givenName || familyName ? { givenName, familyName } : undefined;

    const auth = await authApi.appleSignIn(identityToken, fullName);
    return { status: 'success', auth };
  } catch (err: any) {
    // The user backed out of the Apple sheet — treat as a silent no-op.
    if (err?.code === 'ERR_REQUEST_CANCELED') {
      return { status: 'cancelled' };
    }
    const serverMsg =
      err?.response?.data?.error ?? err?.response?.data?.message;
    return {
      status: 'error',
      message: serverMsg ?? 'Apple sign-in failed. Please try again.',
    };
  }
}
