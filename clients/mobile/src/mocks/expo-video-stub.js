/**
 * Jest stub for `expo-video`.
 *
 * The native package is declared in package.json for the EAS build but is NOT
 * installed in the environment that runs the jest/`tsc` gate (we never
 * `npm install` native deps there). Without this stub, `src/lib/exerciseVideoNative.tsx`
 * — which jest's resolver eagerly resolves when the lazy `require('./exerciseVideoNative')`
 * in `src/lib/exerciseVideo.ts` is reached — would fail the suite with
 * "Cannot find module 'expo-video'".
 *
 * This stub is mapped in via jest.config.js `moduleNameMapper`. It keeps the lazy
 * `require('./exerciseVideoNative')` resolvable WITHOUT the real package. To mirror
 * the real Expo-Go / gate condition (no native video engine), `useVideoPlayer` is
 * NOT a function, so the seam's `typeof useVideoPlayer === 'function'` probe yields
 * FALSE → isExerciseVideoAvailable() reports unavailable → ExerciseDemo keeps the
 * existing animated image-frame / fallback path. Exactly mirrors expo-speech-stub.js
 * (which sets `speak: null` for the same reason). Keeps the gate green with NO
 * `npm install` of the native dep.
 *
 * `VideoView` is exported as a harmless no-op component so any test that DOES mock
 * the seam available (e.g. ExerciseDemo.video.test.tsx) can still resolve the import
 * if it ever reaches this module — it renders nothing and never touches native code.
 */
const React = require('react');

module.exports = {
  // Intentionally NOT a function — signals "no native video engine" to the probe.
  useVideoPlayer: null,
  // No-op component: renders nothing, accepts (and ignores) any props.
  VideoView: () => React.createElement(React.Fragment, null),
};
