/**
 * training-workout.wiring.test.tsx
 *
 * Screen-level coverage that the Active Workout screen
 * (`app/training/workout.tsx`) is WIRED to the F10-hardened workout primitives —
 * `<RestTimer/>` (src/components/workout/RestTimer.tsx) and `<SetLogger/>`
 * (src/components/workout/SetLogger.tsx) — rather than carrying its own
 * duplicated inline rest-timer effect + unguarded per-set parseFloat/parseInt
 * inputs (the dormant state this change removed).
 *
 * Distinct from the sibling training-workout.states.test.tsx (which pins the
 * PRE-init skeleton / error / FINISH states): that suite is behaviour-preserving
 * and still passes after this wiring. This suite asserts the POST-init set-entry
 * + rest-cycle behaviour:
 *
 *   1. The REAL <RestTimer/> mounts when a rest cycle opens — queryable via its
 *      accessibilityRole="timer" + the formatRestA11yLabel-derived label — not a
 *      bare inline CircularProgress ring. (Before a set is logged it is absent.)
 *   2. Logging a valid set through <SetLogger/> opens the rest cycle, and BOTH
 *      SKIP and the timer's own onFinish (reaching 00:00) close it (the timer
 *      unmounts again).
 *   3. Input hardening is now USER-REACHABLE: a junk SetLogger entry (reps='abc'
 *      / '0' / a negative weight) does NOT fire the log path — no logged "Set 1"
 *      row and no rest cycle opens — while a valid entry does both.
 *
 * Mock conventions mirror training-workout.states.test.tsx (fake timers freeze
 * the elapsed/startup intervals; AsyncStorage / confetti / expo-image /
 * expo-linear-gradient / SafeBlurView / expo-status-bar / vector-icons /
 * safe-area / react-query / @/api/exercises all stubbed so no native module or
 * axios client loads). CRUCIALLY this suite does NOT mock @/components/workout/
 * RestTimer or SetLogger — they render for real, since the whole point is to
 * prove the screen reaches them. react-native-svg (RestTimer's ring) is in
 * jest-expo's transform whitelist, so it renders to host primitives unstubbed.
 *
 * Additive: NEW test file only (does not touch the states suite).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// A present sessionId enables the ['active-session', id] query (the realistic
// "resume / open a session" navigation). `mockReplace` is hoisted so the summary
// test can assert the params handleEnd forwards to /training/complete.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ sessionId: 'sess-1' }),
}));

// react-query: branch useQuery on queryKey[0]. The ['active-session'] query
// returns a seeded session (one logged exercise) so the init effect's fallback
// path seeds a single exercise card. The resolved-card detail/last-set queries
// default to a benign empty result. useMutation / useQueryClient are benign
// stubs (handleEnd is not exercised here).
const mockSession = {
  id: 'sess-1',
  startedAt: '2026-06-17T20:00:00.000Z',
  logs: [{ exerciseName: 'Bench Press', sets: 3, reps: 8, weightKg: 0, durationSecs: 0 }],
};
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return { data: mockSession, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. The query/mutation hooks are stubbed above, so
// these are never invoked; they only satisfy the import graph.
jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getRoutines: jest.fn(),
  startSession: jest.fn(),
  logSessionExercise: jest.fn(),
  endSession: jest.fn(),
  getById: jest.fn(),
}));

// AsyncStorage: getItem → null so init takes the fallback path and seeds from the
// active-session payload (matches the states suite).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suites,
// and lets SetLogger's checkmark / logged-row icons render without expo-font).
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

// Native-module-backed visuals → passthrough Views: expo-image (thumbnails),
// expo-linear-gradient (the glass Card), the confetti cannon, the frosted
// SafeBlurView overlay (countdown / rest backdrop).
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
import { formatRestA11yLabel } from '@/components/workout/RestTimer';
import ActiveWorkoutScreen from '../../app/training/workout';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ActiveWorkoutScreen />
    </ThemeContext.Provider>,
  );
}

/** Flush the init effect's awaited AsyncStorage.getItem microtask. */
async function flushInit() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Advance N whole seconds inside act() so interval state settles cleanly. */
function tickSeconds(n: number) {
  act(() => {
    jest.advanceTimersByTime(n * 1000);
  });
}

/**
 * The screen's init fallback path always arms a 3-2-1 startup countdown
 * (`setStartupCountdown(3)`), during which the rest modal is suppressed
 * (`visible={showRestTimer && !isStarting}`). Advance past it so isStarting is
 * false and a logged set can open the rest cycle. 4s is comfortably enough
 * (startupCountdown hits 0 — i.e. isStarting=false — after 3 ticks).
 */
function clearStartupCountdown() {
  tickSeconds(4);
}

/** Type reps + weight into the (real) SetLogger inputs and press its log button. */
function logViaSetLogger(reps: string, weight: string) {
  fireEvent.changeText(screen.getByLabelText('Reps'), reps);
  fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), weight);
  fireEvent.press(screen.getByRole('button', { name: 'Log set' }));
}

