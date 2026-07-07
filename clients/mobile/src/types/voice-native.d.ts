/**
 * voice-native.d.ts
 *
 * (Intentionally EMPTY of `declare module` shims.)
 *
 * This file USED to carry ambient `declare module 'expo-speech'` and
 * `declare module 'expo-speech-recognition'` shims so `tsc --noEmit` could
 * type-check `src/lib/voiceNative.ts` WITHOUT the native packages installed.
 *
 * Both packages are now actually installed (resolved from the monorepo-root
 * `node_modules`, reachable from this workspace), so the REAL bundled types
 * must take over. A `declare module` for an INSTALLED package shadows that
 * package's real types — and that is precisely the bug this file once caused:
 * the old `expo-speech-recognition` shim faked a top-level
 * `addSpeechRecognitionListener(event, cb)` export that does NOT exist in the
 * real jamsch package (v3.x). `tsc` stayed green against the fake while the
 * runtime call resolved to `undefined` → "undefined is not a function".
 *
 * The real API is an Expo `EventEmitter`/`NativeModule`:
 *   ExpoSpeechRecognitionModule.addListener('start'|'result'|'error'|'end', cb)
 *     → returns a subscription with `.remove()`
 *   ExpoSpeechRecognitionModule.start(opts) / .stop() / .abort()
 *   ExpoSpeechRecognitionModule.requestPermissionsAsync() → { granted }
 *   ExpoSpeechRecognitionModule.isRecognitionAvailable()
 *   plus the `useSpeechRecognitionEvent(eventName, listener)` hook.
 *
 * Keep this file as a single, empty, ambient module so the project's
 * type-checker has nothing here to shadow the genuine package declarations. Do
 * NOT re-add `declare module` blocks for these packages while they are installed.
 */
export {};
