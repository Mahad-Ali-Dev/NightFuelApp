/**
 * voice.types.ts
 *
 * The TYPE seam for the "talk to Ria" voice module — speech-to-text (STT) for
 * dictating a message and text-to-speech (TTS) for hearing Ria's reply. This
 * file defines the single `VoiceAdapter` contract that every implementation must
 * satisfy:
 *
 *   - the DEFAULT no-op/unavailable adapter (`src/lib/voice.ts`), which is pure
 *     TypeScript with ZERO native imports, so the app runs in Expo Go and the
 *     jest gate runs with no native packages installed; and
 *   - the REAL native adapter (`src/lib/voiceNative.ts`), built on
 *     expo-speech-recognition (on-device STT) + expo-speech (on-device TTS),
 *     which is loaded LAZILY at runtime behind `isAvailable()` checks so neither
 *     `tsc` nor jest ever needs the native packages resolvable.
 *
 * This mirrors the health-sync seam (`src/lib/healthSync.types.ts` +
 * `src/lib/healthSync.ts`): an interface + an honest unavailable default +
 * a `getVoiceAdapter()` accessor the UI imports against.
 *
 * Nothing in this file imports React, react-native, expo, expo-speech, or
 * expo-speech-recognition. It is pure type + const declarations, safe to import
 * from anywhere (the UI, tests, and the native adapter alike).
 *
 * ── Why `as const` unions, NOT TS `enum` ──────────────────────────────────────
 * Same reasoning as healthSync.types.ts: `as const` arrays give a runtime-
 * enumerable list AND a precise literal type with no emitted enum object, which
 * is the codebase convention and avoids the Babel-only / isolatedModules `enum`
 * footguns under jest-expo.
 */

// ─── Listening (STT) state machine ────────────────────────────────────────────
//
// The honest UX state machine the mic button derives its appearance from. The
// adapter owns the real recogniser state (ground truth); the UI reflects it.
//
//   - 'unavailable' → STT can't run on this build/device (Expo Go, no native
//                     module, OS without on-device recognition). NOT an error —
//                     an expected, honest fallback: the mic shows a disabled
//                     "needs dev build" affordance and text chat is unaffected.
//   - 'idle'        → available and ready, not currently listening.
//   - 'starting'    → permission/engine warming up after a tap (transient).
//   - 'listening'   → actively capturing speech; interim transcripts stream in.
//   - 'error'       → the last listen attempt failed (see VoiceErrorCode); the
//                     UI surfaces a short message and falls back to typing.

/** Runtime-enumerable list of every listening (STT) state. */
export const VOICE_LISTEN_STATES = [
  'unavailable',
  'idle',
  'starting',
  'listening',
  'error',
] as const;

/** A listening-state value. Derived from {@link VOICE_LISTEN_STATES}. */
export type VoiceListenState = (typeof VOICE_LISTEN_STATES)[number];

// ─── Error taxonomy ───────────────────────────────────────────────────────────
//
// The researched set of recoverable STT failures, normalised across platforms
// so the UI can react without parsing raw native error strings. Each maps to an
// honest, plain-language fallback to text:
//
//   - 'no-speech'    → the user didn't say anything in time.
//   - 'not-allowed'  → microphone / speech-recognition permission was denied.
//   - 'network'      → the recogniser needed the network and it failed.
//   - 'busy'         → a session is already running (double-tap / re-entrancy).
//   - 'unavailable'  → STT isn't supported on this build/device at all.
//   - 'unknown'      → any other native failure (caught, never thrown).

/** Runtime-enumerable list of every normalised STT error code. */
export const VOICE_ERROR_CODES = [
  'no-speech',
  'not-allowed',
  'network',
  'busy',
  'unavailable',
  'unknown',
] as const;

/** A normalised STT error code. Derived from {@link VOICE_ERROR_CODES}. */
export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/**
 * Default, human-readable fallback messages per error code. The UI shows these
 * verbatim (e.g. as an inline notice) so the wording is honest and consistent;
 * an adapter may pass a more specific `message` on the error event, but these
 * are the safe defaults.
 */
export const VOICE_ERROR_MESSAGES: Record<VoiceErrorCode, string> = {
  'no-speech': "I didn't catch that — tap the mic and try again, or just type.",
  'not-allowed':
    'Microphone access is off. Enable it in Settings to talk to Ria, or type your message.',
  network: 'Voice needs a connection right now — check your network or type instead.',
  busy: "I'm still listening — give me a second.",
  unavailable: 'Voice needs a dev build — type your message and Ria will reply.',
  unknown: "Voice hit a snag — type your message and Ria will reply.",
};

