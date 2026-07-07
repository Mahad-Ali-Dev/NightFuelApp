/**
 * Tests for the default voice adapter (`src/lib/voice.ts`) and the type-seam
 * constants/contract (`src/lib/voice.types.ts`).
 *
 * These pin the honest-fallback behaviour the Expo-Go / jest-gate default must
 * exhibit when the native packages (expo-speech / expo-speech-recognition) are
 * NOT installed:
 *
 *   1. the default adapter implements EVERY VoiceAdapter method;
 *   2. isSTTAvailable()/isTTSAvailable() are false (honest ground truth);
 *   3. requestPermission() resolves false (never throws);
 *   4. startListening() reports an 'unavailable' error then ends — modelling the
 *      failure as DATA (handler callbacks), never a thrown exception;
 *   5. speak() still calls onDone (so a caller's completion flow runs), and the
 *      stop/abort/stopSpeaking methods are safe no-ops;
 *   6. getVoiceAdapter() falls back to the no-op when the native module can't be
 *      required (the gate has no native deps) — and the result is memoised.
 *
 * The module under test is pure TypeScript; getVoiceAdapter()'s lazy
 * require('./voice.native') simply throws under jest (no native module), which
 * is exactly the gate condition we assert degrades to the no-op.
 */
// NOTE on the gate condition: getVoiceAdapter() lazily require()s
// `./voice.native`, which imports expo-speech / expo-speech-recognition. Those
// native packages are NOT installed for the gate; jest.config.js maps them to
// lightweight stubs that report STT/TTS UNAVAILABLE, so createNativeVoiceAdapter()
// returns null and getVoiceAdapter() falls back to the honest no-op — exactly
// the Expo-Go behaviour asserted below. No native package install is required.

import defaultVoice, {
  noopVoiceAdapter,
  getVoiceAdapter,
  __resetVoiceAdapterForTests,
} from '@/lib/voice';
import {
  VOICE_ERROR_CODES,
  VOICE_ERROR_MESSAGES,
  VOICE_LISTEN_STATES,
  type VoiceAdapter,
  type VoiceListenHandlers,
} from '@/lib/voice.types';

describe('voice — default no-op adapter', () => {
  // (1) implements every VoiceAdapter method.
  test('implements every VoiceAdapter method', () => {
    const methods: (keyof VoiceAdapter)[] = [
      'isSTTAvailable',
      'isTTSAvailable',
      'requestPermission',
      'startListening',
      'stop',
      'abort',
      'speak',
      'stopSpeaking',
    ];
    for (const m of methods) {
      expect(typeof noopVoiceAdapter[m]).toBe('function');
    }
  });

  // (2) honest availability ground truth.
  test('isSTTAvailable() and isTTSAvailable() are both false', () => {
    expect(noopVoiceAdapter.isSTTAvailable()).toBe(false);
    expect(noopVoiceAdapter.isTTSAvailable()).toBe(false);
  });

  // (3) requestPermission resolves false, never throws.
  test('requestPermission() resolves false (never rejects)', async () => {
    await expect(noopVoiceAdapter.requestPermission()).resolves.toBe(false);
  });

  // (4) startListening reports 'unavailable' as DATA then ends; never throws.
  test("startListening() fires onError('unavailable') then onEnd, never throws", () => {
    const onError = jest.fn();
    const onEnd = jest.fn();
    const onFinal = jest.fn();
    const handlers: VoiceListenHandlers = { onError, onEnd, onFinal };

    expect(() => noopVoiceAdapter.startListening(handlers)).not.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('unavailable', VOICE_ERROR_MESSAGES.unavailable);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // No final transcript is ever fabricated.
    expect(onFinal).not.toHaveBeenCalled();
  });

  test('startListening() with no handlers is a safe no-op (never throws)', () => {
    expect(() => noopVoiceAdapter.startListening({})).not.toThrow();
  });

  // (5) speak() still runs the caller's completion flow; the rest are no-ops.
  test('speak() calls onDone (so completion flow runs) and never speaks', () => {
    const onDone = jest.fn();
    expect(() => noopVoiceAdapter.speak('Hello from Ria', { onDone })).not.toThrow();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('stop/abort/stopSpeaking are idempotent no-ops (never throw)', () => {
    expect(() => {
      noopVoiceAdapter.stop();
      noopVoiceAdapter.stop();
      noopVoiceAdapter.abort();
      noopVoiceAdapter.abort();
      noopVoiceAdapter.stopSpeaking();
      noopVoiceAdapter.stopSpeaking();
    }).not.toThrow();
  });

  test('the singleton is frozen — callers cannot mutate the shared instance', () => {
    expect(Object.isFrozen(noopVoiceAdapter)).toBe(true);
  });
});

describe('voice — getVoiceAdapter() seam', () => {
  beforeEach(() => __resetVoiceAdapterForTests());
  afterAll(() => __resetVoiceAdapterForTests());

  // (6) falls back to the no-op when the native module can't be required.
  test('falls back to the no-op adapter when native deps are absent (the gate)', () => {
    // Under jest there is no expo-speech-recognition / expo-speech native
    // module, so the lazy require('./voice.native') throws → no-op fallback.
    expect(getVoiceAdapter()).toBe(noopVoiceAdapter);
  });

  test('memoises the resolved adapter (probe runs once)', () => {
    const first = getVoiceAdapter();
    const second = getVoiceAdapter();
    expect(first).toBe(second);
  });

  test('the default export is the no-op adapter', () => {
    expect(defaultVoice).toBe(noopVoiceAdapter);
  });
});

describe('voice.types — documented enumerations + error copy', () => {
  test('VOICE_LISTEN_STATES enumerates the full state machine', () => {
    expect([...VOICE_LISTEN_STATES]).toEqual([
      'unavailable',
      'idle',
      'starting',
      'listening',
      'error',
    ]);
  });

  test('VOICE_ERROR_CODES enumerates the normalised STT failures', () => {
    expect([...VOICE_ERROR_CODES]).toEqual([
      'no-speech',
      'not-allowed',
      'network',
      'busy',
      'unavailable',
      'unknown',
    ]);
  });

  test('every error code has a human-readable fallback message', () => {
    for (const code of VOICE_ERROR_CODES) {
      expect(typeof VOICE_ERROR_MESSAGES[code]).toBe('string');
      expect(VOICE_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  test("the 'unavailable' fallback mentions a dev build (honest, never fake)", () => {
    expect(VOICE_ERROR_MESSAGES.unavailable.toLowerCase()).toContain('dev build');
  });
});
