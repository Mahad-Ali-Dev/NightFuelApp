/**
 * training-workout.mathGuards.test.tsx
 *
 * Hardening proof for the live volume / avg-reps / max-weight / timer math the
 * Active Workout PLAYER (`app/training/workout.tsx`) owns. handleEnd derives the
 * summary the screen forwards to /training/complete (volume / kcal / elapsed via
 * router.replace) AND the per-exercise finish-time logSessionExercise payload
 * (sets / reps / weightKg) from `exerciseStates.sets[].completed`. Those
 * reductions read kg/reps that originate from a restored AsyncStorage snapshot
 * (JSON.parse) — so a malformed/legacy snapshot can carry a NaN / Infinity /
 * negative kg|reps, or be missing them entirely. Before this change:
 *
 *   - totalVolume summed `(s.kg||0)*(s.reps||0)` — `||0` catches undefined but
 *     `NaN * 0` is still NaN, so one garbled set surfaced a literal "NaN" volume.
 *   - the avg-reps mean divided by `completedSets.length` and the max weight used
 *     `Math.max(...map(s=>s.kg))` — `Math.max()` of an empty array is -Infinity.
 *
 * The screen now routes every at-risk number through a module-scope `finite`
 * helper (typeof number && Number.isFinite && >= min) and seeds the max-weight
 * reduce at 0, and formatTime clamps to a finite, non-negative whole second. This
 * suite feeds the AT-RISK inputs and asserts the player's OUTPUTS stay
 * finite/clamped + nothing crashes:
 *
 *   1. A restored set with a NaN/empty kg and a NaN/empty reps → the forwarded
 *      summary volume is the finite '0' (never 'NaN'/'-Infinity'/negative), the
 *      logged payload's reps/weightKg are finite & >= 0, and the header timer is
 *      a clean MM:SS (never "NaN:NaN"/negative).
 *   2. A workout with 0 completed sets → volume '0' and NO per-exercise log fires
 *      (the length===0 guard holds), no crash.
 *   3. A garbled NEGATIVE restored elapsed (a future startedAt) → the header timer
 *      clamps to 00:00 and the forwarded `elapsed` is the clamped '0', never a
 *      negative.
 *   4. CONTROL — a normal in-progress workout (two well-formed 50×10 sets) forwards
 *      the SAME volume ('1000') + logs the SAME reps/weight (10 / 50) it does
 *      today, and the timer renders the same clean MM:SS: the hardening changed no
 *      well-formed value.
 *
 * Cites react-native-skills: rendering-no-falsy-and (the player's volume/timer
 * paths must never leak a falsy 0 / NaN into the tree as bare text — the summary
 * forwards a string, the header goes through formatTime), state-ground-truth
 * (the summary + log derive from `exerciseStates.sets[].completed`, the single
 * truth — this suite reads only those derived OUTPUTS, never a parallel counter),
 * list-performance-callbacks (the exercise cards' handlers stay hoisted; unchanged
 * here — we assert behaviour, not re-instantiate them).
 *
 * Mock conventions mirror the sibling training-workout.wiring/persistence suites:
 * fake timers freeze the elapsed/startup intervals; expo-router with a sessionId
 * param + a hoisted mockReplace (so the forwarded summary params are observable);
 * react-query useQuery branched on queryKey[0] over a STABLE hoisted session
 * (a fresh object per render would re-run the session-keyed init effect → render
 * loop); useMutation/useQueryClient benign stubs; @/api/exercises fully mocked
 * (logSessionExercise records its finish-time args, the rest are stubs so axios
 * never loads); AsyncStorage stubbed (getItem overridden per-test to feed the
 * RESTORED snapshot so init takes the restore branch and seeds the at-risk sets);
 * expo-image / expo-linear-gradient / SafeBlurView / confetti / vector-icons /
 * expo-status-bar / safe-area stubbed so no native module loads. The (real)
 * SetLogger renders unstubbed (react-native-svg is in jest-expo's transform
 * whitelist) — this suite never drives it; it only asserts the player's math.
 *
 * Additive: NEW test file only (owns no production source; does not touch the
 * states/wiring/persistence suites or the components they exercise).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// A present sessionId enables the ['active-session', id] query AND gives handleEnd
// a non-empty sessionId so it takes the logSessionExercise branch (not the
// sessionId-less early return). `mockReplace` is hoisted so the summary
// assertions can read the params handleEnd forwards to /training/complete.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ sessionId: 'sess-1' }),
}));

// react-query: branch useQuery on queryKey[0]. The restore path (AsyncStorage
// getItem → the RESTORED fixture) seeds exercises directly, so the active-session
// query only needs to resolve benignly; resolved-card detail/last-set queries
// default to empty. useMutation / useQueryClient are benign stubs.
//
// CRUCIAL: `data`/`refetch` are STABLE references (a hoisted constant + a shared
// spy), not fresh literals per call — the init effect lists `session` in its deps,
// so a new object each render would loop. Mirrors the wiring/persistence suites.
const mockSession = { id: 'sess-1', startedAt: '2026-06-17T20:00:00.000Z', logs: [] };
const mockRefetch = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return { data: mockSession, isLoading: false, isError: false, refetch: mockRefetch };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: mockRefetch };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports. logSessionExercise is the FINISH-time
// sink this suite captures (records its args); the rest are stubs so axios (via
// @/api/client) never loads. endSession resolves so handleEnd's `await
// endSession(...)` settles cleanly under fake timers.
jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getRoutines: jest.fn(),
  startSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
  logSessionExercise: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn().mockResolvedValue(undefined),
  getById: jest.fn(),
}));

// AsyncStorage: getItem overridden per-test to feed the RESTORED snapshot (init
// takes the restore branch and seeds the exercise with the at-risk sets). setItem
// records persisted payloads (unused here); removeItem resolves (handleEnd clears
// the key before its async work).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suites,
// and lets the real SetLogger's icons render without expo-font).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Native-module-backed visuals → passthrough Views.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import ActiveWorkoutScreen from '../../app/training/workout';

// The exact module instances the screen imports (jest hoists the mocks → same
// singletons), so these capture the screen's real calls.
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { logSessionExercise } = require('@/api/exercises');

// A clean MM:SS clock (two digits : two digits). Any "NaN"/negative/Infinity in
// the formatted elapsed would fail to match this, so it doubles as the "timer
// never NaN/negative" assertion.
const MMSS = /^\d{2}:\d{2}$/;

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ActiveWorkoutScreen />
    </ThemeContext.Provider>,
  );
}

/** Flush an awaited microtask (e.g. the init effect's AsyncStorage.getItem). */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Render with the given restored snapshot and flush init (+ follow-up microtask). */
async function renderRestored(restored: unknown) {
  AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(restored));
  renderScreen();
  await flushMicrotasks();
  await flushMicrotasks();
}