// ─── Listening result + event handlers ────────────────────────────────────────

/**
 * A transcript event from the recogniser. `isFinal` distinguishes the live,
 * still-changing interim hypothesis (shown in the input as the user speaks) from
 * the committed final transcript (which is what gets sent to Ria).
 */
export interface VoiceTranscript {
  /** The recognised text so far (interim) or the committed text (final). */
  text: string;
  /** True only for the committed final transcript of an utterance. */
  isFinal: boolean;
}

/**
 * Callbacks the UI passes to `startListening`. All are optional; the adapter
 * invokes the ones provided. The adapter NEVER throws into these — failures are
 * delivered via `onError` as data.
 */
export interface VoiceListenHandlers {
  /** Recogniser actually started capturing (mic is live). */
  onStart?: () => void;
  /** A transcript update — interim (live) or final (committed). */
  onTranscript?: (t: VoiceTranscript) => void;
  /**
   * The committed final transcript for the utterance. Convenience over
   * filtering `onTranscript` for `isFinal` — this is the string the UI feeds to
   * the existing `sendMessage(text)`.
   */
  onFinal?: (text: string) => void;
  /** A normalised, recoverable failure. The session is over; fall back to text. */
  onError?: (code: VoiceErrorCode, message: string) => void;
  /** The session ended (after a final, an error, or an explicit stop/abort). */
  onEnd?: () => void;
}

// ─── Speaking (TTS) options ───────────────────────────────────────────────────

/**
 * Options for `speak`. All optional; the native adapter maps them to
 * expo-speech's options. Kept minimal and engine-agnostic.
 */
export interface VoiceSpeakOptions {
  /** BCP-47 language tag, e.g. 'en-US'. Defaults to the device locale. */
  language?: string;
  /** Speaking rate (1 = normal). Clamped by the engine. */
  rate?: number;
  /** Pitch (1 = normal). Clamped by the engine. */
  pitch?: number;
  /** Fired when speech finishes (or is stopped). Never throws. */
  onDone?: () => void;
}

// ─── The adapter contract ─────────────────────────────────────────────────────

/**
 * The contract every voice adapter implements. The no-op adapter in
 * `src/lib/voice.ts` satisfies it today (all methods are honest no-ops and
 * `isSTTAvailable()/isTTSAvailable()` return `false`); the native adapter in
 * `src/lib/voiceNative.ts` satisfies it behind a dev build.
 *
 * Discipline every implementation MUST follow (mirrors the health-sync seam's
 * async/never-throw + honest-fallback rule):
 *   - `isSTTAvailable()` / `isTTSAvailable()` are the synchronous GROUND TRUTH
 *     the UI derives the mic's enabled/disabled state from. The no-op returns
 *     `false`; the native adapter returns whether the engine is actually present.
 *   - `requestPermission()` / `startListening()` / `stop()` / `abort()` /
 *     `speak()` / `stopSpeaking()` MUST NOT throw. A failure is delivered as
 *     DATA — `requestPermission()` resolves a boolean; `startListening()`
 *     reports failures through `handlers.onError`.
 *   - `startListening()` returns synchronously after kicking off the session;
 *     transcripts/errors arrive via the handlers.
 */
export interface VoiceAdapter {
  /** Synchronous ground truth: can this build/device do on-device STT? */
  isSTTAvailable(): boolean;
  /** Synchronous ground truth: can this build/device do on-device TTS? */
  isTTSAvailable(): boolean;
  /**
   * Ensure mic + speech-recognition permission. Resolves `true` if granted,
   * `false` otherwise (denied, or STT unavailable). Never throws.
   */
  requestPermission(): Promise<boolean>;
  /**
   * Begin a listening session, streaming interim + final transcripts through
   * `handlers`. A no-op (still firing `onError('unavailable', …)` then `onEnd`)
   * when STT is unavailable, so the caller's state machine always settles.
   */
  startListening(handlers: VoiceListenHandlers): void;
  /** Stop listening and COMMIT the current utterance as a final transcript. */
  stop(): void;
  /** Stop listening and DISCARD the current utterance (no final emitted). */
  abort(): void;
  /**
   * Speak `text` aloud (Ria's reply). Honours barge-in by stopping any prior
   * utterance first. A no-op (immediately calling `opts.onDone`) when TTS is
   * unavailable. Never throws.
   */
  speak(text: string, opts?: VoiceSpeakOptions): void;
  /** Stop any in-progress speech immediately (barge-in). Idempotent; no throw. */
  stopSpeaking(): void;
}
