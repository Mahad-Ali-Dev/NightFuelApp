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
 * A final test pins the hero + primary action (loaded state): the Sleep-Quality
 * hero GlassCard renders ("Sleep Quality Score" / "QUALITY" / the resolved score
 * + summary), and pressing the screen's only primary button — "Log Rest Block",
 * a PURPLE (colors.gradients.purple) gradient, deliberately NOT a coral CtaButton
 * — fires the UNCHANGED `onPress={() => logMutation.mutate()}` exactly once. (The
 * purple button is left verbatim: recoloring it coral / wrapping it in CtaButton
 * would manufacture a brand CTA where the screen has none, so the source is not
 * modified by the coverage item this suite belongs to.)
 *
 * Mock conventions mirror the sibling screen suites (circadian / shift-detail /
 * dashboard.shiftTransition): `@tanstack/react-query` is stubbed and branches on
 * queryKey[0] (a mutable `mockShiftState` holder drives ['current-shift'] and a
 * mutable `mockAnalyticsState` drives ['sleep-analytics']); useMutation returns a
 * hoisted `mockMutate` (so the Log-Rest-Block press can be asserted) with
 * `isPending:false` so the button renders its label; useQueryClient is a benign
 * no-op (cache invalidation isn't exercised);
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
// The "Log Rest Block" primary action calls `logMutation.mutate()` on press.
// `mutate` is a hoisted `mock`-prefixed holder (the prefix lets
// babel-plugin-jest-hoist allow the react-query factory to close over it) so the
// log-button test can assert the screen's UNCHANGED `onPress={() =>
// logMutation.mutate()}` fires exactly once. `isPending` stays false so the
// button renders its "Log Rest Block" label (not the ActivityIndicator).
const mockMutate = jest.fn();

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
  useMutation: () => ({ mutate: mockMutate, isPending: false, isError: false, reset: jest.fn() }),
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
import { render, fireEvent, screen } from '@testing-library/react-native';
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

/** Escape a string for safe interpolation into a RegExp source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A resilient matcher for a {start,end} light window. Rather than pinning the
 * exact range STRING (which couples the test to the screen's private separator —
 * an en-dash "–" today, trivially churned to "-"/"to"/whitespace), we assert the
 * row's text CONTAINS both endpoint instants formatted from computeLightPlan,
 * order-independently, via two lookaheads. This keeps the load-bearing coverage
 * ("the window prints computeLightPlan's actual instants, timezone-portable")
 * while shedding the copy-fragile glue. Returns a RegExp (not a predicate fn):
 * this RTL version's text query calls `matcher.test(content)`, so string|RegExp
 * are the supported matcher shapes.
 */
function windowMatcher(w: { start: Date; end: Date }): RegExp {
  // RTL's default normalizer trims + collapses ALL whitespace (incl. the narrow
  // no-break space ICU may emit before AM/PM) to single spaces before calling
  // matcher.test(). Mirror that collapse on each endpoint so the escaped literal
  // matches the normalized node text regardless of the runner's ICU spacing.
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const start = escapeRegExp(norm(fmt(w.start)));
  const end = escapeRegExp(norm(fmt(w.end)));
  return new RegExp(`(?=[\\s\\S]*${start})(?=[\\s\\S]*${end})`);
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
    mockMutate.mockClear();
  });

  // ── Test A: shift loading → Skeleton fallback only ────────────────────────
  test('shift loading: the Light-timing section shows the skeleton only — no windows, no empty state', () => {
    mockShiftState.isLoading = true;
    mockShiftState.data = undefined;

    expect(() => renderScreen()).not.toThrow();

    // The section header is always rendered in the loaded ScrollView ("Light
    // Timing" is a stable domain label, kept as a getByText)…
    expect(screen.getByText('Light Timing')).toBeTruthy();
    // …but while the shift query is in flight neither the populated window rows
    // nor the no-shift EmptyState are in the tree yet (skeleton fallback). We
    // assert this both via the stable Seek/Avoid domain labels AND via each
    // branch's structural glyph (sunny / glasses-outline for the rows,
    // sunny-outline for the empty state), so a copy tweak to any of those
    // strings can't mask a real regression.
    expect(screen.queryByText('Seek Light')).toBeNull();
    expect(screen.queryByText('Avoid Light')).toBeNull();
    expect(screen.queryByText('icon:sunny')).toBeNull();
    expect(screen.queryByText('icon:glasses-outline')).toBeNull();
    expect(screen.queryByText('icon:sunny-outline')).toBeNull();
  });

  // ── Test B: no shift → EmptyState, no windows ─────────────────────────────
  test('no shift: renders the Light-timing EmptyState with NO seek/avoid windows', () => {
    mockShiftState.data = null;
    mockShiftState.isLoading = false;

    renderScreen();

    // Assert the no-shift fallback via its STABLE structural marker — the
    // EmptyState's `sunny-outline` glyph, surfaced by the icon stub as
    // `icon:sunny-outline` — rather than its body-copy sentence (which is the
    // only place that glyph appears, so it uniquely pins "the no-shift
    // EmptyState rendered"). The "No shift to plan light around" title stays as
    // a getByText: it's a stable domain label, while the full subtitle sentence
    // ("Log a shift to see when to seek and avoid light.") was the copy-fragile
    // assertion and is dropped here.
    expect(screen.getByText('No shift to plan light around')).toBeTruthy();
    expect(screen.getByText('icon:sunny-outline')).toBeTruthy();
    // No light windows render without a shift — the populated rows' glyphs
    // (sunny / glasses-outline) and their domain labels are both absent.
    expect(screen.queryByText('Seek Light')).toBeNull();
    expect(screen.queryByText('Avoid Light')).toBeNull();
    expect(screen.queryByText('icon:sunny')).toBeNull();
    expect(screen.queryByText('icon:glasses-outline')).toBeNull();
  });

  // ── Test C: populated shift → both windows with computeLightPlan instants ──
  test('populated shift: renders both Seek Light and Avoid Light windows from computeLightPlan instants', () => {
    mockShiftState.data = ACTIVE_SHIFT;
    mockShiftState.isLoading = false;

    // Derive expectations from the REAL pure compute against the SAME shift, so
    // the matched instants are correct whatever the runner's tz is.
    const plan = computeLightPlan(ACTIVE_SHIFT);

    renderScreen();

    // Both window rows are present — anchored on their STABLE markers: the
    // domain labels ("Seek Light" / "Avoid Light") plus each row's structural
    // glyph (sunny for seek, glasses-outline for avoid, surfaced by the icon
    // stub). These pin "both rows rendered" without depending on body copy.
    expect(screen.getByText('Seek Light')).toBeTruthy();
    expect(screen.getByText('Avoid Light')).toBeTruthy();
    expect(screen.getByText('icon:sunny')).toBeTruthy();
    expect(screen.getByText('icon:glasses-outline')).toBeTruthy();
    // …and each row still prints the window from computeLightPlan's actual
    // instants. We match CONTAINS-both-endpoints (windowMatcher) instead of the
    // exact range string, so a separator/whitespace copy tweak can't regress
    // this while a wrong/NaN instant still would.
    expect(screen.getByText(windowMatcher(plan.seekLight))).toBeTruthy();
    expect(screen.getByText(windowMatcher(plan.avoidLight))).toBeTruthy();
    // The no-shift EmptyState must NOT be present for a populated shift — its
    // structural marker (the sunny-outline glyph) is absent.
    expect(screen.queryByText('No shift to plan light around')).toBeNull();
    expect(screen.queryByText('icon:sunny-outline')).toBeNull();
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

    // …and falls back to the same EmptyState as the no-shift branch (asserted
    // via its stable `sunny-outline` glyph marker, not its subtitle copy), with
    // no (NaN) window rows — neither the Seek/Avoid labels nor their glyphs.
    expect(screen.getByText('No shift to plan light around')).toBeTruthy();
    expect(screen.getByText('icon:sunny-outline')).toBeTruthy();
    expect(screen.queryByText('Seek Light')).toBeNull();
    expect(screen.queryByText('Avoid Light')).toBeNull();
    expect(screen.queryByText('icon:sunny')).toBeNull();
    expect(screen.queryByText('icon:glasses-outline')).toBeNull();
  });

  // ── Hero GlassCard + Log-Rest-Block handler (loaded state) ────────────────
  // The screen's only primary action is "Log Rest Block" — a PURPLE
  // (colors.gradients.purple) gradient button, NOT a coral CtaButton. It is left
  // verbatim (recoloring it coral / wrapping it in CtaButton would manufacture a
  // brand CTA where none exists), so this test pins it as-is: the hero GlassCard
  // renders in the loaded state and pressing the button fires the UNCHANGED
  // `onPress={() => logMutation.mutate()}` exactly once.
  test('loaded: the hero GlassCard renders and pressing "Log Rest Block" calls logMutation.mutate once', () => {
    // analytics resolved (beforeEach) → past the top-level skeleton/error, loaded.
    mockAnalyticsState.data = { qualityScore: 80, summary: 'Looking good.' };

    renderScreen();

    // The hero Sleep-Quality GlassCard mounted: its "Sleep Quality Score"
    // overline, the "QUALITY" ring caption, and the resolved score (80) all
    // render (the CircularProgress ring inside is decorative; the score TEXT is
    // the stable marker). The summary copy from analytics renders too.
    expect(screen.getByText('Sleep Quality Score')).toBeTruthy();
    expect(screen.getByText('QUALITY')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('Looking good.')).toBeTruthy();

    // The primary action — queried by its (stable) accessibilityLabel "Log rest
    // block" — and its visible "Log Rest Block" label both present (isPending is
    // forced false, so the label renders rather than the ActivityIndicator).
    const logBtn = screen.getByRole('button', { name: 'Log rest block' });
    expect(screen.getByText('Log Rest Block')).toBeTruthy();

    // Pressing it fires the screen's UNCHANGED handler exactly once. The mutation
    // is a no-op stub here (its real mutationFn → log() API is mocked away); we
    // assert only that the press is wired to logMutation.mutate — the load-bearing
    // behaviour — with no stray extra invocation.
    fireEvent.press(logBtn);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
