/**
 * voiceNative.ts
 *
 * The REAL on-device voice adapter — STT via expo-speech-recognition
 * (jamsch, @sdk-54) and TTS via expo-speech. It is loaded LAZILY from
 * `src/lib/voice.ts`'s `getVoiceAdapter()` via a dynamic `require` inside a
 * try/catch, behind an availability probe. That seam is what keeps the jest /
 * `tsc` gate green WITHOUT the native packages installed:
 *
 *   - At RUNTIME in a native (EAS dev/release) build, `require('./voiceNative')`
 *     succeeds, the native packages resolve, and `createNativeVoiceAdapter()`
 *     returns a working adapter.
 *   - During the GATE, this file is never module-evaluated by the screen tests
 *     (they mock `@/lib/voice`), and `getVoiceAdapter()`'s require throws if a
 *     test ever does reach it (no native module under jest) → no-op fallback.
 *   - For `tsc --noEmit`, the `import`s below resolve against the REAL bundled
 *     types of expo-speech / expo-speech-recognition (both are installed at the
 *     monorepo root `node_modules`, resolvable from this workspace). The old
 *     ambient shims in `src/types/voice-native.d.ts` were removed — keeping a
 *     `declare module` for an installed package SHADOWS its real types, which is
 *     exactly what hid the wrong `addSpeechRecognitionListener` API before.
 *
 * Honest-fallback discipline (mirrors the health-sync adapter): nothing here
 * throws into the caller. Engine/permission failures are reported through the
 * handler callbacks (STT) or simply degrade to `isAvailable() === false`.
 */

import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import * as Speech from 'expo-speech';

/**
 * The subscription object every `ExpoSpeechRecognitionModule.addListener(...)`
 * call returns (it's an Expo `EventEmitter`/`NativeModule`). Derived from the
 * module's own `addListener` return type so we stay pinned to the real API
 * surface without importing `EventSubscription` from a separate entrypoint.
 */
type SpeechSubscription = ReturnType<typeof ExpoSpeechRecognitionModule.addListener>;

import type {
  VoiceAdapter,
  VoiceErrorCode,
  VoiceListenHandlers,
  VoiceSpeakOptions,
} from './voice.types';

/**
 * Map a native expo-speech-recognition error code to our normalised
 * {@link VoiceErrorCode}. The real {@link ExpoSpeechRecognitionErrorEvent}'s
 * `error` is a Web-Speech-style union: 'aborted', 'audio-capture',
 * 'interrupted', 'bad-grammar', 'language-not-supported', 'network',
 * 'no-speech', 'not-allowed', 'service-not-allowed', 'busy', 'client',
 * 'speech-timeout', 'unknown'. We collapse them to the small set the UI knows
 * how to fall back from.
 */
