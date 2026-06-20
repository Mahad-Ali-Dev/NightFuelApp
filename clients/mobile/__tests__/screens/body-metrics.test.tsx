/**
 * body-metrics.test.tsx
 *
 * Screen-level render coverage for the Body Metrics screen
 * (`app/(performance)/body-metrics.tsx`) after its legacy `Card variant="glass"`
 * surfaces were migrated to the Aurora `GlassCard` primitive and its history
 * region was given the uniform honest loading / empty / error pattern (the same
 * Skeleton + EmptyState "Couldn't load… / Try Again" shape the dashboard and
 * reports.tsx use). No other suite mounts this screen, so this pins its three
 * `historyQuery` branches — plus its happy path and a11y handles — against a
 * regression:
 *
 *   - Test A (loading): while ['body-metrics'] is `isLoading`, the History
 *     region renders its Skeleton scaffold ONLY — none of the empty
 *     ("No measurements yet") / error ("Couldn't load history") / history-row
 *     copy is in the tree. The always-rendered anchors (the "Body Metrics"
 *     header, the "Log Today's Metrics" form heading, and the "History" heading)
 *     confirm the screen mounted, exactly as the sibling state suites assert a
 *     skeleton branch by absence-of-the-others.
 *   - Test B (error): when ['body-metrics'] is `isError`, the History region
 *     shows the "Couldn't load history" EmptyState whose "Try Again" primary
 *     action calls the query's `refetch` (exactly once); the empty / row copy is
 *     absent.
 *   - Test C (empty): with the query resolved to `[]`, the History region shows
 *     the "No measurements yet" EmptyState and no rows / error copy.
 *   - Test D (loaded): with a populated history the real rows render (a weight •
 *     body-fat line, and — exercising the falsy-`&&` → ternary-with-null fix
 *     both ways — a `W:` waist badge for the entry that carries waistCm and NO
 *     badge for the entry that does not), and neither edge-state copy is present.
 *   - Test E (a11y): the key touchables expose accessibilityRole="button" + a
 *     descriptive accessibilityLabel (Go back / the tape-measurements toggle /
 *     Save snapshot), and the submit control's accessibilityState reflects the
 *     mutation's pending flag (disabled + busy when isPending).
 *
 * Mock conventions mirror the sibling screen suites (hydration / performance-index
 * / challenges.states):
 *   - `@tanstack/react-query` is stubbed: useQuery branches on queryKey[0]
 *     (a mutable `mockHistory` holder drives ['body-metrics'] so each test picks
 *     its branch BEFORE render); useMutation captures the screen's lifecycle
 *     config and returns a benign `mutate` whose `isPending` is read from a
 *     mutable `mockMutation` holder (Test E flips it to assert the busy/disabled
 *     submit state); useQueryClient is a no-op (the onSuccess invalidateQueries
 *     isn't asserted here).
 *   - `@/api/progress` (getBodyMetrics / logBodyMetrics) is a plain jest.fn map so
 *     the real axios client (via @/api/client) and its env config never load —
 *     useQuery / useMutation are fully stubbed, so these fns are never invoked;
 *     they only satisfy the import graph.
 *   - `@/components/SafeBlurView` is a passthrough View so the REAL GlassCard
 *     (kept real) mounts its frosted fill + children without expo-blur's native
 *     module.
 *   - `expo-linear-gradient` is a passthrough View so the error EmptyState's
 *     primary "Try Again" Button (a coral LinearGradient fill) mounts on the jest
 *     renderer.
 *   - expo-router, safe-area insets, @expo/vector-icons and expo-status-bar are
 *     stubbed the same way as the rest of the suite.
 *
 * The `@/components/ui` barrel + GlassCard / Skeleton / EmptyState are left REAL:
 * the assertions ride on the actual EmptyState copy + primary action and the real
 * rows / skeleton, exactly like challenges.states / hydration.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['body-metrics'] query — each test mutates this holder
// BEFORE render() (the factory reads it at call-time). `refetch` is the spy the
// error branch's "Try Again" action must call. A separate `mockMutation` holder
// drives the log mutation's `isPending` so Test E can assert the busy/disabled
// submit accessibilityState. `mock` name prefix satisfies jest's out-of-scope
// hoisting rule.
type HistoryState = { data: any; isLoading: boolean; isError: boolean };
const mockHistory: HistoryState = { data: undefined, isLoading: false, isError: false };
const mockHistoryRefetch = jest.fn();
const mockMutation = { isPending: false };

// react-query: branch useQuery on queryKey[0]. ['body-metrics'] reads the holder
// above + the shared refetch spy. useMutation captures the screen's onSuccess /
// onError config and returns a benign `mutate` whose isPending is read from
// mockMutation (the log mutation is never actually fired in these render tests).
// useQueryClient is a no-op — the onSuccess cache invalidation isn't asserted.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'body-metrics') {
      return {
        data: mockHistory.data,
        isLoading: mockHistory.isLoading,
        isError: mockHistory.isError,
        refetch: mockHistoryRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: (_config: any) => ({ mutate: jest.fn(), isPending: mockMutation.isPending }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so the real
// axios client (via @/api/client) never loads. useQuery / useMutation are fully
// stubbed above, so these are never actually invoked; they only satisfy the
// import graph.
jest.mock('@/api/progress', () => ({ getBodyMetrics: jest.fn(), logBodyMetrics: jest.fn() }));

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

// expo-linear-gradient ships a native module — passthrough View so the error
// EmptyState's primary "Try Again" Button (a coral LinearGradient) mounts on the
// jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// The Aurora migration wraps the stat boxes + the log form in the GlassCard
// primitive, which renders a SafeBlurView (expo-blur native) fill. Replace
// SafeBlurView with a passthrough View — preserving its forwarded props — so the
// REAL GlassCard mounts deterministically regardless of the Android<12 fallback.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
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
import BodyMetricsScreen from '../../app/(performance)/body-metrics';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <BodyMetricsScreen />
    </ThemeContext.Provider>,
  );
}

// A small fixed history. Entry 1 carries a waist measurement (exercises the
// truthy branch of the falsy-`&&` → ternary-with-null fix → a `W:` badge); entry
// 2 omits waistCm (exercises the `: null` branch → no badge, no crash). Only the
// shape the row reads (id / recordedAt / weightKg / bodyFatPct / waistCm) matters.
const HISTORY = [
  { id: 'm1', recordedAt: '2026-06-01T08:00:00.000Z', date: '2026-06-01', weightKg: 82, bodyFatPct: 15, waistCm: 85 },
  { id: 'm2', recordedAt: '2026-05-25T08:00:00.000Z', date: '2026-05-25', weightKg: 83, bodyFatPct: 16 },
];

// Always-rendered anchors (outside the historyQuery branch) — present in EVERY
// state, so they prove the screen mounted regardless of which branch is active.
const HEADER_TITLE = 'Body Metrics';
const FORM_HEADING = "Log Today's Metrics";
const HISTORY_HEADING = 'History';

describe('BodyMetricsScreen — loading / empty / error / loaded states + a11y', () => {
  beforeEach(() => {
    mockHistory.data = undefined;
    mockHistory.isLoading = false;
    mockHistory.isError = false;
    mockHistoryRefetch.mockClear();
    mockMutation.isPending = false;
  });

  // ── Test A: loading → skeleton scaffold only (no empty / error / rows) ───────
  test('loading: mounts the History skeleton scaffold with no empty / error / row copy', () => {
    mockHistory.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The loading branch renders the Skeleton scaffold ONLY — none of the
    // empty / error / loaded-row copy is in the tree yet.
    expect(screen.queryByText('No measurements yet')).toBeNull();
    expect(screen.queryByText("Couldn't load history")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText(/% BF/)).toBeNull();

    // The always-rendered anchors confirm the screen mounted at all.
    expect(screen.getByText(HEADER_TITLE)).toBeTruthy();
    expect(screen.getByText(FORM_HEADING)).toBeTruthy();
    expect(screen.getByText(HISTORY_HEADING)).toBeTruthy();
  });

  // ── Test B: error → inline EmptyState whose Try Again refetches the query ────
  test('error: shows the "Couldn\'t load history" EmptyState whose Try Again refetches', () => {
    mockHistory.isError = true;

    renderScreen();

    // The honest error copy is present; the empty / loaded copy is absent.
    expect(screen.getByText("Couldn't load history")).toBeTruthy();
    expect(screen.queryByText('No measurements yet')).toBeNull();
    expect(screen.queryByText(/% BF/)).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") refetches
    // the body-metrics query — exactly once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockHistoryRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Test C: resolved-but-empty list → honest empty state ─────────────────────
  test('empty: history [] → "No measurements yet" EmptyState and no rows', () => {
    mockHistory.data = [];

    renderScreen();

    expect(screen.getByText('No measurements yet')).toBeTruthy();
    // …and the screen does NOT fall through to the error or loaded copy.
    expect(screen.queryByText("Couldn't load history")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText(/% BF/)).toBeNull();
  });

  // ── Test D: loaded → real rows render; waist badge ternary works both ways ───
  test('loaded: renders the real history rows; waist badge shows only when present', () => {
    mockHistory.data = HISTORY;

    renderScreen();

    // Both rows' weight • body-fat summary lines render (locale-independent copy).
    expect(screen.getByText(/82kg • 15% BF/)).toBeTruthy();
    expect(screen.getByText(/83kg • 16% BF/)).toBeTruthy();

    // The falsy-`&&` → ternary-with-null fix: entry m1 carries waistCm → a single
    // `W:` badge renders; entry m2 omits it → no second badge (and, critically, no
    // crash from a leaked falsy value).
    expect(screen.getByText(/W: 85/)).toBeTruthy();
    expect(screen.getAllByText(/^W: /)).toHaveLength(1);

    // …and neither edge-state copy is present on the loaded branch.
    expect(screen.queryByText('No measurements yet')).toBeNull();
    expect(screen.queryByText("Couldn't load history")).toBeNull();
  });

  // ── Test E: key touchables expose role + label; submit reflects pending ──────
  test('a11y: touchables expose role/label and the submit reflects the mutation pending state', () => {
    // Idle first: the submit is not disabled / busy.
    mockHistory.data = [];
    const { unmount } = renderScreen();

    const back = screen.getByLabelText('Go back');
    expect(back.props.accessibilityRole).toBe('button');

    // The tape-measurements disclosure toggle (collapsed by default).
    const toggle = screen.getByLabelText('Add tape measurements');
    expect(toggle.props.accessibilityRole).toBe('button');

    const submitIdle = screen.getByLabelText('Save snapshot');
    expect(submitIdle.props.accessibilityRole).toBe('button');
    // Idle → neither disabled nor busy.
    expect(submitIdle.props.accessibilityState).toMatchObject({ disabled: false, busy: false });

    // Now re-render with the log mutation in flight: the submit control announces
    // its disabled + busy state (so assistive tech doesn't fire a no-op tap).
    unmount();
    mockMutation.isPending = true;
    renderScreen();

    const submitBusy = screen.getByLabelText('Save snapshot');
    expect(submitBusy.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });

  // ── Test F: NON-weight fields are finite-guarded too (not just weight) ────────
  // Regression for FINDING 5: handleLog used to gate on a weight-only hasErrors,
  // so a non-numeric body-fat / tape-measurement entry (parseFloat → NaN) escaped
  // to the API. Now EVERY provided field is validated; any non-finite / out-of-range
  // value surfaces an inline error AND disables the Save control.
  test('validation: a non-numeric Body Fat % entry surfaces an inline error and disables Save', () => {
    mockHistory.data = [];
    renderScreen();

    // Idle (all fields empty) → Save enabled.
    expect(
      screen.getByLabelText('Save snapshot').props.accessibilityState,
    ).toMatchObject({ disabled: false });

    // Type garbage into Body Fat % — parseFloat('abc') === NaN. Pre-fix this slipped
    // through because only `weight` was validated.
    fireEvent.changeText(screen.getByLabelText('Body Fat %'), 'abc');

    // The honest inline error appears on the Body Fat field…
    expect(screen.getByText('Enter a valid body fat % greater than 0.')).toBeTruthy();
    // …and the Save control is now disabled so the NaN can never reach the API.
    expect(
      screen.getByLabelText('Save snapshot').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  // ── Test G: out-of-range tape measurement (cm) is rejected ───────────────────
  test('validation: an out-of-range tape measurement disables Save with an inline error', () => {
    mockHistory.data = [];
    renderScreen();

    // Reveal the tape-measurement inputs.
    fireEvent.press(screen.getByLabelText('Add tape measurements'));

    // A wildly out-of-range waist (cm) value — beyond MEASUREMENT_CM_MAX (300).
    fireEvent.changeText(screen.getByLabelText('Waist (cm)'), '9999');

    expect(screen.getByText('waist must be 300 or less.')).toBeTruthy();
    expect(
      screen.getByLabelText('Save snapshot').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });
});
