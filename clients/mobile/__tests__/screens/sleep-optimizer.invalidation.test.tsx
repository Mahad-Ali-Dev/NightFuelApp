/**
 * sleep-optimizer.invalidation.test.tsx
 *
 * Behaviour lock on the SLEEP-CACHE INVALIDATION performed by the shift
 * Sleep-Optimizer screen (`app/(shifts)/sleep-optimizer.tsx`). The screen's
 * quick "Log Rest Block" action records an 8h sleep block; on success its
 * `logMutation.onSuccess` MUST refresh the full sleep cache set via the shared
 * `invalidateSleep` helper — NOT just ['sleep-analytics'] as it did before.
 *
 * The load-bearing assertion (sleep "split-brain" consumer #2): a successful
 * sleep log from this screen must invalidate ['sleep-sessions'] (the log-sleep
 * modal's Recovery-History session list), ['sleep-analytics'] (the analytics /
 * quality summary), AND ['today-progress'] (the dashboard ring, a preserved
 * no-op) — the exact key set centralised in src/utils/invalidateSleep.ts. Before
 * this fix the screen invalidated ['sleep-analytics'] ONLY, leaving the
 * Recovery-History list stale after a quick log here; this test fails closed if
 * any of the three keys ever stops being invalidated (e.g. a regression back to
 * the standalone ['sleep-analytics']-only call).
 *
 * This is a SEPARATE suite from the pre-existing sleep-optimizer.test.tsx (a
 * render-state suite with a deliberately no-op useQueryClient that does NOT
 * exercise invalidation). Ownership stays disjoint: that suite is left untouched
 * and is not imported here.
 *
 * Mock conventions mirror the sibling log-shift.test.tsx invalidation suite:
 * `@tanstack/react-query` captures the mutation's `onSuccess` into a holder and
 * returns a stable `invalidateQueries` spy from useQueryClient (plus a `useQuery`
 * stub returning a benign current-shift / resolved analytics so the screen
 * mounts past its top-level skeleton); `@/api/sleep` (`log`) + `@/api/shifts`
 * (`getCurrent`) are stubbed so the real axios client never loads; the
 * `@/components/ui` barrel, the deep GlassCard / CircularProgress imports,
 * @expo/vector-icons, react-native-safe-area-context, expo-linear-gradient and
 * expo-status-bar are stubbed with lightweight components so importing the screen
 * pulls in no native module (expo-blur via GlassCard, the gradient native module,
 * etc.). The real `invalidateSleep` helper is left UNMOCKED — this suite asserts
 * the keys IT performs, which is exactly the contract under test.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// react-query: capture the mutation's onSuccess so the test can drive the success
// path and observe the cache invalidation it performs; isPending is fixed false
// so the Log-Rest-Block button renders its label, not the spinner. useQuery is
// stubbed to keep the screen mounted: ['sleep-analytics'] resolves to a benign
// payload (past the top-level skeleton/error) and ['current-shift'] resolves to a
// benign current shift. useQueryClient returns a stable invalidateQueries spy.
const mockMutate = jest.fn();
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'sleep-analytics') {
      return {
        data: { qualityScore: 80, summary: 'Looking good.' },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'current-shift') {
      // A benign active shift so the screen mounts; the Light-timing math is not
      // exercised by this invalidation suite.
      return {
        data: {
          id: 'shift-1',
          userId: 'u-1',
          type: 'night',
          startTime: '2026-06-13T22:00:00.000Z',
          endTime: '2026-06-14T06:00:00.000Z',
          timezone: 'UTC',
          createdAt: '2026-06-10T00:00:00.000Z',
          updatedAt: '2026-06-10T00:00:00.000Z',
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ onSuccess }: { onSuccess?: (data?: unknown) => unknown }) => {
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false, isError: false, reset: jest.fn() };
  },
  useQueryClient: () => mockQueryClient,
}));

// API modules the screen statically imports — stub to plain jest.fns so the real
// axios client (via @/api/client) and its env config never load. useQuery /
// useMutation are fully stubbed above, so these are never actually invoked; they
// only satisfy the import graph.
jest.mock('@/api/sleep', () => ({ getAnalytics: jest.fn(), log: jest.fn() }));
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));

// The @/components/ui barrel re-exports Skeleton / EmptyState (and, via the
// barrel's own re-exports, GlassCard → SafeBlurView → expo-blur). The screen also
// imports GlassCard and CircularProgress from their deep paths. Stub all of them
// with lightweight passthroughs so importing the screen pulls in no native
// module. Children are rendered so the ScrollView body (incl. the Log-Rest-Block
// button) mounts.
jest.mock('@/components/ui', () => {
  const RN = require('react-native');
  return {
    Skeleton: (props: any) => <RN.View {...props} />,
    EmptyState: ({ title }: any) => <RN.Text>{title}</RN.Text>,
  };
});
jest.mock('@/components/ui/GlassCard', () => {
  const RN = require('react-native');
  return { GlassCard: ({ children, style }: any) => <RN.View style={style}>{children}</RN.View> };
});
jest.mock('@/components/ui/CircularProgress', () => {
  const RN = require('react-native');
  return { CircularProgress: (props: any) => <RN.View {...props} /> };
});

// expo-router: the screen only calls router.back(); a no-op stub is enough.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the sibling
// suites). Otherwise pulls in expo-font → expo-asset.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
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
import { render } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import SleepOptimizerScreen from '../../app/(shifts)/sleep-optimizer';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <SleepOptimizerScreen />
    </ThemeContext.Provider>,
  );
}

describe('SleepOptimizerScreen — sleep-log cache invalidation', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockInvalidateQueries.mockClear();
    mockOnSuccess.current = null;
  });

  // ── Split-brain consumer #2 regression lock ───────────────────────────────
  // A successful "Log Rest Block" must refresh the FULL sleep cache set via the
  // shared invalidateSleep helper — ['sleep-sessions'] + ['sleep-analytics'] +
  // ['today-progress'] — not just ['sleep-analytics'] as it did before. Dropping
  // the Recovery-History (['sleep-sessions']) invalidation (a regression to the
  // old standalone analytics-only call) must turn this test red.
  test('success: invalidates sleep-sessions + sleep-analytics + today-progress (full sleep set, not analytics-only)', () => {
    renderScreen();

    // The screen registered an onSuccess via useMutation.
    expect(mockOnSuccess.current).toBeTruthy();

    // Drive the success path (as react-query would after log() resolves).
    mockOnSuccess.current!({ id: 'sleep-1' });

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([['sleep-sessions'], ['sleep-analytics'], ['today-progress']]),
    );

    // The Recovery-History session-list key specifically — the one this fix added
    // (the old onSuccess invalidated ['sleep-analytics'] only); deleting that
    // invalidation must turn this test red.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['sleep-sessions'] });
    // …and the dashboard ring key, the third member of the shared sleep set.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['today-progress'] });
    // …and the original analytics key is still refreshed (behaviour-preserving).
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['sleep-analytics'] });
  });
});
