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
 *   - For `tsc --noEmit`, the `import`s below resolve against the ambient shims
 *     in `src/types/voice-native.d.ts` (declared because the packages aren't
 *     installed for the gate). Delete those shims once the deps are installed.
 *
 * Honest-fallback discipline (mirrors the health-sync adapter): nothing here
 * throws into the caller. Engine/permission failures are reported through the
 * handler callbacks (STT) or simply degrade to `isAvailable() === false`.
 */

import {
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener,
  type EventSubscription,
} from 'expo-speech-recognition';
import * as Speech from 'expo-speech';

import type {
  VoiceAdapter,
  VoiceErrorCode,
  VoiceListenHandlers,
  VoiceSpeakOptions,
} from './voice.types';

/**
 * Map a native expo-speech-recognition error string to our normalised
 * {@link VoiceErrorCode}. The Web-Speech-style codes jamsch emits include
 * 'no-speech', 'not-allowed', 'network', 'aborted', 'audio-capture',
 * 'service-not-allowed', 'language-not-supported', etc. We collapse them to the
 * small set the UI knows how to fall back from.
 */
function normaliseErrorCode(raw: string | undefined): VoiceErrorCode {
  switch (raw) {
    case 'no-speech':
      return 'no-speech';
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return 'not-allowed';
    case 'network':
      return 'network';
    case 'busy':
      return 'busy';
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
  let subs: EventSubscription[] = [];
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
        subs.push(
          addSpeechRecognitionListener('start', () => {
            handlers.onStart?.();
          }),
        );

        subs.push(
          addSpeechRecognitionListener('result', (ev) => {
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
          }),
        );

        subs.push(
          addSpeechRecognitionListener('error', (ev) => {
            const code = normaliseErrorCode(ev?.error);
            handlers.onError?.(code, ev?.message ?? 'Recognition error.');
            teardown();
            handlers.onEnd?.();
          }),
        );

        subs.push(
          addSpeechRecognitionListener('end', () => {
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
