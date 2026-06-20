/**
 * hydration.test.tsx
 *
 * Render-state coverage for the Hydration Tracker screen
 * (`app/(performance)/hydration.tsx`) after its inline card surfaces were
 * migrated to the Aurora `GlassCard` primitive. The "Add Liquid" preset tiles
 * (250 / 500 / 750 ml) are now <TouchableOpacity> handles whose bodies are
 * wrapped in <GlassCard>, and the hydration tip is a <GlassCard>-wrapped row.
 * No other suite mounts this screen, so this pins its two primary render
 * branches against a regression:
 *
 *   - Test A (loaded): with ['today-progress'] resolved (NOT error), the
 *     loaded ScrollView renders — all three PRESET amounts (250 / 500 / 750)
 *     are present (the GlassCard preset tiles mounted) and the hydration tip
 *     copy renders. The header title ("Hydration Tracker") is asserted too as a
 *     stable domain label.
 *   - Test B (error): when ['today-progress'] is `isError`, the screen is on
 *     its EmptyState branch — the "Couldn't load hydration" copy + the "Try
 *     Again" action render, and the preset tiles / tip copy are NOT in the tree
 *     (the loaded ScrollView never mounts). Tapping "Try Again" calls the
 *     query's refetch.
 *
 * Mock conventions mirror the sibling screen suites (performance-index /
 * circadian / sleep-optimizer):
 *   - `@tanstack/react-query` is stubbed: useQuery branches on queryKey[0]
 *     (a mutable `mockTodayState` holder drives ['today-progress'] so each test
 *     picks the loaded / error branch before render); useMutation captures the
 *     screen's lifecycle config and returns a benign `mutate`/`isPending:false`
 *     (the log-water mutation is never exercised here); useQueryClient is a
 *     no-op (the onSuccess invalidateQueries isn't asserted).
 *   - `@/api/progress` (getToday / logHydration) is a plain jest.fn map so the
 *     real axios client (via @/api/client) and its env config never load —
 *     useQuery/useMutation are fully stubbed, so these fns are never invoked;
 *     they only satisfy the import graph.
 *   - `@/components/SafeBlurView` is a passthrough View so the REAL GlassCard
 *     (kept real) mounts its frosted fill + children without expo-blur's native
 *     module — the assertions ride on the actual preset/tip content inside it.
 *   - CircularProgress (the hydration hero ring, which pulls in react-native-svg)
 *     is stubbed to a passthrough so the loaded screen mounts without the native
 *     svg module — it is decorative and not under assertion here.
 *   - expo-router, safe-area insets, @expo/vector-icons, expo-linear-gradient
 *     and expo-status-bar are stubbed the same way as the rest of the suite.
 *
 * The `@/components/ui` barrel + GlassCard are left REAL: the assertions ride on
 * the actual preset-tile text and the EmptyState copy, and the real
 * GlassCard/EmptyState render fine under the icon/gradient/blur stubs (exactly
 * like exercises-index.test / performance-index.test).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Controlled state for the ['today-progress'] query. Each test mutates this
// holder BEFORE render() to pick the loaded / error branch; the useQuery stub
// reads it at call-time so the chosen branch is honoured. `mock` name prefix is
// required for jest's out-of-scope hoisting rule.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockTodayState: QueryState = { data: {}, isLoading: false, isError: false };
const mockTodayRefetch = jest.fn();

// react-query: branch on queryKey[0]. ['today-progress'] reads the today holder
// (it drives the screen's error/loaded branch). useMutation captures the
// screen's onSuccess/onError config and returns a benign `mutate` with
// isPending false (the log-water mutation is never exercised in these render
// tests). useQueryClient is a no-op — the onSuccess cache invalidation isn't
// asserted here.
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
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: (_config: any) => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so the real
// axios client (via @/api/client) and its env config never load. useQuery /
// useMutation are fully stubbed above, so these fns are never actually invoked;
// they only satisfy the import graph.
jest.mock('@/api/progress', () => ({ getToday: jest.fn(), logHydration: jest.fn() }));

// expo-router: the screen only calls router.back(); no-op stub.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// SafeBlurView → passthrough View so the REAL GlassCard (kept real) mounts its
// frosted fill + children (the preset tiles + the tip row) without expo-blur's
// native module.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

// CircularProgress pulls in react-native-svg (a native module); the hydration
// hero ring is decorative and not under assertion, so stub it to a passthrough
// View to keep the loaded screen mounting cleanly under the jest renderer.
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

// expo-linear-gradient ships a native module; replace <LinearGradient> (the
// cyan FAB) with a passthrough View so the screen mounts on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import HydrationTrackerScreen from '../../app/(performance)/hydration';

// The three preset amounts rendered in the loaded "Add Liquid" row — the
// GlassCard preset tiles. Asserting all three pins "the preset grid mounted"
// without coupling to the tile internals (icons/units).
const PRESET_LABELS = ['250', '500', '750'] as const;
// A stable slice of the hydration tip copy rendered inside the tip GlassCard.
const TIP_COPY = /Sip water consistently/;

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <HydrationTrackerScreen />
    </ThemeContext.Provider>,
  );
}

describe('HydrationTrackerScreen — Aurora GlassCard surfaces', () => {
  beforeEach(() => {
    // Loaded by default (today resolved, not error) so the preset grid + tip
    // are reached. Each test overrides the branch it needs.
    mockTodayState.data = { hydrationActual: 1200, hydrationTargetMl: 3000 };
    mockTodayState.isLoading = false;
    mockTodayState.isError = false;
    mockTodayRefetch.mockClear();
  });

  // ── Test A: loaded → the GlassCard preset tiles + tip copy render ─────────
  test('loaded: renders the header, all three preset tiles, and the hydration tip', () => {
    expect(() => renderScreen()).not.toThrow();

    // Header title — a stable domain label confirming the screen mounted.
    expect(screen.getByText('Hydration Tracker')).toBeTruthy();

    // The GlassCard preset tiles — assert every preset amount is present.
    for (const label of PRESET_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    // The tip copy inside the tip GlassCard — confirms the loaded ScrollView
    // (not the error branch) is what rendered.
    expect(screen.getByText(TIP_COPY)).toBeTruthy();
  });

  // ── Test B: error → EmptyState branch, no preset tiles / tip ──────────────
  test('error: renders the EmptyState (no preset tiles / tip) and Try Again refetches', () => {
    mockTodayState.isError = true;
    mockTodayState.data = undefined;

    expect(() => renderScreen()).not.toThrow();

    // The error EmptyState copy + its action render…
    expect(screen.getByText("Couldn't load hydration")).toBeTruthy();
    const tryAgain = screen.getByText('Try Again');
    expect(tryAgain).toBeTruthy();

    // …and the loaded ScrollView never mounts, so the preset tiles + tip copy
    // are NOT in the tree on the error branch.
    for (const label of PRESET_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText(TIP_COPY)).toBeNull();

    // Pressing "Try Again" re-runs the today query (the EmptyState action wires
    // straight to todayQuery.refetch).
    fireEvent.press(tryAgain);
    expect(mockTodayRefetch).toHaveBeenCalledTimes(1);
  });
});
