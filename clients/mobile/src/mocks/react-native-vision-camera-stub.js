/**
 * Jest stub for `react-native-vision-camera` (and the -worklets companion).
 *
 * src/lib/ppg/ppgCamera.ts lazily `require('react-native-vision-camera')` inside
 * a try/catch and probes for the `Camera` / `useCameraDevice` exports. Under jest
 * there is no native camera module, so this stub deliberately exposes NONE of
 * those as functions → `isPpgSupported()` returns false and the measurement
 * screen renders its honest "needs the app build" fallback (the same behaviour as
 * Expo Go). Keeps the gate green without a real native module.
 *
 * The isolated camera view (PpgCameraView.tsx) — the only file that imports these
 * packages' hooks — is never required in the gate because the screen gates its
 * mount behind isPpgSupported() (false here), so the hook exports don't need real
 * implementations.
 */
module.exports = {
  // Intentionally not functions → the availability probe reports unsupported.
  Camera: undefined,
  useCameraDevice: undefined,
  useCameraPermission: undefined,
  useFrameOutput: undefined,
};