/**
 * Finish the workout and return the params handleEnd forwarded to /complete.
 * handleEnd derives the summary from exerciseStates.sets[].completed, fires
 * logSessionExercise per completed exercise inside `await Promise.all(...)`, then
 * navigates after a 2.5s confetti delay — flush the finish microtasks AND advance
 * past the delay before reading. Returns null params only if navigation never
 * fired (the caller asserts on the count).
 */
async function finishAndReadSummaryParams(): Promise<any> {
  await act(async () => {
    // Press the FINISH Button via its accessibilityLabel (targets the Pressable,
    // mirroring the wiring/persistence suites).
    fireEvent.press(screen.getByLabelText('Finish workout'));
  });
  await act(async () => {
    jest.advanceTimersByTime(2500);
    await Promise.resolve();
  });
  expect(mockReplace).toHaveBeenCalledTimes(1);
  const [arg] = mockReplace.mock.calls[0];
  expect(arg.pathname).toBe('/training/complete');
  return arg.params;
}

/** A string param is a finite, non-negative number (never 'NaN'/'-Infinity'/<0). */
function expectFiniteNonNegativeNumericString(value: string) {
  expect(typeof value).toBe('string');
  const n = Number(value);
  expect(Number.isFinite(n)).toBe(true);
  expect(n).toBeGreaterThanOrEqual(0);
  // Guard the exact toxic serialisations a bad reduce would emit.
  expect(value).not.toBe('NaN');
  expect(value).not.toBe('Infinity');
  expect(value).not.toBe('-Infinity');
}

