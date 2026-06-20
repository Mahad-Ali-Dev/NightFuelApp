/**
 * Render tests for the Nutrition hub's loading / error / empty / filled states
 * (`app/(tabs)/nutrition.tsx`).
 *
 * Mirrors __tests__/screens/dashboard.errorStates.test.tsx: it mocks
 * `@tanstack/react-query`'s `useQuery` keyed on `queryKey[0]` so each of the
 * tab's four queries can be driven independently into a chosen state, each with
 * its OWN `refetch` spy. The macro dashboard's "Retry" calls the screen's
 * `refetchAll`, which fans out to ALL FOUR refetch fns — the headline assertion
 * below presses that single Retry and verifies every spy fired exactly once.
 *
 * Nutrition's four queries (nutrition.tsx lines 40-58):
 *   - ['nutrition-plan']  → getPlanByDate   (Daily Plan section)
 *   - ['meal-logs']       → getMealLogs     (consumed macros)
 *   - ['daily-progress']  → getToday        (macro targets)  [progress module]
 *   - ['fasting-logs']    → getFastingLogs  (Fasting Timer card)
 *
 * Mocks (lean, same shape as the dashboard suite):
 *  - `@tanstack/react-query` useQuery → a mutable per-key state table the tests
 *    set in `beforeEach`/inline, plus useMutation/useQueryClient stubs.
 *  - `@/components/ui` → real module EXCEPT `Skeleton`, overridden to a
 *    testID-bearing View so loading states are assertable (the real Skeleton is
 *    an unlabelled Animated.View). EmptyState/everything else stays real so the
 *    "Couldn't load your macros" / "Retry" copy is the genuine component.
 *  - api modules, expo-router, @expo/vector-icons, react-native-safe-area-
 *    context, expo-image, expo-status-bar, and `./_layout` (TAB_BAR_H) — stubbed
 *    so the module graph loads without native code, the real tab navigator, or a
 *    real API client.
 */
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

// ── react-query: a mutable per-key state table the tests drive ───────────────
// Each query gets its own refetch spy so we can prove the macro "Retry" fans
// out to ALL FOUR (refetchAll), not just one.
//
// EVERYTHING the hoisted jest.mock() factory closes over is `mock`-prefixed so
// babel-plugin-jest-hoist permits it. Crucially, the factory references each
// spy INSIDE `useQuery` (i.e. at render time) — NOT in an object literal built
// when the factory first runs. jest evaluates the factory the moment the mocked
// module is first required (during `import NutritionHubScreen`, which babel
// hoists ABOVE these `const`s), so a lookup table built at factory-run time
// would capture the spies while still `undefined` and fall through to throwaway
// `jest.fn()`s — silently breaking `refetch === mockPlanRefetch` identity and
// the refetchAll fan-out assertion. Reading them lazily per call avoids that.
const mockPlanRefetch = jest.fn();
const mockLogsRefetch = jest.fn();
const mockProgressRefetch = jest.fn();
const mockFastingRefetch = jest.fn();

// Stable router.push spy (mock-prefixed so the hoisted expo-router factory may
// close over it). A single shared fn — NOT a fresh jest.fn() per useRouter()
// call — so a test can press the header history button and assert the exact
// route it pushed. beforeEach clears it alongside the refetch spies.
const mockRouterPush = jest.fn();

type QState = { data?: unknown; isLoading?: boolean; isError?: boolean };

// Mutated by each test BEFORE renderScreen(). Defaults = everything resolved &
// benign (idle fasting, empty-but-present plan) so a test only sets the keys it
// cares about.
const mockState: Record<string, QState> = {};

function resetQueryState() {
  mockState['nutrition-plan'] = { data: { meals: [] }, isLoading: false, isError: false };
  mockState['meal-logs'] = { data: [], isLoading: false, isError: false };
  mockState['daily-progress'] = { data: {}, isLoading: false, isError: false };
  mockState['fasting-logs'] = { data: [], isLoading: false, isError: false };
}
resetQueryState();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = String(queryKey[0]);
    const s = mockState[key] ?? {};
    // Resolve the spy lazily, per call (render time) — see the note above.
    const refetch =
      key === 'nutrition-plan' ? mockPlanRefetch :
      key === 'meal-logs' ? mockLogsRefetch :
      key === 'daily-progress' ? mockProgressRefetch :
      key === 'fasting-logs' ? mockFastingRefetch :
      jest.fn();
    return { data: s.data, isLoading: !!s.isLoading, isError: !!s.isError, refetch };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// ── ui barrel: keep everything real except Skeleton (make it assertable) ─────
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    Skeleton: (props: any) => <RN.View testID="skeleton" {...props} />,
  };
});

