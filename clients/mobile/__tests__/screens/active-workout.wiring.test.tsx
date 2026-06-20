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
// — irrelevant to the wiring under test.
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
}));

// Imports must resolve; useQuery is fully stubbed so these are never called.
jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getLastSet: jest.fn(),
}));

// Capture router.push so we can assert "Add Exercise" performs a real navigation
// (never a silent no-op handler).
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
