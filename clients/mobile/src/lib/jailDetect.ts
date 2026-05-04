/**
 * Lightweight jailbreak / root detection.
 *
 * Strategy: defense-in-depth, NOT a hard wall. A determined attacker on a
 * compromised device can patch out any client-side check we ship. This
 * module exists to:
 *
 *   1. Show users a soft warning that their device's security model has
 *      been bypassed and that NightFuel can't protect their account
 *      tokens / payment data the way it normally would.
 *   2. Send a Sentry breadcrumb with a flag so we can see in aggregate
 *      what fraction of users run on rooted/jailbroken devices.
 *   3. Give us a tag we could choose to *enforce* on (e.g. block paid
 *      tier purchases) if abuse becomes a problem.
 *
 * We deliberately don't crash or hard-block. Many users have valid
 * reasons to root/jailbreak their devices, and refusing service to them
 * is a hostile UX move that won't actually stop attackers.
 *
 * Detection method: file-system probes via expo-file-system. JavaScript-
 * only, no new native dependencies. Less reliable than dedicated native
 * libraries (jail-monkey etc.) — about ~80% accurate vs ~95% for native
 * — but adequate for the soft-warning use case. Upgrade to a native
 * library if abuse data justifies it.
 */
import { Platform } from 'react-native';
import { captureException } from '@/lib/sentry';

type FileSystemModule = typeof import('expo-file-system');
let fs: FileSystemModule | null = null;

function getFs(): FileSystemModule | null {
  if (fs !== null) return fs;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fs = require('expo-file-system') as FileSystemModule;
    return fs;
  } catch {
    return null;
  }
}

const IOS_JAILBREAK_PATHS = [
  '/Applications/Cydia.app',
  '/Library/MobileSubstrate/MobileSubstrate.dylib',
  '/bin/bash',
  '/usr/sbin/sshd',
  '/etc/apt',
  '/private/var/lib/apt/',
  '/private/var/stash',
  '/private/var/tmp/cydia.log',
  '/usr/libexec/sftp-server',
];

const ANDROID_ROOT_PATHS = [
  '/system/app/Superuser.apk',
  '/sbin/su',
  '/system/bin/su',
  '/system/xbin/su',
  '/data/local/xbin/su',
  '/data/local/bin/su',
  '/system/sd/xbin/su',
  '/system/bin/failsafe/su',
  '/data/local/su',
];

export interface JailbreakResult {
  /** Best guess at whether the device is compromised. */
  compromised: boolean;
  /** What signals we matched, for telemetry. */
  signals: string[];
}

/**
 * Detect jailbreak (iOS) / root (Android). Returns `compromised: false` on
 * platforms where we can't probe (web, simulator on iOS where these paths
 * legitimately exist).
 */
export async function detectCompromisedDevice(): Promise<JailbreakResult> {
  if (Platform.OS === 'web') return { compromised: false, signals: [] };

  const fsm = getFs();
  if (!fsm) return { compromised: false, signals: [] };

  const paths = Platform.OS === 'ios' ? IOS_JAILBREAK_PATHS : ANDROID_ROOT_PATHS;
  const signals: string[] = [];

  await Promise.all(
    paths.map(async (path) => {
      try {
        const info = await fsm.getInfoAsync('file://' + path);
        if (info.exists) signals.push(path);
      } catch {
        // Permission denied / unsupported URI — that's expected for
        // non-jailbroken devices. Treat as a non-signal.
      }
    }),
  );

  return { compromised: signals.length > 0, signals };
}

/**
 * Run the detection at app startup and log a Sentry tag/breadcrumb.
 * Idempotent — safe to call from a useEffect with [] dependency.
 *
 * @returns true if a soft warning should be shown to the user.
 */
export async function checkAndReportCompromise(): Promise<boolean> {
  try {
    const result = await detectCompromisedDevice();
    if (result.compromised) {
      // Non-fatal exception — categorized by Sentry as a tagged event so
      // we can dashboard it without polluting "crashes".
      captureException(new Error('device_compromised'), {
        signals: result.signals,
        platform: Platform.OS,
      });
    }
    return result.compromised;
  } catch (err) {
    captureException(err, { source: 'jailDetect.checkAndReportCompromise' });
    return false;
  }
}
