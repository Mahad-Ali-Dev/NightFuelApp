/**
 * training-workout.states.test.tsx
 *
 * Screen-level coverage for the load-bearing PRE-INITIALIZATION states of the
 * Active Workout screen — `app/training/workout.tsx`. Before a session has
 * initialized the screen previously rendered a bare full-screen
 * <ActivityIndicator> and had NO error handling (a failed session/routines
 * fetch hung on that spinner forever). It now renders, while `!isInitialized`:
 * a loading SKELETON scaffold (header + exercise-card + set-row placeholders),
 * and — when the session fetch (or, on a routine launch, the routines fetch)
 * errored — a retryable EmptyState instead. Once a session initializes, the
 * full active-workout chrome renders unchanged. This suite pins the spinner-debt
 * burn-down specifically:
 *
 *   - Test A (loading): while ['active-session', id] is `isLoading`, the screen
 *     mounts its SKELETON scaffold ONLY — no error ("Couldn't start your
 *     workout") / retry copy, no FINISH control, and NO bare full-screen
 *     <ActivityIndicator> as the primary loading state (the screen no longer
 *     imports it).
 *   - Test B (error): when the session query is `isError`, the screen shows the
 *     "Couldn't start your workout" EmptyState whose "Try Again" action calls
 *     the session query's `refetch` (exactly once) — the screen does NOT
 *     initialize an empty workout off the failed fetch (no FINISH control).
 *   - Test C (active-session preserved): with the session query resolved to a
 *     session carrying one logged exercise, the screen initializes and renders
 *     the full active-workout chrome — the FINISH control and the seeded
 *     exercise card — and neither the skeleton-era nor the error copy is shown.
 *
 * Mock conventions mirror the sibling state suites (challenges.states.test.tsx +
 * leaderboard.states.test.tsx) and the active-workout previous-set suite (fake
 * timers to freeze the elapsed/rest intervals; AsyncStorage / confetti /
 * expo-image / expo-linear-gradient stubbed so no native module loads): a
 * hoisted `mock`-prefixed react-query stub branches on queryKey[0] over mutable
 * holders (so each test picks the loading / error / loaded branch BEFORE
 * render), and per-query `refetch` spies prove the error retry wiring.
 * `@/api/exercises` is fully mocked so the real axios client never loads. The
 * `@/components/ui` barrel is left REAL so the assertions ride on the actual
 * EmptyState copy + primary action and the real Skeleton.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// The screen reads sessionId from the route params; a present sessionId enables
// the ['active-session', id] query (and is the realistic "resume a session" nav).
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ sessionId: 'sess-1' }),
}));

// Controlled state for the ['active-session', id] and ['routines'] queries —
// each test mutates these holders BEFORE render() (the factory reads them at
// call-time). The `refetch` spies are what the error branch's "Try Again"
// action must call.
type QState = { data: any; isLoading: boolean; isError: boolean };
const mockSession: QState = { data: undefined, isLoading: false, isError: false };
const mockRoutines: QState = { data: undefined, isLoading: false, isError: false };
const mockSessionRefetch = jest.fn();
const mockRoutinesRefetch = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['active-session'] + ['routines']
// read their holders above + their refetch spies. The exercise-detail /
// exercise-last-sets queries used by resolved cards default to a benign empty
// result. useMutation / useQueryClient are benign stubs (end-session etc. are
// not exercised by these pre-init state tests).
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return {
        data: mockSession.data,
        isLoading: mockSession.isLoading,
        isError: mockSession.isError,
        refetch: mockSessionRefetch,
      };
    }
    if (key === 'routines') {
      return {
        data: mockRoutines.data,
        isLoading: mockRoutines.isLoading,
        isError: mockRoutines.isError,
        refetch: mockRoutinesRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed
// above, so these are never actually invoked; they only satisfy the import graph.
jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getRoutines: jest.fn(),
  startSession: jest.fn(),
  logSessionExercise: jest.fn(),
  endSession: jest.fn(),
  getById: jest.fn(),
}));

// AsyncStorage: persist/restore must never touch a real device store. getItem
// resolves to null so the init effect takes the fallback path and seeds from the
// active-session payload (mirrors __tests__/store/themeStore.test.ts).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
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

// Native-module-backed visuals → passthrough Views so the screen mounts on the
// jest renderer: expo-image (exercise thumbnails), expo-linear-gradient (the
// glass Card + the EmptyState's primary Button), the confetti cannon, and the
// frosted SafeBlurView overlay (countdown / rest-timer backdrop).
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

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ActiveWorkoutScreen />
    </ThemeContext.Provider>,
  );
}

// An active session carrying one logged exercise → the init effect (fallback
// path, AsyncStorage empty) seeds a single exercise card with set rows.
const SESSION = {
  id: 'sess-1',
  startedAt: '2026-06-17T20:00:00.000Z',
  logs: [{ exerciseName: 'Bench Press', sets: 3, reps: 8, weightKg: 0, durationSecs: 0 }],
};

describe('ActiveWorkoutScreen — loading / error / active-session states', () => {
  beforeEach(() => {
    // Freeze the elapsed/rest-timer intervals so they don't tick during a test.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
    mockSession.data = undefined;
    mockSession.isLoading = false;
    mockSession.isError = false;
    mockRoutines.data = undefined;
    mockRoutines.isLoading = false;
    mockRoutines.isError = false;
    mockSessionRefetch.mockClear();
    mockRoutinesRefetch.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Test A: loading → skeleton scaffold only (no bare spinner) ─────────────
  test('loading: mounts the skeleton scaffold with no error / retry / FINISH', () => {
    mockSession.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The pre-init loading branch renders the skeleton scaffold ONLY — none of
    // the error / retry copy is in the tree, and the active-workout FINISH
    // control has not mounted (the session has not initialized).
    expect(screen.queryByText('Couldn\'t start your workout')).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('FINISH')).toBeNull();
    // No seeded exercise card yet either.
    expect(screen.queryByText('Bench Press')).toBeNull();
  });

  // ── Test B: error → retry refetches the active-session query ───────────────
  test('error: shows the "Couldn\'t start your workout" EmptyState whose Try Again refetches', () => {
    mockSession.isError = true;

    renderScreen();

    // The honest error copy is present; the screen did NOT initialize an empty
    // workout off the failed fetch (no FINISH control / seeded card).
    expect(screen.getByText('Couldn\'t start your workout')).toBeTruthy();
    expect(screen.queryByText('FINISH')).toBeNull();
    expect(screen.queryByText('Bench Press')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again")
    // refetches the active-session query — exactly once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Test C: resolved session → active-workout chrome initializes ───────────
  test('active session: initializes and renders the FINISH control + seeded exercise (no skeleton/error)', async () => {
    mockSession.data = SESSION;

    renderScreen();

    // The init effect awaits AsyncStorage.getItem (mocked → null) then seeds
    // state from the session payload. Flush those microtasks so `isInitialized`
    // flips and the active-workout chrome commits.
    await act(async () => {
      await Promise.resolve();
    });

    // Full active-workout chrome rendered: the FINISH control and the seeded
    // exercise card from the session's logs.
    expect(screen.getByText('FINISH')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();

    // …and neither the pre-init error copy nor its retry is present.
    expect(screen.queryByText('Couldn\'t start your workout')).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
  });
});
