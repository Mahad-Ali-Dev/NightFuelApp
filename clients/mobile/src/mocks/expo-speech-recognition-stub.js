/**
 * Jest stub for `expo-speech-recognition` (STT, jamsch @sdk-54).
 *
 * Same rationale as expo-speech-stub.js: the package is declared for the EAS
 * build but not installed for the gate, and jest eagerly resolves the lazy
 * `require('./voice.native')` in `src/lib/voice.ts`. This stub keeps that
 * resolvable WITHOUT the native package, so the gate stays green with no
 * `npm install`.
 *
 * The stub reports recognition as UNAVAILABLE (`isRecognitionAvailable()` →
 * false), which makes `createNativeVoiceAdapter()` return null (no usable
 * engine) and `getVoiceAdapter()` fall back to the honest no-op — exactly the
 * gate/Expo-Go behaviour the voice.test.ts suite asserts.
 */
module.exports = {
  ExpoSpeechRecognitionModule: {
    start: () => undefined,
    stop: () => undefined,
    abort: () => undefined,
    requestPermissionsAsync: () => Promise.resolve({ granted: false }),
    getPermissionsAsync: () => Promise.resolve({ granted: false }),
    isRecognitionAvailable: () => false,
  },
  addSpeechRecognitionListener: () => ({ remove: () => undefined }),
  getSpeechRecognitionServices: () => [],
};
