/**
 * Jest stub for `expo-speech` (TTS).
 *
 * The native package is declared in package.json for the EAS build but is NOT
 * installed in the environment that runs the jest/`tsc` gate (we never
 * `npm install` native deps there). Without this stub, `src/lib/voice.native.ts`
 * — which jest's resolver eagerly resolves when `src/lib/voice.ts` is loaded —
 * would fail the suite with "Cannot find module 'expo-speech'".
 *
 * This stub is mapped in via jest.config.js `moduleNameMapper`. It keeps the
 * lazy `require('./voiceNative')` resolvable WITHOUT the real package. To mirror
 * the real Expo-Go / gate condition (no native TTS engine), `speak` is NOT a
 * function, so voiceNative's `typeof Speech.speak === 'function'` probe yields
 * FALSE → createNativeVoiceAdapter() reports TTS unavailable. Combined with the
 * STT stub (also unavailable), createNativeVoiceAdapter() returns null and
 * getVoiceAdapter() falls back to the honest no-op.
 */
module.exports = {
  // Intentionally NOT a function — signals "no native TTS engine" to the probe.
  speak: null,
  stop: () => Promise.resolve(),
  pause: () => Promise.resolve(),
  resume: () => Promise.resolve(),
  isSpeakingAsync: () => Promise.resolve(false),
  getAvailableVoicesAsync: () => Promise.resolve([]),
  maxSpeechInputLength: 4000,
};