// ── api modules: stubbed so the real axios client / env config never loads.
// useQuery is mocked above, so these queryFns are never actually invoked — they
// only need to be importable. ────────────────────────────────────────────────
jest.mock('@/api/plans', () => ({ getPlanByDate: jest.fn() }));
jest.mock('@/api/meals', () => ({ getMealLogs: jest.fn(), getFastingLogs: jest.fn() }));
jest.mock('@/api/progress', () => ({ getToday: jest.fn() }));

// ── _layout stub: nutrition.tsx only needs the TAB_BAR_H constant from it.
// Mocking it keeps the real tab navigator (expo-router <Tabs>, auth store,
// SafeBlurView) out of the render entirely. ──────────────────────────────────
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn(), back: jest.fn() }),
}));

// Decorative glyphs; stub to plain text (avoids expo-font → expo-asset).
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

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// Import AFTER the mocks are registered.
import NutritionHubScreen from '../../app/(tabs)/nutrition';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <NutritionHubScreen />
    </ThemeContext.Provider>,
  );
}

describe('NutritionHubScreen — loading / error / empty / filled states', () => {
  beforeEach(() => {
    mockPlanRefetch.mockClear();
    mockLogsRefetch.mockClear();
    mockProgressRefetch.mockClear();
    mockFastingRefetch.mockClear();
    mockRouterPush.mockClear();
    resetQueryState();
  });

  // (a) macro LOADING — progress/logs isLoading → Skeletons in the macro card.
  test('macro LOADING: renders skeletons while progress/logs load (no error, no macro values)', () => {
    mockState['daily-progress'] = { data: undefined, isLoading: true, isError: false };
    mockState['meal-logs'] = { data: undefined, isLoading: true, isError: false };
    renderScreen();

    // The macro dashboard's loading branch renders the ring + 3 bar Skeletons.
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(4);
    // Loading must NOT fall through to the error or the populated macro UI.
    expect(screen.queryByText("Couldn't load your macros")).toBeNull();
    expect(screen.queryByText('KCAL LEFT')).toBeNull();
  });

  // (b) macro ERROR + RETRY — progress/logs isError → "Couldn't load your
  // macros" + a Retry that calls refetchAll (all four refetch spies).
  test('macro ERROR: shows "Couldn\'t load your macros" and hides the macro ring', () => {
    mockState['daily-progress'] = { data: undefined, isLoading: false, isError: true };
    renderScreen();

    expect(screen.getByText("Couldn't load your macros")).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    // Error branch is mutually exclusive with the populated ring.
    expect(screen.queryByText('KCAL LEFT')).toBeNull();
  });

  test('macro ERROR Retry fans out to ALL FOUR query refetches (refetchAll)', () => {
    // Drive the macro into error; keep plan empty (no second "Retry" from the
    // plan section) so getByText('Retry') is unambiguous.
    mockState['meal-logs'] = { data: undefined, isLoading: false, isError: true };
    renderScreen();

    fireEvent.press(screen.getByText('Retry'));
    expect(mockPlanRefetch).toHaveBeenCalledTimes(1);
    expect(mockLogsRefetch).toHaveBeenCalledTimes(1);
    expect(mockProgressRefetch).toHaveBeenCalledTimes(1);
    expect(mockFastingRefetch).toHaveBeenCalledTimes(1);
  });

  // (c) EMPTY plan — plan resolved but no meals → "No plan generated" CTA.
  test('EMPTY plan: shows the "No plan generated for today" generate CTA', () => {
    mockState['nutrition-plan'] = { data: { meals: [] }, isLoading: false, isError: false };
    renderScreen();

    expect(screen.getByText('No plan generated for today')).toBeTruthy();
    expect(screen.getByText('GENERATE PLAN')).toBeTruthy();
    // No meal rows rendered.
    expect(screen.queryByText('Breakfast')).toBeNull();
  });

  // (d) FILLED meals — plan.meals populated → meal labels + times render.
  test('FILLED plan: renders each meal label and time', () => {
    mockState['nutrition-plan'] = {
      data: {
        meals: [
          { time: '08:00', label: 'Breakfast', description: 'Oats and eggs' },
          { time: '13:00', label: 'Lunch', description: 'Chicken and rice' },
        ],
      },
      isLoading: false,
      isError: false,
    };
    renderScreen();

    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('13:00')).toBeTruthy();
    // The empty-plan CTA must NOT show when meals exist.
    expect(screen.queryByText('No plan generated for today')).toBeNull();
  });

  // (e) fasting IDLE vs ACTIVE.
  test('fasting IDLE: no active log → "IDLE" badge and "START FAST" action', () => {
    mockState['fasting-logs'] = { data: undefined, isLoading: false, isError: false };
    renderScreen();

    // The Fasting Timer card is the only place these strings appear, so a
    // screen-level lookup is unambiguous. The queryByText assertions below pin
    // the IDLE/ACTIVE branches as mutually exclusive.
    expect(screen.getByText('Fasting Timer')).toBeTruthy();
    expect(screen.getByText('IDLE')).toBeTruthy();
    expect(screen.getByText('START FAST')).toBeTruthy();
    expect(screen.queryByText('IN PROGRESS')).toBeNull();
    expect(screen.queryByText('VIEW TIMER')).toBeNull();
  });

  test('fasting ACTIVE: status ACTIVE → "IN PROGRESS" badge and "VIEW TIMER" action', () => {
    mockState['fasting-logs'] = {
      data: [{ id: 'f1', status: 'ACTIVE', startedAt: '2026-06-18T00:00:00Z', targetHours: 16 }],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    expect(screen.getByText('IN PROGRESS')).toBeTruthy();
    expect(screen.getByText('VIEW TIMER')).toBeTruthy();
    expect(screen.queryByText('IDLE')).toBeNull();
    expect(screen.queryByText('START FAST')).toBeNull();
  });

  // ── GlassCard-conversion guard rails (Aurora coverage item) ────────────────
  // These pin the two states the Card→GlassCard conversion of the macro
  // dashboard touched — loading and loaded — plus the header history-button
  // route. They assert the screen still mounts and behaves identically AFTER the
  // three `Card variant="glass"` macro surfaces became `<GlassCard>`; the macro
  // dashboard's loading Skeletons and its populated ring must each render under
  // the new primitive, and nothing about the history button changed.

  // LOADING render: the macro card mounts (Skeletons present), now inside a
  // GlassCard rather than a Card. Complements test (a) by also asserting the
  // surrounding screen chrome (header date overline, "Quick Tools") renders.
  test('GlassCard conversion — macro LOADING still mounts the dashboard + screen chrome', () => {
    mockState['daily-progress'] = { data: undefined, isLoading: true, isError: false };
    mockState['meal-logs'] = { data: undefined, isLoading: true, isError: false };
    renderScreen();

    // Loading branch (now a GlassCard) renders the ring + 3 bar Skeletons.
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(4);
    // Static screen chrome around the converted card is unaffected.
    expect(screen.getByText('Nutrition')).toBeTruthy();
    expect(screen.getByText('Quick Tools')).toBeTruthy();
    // Not the loaded ring or the error copy.
    expect(screen.queryByText('KCAL LEFT')).toBeNull();
    expect(screen.queryByText("Couldn't load your macros")).toBeNull();
  });

  // LOADED render: all four queries resolved → the populated macro ring renders
  // inside the converted GlassCard (KCAL LEFT + the three macro labels), with no
  // loading Skeletons and no error copy. Proves the loaded branch's GlassCard
  // wraps the same children as the old Card.
  test('GlassCard conversion — fully LOADED renders the macro ring + macros (no skeletons, no error)', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2400, proteinTarget: 180, carbsTarget: 200, fatTarget: 70 },
      isLoading: false,
      isError: false,
    };
    mockState['meal-logs'] = {
      data: [{ totalCalories: 600, totalProtein: 40, totalCarbs: 50, totalFat: 20 }],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    // The loaded macro card (now a GlassCard) shows the ring summary + macros.
    expect(screen.getByText('KCAL LEFT')).toBeTruthy();
    expect(screen.getByText('PROTEIN')).toBeTruthy();
    expect(screen.getByText('CARBS')).toBeTruthy();
    expect(screen.getByText('FAT')).toBeTruthy();
    // Mutually exclusive with the loading and error branches.
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.queryByText("Couldn't load your macros")).toBeNull();
  });

  // The header history button (accessibilityLabel "View log") still routes to
  // '/(meals)/log-meal'. The conversion left this TouchableOpacity and its
  // onPress untouched; this pins the exact route via the stable router.push spy.
  test('history button routes to /(meals)/log-meal (onPress unchanged by the conversion)', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('View log'));
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith('/(meals)/log-meal');
  });
});
