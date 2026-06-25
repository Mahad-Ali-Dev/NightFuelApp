/**
 * Jest stub for `expo-speech-recognition` (STT, jamsch v3.x).
 *
 * Same rationale as expo-speech-stub.js: jest eagerly resolves the lazy
 * `require('./voiceNative')` in `src/lib/voice.ts`, so this keeps that
 * resolvable with a controlled shape and the gate stays green.
 *
 * This mock mirrors the REAL package surface so the tests exercise the actual
 * API shape (not a fictional one):
 *   - `ExpoSpeechRecognitionModule` is an EventEmitter-style object with
 *     `.addListener(eventName, cb)` returning a subscription `{ remove() }`,
 *     plus `start`/`stop`/`abort`/`requestPermissionsAsync`/`getPermissionsAsync`/
 *     `isRecognitionAvailable`.
 *   - `useSpeechRecognitionEvent` is the real hook export (no-op here).
 *
 * IMPORTANT — preserves the gate/Expo-Go behaviour the voice.test.ts suite
 * asserts: `isRecognitionAvailable()` returns FALSE, so
 * `createNativeVoiceAdapter()` reports STT unavailable. Combined with the
 * expo-speech stub (TTS also unavailable), createNativeVoiceAdapter() returns
 * null and `getVoiceAdapter()` falls back to the honest no-op. There is NO
 * top-level `addSpeechRecognitionListener` export — that fictional API is what
 * the bug relied on; mocking it would re-hide the same class of error.
 */
const ExpoSpeechRecognitionModule = {
  start: () => undefined,
  stop: () => undefined,
  abort: () => undefined,
  // Real shape: returns a subscription with a `remove()` method.
  addListener: () => ({ remove: () => undefined }),
  removeAllListeners: () => undefined,
  requestPermissionsAsync: () => Promise.resolve({ granted: false }),
  getPermissionsAsync: () => Promise.resolve({ granted: false }),
  // FALSE → createNativeVoiceAdapter() treats STT as unavailable (gate behaviour).
  isRecognitionAvailable: () => false,
  getSpeechRecognitionServices: () => [],
  getStateAsync: () => Promise.resolve('inactive'),
};

module.exports = {
  ExpoSpeechRecognitionModule,
  // The real hook export (used by consumers that prefer the hook API). No-op here.
  useSpeechRecognitionEvent: () => undefined,
};
