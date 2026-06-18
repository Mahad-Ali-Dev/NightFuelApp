/**
 * sleep-optimizer.test.tsx
 *
 * Render coverage for the NEW "Light Timing" GlassCard on the Sleep Optimizer
 * screen (`app/(shifts)/sleep-optimizer.tsx`). The screen gained a second query
 * — `useQuery({ queryKey: ['current-shift'], queryFn: getCurrent })` — and a
 * GlassCard that derives the SEEK / AVOID light windows from that shift via the
 * pure `computeLightPlan` (src/lib/lightPlan.ts). This suite pins the section's
 * three load-bearing branches so a future change can't silently regress them:
 *
 *   - Test A (shift loading): while ['current-shift'] is `isLoading`, the
 *     Light-timing section shows its Skeleton fallback ONLY — neither the
 *     populated window labels ("Seek Light" / "Avoid Light") nor the no-shift
 *     EmptyState are in the tree yet. (sleep-analytics is resolved so the screen
 *     is past its own top-level skeleton and the section is reached.)
 *   - Test B (no shift): with ['current-shift'] resolved to `null`, the section
 *     falls back to its EmptyState ("No shift to plan light around") and renders
 *     NO seek/avoid windows — never a crash.
 *   - Test C (populated shift): with a real shift, BOTH the "Seek Light" and
 *     "Avoid Light" rows render, each printing the window formatted from
 *     `computeLightPlan`'s actual instants (derived here against the SAME ISO so
 *     the assertion is timezone-portable, mirroring dashboard.shiftTransition).
 *
 * A malformed-shift guard is also covered: a shift with an unparseable ISO makes
 * `computeLightPlan` throw, and the screen's try/catch must degrade to the same
 * EmptyState as the no-shift branch (no crash, no windows).
 *
 * Mock conventions mirror the sibling screen suites (circadian / shift-detail /
 * dashboard.shiftTransition): `@tanstack/react-query` is stubbed and branches on
 * queryKey[0] (a mutable `mockShiftState` holder drives ['current-shift'] and a
 * mutable `mockAnalyticsState` drives ['sleep-analytics']); useMutation /
 * useQueryClient are benign no-ops (the Log-Rest-Block mutation isn't exercised);
 * `@/api/sleep` + `@/api/shifts` are plain jest.fns so the real axios client
 * (via @/api/client) never loads (the queryFns are never invoked — useQuery is
 * fully stubbed); expo-router, safe-area insets, @expo/vector-icons,
 * expo-linear-gradient and expo-status-bar are stubbed the same way as the rest
 * of the suite. The `@/components/ui` barrel + GlassCard are left REAL — the
 * assertions ride on the actual EmptyState copy and the real GlassCard/Skeleton
 * render fine under the icon/gradient/blur stubs (exactly like circadian.test).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Controlled state for the two queries the screen runs. Each test mutates these
// holders BEFORE render() to pick the branch under test; the useQuery stub reads
// them at call-time so the chosen branch is honoured. `mock` name prefix is
// required for jest's out-of-scope hoisting rule.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockAnalyticsState: QueryState = { data: {}, isLoading: false, isError: false };
const mockShiftState: QueryState = { data: null, isLoading: false, isError: false };
const mockAnalyticsRefetch = jest.fn();

// react-query: branch on queryKey[0]. ['sleep-analytics'] reads the analytics
// holder (resolved by default so the screen is past its own top-level skeleton/
// error and the Light-timing section is reached); ['current-shift'] reads the
// shift holder. useMutation / useQueryClient are benign no-ops — the
// Log-Rest-Block mutation and cache invalidation aren't exercised here.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'sleep-analytics') {
      return {
        data: mockAnalyticsState.data,
        isLoading: mockAnalyticsState.isLoading,
        isError: mockAnalyticsState.isError,
        refetch: mockAnalyticsRefetch,
      };
    }
    if (key === 'current-shift') {
      return {
        data: mockShiftState.data,
        isLoading: mockShiftState.isLoading,
        isError: mockShiftState.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API modules the screen statically imports — stub to plain jest.fns so the real
// axios client (via @/api/client) and its env config never load. useQuery is
// fully stubbed above, so these queryFns are never actually invoked; they only
// satisfy the import graph.
jest.mock('@/api/sleep', () => ({ getAnalytics: jest.fn(), log: jest.fn() }));
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));

// expo-router: the screen only calls router.back(); a no-op stub is enough.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

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
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
// The REAL pure window math — imported so the populated-case expectations are
// derived from the SAME instants the screen renders (no hand-replicated offsets),
// keeping the assertion correct regardless of the CI runner's timezone. It is
// dependency-free (only ./shiftTransition), so importing it pulls in no native
// modules.
import { computeLightPlan } from '@/lib/lightPlan';
import SleepOptimizerScreen from '../../app/(shifts)/sleep-optimizer';

/**
 * Mirror of the screen's private `formatLightTime` (toLocaleTimeString with
 * { hour: 'numeric', minute: '2-digit' }). Re-derived here — rather than pinning
 * a wall-clock string — so the assertion is correct regardless of the CI
 * runner's timezone: we format the SAME instant the screen formats.
 */
function fmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** The window range string the screen renders for a {start,end} pair. */
function windowText(w: { start: Date; end: Date }): string {
  return `${fmt(w.start)} – ${fmt(w.end)}`;
}

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <SleepOptimizerScreen />
    </ThemeContext.Provider>,
  );
}

// A fixed active night shift for the populated case. The light windows derive
// purely from these ISO instants, so only their presence + stability matter.
const ACTIVE_SHIFT = {
  id: 'shift-1',
  userId: 'u-1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
  timezone: 'UTC',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

describe('SleepOptimizerScreen — Light Timing card', () => {
  beforeEach(() => {
    // Analytics resolved by default so the screen is past its own top-level
    // skeleton/error and the Light-timing section is reached. Each test sets the
    // shift branch it needs.
    mockAnalyticsState.data = { qualityScore: 80, summary: 'Looking good.' };
    mockAnalyticsState.isLoading = false;
    mockAnalyticsState.isError = false;
    mockShiftState.data = null;
    mockShiftState.isLoading = false;
    mockShiftState.isError = false;
    mockAnalyticsRefetch.mockClear();
  });

  // ── Test A: shift loading → Skeleton fallback only ────────────────────────
  test('shift loading: the Light-timing section shows the skeleton only — no windows, no empty state', () => {
    mockShiftState.isLoading = true;
    mockShiftState.data = undefined;

    expect(() => renderScreen()).not.toThrow();

    // The section header is always rendered in the loaded ScrollView…
    expect(screen.getByText('Light Timing')).toBeTruthy();
    // …but while the shift query is in flight neither the populated window rows
    // nor the no-shift EmptyState are in the tree yet (skeleton fallback).
    expect(screen.queryByText('Seek Light')).toBeNull();
    expect(screen.queryByText('Avoid Light')).toBeNull();
    expect(screen.queryByText('No shift to plan light around')).toBeNull();
  });

  // ── Test B: no shift → EmptyState, no windows ─────────────────────────────
  test('no shift: renders the Light-timing EmptyState with NO seek/avoid windows', () => {
    mockShiftState.data = null;
    mockShiftState.isLoading = false;

    renderScreen();

    // The honest no-shift fallback copy (not the populated rows).
    expect(screen.getByText('No shift to plan light around')).toBeTruthy();
    expect(screen.getByText('Log a shift to see when to seek and avoid light.')).toBeTruthy();
    // No light windows render without a shift.
    expect(screen.queryByText('Seek Light')).toBeNull();
    expect(screen.queryByText('Avoid Light')).toBeNull();
  });

  // ── Test C: populated shift → both windows with computeLightPlan instants ──
  test('populated shift: renders both Seek Light and Avoid Light windows from computeLightPlan instants', () => {
    mockShiftState.data = ACTIVE_SHIFT;
    mockShiftState.isLoading = false;

    // Derive expectations from the REAL pure compute against the SAME shift, so
    // the formatted strings match whatever the runner's tz is.
    const plan = computeLightPlan(ACTIVE_SHIFT);
    const seekText = windowText(plan.seekLight);
    const avoidText = windowText(plan.avoidLight);

    renderScreen();

    // Both window rows are present…
    expect(screen.getByText('Seek Light')).toBeTruthy();
    expect(screen.getByText('Avoid Light')).toBeTruthy();
    // …each printing the window range formatted from computeLightPlan's instants.
    expect(screen.getByText(seekText)).toBeTruthy();
    expect(screen.getByText(avoidText)).toBeTruthy();
    // The no-shift EmptyState must NOT be present for a populated shift.
    expect(screen.queryByText('No shift to plan light around')).toBeNull();
  });

  // ── Malformed-shift guard: computeLightPlan throws → EmptyState, no crash ──
  test('malformed shift (unparseable ISO): the try/catch degrades to the EmptyState, never a crash, no windows', () => {
    // A shift whose ISO is garbage — computeShiftTransition (and therefore
    // computeLightPlan) throws by contract rather than producing NaN windows.
    mockShiftState.data = {
      id: 'shift-x',
      userId: 'u-1',
      type: 'night',
      startTime: 'not-a-real-iso',
      endTime: 'also-bad',
      timezone: 'UTC',
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    };
    mockShiftState.isLoading = false;

    // The screen must not crash on the thrown error…
    expect(() => renderScreen()).not.toThrow();

    // …and falls back to the same EmptyState as the no-shift branch, with no
    // (NaN) window rows.
    expect(screen.getByText('No shift to plan light around')).toBeTruthy();
    expect(screen.queryByText('Seek Light')).toBeNull();
    expect(screen.queryByText('Avoid Light')).toBeNull();
  });
});
