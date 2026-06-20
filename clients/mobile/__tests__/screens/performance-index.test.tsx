/**
 * performance-index.test.tsx
 *
 * Render coverage for the Performance Hub landing screen
 * (`app/(performance)/index.tsx`) after its inline glass-card surfaces were
 * migrated to the Aurora `GlassCard` primitive. The screen's NAV_ITEMS grid —
 * Hydration / Body Metrics / AI Reports / Photos — is now a column of
 * <TouchableOpacity> tiles whose bodies are wrapped in <GlassCard>, and the
 * Optimizations checklist rows are <GlassCard>-wrapped too. This suite pins the
 * load-bearing render so a future change can't silently drop the nav grid:
 *
 *   - Test A (loaded): with ['today-progress'] resolved (NOT loading, NOT
 *     error), the loaded ScrollView renders the score card (the "Great Job!"
 *     hero + its "PERF SCORE" ring caption) AND all four NAV_ITEMS labels —
 *     the GlassCard nav tiles mounted. The header title ("Performance Hub") and
 *     a section header ("Optimizations") are asserted too, as stable domain
 *     labels.
 *   - Test B (loading): while ['today-progress'] is `isLoading`, the screen is
 *     on its skeleton branch — the SkeletonCard placeholders render while the
 *     loaded surfaces (the score card + the NAV_ITEMS labels) are NOT in the
 *     tree yet (the grid only renders in the loaded branch), and never a crash.
 *   - Test C (nav routing): in the loaded state, pressing each nav tile (queried
 *     by its accessibilityLabel) calls router.push exactly once with that item's
 *     route — the hub's load-bearing navigation contract. The handler is the
 *     screen's UNCHANGED `onPress={() => router.push(item.route)}`; this suite is
 *     a pure render/behaviour pin (the screen source is NOT modified by this item).
 *
 * Mock conventions mirror the sibling screen suites (sleep-optimizer /
 * circadian / shift-detail): `@tanstack/react-query` is stubbed and branches on
 * queryKey[0] (mutable `mockTodayState` drives ['today-progress'] and mutable
 * `mockWeeklyState` drives ['weekly-stats']); useQueryClient is a benign no-op
 * (the refresh button's invalidateQueries isn't exercised); `@/api/progress` is
 * a plain jest.fn map so the real axios client (via @/api/client) never loads
 * (the queryFns are never invoked — useQuery is fully stubbed); expo-router
 * exposes a hoisted `mockPush` (so the nav-tile routing can be asserted by route
 * + arity), with `back`/`replace` benign no-ops; safe-area insets,
 * @expo/vector-icons, expo-linear-gradient and expo-status-bar are stubbed the
 * same way as the rest of the suite. CircularProgress (the hero
 * score ring, which pulls in react-native-svg) is stubbed to a passthrough so
 * the score card mounts without the native svg module — it is decorative and
 * not under assertion here. The `@/components/ui` barrel + GlassCard are left
 * REAL: the assertions ride on the actual nav-tile labels, and the real
 * GlassCard/Skeleton/Card render fine under the icon/gradient/blur stubs
 * (exactly like circadian.test / sleep-optimizer.test).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Controlled state for the two queries the screen runs. Each test mutates these
// holders BEFORE render() to pick the branch under test; the useQuery stub reads
// them at call-time so the chosen branch is honoured. `mock` name prefix is
// required for jest's out-of-scope hoisting rule.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockTodayState: QueryState = { data: {}, isLoading: false, isError: false };
const mockWeeklyState: QueryState = { data: {}, isLoading: false, isError: false };
const mockTodayRefetch = jest.fn();
// `router.push` is a hoisted `mock`-prefixed holder (the prefix lets
// babel-plugin-jest-hoist allow the expo-router factory to close over it) so the
// nav-routing test can assert exactly which route — and with what arity — a
// pressed nav tile navigated to. Mirrors the `mockPush` posture in
// circadian.test / shift-detail.test.
const mockPush = jest.fn();

// react-query: branch on queryKey[0]. ['today-progress'] reads the today holder
// (it drives the screen's top-level loading/error/loaded branch); ['weekly-stats']
// reads the weekly holder (the Weekly Recap card). useQueryClient is a benign
// no-op — the refresh button's cache invalidation isn't exercised here.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'today-progress') {
      return {
        data: mockTodayState.data,
        isLoading: mockTodayState.isLoading,
        isError: mockTodayState.isError,
        refetch: mockTodayRefetch,
      };
    }
    if (key === 'weekly-stats') {
      return {
        data: mockWeeklyState.data,
        isLoading: mockWeeklyState.isLoading,
        isError: mockWeeklyState.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so the real
// axios client (via @/api/client) and its env config never load. useQuery is
// fully stubbed above, so these queryFns are never actually invoked; they only
// satisfy the import graph.
jest.mock('@/api/progress', () => ({ getToday: jest.fn(), getWeeklyStats: jest.fn() }));

// expo-router: the screen calls router.push(item.route) from each nav tile and
// router.back() from the header. `push` is the hoisted `mockPush` holder so the
// nav-routing test can assert the deep-link target + arity; `back`/`replace` are
// benign no-ops (not exercised here).
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// CircularProgress pulls in react-native-svg (a native module); the hero score
// ring is decorative and not under assertion, so stub it to a passthrough View
// to keep the loaded score card mounting cleanly under the jest renderer.
jest.mock('@/components/ui/CircularProgress', () => {
  const RN = require('react-native');
  return { CircularProgress: (props: any) => <RN.View {...props} /> };
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
// passthrough View so the screen's gradients mount on the jest renderer.
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
import DailyReportScreen from '../../app/(performance)/index';

// The four NAV_ITEMS labels rendered in the loaded grid — the GlassCard nav
// tiles. Asserting all four pins "the nav grid mounted" without coupling to the
// tile internals (icons/values).
const NAV_LABELS = ['Hydration', 'Body Metrics', 'AI Reports', 'Photos'] as const;

// The label → route map mirrors the screen's NAV_ITEMS so the routing test can
// press a tile by its (stable, accessibilityLabel) name and assert the EXACT
// pathname router.push received. Kept here (not re-imported) because NAV_ITEMS is
// a module-private const inside the screen component; these four routes are the
// load-bearing nav contract this hub exists to wire up.
const NAV_ROUTES: Record<(typeof NAV_LABELS)[number], string> = {
  Hydration: '/(performance)/hydration',
  'Body Metrics': '/(performance)/body-metrics',
  'AI Reports': '/(performance)/reports',
  Photos: '/(performance)/photos',
};

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <DailyReportScreen />
    </ThemeContext.Provider>,
  );
}

describe('DailyReportScreen — Performance Hub nav grid', () => {
  beforeEach(() => {
    // Loaded by default (today resolved, not loading/error) so the nav grid is
    // reached. Each test overrides the branch it needs.
    mockTodayState.data = { score: 72, hydrationActual: 1200, proteinActual: 150, lightExposureCompleted: true };
    mockTodayState.isLoading = false;
    mockTodayState.isError = false;
    mockWeeklyState.data = { avgScore: 70, streakDays: 3, avgHydration: 2000, daysLogged: 5 };
    mockWeeklyState.isLoading = false;
    mockWeeklyState.isError = false;
    mockTodayRefetch.mockClear();
    mockPush.mockClear();
  });

  // ── Test A: loaded → score card + all four GlassCard nav tiles render ─────
  test('loaded: renders the header, the score card, all four NAV_ITEMS nav cards, and the Optimizations section', () => {
    expect(() => renderScreen()).not.toThrow();

    // Header title — a stable domain label confirming the screen mounted.
    expect(screen.getByText('Performance Hub')).toBeTruthy();

    // The score card (the hero LinearGradient surface): its "Great Job!" heading,
    // the "PERF SCORE" ring caption, and the numeric score (72) from the resolved
    // ['today-progress'] all render — pinning that the loaded ScrollView's first
    // surface mounted (the CircularProgress ring is stubbed to a passthrough, so
    // the score TEXT is the stable marker here, not the decorative ring).
    expect(screen.getByText('Great Job!')).toBeTruthy();
    expect(screen.getByText('PERF SCORE')).toBeTruthy();
    expect(screen.getByText('72')).toBeTruthy();

    // The GlassCard nav tiles — assert every NAV_ITEMS label is present.
    for (const label of NAV_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    // A section header below the grid — confirms the loaded ScrollView (not the
    // skeleton/error branch) is what rendered.
    expect(screen.getByText('Optimizations')).toBeTruthy();
  });

  // ── Test B: loading → skeleton branch, no score card / nav tiles yet ──────
  test('loading: the SkeletonCard scaffold renders and neither the score card nor the NAV_ITEMS nav cards are in the tree yet', () => {
    mockTodayState.isLoading = true;
    mockTodayState.data = undefined;

    const { toJSON } = renderScreen();
    expect(() => toJSON()).not.toThrow();

    // The header is always rendered (it sits above the loading/loaded switch)…
    expect(screen.getByText('Performance Hub')).toBeTruthy();
    // …and the skeleton ScrollView mounted: it is the ONLY branch reached while
    // ['today-progress'] is in flight (not loaded, not error), so a non-null tree
    // here is the SkeletonCard scaffold (the SkeletonCard placeholders are real
    // <Animated.View>s with no queryable text/role — their presence is pinned by
    // the loaded/error surfaces all being absent below).
    expect(toJSON()).not.toBeNull();
    // The loaded score card is NOT mounted yet…
    expect(screen.queryByText('Great Job!')).toBeNull();
    expect(screen.queryByText('PERF SCORE')).toBeNull();
    // …nor is the error EmptyState (this is the loading branch, not the error one).
    expect(screen.queryByText("Couldn't load your hub")).toBeNull();
    // …and the nav grid only renders in the loaded branch, so while
    // ['today-progress'] is in flight none of the NAV_ITEMS labels (nor the
    // Optimizations section header) are present yet.
    for (const label of NAV_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText('Optimizations')).toBeNull();

    // Nothing was pressed, so the loading mount fired no navigation.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Test C: loaded → pressing each nav tile routes to its NAV_ITEMS route ──
  test('loaded: pressing each nav tile calls router.push exactly once with that item\'s route', () => {
    renderScreen();

    // Each nav tile is a <TouchableOpacity accessibilityRole="button"
    // accessibilityLabel={item.label}>; query it by that accessible name and
    // press it. The handler is the screen's UNCHANGED
    // `onPress={() => router.push(item.route as any)}` — this asserts the
    // load-bearing nav contract without touching the (already-Aurora) source.
    for (const label of NAV_LABELS) {
      mockPush.mockClear();
      const tile = screen.getByRole('button', { name: label });
      fireEvent.press(tile);
      // Exactly once, with that single route arg (a stray 2nd param would
      // silently change the deep-link target).
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(NAV_ROUTES[label]);
    }
  });
});
