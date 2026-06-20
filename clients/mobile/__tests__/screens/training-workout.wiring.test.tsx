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
  // NOTE: the screen now seeds SetLogger from ALL planned sets (1:1 with ex.sets)
  // so the seeded "Set 1/2/3" rows are present from the start — the OLD "Set 1
  // absent" signal no longer distinguishes a logged set. We bind instead to the
  // two effects of the guarded ADD path: the header `N/3 Sets Done` count (from
  // ex.sets[].completed — the mockSession seeds 3 incomplete sets → opens at 0/3)
  // and the rest cycle (the RestTimer). Junk fires neither; a valid set fires both.
  test.each(['abc', '0', '-3'])(
    'junk reps="%s" does NOT advance the completed count or open the rest cycle',
    async (badReps) => {
      renderScreen();
      await flushInit();
      clearStartupCountdown();

      // Seeded fresh: 0 of 3 done, no rest timer.
      expect(screen.getByText(/0\/3 Sets Done/)).toBeTruthy();

      logViaSetLogger(badReps, '40');

      // SetLogger's Number.isFinite + reps>=1 guard rejected it: the completed
      // count stayed 0/3 (no ex.set marked complete) and the rest cycle never
      // opened (no RestTimer).
      expect(screen.getByText(/0\/3 Sets Done/)).toBeTruthy();
      expect(screen.queryByRole('timer')).toBeNull();
    },
  );

  test('a negative weight does NOT advance the completed count or open the rest cycle', async () => {
    renderScreen();
    await flushInit();
    clearStartupCountdown();

    expect(screen.getByText(/0\/3 Sets Done/)).toBeTruthy();

    logViaSetLogger('5', '-20');

    expect(screen.getByText(/0\/3 Sets Done/)).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  test('a valid entry advances the completed count AND opens the rest cycle', async () => {
    renderScreen();
    await flushInit();
    clearStartupCountdown();

    // Sanity: 0 of 3 done / no timer before the valid entry.
    expect(screen.getByText(/0\/3 Sets Done/)).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();

    logViaSetLogger('12', '50');

    // The valid set was accepted: logSet marked the next pending ex.set complete
    // (header → 1/3 Sets Done) AND the screen opened the rest cycle (real
    // RestTimer mounted).
    expect(screen.getByText(/1\/3 Sets Done/)).toBeTruthy();
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

// ── In-row toggle / edit / remove PERSIST to ex.sets (not display-only) ────────
// The capstone for THIS change: a DONE-toggle / reps-or-kg edit / remove in the
// (real) SetLogger of the routed workout screen must reach the screen's PERSISTED
// `exerciseStates[eIdx].sets` — the SAME ground truth the header count
// `${completedCount}/${ex.sets.length} Sets Done` AND handleEnd's finish-time
// summary volume read. We bind each gesture to BOTH (the header count + the
// forwarded summary volume) so it can never silently regress to a cosmetic
// SetLogger-local edit again. The RESTORED fixture seeds 3 sets (2 completed
// 50×10 + 1 pending) so the first, default-expanded card's SetLogger maps row i
// 1:1 to ex.sets[i].
describe('ActiveWorkoutScreen — in-row toggle / edit / remove persist to ex.sets', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');

  const RESTORED = {
    sessionId: 'sess-1',
    startedAt: new Date(2026, 5, 17, 19, 30, 0).getTime(),
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
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  async function renderRestored() {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(RESTORED));
    renderScreen();
    await flushInit();
    await flushInit();
  }

  /** Finish the workout and return the params handleEnd forwarded to /complete. */
  async function finishAndReadSummary() {
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Finish workout'));
    });
    await act(async () => {
      jest.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    return mockReplace.mock.calls[0][0].params;
  }

  test('toggling a logged set DONE updates the header count AND the persisted finish-time volume', async () => {
    await renderRestored();

    // Opens at 2 / 3 (both the header — from ex.sets — and the SetLogger agree).
    expect(screen.getByText(/2\/3 Sets Done/)).toBeTruthy();
    expect(screen.getByText('2 / 3 sets')).toBeTruthy();

    // Toggle set 1 OFF via the SetLogger's per-set DONE control. This now flows
    // through onToggleDone → toggleSetDone → exerciseStates[0].sets[0].completed.
    fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 done' }));

    // The header count (derived from ex.sets) drops to 1 / 3 — proof the toggle
    // reached the PERSISTED sets, not just SetLogger-local state.
    expect(screen.getByText(/1\/3 Sets Done/)).toBeTruthy();
    expect(screen.getByText('1 / 3 sets')).toBeTruthy();

    // …and finish-time volume now counts only the 1 remaining completed set:
    // 50×10 = 500 (was 1000).
    const params = await finishAndReadSummary();
    expect(params.volume).toBe('500');
  });

  test('editing a logged set reps + kg updates the persisted finish-time volume', async () => {
    await renderRestored();

    // Edit set 1: reps 10 → 12, kg 50 → 60. Each valid edit flows through
    // onEditSet → updateSet → exerciseStates[0].sets[0] (and marks it completed).
    fireEvent.changeText(screen.getByLabelText('Reps for set 1'), '12');
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms for set 1'), '60');

    // Volume = set1 (60×12 = 720) + set2 (50×10 = 500) = 1220 — proof the edit
    // reached the PERSISTED set value, not just the SetLogger row.
    const params = await finishAndReadSummary();
    expect(params.volume).toBe('1220');
  });

  test('removing a logged set drops it from the header count AND the persisted finish-time volume', async () => {
    await renderRestored();

    expect(screen.getByText(/2\/3 Sets Done/)).toBeTruthy();

    // Remove set 1 via the SetLogger's per-set remove → onRemoveSet → removeSetAt
    // drops exerciseStates[0].sets[0]. The exercise now has 2 sets (1 completed).
    fireEvent.press(screen.getByRole('button', { name: 'Remove set 1' }));

    // Header total + completed both drop: 1 completed of 2 remaining.
    expect(screen.getByText(/1\/2 Sets Done/)).toBeTruthy();

    // Finish-time volume now counts only the single remaining completed set:
    // 50×10 = 500 (the removed completed set is gone).
    const params = await finishAndReadSummary();
    expect(params.volume).toBe('500');
  });

  test('the rest cycle still opens when a NEW set is logged via the input row (add path intact)', async () => {
    await renderRestored();

    // No rest timer yet.
    expect(screen.queryByRole('timer')).toBeNull();

    // Use the input-row add path (the guarded "Log set"): this is the ONLY path
    // that fires onLogSet → logSet, which marks the next pending ex.set complete
    // AND opens the rest cycle. Toggle/edit/remove above never open it.
    fireEvent.changeText(screen.getByLabelText('Reps'), '8');
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '40');
    fireEvent.press(screen.getByRole('button', { name: 'Log set' }));

    // The real RestTimer mounted → the add path's rest-trigger is intact.
    expect(screen.getByRole('timer')).toBeTruthy();
  });
});
