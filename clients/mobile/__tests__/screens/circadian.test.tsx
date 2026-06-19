/**
 * circadian.test.tsx
 *
 * Render coverage for the Aurora-restyled Circadian tab
 * (`app/(tabs)/circadian.tsx`). The screen had zero render tests, so a silent
 * restyle could break its navigation without a single suite turning red. This
 * file pins the three load-bearing behaviours so future restyle rounds can't
 * regress them:
 *
 *   - Test A (loading): while ['current-shift'] is `isLoading`, the screen
 *     mounts its skeleton scaffold ONLY — the "Circadian"/"Optimizer" hero and
 *     the metric values are NOT in the tree yet.
 *   - Test B (no shift): with no active shift, the "No shift to sync to"
 *     EmptyState renders and its primary CtaButton ("Schedule a shift") deep-
 *     links to '/(tabs)/schedule' (exactly once).
 *   - Test C (populated → AI Protocol): with an active shift, switching to the
 *     "AI Protocol" tab renders the meal timeline; pressing a meal row's
 *     "Log this" pushes the '/(meals)/log-planned-meal' confirm screen with the
 *     slot's mealType + serialized plan params (the one-tap plan→meal flow that
 *     replaced the old data-less "Swap → build-plate" action).
 *
 * Mock conventions mirror the sibling `(tabs)` screen suites
 * (nutrition.errorStates / dashboard.errorStates) and the hoisted-`mockPush`
 * holder in shift-detail.test.tsx:
 *
 *   - `@tanstack/react-query` is stubbed and branches on queryKey[0]: a mutable
 *     `mockCurrentShift` holder drives ['current-shift'] (so each test picks the
 *     loading / no-shift / populated branch before render); ['circadian-model']
 *     resolves `{ data: undefined }` so the screen uses its shift-based metric
 *     estimates; `useMutation` is a benign no-op (`isPending:false`,
 *     `data:undefined`) so the plan timeline — not the GeneratingSteps loader —
 *     renders, and the fallback protocol (which contains the meal rows) is used.
 *   - `expo-router` exposes a hoisted `mockPush` so the deep-links can be
 *     asserted by route + arity.
 *   - `../../app/(tabs)/_layout` is stubbed to just `{ TAB_BAR_H }` — the screen
 *     only needs that constant; the stub keeps the real tab navigator
 *     (expo-router <Tabs>, authStore, SafeBlurView) out of the render entirely.
 *   - api modules (`@/api/shifts` getCurrent, `@/api/ai` generatePlan,
 *     `@/api/circadian` getModel) are plain jest.fns so the real axios client /
 *     env config (and ai's @/lib/aiSafety + sentry subtree) never load; useQuery
 *     /useMutation are fully stubbed, so these queryFns are never invoked.
 *   - decorative glyphs, safe-area insets, the linear gradient and the status
 *     bar are stubbed the same way as the rest of the screen suites.
 *
 * The `@/components/ui` barrel is deliberately left REAL: the assertions ride on
 * the actual CtaButton (its accessibilityRole="button" + "Schedule a shift"
 * label) and EmptyState copy, and the real GlassCard / Skeleton / GeneratingSteps
 * render fine under the gradient/icon/blur stubs above.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder (the prefix lets
// babel-plugin-jest-hoist allow the factory to close over it) so each test can
// assert exactly which route — and with what arity — the screen navigated to.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['current-shift'] query. Each test mutates this
// holder BEFORE render() to pick the loading / no-shift / populated branch.
// Read at call-time inside the useQuery stub so the chosen branch is honoured.
type ShiftState = { data: any; isLoading: boolean };
const mockCurrentShift: ShiftState = { data: undefined, isLoading: false };

// react-query: branch on queryKey[0]. ['current-shift'] reads the mutable holder
// above; ['circadian-model'] resolves undefined so the screen estimates metrics
// from the shift (and never calls the real getModel). useMutation is a benign
// no-op: data:undefined → the screen uses its FALLBACK protocol (which carries
// the meal rows under test); isPending:false → the timeline renders rather than
// the GeneratingSteps loader.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'current-shift') {
      return { data: mockCurrentShift.data, isLoading: mockCurrentShift.isLoading };
    }
    if (key === 'circadian-model') {
      return { data: undefined };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ data: undefined, isPending: false, mutate: jest.fn() }),
}));

// api modules the screen statically imports — stubbed so the real axios client
// (via @/api/client) and ai's @/lib/aiSafety + sentry subtree never load.
// useQuery / useMutation are stubbed above, so none of these are ever invoked.
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/ai', () => ({ generatePlan: jest.fn() }));
jest.mock('@/api/circadian', () => ({ getModel: jest.fn() }));

// Auth store: the plan mutation reads `user.id`; a fixed id is enough.
jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u-1' } }),
}));

// _layout stub: circadian.tsx only needs the TAB_BAR_H constant from it.
// Mocking it keeps the real tab navigator (expo-router <Tabs>, auth store,
// SafeBlurView) out of the render entirely.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

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
// passthrough View so the screen's (and CtaButton's) gradients mount.
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
import CircadianScreen from '../../app/(tabs)/circadian';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CircadianScreen />
    </ThemeContext.Provider>,
  );
}

// A fixed active night shift for the populated case. Its id/type are what the
// (stubbed) plan mutation would key on; only their presence + stability matter.
const ACTIVE_SHIFT = {
  id: 's1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
};

describe('CircadianScreen', () => {
  beforeEach(() => {
    mockCurrentShift.data = undefined;
    mockCurrentShift.isLoading = false;
    mockPush.mockClear();
  });

  // ── Test A: loading → skeleton scaffold only ──────────────────────────────
  test('loading: mounts the skeleton scaffold with no hero text or metric values', () => {
    mockCurrentShift.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The loading branch returns the skeleton scaffold ONLY — the hero copy and
    // the biological-window metric labels/values are not in the tree yet.
    expect(screen.queryByText('Circadian')).toBeNull();
    expect(screen.queryByText('Optimizer')).toBeNull();
    expect(screen.queryByText('Biological Windows')).toBeNull();
    expect(screen.queryByText('Melatonin Onset')).toBeNull();
    expect(screen.queryByText('Caffeine Cutoff')).toBeNull();
    expect(screen.queryByText('Entrainment Score')).toBeNull();

    // Nothing was pressed, so the screen fired no navigation on mount.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Test B: no shift → EmptyState + CtaButton deep-link ───────────────────
  test('no shift: renders the "No shift to sync to" EmptyState and the CtaButton deep-links to /(tabs)/schedule', () => {
    mockCurrentShift.data = undefined;
    mockCurrentShift.isLoading = false;

    renderScreen();

    // The honest zero-data EmptyState (not the metric grid).
    expect(screen.getByText('No shift to sync to')).toBeTruthy();
    expect(screen.queryByText('Biological Windows')).toBeNull();

    // The primary CTA is the Aurora CtaButton: accessibilityRole="button" whose
    // accessible name is its "Schedule a shift" label.
    const cta = screen.getByRole('button', { name: /Schedule a shift/ });
    fireEvent.press(cta);

    // It deep-links to the schedule tab — exactly once, with that single arg
    // (a stray 2nd param would silently change the deep-link target).
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/schedule');
  });

  // ── Test C: populated → AI Protocol tab → "Log this" push ─────────────────
  test('populated: switching to the AI Protocol tab and pressing a meal "Log this" pushes /(meals)/log-planned-meal with the slot params', () => {
    mockCurrentShift.data = ACTIVE_SHIFT;
    mockCurrentShift.isLoading = false;

    renderScreen();

    // The profile hub is the default tab; the no-shift EmptyState must be gone
    // and the metric grid present for a populated shift.
    expect(screen.queryByText('No shift to sync to')).toBeNull();
    expect(screen.getByText('Biological Windows')).toBeTruthy();

    // Switch to the "AI Protocol" tab (accessibilityRole="tab", named by its
    // child text). The fallback protocol then renders its meal timeline.
    fireEvent.press(screen.getByRole('tab', { name: /AI Protocol/ }));
    expect(screen.getByText("Today's Protocol")).toBeTruthy();

    // Each meal row exposes a "Log <title>" button (the one-tap plan→meal CTA
    // that replaced "Swap"). Press the first one and assert it opens the
    // log-planned-meal confirm screen, carrying the slot's mealType plus a
    // serialized `plan` param (macros/foods) so the screen renders prefilled.
    const logButtons = screen.getAllByRole('button', { name: /^Log / });
    expect(logButtons.length).toBeGreaterThan(0);
    fireEvent.press(logButtons[0]!);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(arg.pathname).toBe('/(meals)/log-planned-meal');
    // The fallback protocol's first meal is the BREAKFAST slot.
    expect(arg.params.mealType).toBe('BREAKFAST');
    // `plan` is a JSON string carrying the planned macros + suggested foods.
    expect(typeof arg.params.plan).toBe('string');
    expect(() => JSON.parse(arg.params.plan!)).not.toThrow();
    const parsedPlan = JSON.parse(arg.params.plan!);
    expect(parsedPlan).toHaveProperty('plannedMacros');
    expect(parsedPlan).toHaveProperty('suggestedFoods');
  });
});
