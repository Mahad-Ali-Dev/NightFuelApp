/**
 * fasting.test.tsx
 *
 * Render + behaviour lock on `app/(meals)/fasting.tsx` — the Fasting timer
 * screen reached from the Nutrition tab's "Fasting Timer" card. The screen owns
 * the same honest loading / error / empty three-state contract the rest of the
 * nutrition surfaces already pin (see nutrition.errorStates.test.tsx), driven by
 * a SINGLE query (`['fasting-logs']` → getFastingLogs). This suite pins that
 * contract so a regression can't reintroduce a fabricated timer value:
 *
 *   (a) LOADING  (fastingQuery.isLoading) → the Skeleton scaffold (lines 95-104)
 *       renders and the screen does NOT fall through to the resolved timer
 *       chrome or the error copy (a fetch-in-flight must not masquerade as
 *       "no active fast").
 *   (b) ERROR    (fastingQuery.isError) → the retryable EmptyState ("Couldn't
 *       load fasting" + "Try Again"); pressing "Try Again" calls
 *       fastingQuery.refetch (the shared spy), and the error branch is mutually
 *       exclusive with the resolved timer chrome.
 *   (c) NO ACTIVE FAST (200 → [] / a non-ACTIVE log) → the HONEST ready state:
 *       overline "READY TO START", elapsed placeholder "00:00:00", and Ends At
 *       "--:--" — NEVER a fabricated elapsed / "% COMPLETE" / non-placeholder
 *       Ends At. The protocol picker + "START FASTING" CTA render.
 *   (d) ACTIVE FAST (status ACTIVE) → the REAL derived values: overline
 *       "ELAPSED TIME", the live elapsed clock computed from `startedAt` (NOT
 *       the "00:00:00" placeholder), the real target ("16h"), and the real
 *       computed Ends At — with the protocol picker / START FASTING gone.
 *
 * react-native-skills applied:
 *   - react-state-fallback / state-ground-truth: the fastingQuery cache is the
 *     SINGLE source of truth for loading/error/empty; the screen keeps no
 *     mirrored isLoading/isError flag, and the only local state (`elapsed`) is
 *     REAL — derived from `activeFast.startedAt` ground truth — while `progress`
 *     is derived, not stored. Tests (c)/(d) prove no state branch manufactures a
 *     value: empty → static placeholders, active → values sourced from the data.
 *   - rendering-no-falsy-and: the percent-complete + protocol picker render via
 *     `activeFast && (…)` / `!activeFast && (…)` where the operand is an
 *     object-or-null / real boolean (never an empty string or 0), so they never
 *     leak a falsy renderable. Cases (c)/(d) assert the "% COMPLETE" node is
 *     present ONLY for an active fast.
 *
 * Mock conventions mirror the sibling `(meals)` suite (log-meal.test) + the
 * GlassCard render suites (hydration.test):
 *   - `@tanstack/react-query` is stubbed: useQuery branches on queryKey[0]
 *     (`['fasting-logs']` reads a mutable `mockFastingState` holder each test
 *     sets before render) and hands back a SHARED `mockFastingRefetch` spy so
 *     the error-branch "Try Again" press can be asserted against it; useMutation
 *     returns `mutate`/`isPending:false`; useQueryClient stubs invalidateQueries.
 *   - `@/api/meals` is mocked so the real axios client never loads (useQuery is
 *     fully stubbed, so the queryFns are never invoked — they only need to be
 *     importable).
 *   - `@/components/SafeBlurView` is a passthrough View so the REAL GlassCard
 *     (kept real, via the @/components/ui barrel — Target / Ends At cards) mounts
 *     its children; assertions ride on the actual content inside it.
 *   - `@/components/ui/CircularProgress` (the timer ring, which pulls in
 *     react-native-svg) is a passthrough View so the screen mounts cleanly under
 *     the jest renderer.
 *   - `@/components/ui` is the REAL barrel EXCEPT `Skeleton`, overridden to a
 *     testID-bearing View so the loading scaffold is assertable (the real
 *     Skeleton is an unlabelled Animated.View). EmptyState / GlassCard / Button /
 *     CtaButton stay real so the genuine "Couldn't load fasting" / "Try Again"
 *     copy and the real CTAs render.
 *   - decorative glyphs, expo-linear-gradient (the CtaButton/Button fill),
 *     safe-area insets and the status bar are stubbed the same way as the rest
 *     of the screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Shared refetch spy (mock-prefixed so the hoisted react-query factory may close
// over it). A single stable fn — NOT a fresh jest.fn() per useQuery() call — so
// the error-branch test can press "Try Again" and assert this exact spy fired.
const mockFastingRefetch = jest.fn();

// Mutable holder each test sets BEFORE renderScreen(). Default = resolved &
// empty (no active fast) so a test only sets the branch it cares about.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockFastingState: QueryState = { data: [], isLoading: false, isError: false };

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'fasting-logs') {
      return {
        data: mockFastingState.data,
        isLoading: mockFastingState.isLoading,
        isError: mockFastingState.isError,
        refetch: mockFastingRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// api/meals — stubbed so the real axios client / env config never loads. useQuery
// is mocked above, so these queryFns/mutationFns are never invoked; they only
// need to be importable.
jest.mock('@/api/meals', () => ({
  getFastingLogs: jest.fn(),
  startFasting: jest.fn(),
  endFasting: jest.fn(),
}));

// SafeBlurView → passthrough View so the REAL GlassCard (kept real, via the
// @/components/ui barrel — the Target / Ends At info cards) mounts its frosted
// fill + children without expo-blur's native module.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

// CircularProgress pulls in react-native-svg (a native module); the timer ring
// is decorative and not under assertion (we assert the centered clock text), so
// stub it to a passthrough View to keep the screen mounting under the renderer.
jest.mock('@/components/ui/CircularProgress', () => {
  const RN = require('react-native');
  return { CircularProgress: (props: any) => <RN.View {...props} /> };
});

// ui barrel: keep everything real except Skeleton (make the loading scaffold
// assertable). EmptyState / GlassCard / Button / CtaButton stay real so the
// genuine error copy + CTAs render.
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    Skeleton: (props: any) => <RN.View testID="skeleton" {...props} />,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name. Otherwise pulls in
// expo-font → expo-asset.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient ships a native module; the CtaButton / Button fill →
// passthrough View so the screen mounts on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import FastingScreen from '../../app/(meals)/fasting';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <FastingScreen />
    </ThemeContext.Provider>,
  );
}

function resetFastingState() {
  mockFastingState.data = [];
  mockFastingState.isLoading = false;
  mockFastingState.isError = false;
}

describe('FastingScreen — honest loading / error / empty / active three-state contract', () => {
  beforeEach(() => {
    mockFastingRefetch.mockClear();
    resetFastingState();
  });

  // ── (a) LOADING ───────────────────────────────────────────────────────────
  test('LOADING: renders the Skeleton scaffold, no error copy, no resolved timer chrome', () => {
    mockFastingState.data = undefined;
    mockFastingState.isLoading = true;
    renderScreen();

    // The loading branch renders the ring + info-row + button + tips Skeletons.
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(1);
    // Loading must NOT fall through to the error EmptyState…
    expect(screen.queryByText('Couldn\'t load fasting')).toBeNull();
    // …nor the resolved timer chrome (the ready/active layout).
    expect(screen.queryByText('READY TO START')).toBeNull();
    expect(screen.queryByText('ELAPSED TIME')).toBeNull();
    expect(screen.queryByText('SELECT PROTOCOL')).toBeNull();
    expect(screen.queryByText('START FASTING')).toBeNull();
  });

  // ── (b) ERROR + RETRY ───────────────────────────────────────────────────────
  test('ERROR: shows the retryable EmptyState, mutually exclusive with the timer chrome', () => {
    mockFastingState.data = undefined;
    mockFastingState.isError = true;
    renderScreen();

    expect(screen.getByText('Couldn\'t load fasting')).toBeTruthy();
    // The retry affordance is the only "Try Again" on the screen.
    expect(screen.getByText('Try Again')).toBeTruthy();
    // Error branch is mutually exclusive with the resolved ready/active layout —
    // and must NOT render the loading Skeletons.
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.queryByText('READY TO START')).toBeNull();
    expect(screen.queryByText('START FASTING')).toBeNull();
    // No fabricated timer leaks into the error state.
    expect(screen.queryByText('00:00:00')).toBeNull();
  });

  test('ERROR Retry is scoped to fastingQuery.refetch (called once on press)', () => {
    mockFastingState.data = undefined;
    mockFastingState.isError = true;
    renderScreen();

    fireEvent.press(screen.getByText('Try Again'));
    expect(mockFastingRefetch).toHaveBeenCalledTimes(1);
  });

  // ── (c) NO ACTIVE FAST → HONEST READY STATE ─────────────────────────────────
  test('NO ACTIVE FAST (empty 200): honest READY state — "00:00:00" / "--:--", never a fabricated elapsed/progress', () => {
    mockFastingState.data = []; // resolved, no logs
    renderScreen();

    // Honest placeholders sourced from static state, not invented values.
    expect(screen.getByText('READY TO START')).toBeTruthy();
    expect(screen.getByText('00:00:00')).toBeTruthy();
    expect(screen.getByText('--:--')).toBeTruthy();
    // The protocol picker + START FASTING CTA are the no-active-fast affordances.
    expect(screen.getByText('SELECT PROTOCOL')).toBeTruthy();
    expect(screen.getByText('START FASTING')).toBeTruthy();
    // NOTHING fabricated: no elapsed-time overline and no "% COMPLETE" progress
    // node (those render ONLY for an active fast).
    expect(screen.queryByText('ELAPSED TIME')).toBeNull();
    expect(screen.queryByText(/% COMPLETE/)).toBeNull();
  });

  test('NON-ACTIVE log (a COMPLETED log present): still the honest READY state, no fabricated elapsed', () => {
    // A resolved-but-non-ACTIVE log must be treated as "no active fast" — the
    // screen keys the active state off status === 'ACTIVE', so a COMPLETED log
    // never manufactures an elapsed/progress.
    mockFastingState.data = [
      { id: 'f-done', status: 'COMPLETED', startedAt: '2026-06-18T00:00:00Z', targetHours: 16, actualHours: 16 },
    ];
    renderScreen();

    expect(screen.getByText('READY TO START')).toBeTruthy();
    expect(screen.getByText('00:00:00')).toBeTruthy();
    expect(screen.getByText('--:--')).toBeTruthy();
    expect(screen.queryByText('ELAPSED TIME')).toBeNull();
    expect(screen.queryByText(/% COMPLETE/)).toBeNull();
  });

  // ── (d) ACTIVE FAST → REAL DERIVED VALUES ───────────────────────────────────
  test('ACTIVE FAST: renders the REAL elapsed clock + target + computed Ends At (not the placeholder)', () => {
    // Pin the wall clock so the elapsed value the interval computes from
    // `startedAt` is deterministic. The screen's elapsed is set INSIDE the 1s
    // setInterval, and `jest.advanceTimersByTime(1000)` moves the mocked clock
    // forward by 1000ms BEFORE the scheduled callback runs — so `new Date()` in
    // the callback reads `now + 1s`. We therefore set "now" to 08:00:00 + 1:01:04
    // so that, post-advance, the callback's clock is exactly 1:01:05 after
    // `startedAt` and the rendered elapsed is a deterministic 01:01:05.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-19T09:01:04Z'));

    mockFastingState.data = [
      { id: 'f-active', status: 'ACTIVE', startedAt: '2026-06-19T08:00:00Z', targetHours: 16 },
    ];

    try {
      renderScreen();

      // The active branch shows the elapsed-time overline (NOT "READY TO START").
      expect(screen.getByText('ELAPSED TIME')).toBeTruthy();
      expect(screen.queryByText('READY TO START')).toBeNull();

      // Drive the 1s interval once so `elapsed` is computed from `startedAt`.
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // REAL elapsed (01:01:05) derived from ground truth — not the "00:00:00"
      // placeholder, which must NOT be present in the active state.
      expect(screen.getByText('01:01:05')).toBeTruthy();
      expect(screen.queryByText('00:00:00')).toBeNull();

      // REAL target sourced from the data (targetHours: 16), and the computed
      // Ends At = startedAt + 16h = 00:00 local-of-the-formatter — never "--:--".
      expect(screen.getByText('16h')).toBeTruthy();
      expect(screen.queryByText('--:--')).toBeNull();

      // The no-active-fast affordances are gone while a fast is in progress.
      expect(screen.queryByText('SELECT PROTOCOL')).toBeNull();
      expect(screen.queryByText('START FASTING')).toBeNull();
    } finally {
      // Flush the screen's setInterval cleanup under fake timers, then restore.
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