describe('ActiveWorkoutScreen — volume / avg-reps / timer math guards', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    // clearAllMocks wipes call data but not implementations; restore the defaults
    // so an ordering change can't leak a stale snapshot or a rejected log/end.
    AsyncStorage.getItem.mockResolvedValue(null);
    logSessionExercise.mockResolvedValue(undefined);
  });

  // ── 1: a restored set with NaN/empty kg & reps → finite '0' summary, no crash ─
  // Snapshot mirrors a malformed/legacy persisted state: a completed set whose kg
  // is NaN and reps is undefined (JSON.parse can yield missing keys; we also force
  // an explicit NaN-source). The old `(s.kg||0)*(s.reps||0)` would compute
  // `NaN * 0 = NaN` → 'NaN' volume; the hardened reduce yields a finite 0.
  test('a NaN/empty-numbers restored set yields a finite 0 volume + finite log + clean timer (no crash)', async () => {
    const RESTORED_GARBLED = {
      sessionId: 'sess-1',
      startedAt: new Date(2026, 5, 17, 19, 30, 0).getTime(), // 30 min before "now"
      elapsedSeconds: 0,
      exercises: [
        {
          name: 'Bench Press',
          muscleGroup: 'Chest',
          restSeconds: 90,
          sets: [
            // Completed but garbled: NaN kg, missing reps. Marked completed so it
            // reaches BOTH the volume reduce and the per-exercise log path.
            { kg: Number.NaN, completed: true },
          ],
        },
      ],
    };

    await expect((async () => {
      await renderRestored(RESTORED_GARBLED);
    })()).resolves.not.toThrow();

    // The header timer rendered as a clean MM:SS (never "NaN:NaN") even though the
    // set numbers are garbage — formatTime is independent of kg/reps, but this
    // pins "the player mounted and the timer is finite" before we finish.
    expect(screen.getByText(MMSS)).toBeTruthy();

    const params = await finishAndReadSummaryParams();

    // Volume is the finite, non-negative '0' (NOT 'NaN'/'-Infinity'): NaN*0 can no
    // longer propagate, and the rounded total is itself clamped finite/>=0.
    expectFiniteNonNegativeNumericString(params.volume);
    expect(params.volume).toBe('0');
    // kcal + elapsed are likewise finite & non-negative.
    expectFiniteNonNegativeNumericString(params.kcal);
    expectFiniteNonNegativeNumericString(params.elapsed);

    // The garbled set is still "completed", so the exercise IS logged — and its
    // derived reps/weightKg must be finite & >= 0, never NaN / -Infinity. avg reps
    // = finite(undefined) / max(1, 1) = 0; max weight = max(0, finite(NaN)) = 0.
    expect(logSessionExercise).toHaveBeenCalledTimes(1);
    const [, payload] = logSessionExercise.mock.calls[0];
    expect(Number.isFinite(payload.reps)).toBe(true);
    expect(payload.reps).toBeGreaterThanOrEqual(0);
    expect(payload.reps).toBe(0);
    expect(Number.isFinite(payload.weightKg)).toBe(true);
    expect(payload.weightKg).toBeGreaterThanOrEqual(0);
    expect(payload.weightKg).toBe(0);
    // sets is the real completed count (1) — the guard hardens the VALUES, not the
    // honest count.
    expect(payload.sets).toBe(1);
  });

  // ── 2: a workout with 0 completed sets → '0' volume, NO per-exercise log ──────
  // All sets pending → the volume reduce sums nothing (0) and the per-exercise
  // `completedSets.length === 0` early-return holds, so logSessionExercise never
  // fires (the avg-reps `/length` + Math.max(...[]) it guards are never reached for
  // an empty list, and the guarded versions would still be finite if they were).
  test('a workout with 0 completed sets forwards a 0 volume and logs no exercise', async () => {
    const RESTORED_NO_COMPLETED = {
      sessionId: 'sess-1',
      startedAt: new Date(2026, 5, 17, 19, 45, 0).getTime(),
      elapsedSeconds: 0,
      exercises: [
        {
          name: 'Squat',
          muscleGroup: 'Legs',
          restSeconds: 90,
          sets: [
            { kg: 60, reps: 8, completed: false },
            { kg: 60, reps: 8, completed: false },
            { kg: 60, reps: 8, completed: false },
          ],
        },
      ],
    };

    await renderRestored(RESTORED_NO_COMPLETED);

    // Header derived from ex.sets[].completed: 0 of 3 done — and the timer is clean.
    expect(screen.getAllByText(/0\/3 sets/)[0]).toBeTruthy();
    expect(screen.getByText(MMSS)).toBeTruthy();

    const params = await finishAndReadSummaryParams();

    // No completed set anywhere → volume sums to the finite '0'.
    expectFiniteNonNegativeNumericString(params.volume);
    expect(params.volume).toBe('0');

    // The per-exercise length===0 guard held → no log fired (so the avg-reps mean
    // and Math.max-weight were never evaluated against an empty list at all).
    expect(logSessionExercise).not.toHaveBeenCalled();
  });

  // ── 3: a garbled NEGATIVE restored elapsed clamps the timer + forwarded elapsed ─
  // A future startedAt makes `Math.floor((Date.now() - startedAt)/1000)` negative
  // at restore. The header goes through the hardened formatTime (Math.max(0,…)) so
  // it shows 00:00 (never a negative clock), and the forwarded `elapsed` is the
  // clamped '0'.
  test('a future startedAt (negative elapsed) clamps the timer to 00:00 and forwards a non-negative elapsed', async () => {
    const RESTORED_FUTURE = {
      sessionId: 'sess-1',
      // 10 minutes AFTER "now" → resumedElapsed = floor((now - future)/1000) < 0.
      startedAt: new Date(2026, 5, 17, 20, 10, 0).getTime(),
      elapsedSeconds: 0,
      exercises: [
        {
          name: 'Deadlift',
          muscleGroup: 'Back',
          restSeconds: 90,
          sets: [{ kg: 100, reps: 5, completed: true }],
        },
      ],
    };

    await renderRestored(RESTORED_FUTURE);

    // The header timer clamps to 00:00 — formatTime floored the negative elapsed to
    // a non-negative whole second (never a "-01:00"/"NaN:NaN").
    expect(screen.getByText('00:00')).toBeTruthy();

    const params = await finishAndReadSummaryParams();
    // The forwarded elapsed is clamped finite & >= 0 (was negative pre-guard).
    expectFiniteNonNegativeNumericString(params.elapsed);
    expect(params.elapsed).toBe('0');
    // …and the well-formed completed set still produces a finite, correct volume.
    expectFiniteNonNegativeNumericString(params.volume);
    expect(params.volume).toBe('500'); // 100kg × 5
  });

  // ── 4: CONTROL — a normal workout is byte-identical to today ──────────────────
  // The hardening must not move any well-formed value. Two completed 50×10 sets →
  // volume 1000 (finite(50)*finite(10) twice), mean reps 10, max weight 50 — the
  // SAME numbers the wiring/persistence suites pin for the un-hardened math — and
  // the timer renders a clean MM:SS for the ~30-min elapsed.
  test('a normal in-progress workout forwards the identical volume and logs identical reps/weight', async () => {
    const RESTORED_NORMAL = {
      sessionId: 'sess-1',
      startedAt: new Date(2026, 5, 17, 19, 30, 0).getTime(), // 30 min before "now"
      elapsedSeconds: 0,
      exercises: [
        {
          name: 'Bench Press',
          muscleGroup: 'Chest',
          restSeconds: 90,
          sets: [
            { kg: 50, reps: 10, completed: true },
            { kg: 50, reps: 10, completed: true },
            { kg: 50, reps: 10, completed: false },
          ],
        },
      ],
    };

    await renderRestored(RESTORED_NORMAL);

    // Header derived from ex.sets: 2 of 3 done; timer is a clean MM:SS.
    expect(screen.getAllByText(/2\/3 sets/)[0]).toBeTruthy();
    const timerNode = screen.getByText(MMSS);
    expect(timerNode).toBeTruthy();

    const params = await finishAndReadSummaryParams();

    // Identical to the value the wiring suite pins for the same fixture: 2 × (50×10).
    expect(params.volume).toBe('1000');
    expectFiniteNonNegativeNumericString(params.volume);

    // The per-exercise log carries the un-changed derived numbers: mean reps 10,
    // Math.max weight 50, over the 2 completed sets.
    expect(logSessionExercise).toHaveBeenCalledTimes(1);
    const [sid, payload] = logSessionExercise.mock.calls[0];
    expect(sid).toBe('sess-1');
    expect(payload.exerciseName).toBe('Bench Press');
    expect(payload.sets).toBe(2);
    expect(payload.reps).toBe(10);
    expect(payload.weightKg).toBe(50);
    expect(payload.durationSecs).toBe(0);
  });
});
