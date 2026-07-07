/**
 * exercise-detail.test.tsx
 *
 * Verify-only lock on four behaviours of `app/(exercises)/[id].tsx` that no
 * other suite covers:
 *
 *   - the verified:false "Unreviewed" demo badge (a11y label
 *     "Demo not yet human-reviewed") rendered when the curated entry's
 *     `verified` flag is false;
 *   - the not-found <EmptyState> ("Exercise not found") shown when the
 *     exercise-detail query resolves to no data;
 *   - the Progress tab's error branch — a retryable "Couldn't load progress"
 *     <EmptyState> whose Retry calls the exercise-analytics query's refetch;
 *   - the footer "Log this exercise" CTA pushing to '/training/workout' with
 *     the exercise NAME as the `exercise` param.
 *
 * DISJOINT-BY-MOCK: the sibling `__tests__/constants/curatedDemos-resolution`
 * suite drives the SAME screen against the REAL `@/constants/curatedDemos`
 * data (it owns that data item). To stay disjoint — and to force the
 * verified:false badge path WITHOUT touching that real source file or any
 * `verified` flag — this suite MOCKS `@/constants/curatedDemos` so
 * `getCuratedDemoVerified()` simply returns false. Nothing here reads or flips
 * a real `verified:false → true` anywhere; the badge is exercised purely
 * through the mocked accessor.
 *
 * Navigation is asserted through a hoisted `mockPush` holder and the analytics
 * Retry through a hoisted `mockAnalyticsRefetch` holder (the `mock` prefix lets
 * babel-plugin-jest-hoist allow the hoisted factories to close over them), so a
 * regression that drops the badge, the not-found state, the progress Retry
 * wiring, or the workout push turns RED.
 *
 * Mock conventions mirror the sibling screen suites (shift-detail / calendar /
 * dashboard) and the hoisted-holder pattern in those files.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so the log-this case
// can assert exactly where (and with what params) the footer CTA navigated.
// `back`/`replace` are benign no-ops the screen's other controls call. The :id
// param feeds the (fully-stubbed) exercise-detail query, so any stable string
// works.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'ex-1' }),
}));

// Controlled state for the ['exercise-detail', …] query — each test drives the
// populated / not-found branch by mutating this holder before render().
type ExerciseState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockExercise: ExerciseState = {
  data: undefined,
  isLoading: false,
  isError: false,
};

// Controlled state for the ['exercise-analytics', …] query — its own holder so
// the progress-error case is independent of the exercise holder.
// `mockAnalyticsRefetch` is the spy the error branch's Retry must call.
type AnalyticsState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockAnalytics: AnalyticsState = {
  data: undefined,
  isLoading: false,
  isError: false,
};
const mockAnalyticsRefetch = jest.fn();

// react-query: branch on queryKey[0]. ['exercise-detail'] reads the mutable
// exercise holder; ['exercise-analytics'] reads the separate analytics holder
// (with its own refetch spy). Both are read at call-time, so a test that
// mutates a holder before render() sees its chosen branch. `enabled` is ignored
// on purpose — the holders fully control each branch. (`mock`-prefixed holders
// satisfy babel-plugin-jest-hoist.)
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'exercise-detail') {
      return {
        data: mockExercise.data,
        isLoading: mockExercise.isLoading,
        isError: mockExercise.isError,
        refetch: jest.fn(),
      };
    }
    if (key === 'exercise-analytics') {
      return {
        data: mockAnalytics.data,
        isLoading: mockAnalytics.isLoading,
        isError: mockAnalytics.isError,
        refetch: mockAnalyticsRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// The API module is statically imported by the screen; stub the two named
// exports so the real axios client never loads. useQuery is mocked above so
// these are never actually invoked — they only satisfy the import graph.
jest.mock('@/api/exercises', () => ({
  getById: jest.fn(),
  getAnalytics: jest.fn(),
}));

// CRITICAL: mock the curated-demo accessors so the verified:false badge path is
// forced WITHOUT touching the real source file (keeping this suite disjoint
// from the curated-demos data item). `getCuratedDemoVerified` → false lights
// the "Unreviewed" badge; the demo-source accessors return null so the
// precedence walk falls through cleanly to the (mocked) <ExerciseDemo/>.
jest.mock('@/constants/curatedDemos', () => ({
  getCuratedDemo: () => null,
  getCuratedDemoFrames: () => null,
  getCuratedDemoVerified: () => false,
}));

// exerciseDemos resolvers → null so no in-app frames / youtube URL resolve;
// tipsFor returns a single generic cue so the tips/how-to branches render
// without pulling the real (data-heavy) demo maps.
jest.mock('@/constants/exerciseDemos', () => ({
  resolveDemo: () => null,
  resolveDemoFrames: () => null,
  tipsFor: () => ({ tips: ['cue'], isGeneral: true }),
}));

// <ExerciseDemo/> mounts a native image loader; replace it with a no-op View so
// the screen mounts on the jest renderer. Its props are irrelevant here.
jest.mock('@/components/exercise/ExerciseDemo', () => {
  const RN = require('react-native');
  return { ExerciseDemo: () => <RN.View /> };
});

// react-native-gifted-charts ships a native dep; stub LineChart to a host view.
// (Not reached in the asserted branches, but the screen imports it at module
// top, so it must be stubbed for the import graph.)
jest.mock('react-native-gifted-charts', () => {
  const RN = require('react-native');
  return { LineChart: (props: any) => <RN.View {...props} /> };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the rest of
// the suite). Otherwise pulls in expo-font → expo-asset.
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

// expo-linear-gradient ships a native module; replace <LinearGradient> with a
// passthrough View so the footer fade + the primary <Button> gradient mount on
// the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

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
import ExerciseDetailScreen from '../../app/(exercises)/[id]';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ExerciseDetailScreen />
    </ThemeContext.Provider>,
  );
}

// A populated exercise used by the badge / progress / log-this cases. Minimal
// shape — only the fields the screen reads on those paths.
const EXERCISE = { id: 'ex-1', name: 'Barbell Curl', difficulty: 'Beginner' };

describe('ExerciseDetailScreen — verify-only behaviour lock', () => {
  beforeEach(() => {
    mockExercise.data = undefined;
    mockExercise.isLoading = false;
    mockExercise.isError = false;
    mockAnalytics.data = undefined;
    mockAnalytics.isLoading = false;
    mockAnalytics.isError = false;
    mockAnalyticsRefetch.mockClear();
    mockPush.mockClear();
  });

  // ── (i) verified:false "Unreviewed" badge ─────────────────────────────────
  test('renders the verified:false "Unreviewed" badge (a11y "Demo not yet human-reviewed")', () => {
    mockExercise.data = { ...EXERCISE };

    renderScreen();

    // The badge container carries the long-form a11y label so screen-reader
    // users get the full meaning…
    expect(screen.getByLabelText('Demo not yet human-reviewed')).toBeTruthy();
    // …and the visible chip copy is the short "Unreviewed" token.
    expect(screen.getByText('Unreviewed')).toBeTruthy();
  });

  // ── (ii) not-found EmptyState ──────────────────────────────────────────────
  test('no exercise data → "Exercise not found" EmptyState', () => {
    mockExercise.data = undefined;
    mockExercise.isLoading = false;

    expect(() => renderScreen()).not.toThrow();

    // The not-found EmptyState copy is present (the screen returns it when
    // `!exercise` and it is not loading).
    expect(screen.getByText('Exercise not found')).toBeTruthy();
    // Sanity: the populated-only badge is absent in the not-found state.
    expect(screen.queryByText('Unreviewed')).toBeNull();
  });

  // ── (iii) Progress tab error → retryable EmptyState wired to refetch ───────
  test('Progress tab error → "Couldn\'t load progress" EmptyState whose Retry calls analytics refetch', () => {
    mockExercise.data = { ...EXERCISE };
    mockAnalytics.isError = true;

    renderScreen();

    // Switch to the Progress tab (accessibilityRole="tab", label "Progress").
    fireEvent.press(screen.getByLabelText('Progress'));

    // The analytics error branch renders the retryable connection-error copy.
    expect(screen.getByText("Couldn't load progress")).toBeTruthy();

    // Retry is wired to the exercise-analytics query's refetch — and only that.
    fireEvent.press(screen.getByText('Retry'));
    expect(mockAnalyticsRefetch).toHaveBeenCalledTimes(1);
  });

  // ── (iv) footer "Log this exercise" → /training/workout push ───────────────
  test('footer "Log this exercise" pushes to /training/workout with the exercise name param', () => {
    mockExercise.data = { ...EXERCISE };

    renderScreen();

    // The footer CTA exposes accessibilityLabel="Log this exercise" (distinct
    // from the progress-empty state's "Log This Exercise" actionLabel, which is
    // not mounted on the default 'howto' tab).
    fireEvent.press(screen.getByLabelText('Log this exercise'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/training/workout',
      params: { exercise: 'Barbell Curl' },
    });
  });
});
