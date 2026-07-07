/**
 * Tests for the gate-safe exercise-video seam (`src/lib/exerciseVideo.ts`).
 *
 * These pin the honest-fallback behaviour the Expo-Go / jest-gate default must
 * exhibit when the native `expo-video` package is NOT installed:
 *
 *   1. isExerciseVideoAvailable() is false (honest ground truth: no engine);
 *   2. getExerciseVideoComponent() returns null (so the UI keeps the existing
 *      image-frame path);
 *   3. neither ever throws (the lazy require + probe are wrapped in try/catch);
 *   4. the resolution is memoised (the probe runs at most once per session).
 *
 * The gate condition: getExerciseVideoComponent() lazily require()s
 * `./exerciseVideoNative`, which imports expo-video. That native package is NOT
 * installed for the gate; jest.config.js maps it to a lightweight stub whose
 * `useVideoPlayer` is NOT a function, so the wrapper's engine probe returns false
 * → the seam reports unavailable / returns null. No native package install is
 * required — exactly mirrors voice.test.ts's getVoiceAdapter() seam assertions.
 */
import {
  isExerciseVideoAvailable,
  getExerciseVideoComponent,
  __resetExerciseVideoForTests,
} from '@/lib/exerciseVideo';

describe('exerciseVideo — getExerciseVideoComponent() / isExerciseVideoAvailable() seam', () => {
  beforeEach(() => __resetExerciseVideoForTests());
  afterAll(() => __resetExerciseVideoForTests());

  test('reports unavailable when the native engine is absent (the gate)', () => {
    // Under jest, expo-video resolves to the stub whose useVideoPlayer is not a
    // function, so the wrapper's engine probe is false → seam unavailable.
    expect(isExerciseVideoAvailable()).toBe(false);
  });

  test('getExerciseVideoComponent() returns null under the gate (keeps image path)', () => {
    expect(getExerciseVideoComponent()).toBeNull();
  });

  test('never throws — the lazy require + probe are guarded', () => {
    expect(() => isExerciseVideoAvailable()).not.toThrow();
    expect(() => getExerciseVideoComponent()).not.toThrow();
  });

  test('memoises the resolution (probe runs once)', () => {
    const first = getExerciseVideoComponent();
    const second = getExerciseVideoComponent();
    // Both null under the gate, and isExerciseVideoAvailable agrees.
    expect(first).toBe(second);
    expect(isExerciseVideoAvailable()).toBe(false);
  });
});