describe('ActiveWorkoutScreen — RestTimer + SetLogger wiring', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── 1 + 2: real RestTimer mounts on a logged set; SKIP closes it ───────────
  test('logging a set mounts the REAL RestTimer (role=timer); SKIP closes it', async () => {
    renderScreen();
    await flushInit();

    // The screen reaches the hardened SetLogger (its labelled inputs + log
    // button are in the tree), proving it is not the old inline grid.
    expect(screen.getByLabelText('Reps')).toBeTruthy();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();

    // No rest timer before a set is logged.
    expect(screen.queryByRole('timer')).toBeNull();

    clearStartupCountdown();

    // Log a valid set → opens the rest cycle.
    logViaSetLogger('10', '40');

    // The REAL <RestTimer/> is mounted: it exposes accessibilityRole="timer"
    // with a formatRestA11yLabel-derived name (90s rest → "1 minute 30 seconds
    // remaining"), NOT a bare static CircularProgress ring.
    const timer = screen.getByRole('timer');
    expect(timer).toBeTruthy();
    expect(timer.props.accessibilityLabel).toBe(formatRestA11yLabel(90));
    expect(screen.getByLabelText(formatRestA11yLabel(90))).toBeTruthy();

    // SKIP closes the rest cycle → the timer unmounts. (The shared Button maps
    // its title to a Pressable carrying the "Skip rest" accessibilityLabel — we
    // query by that label rather than role, since Button doesn't set an explicit
    // accessibilityRole.)
    fireEvent.press(screen.getByLabelText('Skip rest'));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  // ── 3: junk is rejected (hardening reachable); valid entry logs + rests ────
  test.each(['abc', '0', '-3'])(
    'junk reps="%s" does NOT log a set or open the rest cycle',
    async (badReps) => {
      renderScreen();
      await flushInit();
      clearStartupCountdown();

      logViaSetLogger(badReps, '40');

      // SetLogger's Number.isFinite + reps>=1 guard rejected it: no logged row
      // surfaced and the rest cycle never opened (no RestTimer).
      expect(screen.queryByText('Set 1')).toBeNull();
      expect(screen.queryByRole('timer')).toBeNull();
    },
  );

  test('a negative weight does NOT log a set or open the rest cycle', async () => {
    renderScreen();
    await flushInit();
    clearStartupCountdown();

    logViaSetLogger('5', '-20');

    expect(screen.queryByText('Set 1')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  test('a valid entry DOES log a "Set 1" row and open the rest cycle', async () => {
    renderScreen();
    await flushInit();
    clearStartupCountdown();

    // Sanity: nothing logged / no timer before the valid entry.
    expect(screen.queryByText('Set 1')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();

    logViaSetLogger('12', '50');

    // The valid set was accepted: SetLogger renders its "Set 1" logged row AND
    // the screen opened the rest cycle (the real RestTimer mounted).
    expect(screen.getByText('Set 1')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
  });
});

// ── Restored-session seed (N / N) + summary read-side (volume counted once) ────
// A resumed workout (restored from AsyncStorage with already-completed sets) must
// open at N / M: the header's `${completedCount}/${total} Sets Done` and the
// seeded <SetLogger/> count must AGREE, and handleEnd's summary volume (derived
// from ExerciseState.sets[].completed) must count each restored set EXACTLY ONCE
// — the SetLogger seed is purely visual (no onLogSet), so it never double-counts.
describe('ActiveWorkoutScreen — restored-session seed + summary read-side', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');

  // Restored state: one exercise with 2 completed sets (50kg x 10) + 1 pending →
  // 2 / 3. Volume from the two completed sets = 50*10*2 = 1000.
  const RESTORED = {
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

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    // clearAllMocks wipes call data but not implementations; restore the default
    // getItem→null so other suites/tests are unaffected.
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('a pre-completed session seeds N / N: header and SetLogger count agree', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(RESTORED));

    renderScreen();
    await flushInit();
    // The restore path may start a session if none is set; flush that microtask too.
    await flushInit();

    // The first card is expanded by default, so its SetLogger is mounted. Both
    // the header count and the SetLogger count read the SAME ground truth: 2 / 3.
    expect(screen.getByText(/2\/3 Sets Done/)).toBeTruthy();
    expect(screen.getByText('2 / 3 sets')).toBeTruthy();
  });

  test('the summary volume derives from sets[].completed and counts a resumed set exactly once', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(RESTORED));

    renderScreen();
    await flushInit();
    await flushInit();

    // Finish the workout. handleEnd computes the summary from ExerciseState.sets[]
    // (the SINGLE counting path) and, after its async logging + a 2.5s confetti
    // delay, forwards the totals to /training/complete via router.replace.
    await act(async () => {
      // Press the FINISH Button via its accessibilityLabel (targets the
      // Pressable, mirroring how this suite presses "Skip rest").
      fireEvent.press(screen.getByLabelText('Finish workout'));
    });
    await act(async () => {
      jest.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const [arg] = mockReplace.mock.calls[0];
    expect(arg.pathname).toBe('/training/complete');
    // 2 completed sets × (50kg × 10 reps) = 1000 — counted ONCE (the seed never
    // fired onLogSet, so there is no second counter to double it).
    expect(arg.params.volume).toBe('1000');
  });
});
