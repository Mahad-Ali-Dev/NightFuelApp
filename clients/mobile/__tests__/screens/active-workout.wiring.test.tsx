/**
 * Wiring tests for the Active Workout modal
 * (`app/(modals)/active-workout.tsx`) — the hardened workout primitives.
 *
 * This screen used to carry a DIVERGENT inline rest-timer effect, unguarded
 * weight/reps inputs, and dead stubs (`Finish`/`Add Exercise`/`Add Set` with no
 * real handler), and toggleSet/updateSet mutated set objects IN PLACE over a
 * shallow copy. It is now wired to the shared, individually-tested components:
 *
 *   • <RestTimer/> (src/components/workout/RestTimer.tsx) drives the rest
 *     countdown in the Aurora rest banner — completing/logging a set starts a
 *     rest cycle; the banner Close control and the timer's own onFinish both
 *     stop it. (RestTimer's countdown behaviour is covered by
 *     __tests__/components/RestTimer.test.tsx; here we only pin the SCREEN
 *     wiring — that the real timer mounts on completion and unmounts on stop.)
 *   • <SetLogger/> (src/components/workout/SetLogger.tsx) is the validated
 *     set-entry surface revealed by "Add Set"; its guard
 *     (Number.isFinite + reps>=1 / weightKg>=0) rejects junk BEFORE onLogSet
 *     fires, so a junk entry logs nothing and starts no rest. (SetLogger's own
 *     hardening is covered by __tests__/components/SetLogger.test.tsx.)
 *
 * We deliberately leave react-native-svg UNMOCKED so the REAL <RestTimer/>
 * renders (it exposes role="timer"); the only stubs are the ones the screen's
 * module graph needs to load under jest (react-query, the api module, the demo
 * player, expo-router, vector-icons, and safe-area).
 *
 * The sibling suite active-workout.previousSet.test.tsx pins the cross-session
 * previous-set hint, the demo player, and the skeleton/error/empty states; it
 * must keep passing. This suite is additive and never opens SetLogger by default
 * (so it never duplicates the exercise title onto the screen).
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// One active-session exercise → one card with two seeded set rows. weightKg 0 so
// the inputs start empty (the appended-set assertions count rows, not values).
const mockSession = {
  id: 'sess-1',
  startedAt: '2026-06-17T20:00:00.000Z',
  logs: [
    { exerciseName: 'Bench Press', sets: 2, reps: 8, weightKg: 0, durationSecs: 0 },
  ],
};

// react-query is fully stubbed: a synchronous switch on queryKey[0]. The
// ['exercise-last-sets', …] history query returns {} (no cross-session history)
// — irrelevant to the wiring under test. useQueryClient is a benign stub whose
// invalidateQueries we capture so the Finish test can assert the cache flush.
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return { data: mockSession, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'exercise-last-sets') {
      return { data: {}, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// Imports must resolve; useQuery is fully stubbed so the read hooks are never
// called. logSessionExercise/endSession ARE invoked by the Finish handler under
// test, so they resolve to undefined and we assert the calls below.
jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getLastSet: jest.fn(),
  logSessionExercise: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn().mockResolvedValue(undefined),
}));

// Capture router.push (Add Exercise navigation) and router.replace (the Finish
// handler's navigation to the completion summary) — both must be real, never a
// silent no-op / bare back().
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

// Decorative glyphs → plain text so labels/roles stay assertable.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// The shared <Button/> (e.g. "Finish", "Add Exercise") pulls in
// expo-linear-gradient, whose native loader never runs under jest — passthrough
// host <View> (same convention as the sibling screen suites).
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// The demo player pulls native image/gradient loaders that never run under jest
// and is irrelevant to the wiring under test — stub it to a plain host view.
jest.mock('@/components/exercise/ExerciseDemo', () => {
  const RN = require('react-native');
  return { ExerciseDemo: (props: any) => <RN.View testID="exercise-demo" {...props} /> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Import AFTER the mocks are registered.
import ActiveWorkoutScreen from '../../app/(modals)/active-workout';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ActiveWorkoutScreen />
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  // Freeze the screen's 1s elapsed interval so it doesn't tick during a test.
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
  mockPush.mockClear();
  mockReplace.mockClear();
  mockInvalidateQueries.mockClear();
  // Clear call data but KEEP the mockResolvedValue implementations registered
  // on the api module (mockClear, not mockReset).
  const api = require('@/api/exercises');
  api.logSessionExercise.mockClear();
  api.endSession.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Active Workout — RestTimer wiring', () => {
  test('completing a set starts a rest cycle via the real <RestTimer/>; Close stops it', () => {
    renderScreen();

    // No rest in progress at rest: the banner (and its role="timer") is absent.
    expect(screen.queryByRole('timer')).toBeNull();

    // Complete set 1 (the seeded session has two "Complete set" checkmarks).
    fireEvent.press(screen.getAllByLabelText('Complete set')[0]);

    // The hardened RestTimer mounted and is running — it exposes role="timer"
    // with its derived countdown label (90s = "1 minute 30 seconds").
    const timer = screen.getByRole('timer');
    expect(timer).toBeTruthy();
    expect(timer.props.accessibilityLabel).toBe('Rest timer, 1 minute 30 seconds remaining');

    // The banner Close control stops the rest cycle → the timer unmounts.
    fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  test("the timer's own onFinish stops the rest cycle when the countdown reaches zero", () => {
    renderScreen();

    fireEvent.press(screen.getAllByLabelText('Complete set')[0]);
    expect(screen.getByRole('timer')).toBeTruthy();

    // Drive the REAL RestTimer to zero (REST_SECONDS = 90). It re-arms its
    // interval each tick, so advance a second at a time (the proven pattern from
    // RestTimer's own suite). At zero it fires onFinish.
    for (let i = 0; i < 90; i++) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }

    // The countdown has reached zero — the timer announces "finished".
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe('Rest timer, finished');

    // onFinish stops the rest: the screen defers the state change to a macrotask
    // (out of RestTimer's render phase), so flush it. The banner then unmounts.
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(screen.queryByRole('timer')).toBeNull();
  });

  test('un-completing a set stops the rest cycle (no leaked banner)', () => {
    renderScreen();

    const checkmark = () => screen.getAllByLabelText('Complete set')[0];
    fireEvent.press(checkmark()); // complete → rest starts
    expect(screen.getByRole('timer')).toBeTruthy();

    fireEvent.press(checkmark()); // toggle back to incomplete → rest stops
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('Active Workout — SetLogger validated entry', () => {
  test('a junk weight/reps entry is rejected: no logged set row and no rest cycle', () => {
    renderScreen();

    // Two seeded set rows → two "Complete set" checkmarks before any logging.
    expect(screen.getAllByLabelText('Complete set')).toHaveLength(2);

    // Reveal the validated SetLogger for the card.
    fireEvent.press(screen.getByLabelText('Add set'));

    // Junk reps ('abc'): SetLogger's guard rejects it before onLogSet.
    fireEvent.changeText(screen.getByLabelText('Reps'), 'abc');
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '40');
    fireEvent.press(screen.getByRole('button', { name: 'Log set' }));

    // Nothing was logged: SetLogger added no "Set 1" row, the card gained no
    // row (still two checkmarks), and no rest cycle was started.
    expect(screen.queryByText('Set 1')).toBeNull();
    expect(screen.getAllByLabelText('Complete set')).toHaveLength(2);
    expect(screen.queryByRole('timer')).toBeNull();
  });

  test('a VALID entry logs through SetLogger: appends a set row and starts a rest cycle', () => {
    renderScreen();

    expect(screen.getAllByLabelText('Complete set')).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Add set'));

    // Valid: reps 10, weight 40 → passes the guard, onLogSet fires.
    fireEvent.changeText(screen.getByLabelText('Reps'), '10');
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '40');
    fireEvent.press(screen.getByRole('button', { name: 'Log set' }));

    // The validated set was appended to the card as a third (done) row …
    expect(screen.getAllByLabelText('Complete set')).toHaveLength(3);
    // … and logging a set starts the rest cycle (real RestTimer mounts).
    expect(screen.getByRole('timer')).toBeTruthy();
  });
});

describe('Active Workout — Add controls are functional (no silent no-ops)', () => {
  test('"Add Set" toggles the validated SetLogger open and closed', () => {
    renderScreen();

    // Collapsed by default — SetLogger's inputs are not mounted.
    expect(screen.queryByLabelText('Reps')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull();

    // Open it.
    fireEvent.press(screen.getByLabelText('Add set'));
    expect(screen.getByLabelText('Reps')).toBeTruthy();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log set' })).toBeTruthy();

    // Close it again (the control flips to "Hide add set").
    fireEvent.press(screen.getByLabelText('Hide add set'));
    expect(screen.queryByLabelText('Reps')).toBeNull();
  });

  test('"Add Exercise" performs a real navigation to the exercise catalogue', () => {
    renderScreen();

    fireEvent.press(screen.getByText('Add Exercise'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(exercises)');
  });
});

// The capstone for THIS change: "Finish" must PERSIST the logged sets and route
// to the completion summary, NOT silently `router.back()` and discard them.
// Before this fix the button called a bare back() that never touched
// logSessionExercise/endSession and never navigated to /training/complete, so
// every logged set was lost — and no test asserted what Finish did, which is why
// it slipped. This pins persist → endSession → invalidate → summary.
describe('Active Workout — Finish persists then navigates to the summary', () => {
  test('Finish persists logged sets and navigates to the summary', async () => {
    renderScreen();

    // Enter real numbers on the first seeded set row, then complete it so it is
    // counted as a logged (done) set. (The labels come straight from the row's
    // weight/reps TextInputs + the "Complete set" checkmark.)
    fireEvent.changeText(screen.getByLabelText('Weight (kg), set 1'), '50');
    fireEvent.changeText(screen.getByLabelText('Reps, set 1'), '10');
    fireEvent.press(screen.getAllByLabelText('Complete set')[0]);

    // Tap Finish (the shared <Button/> maps its title to the Pressable onPress).
    // handleFinish is async: it awaits Promise.all(logSessionExercise…) THEN
    // endSession — a multi-step await chain, each step re-queuing a microtask. We
    // drain the microtask queue across several turns (one `await Promise.resolve()`
    // only advances one `await`) so every step settles before we assert.
    await act(async () => {
      fireEvent.press(screen.getByText('Finish'));
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    });

    const api = require('@/api/exercises');

    // The completed exercise was logged via logSessionExercise with the session
    // id and finite numeric payload derived from the entered set (50kg × 10 reps).
    expect(api.logSessionExercise).toHaveBeenCalledTimes(1);
    const [loggedSessionId, payload] = api.logSessionExercise.mock.calls[0];
    expect(loggedSessionId).toBe(mockSession.id);
    expect(payload).toEqual(
      expect.objectContaining({
        exerciseName: 'Bench Press',
        sets: 1,
        reps: 10,
        weightKg: 50,
        durationSecs: 0,
      }),
    );

    // The session was ended with the same session id …
    expect(api.endSession).toHaveBeenCalledTimes(1);
    expect(api.endSession).toHaveBeenCalledWith(mockSession.id);

    // … the active-session + exercise-history caches were invalidated …
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['active-session'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['exercises', 'history'] });

    // … and we navigated to the completion summary via router.replace (NOT back)
    // with finite numeric-string params (no NaN / -Infinity).
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const [replaceArg] = mockReplace.mock.calls[0];
    expect(replaceArg.pathname).toBe('/training/complete');
    const { elapsed, volume, kcal } = replaceArg.params;
    // volume = 50 × 10 = 500; elapsed/kcal are finite non-negative strings.
    expect(volume).toBe('500');
    for (const v of [elapsed, volume, kcal]) {
      expect(typeof v).toBe('string');
      expect(Number.isFinite(Number(v))).toBe(true);
      expect(Number(v)).toBeGreaterThanOrEqual(0);
    }
  });
});