function normaliseErrorCode(raw: string | undefined): VoiceErrorCode {
  switch (raw) {
    case 'no-speech':
    case 'speech-timeout':
      // No usable speech was captured — same honest "didn't catch that" UX.
      return 'no-speech';
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return 'not-allowed';
    case 'network':
      return 'network';
    case 'busy':
      return 'busy';
    case 'aborted':
      // User-initiated cancel (abort()) — surfaced as a benign unknown; the UI
      // path that calls abort() tears down without showing this anyway.
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Build the native adapter, or return `null` if neither engine is usable on this
 * device (so `getVoiceAdapter()` falls back to the honest no-op). Construction
 * itself never throws — any probe failure resolves to a conservative "false".
 */
export function createNativeVoiceAdapter(): VoiceAdapter | null {
  // ── Availability probes (synchronous ground truth) ────────────────────────
  const sttAvailable = (() => {
    try {
      // jamsch exposes isRecognitionAvailable(); guard for older shapes.
      return typeof ExpoSpeechRecognitionModule?.isRecognitionAvailable === 'function'
        ? !!ExpoSpeechRecognitionModule.isRecognitionAvailable()
        : !!ExpoSpeechRecognitionModule;
    } catch {
      return false;
    }
  })();

  const ttsAvailable = (() => {
    try {
      return typeof Speech?.speak === 'function';
    } catch {
      return false;
    }
  })();

  if (!sttAvailable && !ttsAvailable) return null;

  // ── Per-session subscriptions, torn down on end/stop/abort/error ──────────
  let subs: SpeechSubscription[] = [];
  let active = false;
  let lastFinal = '';
  let lastInterim = '';

  const teardown = () => {
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        /* ignore */
      }
    }
    subs = [];
    active = false;
  };

  const adapter: VoiceAdapter = {
    isSTTAvailable(): boolean {
      return sttAvailable;
    },

    isTTSAvailable(): boolean {
      return ttsAvailable;
    },

    async requestPermission(): Promise<boolean> {
      if (!sttAvailable) return false;
      try {
        const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        return !!res?.granted;
      } catch {
        return false;
      }
    },

    startListening(handlers: VoiceListenHandlers): void {
      if (!sttAvailable) {
        handlers.onError?.('unavailable', 'Voice recognition is unavailable.');
        handlers.onEnd?.();
        return;
      }
      if (active) {
        // Re-entrancy guard: a session is already running.
        handlers.onError?.('busy', 'Already listening.');
        return;
      }

      active = true;
      lastFinal = '';
      lastInterim = '';

      try {
        // The real jamsch API: ExpoSpeechRecognitionModule is an Expo
        // EventEmitter (NativeModule), so we subscribe with `.addListener(name,
        // cb)` — each returns a subscription with `.remove()`. Events: 'start'
        // (mic live), 'result' (interim/final transcripts), 'error', and 'end'
        // (session finished). (There is NO top-level `addSpeechRecognitionListener`
        // export — using it threw "undefined is not a function" at runtime.)
        subs.push(
          ExpoSpeechRecognitionModule.addListener('start', () => {
            handlers.onStart?.();
          }),
        );

        subs.push(
          ExpoSpeechRecognitionModule.addListener(
            'result',
            (ev: ExpoSpeechRecognitionResultEvent) => {
              const text = ev?.results?.[0]?.transcript ?? '';
              if (ev?.isFinal) {
                lastFinal = text;
              } else {
                lastInterim = text;
              }
              handlers.onTranscript?.({ text, isFinal: !!ev?.isFinal });
              if (ev?.isFinal && text.trim().length > 0) {
                handlers.onFinal?.(text);
              }
            },
          ),
        );

        subs.push(
          ExpoSpeechRecognitionModule.addListener(
            'error',
            (ev: ExpoSpeechRecognitionErrorEvent) => {
              const code = normaliseErrorCode(ev?.error);
              handlers.onError?.(code, ev?.message ?? 'Recognition error.');
              teardown();
              handlers.onEnd?.();
            },
          ),
        );

        subs.push(
          ExpoSpeechRecognitionModule.addListener('end', () => {
            // Some platforms end WITHOUT a discrete final result event. If we
            // captured an interim but no final, promote the last interim so the
            // user's words are never silently lost.
            if (!lastFinal && lastInterim.trim().length > 0) {
              handlers.onFinal?.(lastInterim);
            }
            teardown();
            handlers.onEnd?.();
          }),
        );

        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: false,
          // Prefer on-device recognition (no network); the engine falls back if
          // on-device isn't available for the locale.
          requiresOnDeviceRecognition: false,
          addsPunctuation: true,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Could not start listening.';
        handlers.onError?.('unknown', message);
        teardown();
        handlers.onEnd?.();
      }
    },

    stop(): void {
      // Commit the current utterance — the engine emits a final result then end.
      try {
        if (active) ExpoSpeechRecognitionModule.stop();
      } catch {
        /* never throws to caller */
      }
    },

    abort(): void {
      // Discard the current utterance — no final emitted.
      try {
        if (active) ExpoSpeechRecognitionModule.abort();
      } catch {
        /* never throws to caller */
      } finally {
        teardown();
      }
    },

    speak(text: string, opts?: VoiceSpeakOptions): void {
      if (!ttsAvailable || !text || !text.trim()) {
        opts?.onDone?.();
        return;
      }
      try {
        // Barge-in: stop anything currently being spoken before the new reply.
        void Speech.stop();
        Speech.speak(text, {
          language: opts?.language,
          rate: opts?.rate,
          pitch: opts?.pitch,
          onDone: () => opts?.onDone?.(),
          onStopped: () => opts?.onDone?.(),
          onError: () => opts?.onDone?.(),
        });
      } catch {
        // Never throw into the caller's stream-complete flow.
        opts?.onDone?.();
      }
    },

    stopSpeaking(): void {
      try {
        void Speech.stop();
      } catch {
        /* idempotent, never throws */
      }
    },
  };

  return adapter;
}

export default createNativeVoiceAdapter;
