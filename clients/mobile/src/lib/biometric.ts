/**
 * Biometric authentication wrapper around expo-local-authentication.
 *
 * Used for "step-up" auth: cheap stuff (browse meals, log workout) doesn't
 * need biometric; sensitive stuff (Subscription, Billing, Delete Account,
 * Export Data) does.
 *
 * Read PRODUCTION_READINESS.md → S3 for context.
 */
import { Platform } from 'react-native';
import { captureException } from '@/lib/sentry';

// expo-local-authentication is part of the Expo SDK and ships with Expo Go.
// Lazy-required so this file is safe to import on web / in tests where the
// native module isn't present.
type LocalAuthModule = typeof import('expo-local-authentication');
let mod: LocalAuthModule | null = null;

function getMod(): LocalAuthModule | null {
  if (mod !== null) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('expo-local-authentication') as LocalAuthModule;
    return mod;
  } catch {
    return null;
  }
}

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'unknown' | 'none';

export interface BiometricCapability {
  /** Hardware physically present on the device. */
  hardwarePresent: boolean;
  /** User has enrolled at least one biometric template (Face ID face, fingerprint). */
  enrolled: boolean;
  /** Best biometric available. */
  kind: BiometricKind;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === 'web') {
    return { hardwarePresent: false, enrolled: false, kind: 'none' };
  }
  const m = getMod();
  if (!m) return { hardwarePresent: false, enrolled: false, kind: 'none' };

  try {
    const [hardwarePresent, enrolled, types] = await Promise.all([
      m.hasHardwareAsync(),
      m.isEnrolledAsync(),
      m.supportedAuthenticationTypesAsync(),
    ]);

    let kind: BiometricKind = 'unknown';
    if (types.includes(m.AuthenticationType.FACIAL_RECOGNITION)) kind = 'face';
    else if (types.includes(m.AuthenticationType.FINGERPRINT)) kind = 'fingerprint';
    else if (types.includes(m.AuthenticationType.IRIS)) kind = 'iris';
    else if (types.length === 0) kind = 'none';

    return { hardwarePresent, enrolled, kind };
  } catch (err) {
    captureException(err, { source: 'biometric.getBiometricCapability' });
    return { hardwarePresent: false, enrolled: false, kind: 'unknown' };
  }
}

export interface BiometricResult {
  success: boolean;
  /** Why the attempt didn't succeed. */
  error?:
    | 'not_available'
    | 'not_enrolled'
    | 'user_cancel'
    | 'system_cancel'
    | 'lockout'
    | 'authentication_failed'
    | 'unknown_error';
  /** True if the user opted to fall back to device passcode/PIN. */
  usedDevicePasscode?: boolean;
}

/**
 * Prompt the user to authenticate with biometrics.
 *
 * Returns a {@link BiometricResult}. Callers should NOT throw on failure —
 * `result.success === false` is a normal user cancellation case and the
 * app should gracefully decline the protected action without alarming UI.
 *
 * @param promptMessage  Localized message shown above the biometric prompt.
 *                        Be specific: "Confirm purchase", "Show payment
 *                        method", "Delete account" — generic "authenticate"
 *                        prompts confuse users.
 *
 * @param options.allowDevicePasscode  If true (default), the user can fall
 *                                     back to their device passcode if
 *                                     biometric fails. Disable only for
 *                                     truly sensitive actions where you want
 *                                     biometric exclusivity.
 */
export async function authenticateBiometric(
  promptMessage: string,
  options: { allowDevicePasscode?: boolean } = {},
): Promise<BiometricResult> {
  const allowDevicePasscode = options.allowDevicePasscode ?? true;

  if (Platform.OS === 'web') {
    return { success: false, error: 'not_available' };
  }

  const m = getMod();
  if (!m) return { success: false, error: 'not_available' };

  const cap = await getBiometricCapability();
  if (!cap.hardwarePresent) return { success: false, error: 'not_available' };
  if (!cap.enrolled) return { success: false, error: 'not_enrolled' };

  try {
    const result = await m.authenticateAsync({
      promptMessage,
      // iOS only — falls back to device passcode if biometrics fail.
      fallbackLabel: allowDevicePasscode ? 'Use Passcode' : '',
      // Android only — same idea, presents the device credential as a
      // backup. Disabling forces biometric-only.
      disableDeviceFallback: !allowDevicePasscode,
      // iOS only — if an enrollment changes (e.g. user added a new face),
      // require that the user re-enroll inside our app instead of trusting
      // the device's stored template.
      requireConfirmation: true,
    });

    if (result.success) {
      return { success: true };
    }

    const code = (result as any).error as string | undefined;
    let mapped: BiometricResult['error'] = 'unknown_error';
    if (code === 'user_cancel') mapped = 'user_cancel';
    else if (code === 'system_cancel') mapped = 'system_cancel';
    else if (code === 'lockout' || code === 'lockout_permanent') mapped = 'lockout';
    else if (code === 'authentication_failed') mapped = 'authentication_failed';
    else if (code === 'not_enrolled') mapped = 'not_enrolled';
    else if (code === 'not_available') mapped = 'not_available';

    return { success: false, error: mapped };
  } catch (err) {
    captureException(err, { source: 'biometric.authenticateBiometric' });
    return { success: false, error: 'unknown_error' };
  }
}
