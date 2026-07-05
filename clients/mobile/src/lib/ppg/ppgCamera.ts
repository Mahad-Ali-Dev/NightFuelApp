/**
 * ppgCamera.ts — the AVAILABILITY seam for camera-based heart rate.
 *
 * Mirrors the honest-fallback discipline of src/lib/ble/bleManager.ts and
 * src/lib/healthSyncNative.ts: `react-native-vision-camera` is a native module
 * that only exists in an EAS dev/release build. In Expo Go and the jest gate the
 * native side is absent, so `isPpgSupported()` returns false and the measurement
 * screen renders an honest "needs the app build" state instead of crashing.
 *
 * NOTHING native is imported at module scope — the probe lazy-`require`s the
 * library behind a try/catch, so this file is safe to import from the screen and
 * from tests. The actual camera + frame-processing lives in the ONE isolated view
 * `src/components/ppg/PpgCameraView.tsx`, which the screen only mounts when this
 * probe passes (and which is additionally wrapped in an error boundary, so even a
 * V5 API mismatch degrades to the fallback rather than a red screen).
 */

/**
 * True only when the VisionCamera JS module resolves AND exposes the camera API
 * we use. This is a best-effort FAST PATH: in Expo Go the JS can resolve while
 * the Nitro native side is missing, so the screen ALSO guards the actual
 * `<Camera>` mount with an error boundary. On the jest gate the module is mapped
 * to a stub that exposes none of these as functions → false.
 */
export function isPpgSupported(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lib = require('react-native-vision-camera');
    // Check the exports EXIST, not that they are typed `function`. VisionCamera V5
    // exports `Camera` as a forwardRef component (a plain object, NOT a function),
    // so the old `typeof … === 'function'` test failed on a real build and wrongly
    // showed the "needs the app build" fallback. A truthy check passes for a class,
    // a function, or a forwardRef; if the native side is still missing, the actual
    // <Camera> mount is caught by the screen's ErrorBoundary → camera fallback.
    return !!(lib?.Camera && lib?.useCameraDevice && lib?.useCameraPermission);
  } catch {
    return false;
  }
}

// ── Capture tuning (shared by the screen + the camera view) ──────────────────
/** How long a measurement runs, in seconds. ~15 s ≈ 10–25 beats at rest. */
export const CAPTURE_SECONDS = 15;
/**
 * Seconds of samples to DISCARD at the start while the camera's auto-exposure /
 * white-balance settle and the finger stabilises — otherwise the first beats sit
 * on a big exposure ramp that skews the baseline.
 */
export const WARMUP_SECONDS = 2;
/**
 * How often (ms) the screen drains the latest frame brightness written by the
 * frame processor. ~40 ms ≈ 25 Hz — well above the Nyquist rate for the ≤ 3.5 Hz
 * cardiac band, and decoupled from the camera's own frame cadence so a busy JS
 * thread just resamples slightly unevenly (the estimator handles jitter).
 */
export const SAMPLE_POLL_MS = 40;
/** Minimum samples before we even attempt an estimate (guards a too-short read). */
export const MIN_SAMPLES = Math.round(((CAPTURE_SECONDS - WARMUP_SECONDS) * 1000) / SAMPLE_POLL_MS / 2);
