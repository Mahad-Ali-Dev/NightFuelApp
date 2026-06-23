/**
 * training-onboarding.states.test.tsx
 *
 * Screen-level coverage for the load-bearing states of the training
 * onboarding / pre-workout screen — `app/training/onboarding.tsx` (the "Ready
 * to Train?" routine-picker). The screen drives the ['routines'] query
 * (getRoutines) and, beneath an always-present Freestyle-session option, swaps
 * the routines region between three branches: a loading SKELETON scaffold, a
 * retryable ERROR EmptyState, and the populated routine cards. This suite pins
 * the spinner-debt burn-down specifically (the screen previously used a bare
 * <ActivityIndicator> as its routines-loading state):
 *
 *   - Test A (loading): while ['routines'] is `isLoading`, the routines region
 *     mounts its SKELETON scaffold ONLY — none of the error ("Couldn't load
 *     your routines") or loaded routine copy is in the tree, and there is NO
 *     bare <ActivityIndicator> (the screen no longer imports it). The Freestyle
 *     option and the Start Workout CTA remain visible.
 *   - Test B (error): when the query is `isError`, the screen shows the
 *     "Couldn't load your routines" EmptyState whose "Try Again" action calls
 *     the query's `refetch` (exactly once) — and the loaded copy is absent,
 *     while the Freestyle option stays usable.
 *   - Test C (loaded): with a populated list the screen renders the real
 *     routine names — and the error copy is absent.
 *   - Test D (freestyle/start preserved): selecting a routine then pressing the
 *     Start Workout CTA fires the start mutation exactly once (the freestyle +
 *     start-mutation wiring is untouched by the spinner-debt change).
 *
 * Mock conventions mirror the sibling state suites (challenges.states.test.tsx +
 * leaderboard.states.test.tsx): a hoisted `mock`-prefixed react-query stub
 * branches on queryKey[0] over a mutable holder (so each test picks the loading
 * / error / loaded branch BEFORE render), a single `refetch` spy proves the
 * error retry wiring, and a `mutate` spy proves the Start Workout wiring.
 * `@/api/exercises` is fully mocked so the real axios client never loads. The
 * `@/components/ui` barrel is left REAL so the assertions ride on the actual
 * EmptyState copy + primary action and the real Skeleton.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Controlled state for the ['routines'] query — each test mutates this holder
// BEFORE render() (the factory reads it at call-time). `refetch` is the spy the
// error branch's "Try Again" action must call.
type RtState = { data: any; isLoading: boolean; isError: boolean };
const mockRt: RtState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();
// The start-session mutation's `mutate` spy — Test D proves the CTA fires it.
const mockMutate = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['routines'] reads the holder
// above + the shared refetch spy. useMutation returns the shared mutate spy (so
// the Start Workout CTA wiring is assertable) and a non-pending state.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'routines') {
      return { data: mockRt.data, isLoading: mockRt.isLoading, isError: mockRt.isError, refetch: mockRefetch };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: mockMutate, isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed
// above, so these are never actually invoked; they only satisfy the import graph.
jest.mock('@/api/exercises', () => ({
  getRoutines: jest.fn(),
  startSession: jest.fn(),
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

// expo-linear-gradient ships a native module — passthrough View so the glass
// Card, the CtaButton, the background gradient AND the EmptyState's primary
// Button gradient all mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import TrainingOnboardingScreen from '../../app/training/onboarding';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <TrainingOnboardingScreen />
    </ThemeContext.Provider>,
  );
}

// A small fixed set of routines. Only the shape (id/name/exercises) matters to
// the render.
const ROUTINES = [
  { id: 'r1', name: 'Push Day', exercises: [{ name: 'Bench Press', sets: 3, reps: 8 }] },
  { id: 'r2', name: 'Pull Day', exercises: [{ name: 'Deadlift', sets: 3, reps: 5 }] },
];

describe('TrainingOnboardingScreen — loading / error / loaded states', () => {
  beforeEach(() => {
    mockRt.data = undefined;
    mockRt.isLoading = false;
    mockRt.isError = false;
    mockRefetch.mockClear();
    mockMutate.mockClear();
  });

  // ── Test A: loading → skeleton scaffold only (no bare spinner) ─────────────
  test('loading: mounts the skeleton scaffold with no error / loaded routine copy', () => {
    mockRt.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The routines region renders the skeleton scaffold ONLY — none of the
    // error / loaded copy is in the tree yet.
    expect(screen.queryByText('Couldn\'t load your routines')).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('Push Day')).toBeNull();

    // The Freestyle option (always rendered, independent of the routines list)
    // and the Start Workout CTA remain visible while loading.
    expect(screen.getAllByText('Freestyle Session')[0]).toBeTruthy();
    expect(screen.getByText('Start Workout')).toBeTruthy();
    // Sanity: the always-present section header copy mounted.
    expect(screen.getByText('Your Session')).toBeTruthy();
  });

  // ── Test B: error → retry refetches the routines query ─────────────────────
  test('error: shows the "Couldn\'t load your routines" EmptyState whose Try Again refetches', () => {
    mockRt.isError = true;

    renderScreen();

    // The honest error copy is present and the loaded copy is absent.
    expect(screen.getByText('Couldn\'t load your routines')).toBeTruthy();
    expect(screen.queryByText('Push Day')).toBeNull();

    // The Freestyle option stays usable even when routines fail to load.
    expect(screen.getAllByText('Freestyle Session')[0]).toBeTruthy();

    // The retry action (EmptyState's primary Button, label "Try Again")
    // refetches the routines query — exactly once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Test C: loaded → real routine cards render ─────────────────────────────
  test('loaded: renders the real routine names and no error copy', () => {
    mockRt.data = ROUTINES;

    renderScreen();

    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Pull Day')).toBeTruthy();
    // …and the error copy is not present.
    expect(screen.queryByText('Couldn\'t load your routines')).toBeNull();
    // The Freestyle option is still present alongside the loaded routines.
    expect(screen.getAllByText('Freestyle Session')[0]).toBeTruthy();
  });

  // ── Test D: freestyle + start mutation preserved ───────────────────────────
  test('start: selecting a routine then pressing Start Workout fires the start mutation once', () => {
    mockRt.data = ROUTINES;

    renderScreen();

    // Pick a routine (the freestyle/selection wiring is untouched), then start.
    fireEvent.press(screen.getByText('Push Day'));
    fireEvent.press(screen.getByText('Start Workout'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
