/**
 * voice.ts
 *
 * The DEFAULT voice adapter and the `getVoiceAdapter()` seam the UI imports
 * against — exactly mirroring the health-sync seam (`src/lib/healthSync.ts`).
 *
 * Two adapters live behind one `VoiceAdapter` interface:
 *
 *   1. `noopVoiceAdapter` (in THIS file) — an honest unavailable adapter. Pure
 *      TypeScript, imports NOTHING native. `isSTTAvailable()/isTTSAvailable()`
 *      return `false`; `startListening()` fires `onError('unavailable', …)` then
 *      `onEnd`; `speak()` immediately calls `onDone`. The mic UI renders a
 *      disabled "needs dev build" state. NEVER fakes a recogniser.
 *
 *   2. The REAL native adapter (`src/lib/voiceNative.ts`), built on
 *      expo-speech-recognition + expo-speech. It is loaded LAZILY via a dynamic
 *      `require` inside a try/catch in {@link getVoiceAdapter} — so:
 *        • static TypeScript (`tsc --noEmit`) never resolves the native packages
 *          (they're behind a runtime `require`, and the ambient shims in
 *          `src/types/voice-native.d.ts` keep the native module importable to the
 *          type-checker WITHOUT the packages installed); and
 *        • jest never loads native code (the lazy require sits behind the
 *          `isAvailable` probe, and the screen tests mock `@/lib/voice` outright).
 *      This keeps the gate GREEN with NO `npm install` of the native deps.
 *
 * Why this shape (vs. importing the native module at the top)? Static `import`
 * of expo-speech / expo-speech-recognition would make `tsc` and Metro/jest try
 * to resolve packages that aren't installed for the gate, breaking the build.
 * The lazy require behind `isAvailable()` is the same degrade-gracefully idiom
 * as `src/lib/iap.ts` and the health-sync no-op default.
 *
 * ── How the native adapter is wired in for EAS ────────────────────────────────
 * Once `expo-speech` + `expo-speech-recognition@sdk-54` are installed (declared
 * in package.json) and the app runs in a dev/release build,
 * {@link getVoiceAdapter} resolves the native adapter automatically — no UI
 * change needed (the screen always imports `getVoiceAdapter`). In Expo Go / the
 * jest gate the require throws or the probe returns false, and we fall back to
 * the no-op. The selection is memoised so the probe runs once per session.
 */

import type {
  VoiceAdapter,
  VoiceListenHandlers,
  VoiceSpeakOptions,
} from './voice.types';
import { VOICE_ERROR_MESSAGES } from './voice.types';

/**
 * The honest unavailable adapter. Every method honours the `VoiceAdapter`
 * contract while doing no native work:
 *   - availability probes return `false` (ground truth: nothing native here);
 *   - `requestPermission()` resolves `false` (there's nothing to grant);
 *   - `startListening()` reports an honest `'unavailable'` error then ends, so
 *     the caller's state machine always settles back to a known state;
 *   - `speak()` immediately calls `onDone` (nothing is spoken, but the caller's
 *     completion flow still runs);
 *   - `stop()/abort()/stopSpeaking()` are safe no-ops.
 *
 * Frozen so callers can treat it as a stable singleton.
 */
export const noopVoiceAdapter: VoiceAdapter = Object.freeze({
  isSTTAvailable(): boolean {
    return false;
  },

  isTTSAvailable(): boolean {
    return false;
  },

  async requestPermission(): Promise<boolean> {
    // Nothing native to grant — honestly report "not granted" (never throws).
    return false;
  },

  startListening(handlers: VoiceListenHandlers): void {
    // Honest fallback: there is no recogniser. Report it as an error event (not
    // a thrown exception) so the UI can show the "needs dev build" notice and
    // fall back to typing, then settle the session with onEnd.
    handlers.onError?.('unavailable', VOICE_ERROR_MESSAGES.unavailable);
    handlers.onEnd?.();
  },

  stop(): void {
    // No active session — idempotent no-op.
  },

  abort(): void {
    // No active session — idempotent no-op.
  },

  speak(_text: string, opts?: VoiceSpeakOptions): void {
    // Nothing is spoken, but the caller's completion flow must still run.
    opts?.onDone?.();
  },

  stopSpeaking(): void {
    // Nothing is speaking — idempotent no-op.
  },
});

/**
 * Memoised resolved adapter. `undefined` until the first {@link getVoiceAdapter}
 * call probes for a native adapter; thereafter it's the chosen singleton (native
 * if available, else the no-op). Memoising means the dynamic require + probe run
 * at most once per app session.
 */
let resolvedAdapter: VoiceAdapter | undefined;

/**
 * Resolve the best available voice adapter.
 *
 * Tries to LAZILY load the native adapter via a dynamic `require` inside a
 * try/catch — this is the seam that keeps the gate green: the native packages
 * are only touched at runtime in a real build, never by `tsc` or jest. If the
 * require throws (packages not installed / Expo Go), or the loaded adapter
 * reports BOTH STT and TTS unavailable, we fall back to the honest no-op.
 *
 * The require is written so a static bundler can't eagerly pull the module in:
 * the path is read through `getVoiceAdapter`'s own try/catch and the result is
 * shape-checked before use. Jest never reaches it because the screen suites mock
 * `@/lib/voice`; if a future test imports this module directly, the require will
 * simply throw (no native module under jest) and the no-op is returned.
 */
export function getVoiceAdapter(): VoiceAdapter {
  if (resolvedAdapter) return resolvedAdapter;

  try {
    // Lazy, runtime-only require — Metro needs a STRING LITERAL here so it can
    // bundle the native adapter for the EAS build. This line is NEVER reached at
    // module-eval time of THIS file; it runs only when getVoiceAdapter() is first
    // called. In Expo Go / a real device WITHOUT the native packages it throws
    // (caught below → no-op). Under the jest gate: the screen suites mock
    // `@/lib/voice` outright, and the direct adapter suite lets this require run
    // against the expo-speech / expo-speech-recognition STUBS mapped in
    // jest.config.js (which report STT/TTS unavailable) → createNativeVoiceAdapter
    // returns null → no-op fallback. So the real native package graph is never
    // resolved by the gate and NO `npm install` is required to stay green.
    //
    // NOTE: the file is named `voiceNative` (NOT `voice.native`) on purpose —
    // a `.native.ts` suffix is a React-Native platform extension that Metro /
    // jest-expo would resolve in place of `voice` itself.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./voiceNative') as {
      createNativeVoiceAdapter?: () => VoiceAdapter | null;
    };
    const native = mod?.createNativeVoiceAdapter?.() ?? null;
    // Only adopt the native adapter if it can actually do SOMETHING. If both
    // engines are missing it's effectively the no-op — prefer the explicit one.
    if (native && (native.isSTTAvailable() || native.isTTSAvailable())) {
      resolvedAdapter = native;
      return resolvedAdapter;
    }
  } catch {
    // Packages not installed (the jest gate / Expo Go) or native init failed —
    // degrade gracefully to the honest no-op. Never throws to the caller.
  }

  resolvedAdapter = noopVoiceAdapter;
  return resolvedAdapter;
}

/**
 * Test/seam hook: reset the memoised adapter so a suite can force re-resolution.
 * Not used in production code paths.
 */
export function __resetVoiceAdapterForTests(): void {
  resolvedAdapter = undefined;
}

// Default export: the no-op adapter, for ergonomic `import voice from ...`.
export default noopVoiceAdapter;
