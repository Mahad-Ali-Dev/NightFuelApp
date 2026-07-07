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

// Mutable result for the ['active-session'] query. Defaults to `mockSession`
// (the single Bench Press log the previous-set tests rely on); the demo tests
// swap in a session seeded with a different exercise name. Reset in beforeEach.
type SessionState = { data: typeof mockSession };
const mockSessionState: SessionState = { data: mockSession };

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return { data: mockSessionState.data, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'exercise-last-sets') {
      return { data: mockLastSetsState.data, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  // The screen's Finish handler now grabs a query client to invalidate the
  // active-session / exercise-history caches after persisting. These render
  // tests never press Finish, so a benign stub whose invalidateQueries is a
  // no-op jest.fn is enough for the hook to resolve at mount.
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getLastSet: jest.fn(),
  // Finish-time persistence helpers — never invoked by these mount-only render
  // tests (Finish is not pressed), present purely so the import resolves.
  logSessionExercise: jest.fn(),
  endSession: jest.fn(),
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

// The exercise cards now render <ExerciseDemo/>, which pulls in expo-image and
// expo-linear-gradient. Both use native loaders that never run under jest, so
// replace them with passthrough host <View>s (same convention as
// a11y-controls.test.tsx / ExerciseDemo.test.tsx). The stable `testID` on the
// image lets us assert that a demo player actually mounted.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View testID="exercise-demo-image" {...props} /> };
});

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
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
    // Restore the default single-Bench-Press session each test.
    mockSessionState.data = mockSession;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('history PRESENT → set 1 shows the real "last time: {weight}x{reps}" from analytics', () => {
    // Most-recent cross-session set for Bench Press: 60kg x 8 reps.
    mockLastSetsState.data = { 'Bench Press': { weightKg: 60, reps: 8 } };

    renderScreen();

    // The exercise card seeded from the active session.
    expect(screen.getAllByText('Bench Press')[0]).toBeTruthy();

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

    expect(screen.getAllByText('Bench Press')[0]).toBeTruthy();

    // No fabricated previous-set label anywhere on the screen.
    expect(screen.queryByText(/last time:/)).toBeNull();

    // Both set rows fall back to the honest '-' (set 1: no history; set 2: no
    // in-session prior values). This would FAIL if a placeholder were fabricated.
    expect(screen.getAllByText('-').length).toBe(2);
  });
});

// Build a one-log active session seeded with the given exercise name so each
// demo test drives a single card whose demo resolves purely from that name.
function sessionWithExercise(name: string): typeof mockSession {
  return {
    ...mockSession,
    logs: [{ exerciseName: name, sets: 2, reps: 8, weightKg: 0, durationSecs: 0 }],
  };
}

describe('Active Workout — in-app exercise demo (real media, no empty player)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
    mockLastSetsState.data = {};
    mockSessionState.data = mockSession;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a curated movement ("Barbell Bench Press") renders a real demo player', () => {
    // "Barbell Bench Press" resolves to a free-exercise-db [0.jpg, 1.jpg] frame
    // pair (via resolveDemoFrames' curated map, with getCuratedDemo as the
    // additive fallback) — i.e. an animated in-app demo, NOT the coming-soon
    // placeholder.
    mockSessionState.data = sessionWithExercise('Barbell Bench Press');

    renderScreen();

    // The card seeded from the active session.
    expect(screen.getAllByText('Barbell Bench Press')[0]).toBeTruthy();

    // <ExerciseDemo/> mounted: at least one frame <Image> (mocked with this
    // testID) is present. A two-frame animated loop renders two such nodes.
    expect(screen.getAllByTestId('exercise-demo-image').length).toBeGreaterThan(0);

    // It is the ANIMATED demo, not the static "coming soon" fallback: the
    // looping player shows a "Demo" status tag and no "coming soon" copy.
    expect(screen.getByText('Demo')).toBeTruthy();
    expect(screen.queryByText('Video demo coming soon')).toBeNull();
  });

  test('an exercise with no demo renders the honest "coming soon" region, never an empty player', () => {
    // A name that matches nothing in DEMO_FRAMES / the FEDB name index /
    // DEMO_FALLBACK / the curated map → no frames, no gif, no tutorial URL.
    mockSessionState.data = sessionWithExercise('Zzz Imaginary Lift 9000');

    renderScreen();

    expect(screen.getAllByText('Zzz Imaginary Lift 9000')[0]).toBeTruthy();

    // The player still renders (the bundled-fallback still image is present) and
    // is announced as a labelled region — it is NOT an empty/blank box.
    expect(screen.getByLabelText('Exercise demo')).toBeTruthy();
    expect(screen.getByTestId('exercise-demo-image')).toBeTruthy();

    // The honest "coming soon" state is shown instead of a (non-existent)
    // animated loop. No "Demo" status tag from the animated branch.
    expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    expect(screen.queryByText('Demo')).toBeNull();
  });
});
