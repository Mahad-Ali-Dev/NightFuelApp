/**
 * Render tests for the Active Workout modal's cross-session "previous set"
 * (`app/(modals)/active-workout.tsx`).
 *
 * The screen used to derive the per-row "previous" hint ONLY from earlier sets
 * within the CURRENT session (and fell back to '-' for set 1, since the
 * active-session payload carries no history). It now batch-fetches the most-
 * recent logged set per exercise from the EXISTING analytics endpoint
 * (`GET /v1/exercises/analytics/:exerciseName`, surfaced as
 * `getLastSet(exerciseName)` in src/api/exercises.ts) and shows a REAL
 * "last time: {weight}x{reps}" on set 1 — falling back to '-' only when there is
 * genuinely no history. Crucially it must NEVER fabricate a number.
 *
 * We pin both branches:
 *   (a) HISTORY PRESENT — the ['exercise-last-sets', …] query yields
 *       { 'Bench Press': { weightKg: 60, reps: 8 } }; set 1 must show the real
 *       "last time: 60x8", sourced from analytics (not the in-session '-').
 *   (b) HISTORY ABSENT — the same query yields {} (empty history); set 1 must
 *       show '-' and NO fabricated "last time:" string.
 *
 * Mocks (same conventions as the dashboard/calendar suites):
 *  - `@tanstack/react-query` useQuery → a synchronous switch on queryKey[0].
 *    `['active-session']` returns a session whose single log seeds one exercise
 *    with two sets; `['exercise-last-sets', …]` returns a mutable
 *    `mockLastSetsState` object each test sets. (Effect-seeded exercise state is
 *    flushed by RNTL's `render`, which wraps in `act`.)
 *  - `@/api/exercises` getActiveSession / getLastSet → jest.fns (never actually
 *    called; useQuery is fully stubbed) just so the import resolves.
 *  - expo-router, @expo/vector-icons, react-native-safe-area-context — stubbed
 *    exactly as the sibling screen tests do.
 *
 * Fake timers freeze the screen's elapsed/rest intervals so they don't leak
 * between tests.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// A single active-session exercise → one card with two set rows. weightKg is
// left 0 so the inputs start empty and the set-1 "previous" hint comes purely
// from the analytics-backed history (not a seeded value).
const mockSession = {
  id: 'sess-1',
  startedAt: '2026-06-17T20:00:00.000Z',
  logs: [
    { exerciseName: 'Bench Press', sets: 2, reps: 8, weightKg: 0, durationSecs: 0 },
  ],
};

// Mutable result for the ['exercise-last-sets', …] query — each test sets it.
type LastSetsState = { data: Record<string, { weightKg: number; reps: number } | null> };
const mockLastSetsState: LastSetsState = { data: {} };

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return { data: mockSession, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'exercise-last-sets') {
      return { data: mockLastSetsState.data, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getLastSet: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Decorative glyphs; stub to plain text so the icon name is assertable.
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

describe('Active Workout — cross-session "previous set" from analytics', () => {
  beforeEach(() => {
    // Freeze the elapsed/rest-timer intervals so they don't tick during a test.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
    mockLastSetsState.data = {};
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('history PRESENT → set 1 shows the real "last time: {weight}x{reps}" from analytics', () => {
    // Most-recent cross-session set for Bench Press: 60kg x 8 reps.
    mockLastSetsState.data = { 'Bench Press': { weightKg: 60, reps: 8 } };

    renderScreen();

    // The exercise card seeded from the active session.
    expect(screen.getByText('Bench Press')).toBeTruthy();

    // Set 1 surfaces the REAL previous weight x reps sourced from analytics.
    expect(screen.getByText('last time: 60x8')).toBeTruthy();

    // It is NOT the bare in-session '-' for set 1 (the old behaviour). There is
    // exactly one set with no history backing it (set 2, no in-session prior
    // values yet) → a single '-'. The set-1 hint must therefore NOT be '-'.
    expect(screen.getAllByText('-').length).toBe(1);
  });

  test('history ABSENT → set 1 shows "-" and never a fabricated "last time:" number', () => {
    // No history for any exercise.
    mockLastSetsState.data = {};

    renderScreen();

    expect(screen.getByText('Bench Press')).toBeTruthy();

    // No fabricated previous-set label anywhere on the screen.
    expect(screen.queryByText(/last time:/)).toBeNull();

    // Both set rows fall back to the honest '-' (set 1: no history; set 2: no
    // in-session prior values). This would FAIL if a placeholder were fabricated.
    expect(screen.getAllByText('-').length).toBe(2);
  });
});
