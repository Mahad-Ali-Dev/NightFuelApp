/**
 * log-sleep.test.tsx
 *
 * Behaviour lock on `app/(modals)/log-sleep.tsx` — the PRIMARY Sleep & Recovery
 * logging modal. The screen validates a sleep form and, on a successful create,
 * must refresh every React-Query cache key that feeds a sleep surface.
 *
 * The load-bearing assertion (sleep split-brain consumer #1): the mutation's
 * onSuccess must route through the shared `invalidateSleep(queryClient)` helper,
 * which invalidates ['sleep-sessions'] + ['sleep-analytics'] + ['today-progress'].
 * Before this fix the screen invalidated only ['today-progress'] + ['sleep-
 * sessions'] and NOT ['sleep-analytics'] — so logging a sleep here left the Sleep
 * Optimizer's quality score + 7-day chart (which read off ['sleep-analytics'] in
 * app/(shifts)/sleep-optimizer.tsx) stale until a cold refetch. The explicit
 * toHaveBeenCalledWith({ queryKey: ['sleep-analytics'] }) below fails closed:
 * dropping the analytics refresh from the helper (or bypassing the helper) turns
 * this test red.
 *
 * Mock conventions mirror the sibling log-shift suite: expo-router exposes a
 * hoisted `mockBack`; `@tanstack/react-query` captures the mutation's `onSuccess`
 * into a holder and returns a stable `invalidateQueries` spy from useQueryClient
 * (and a benign useQuery stub for the screen's own ['sleep-sessions'] list query);
 * `@/api/sleep`'s `log`/`listSessions` are stubbed so the real axios client never
 * loads; and the `@/components/ui` barrel + icons + safe-area + status-bar are
 * stubbed lightweight so no native module (expo-blur via GlassCard, the native
 * date picker) loads at import time.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

// react-query: capture the mutation's onSuccess so the test can drive the success
// path and observe the cache invalidation it performs; isPending is fixed false
// so the Save button renders its label, not the spinner. useQuery is a benign
// stub for the screen's own ['sleep-sessions'] history query (empty list → the
// screen renders its empty state; the queryFn is never actually called).
const mockMutate = jest.fn();
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useMutation: ({ onSuccess }: { onSuccess?: (data?: unknown) => unknown }) => {
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => mockQueryClient,
}));

// api/sleep — `log` (aliased `logSleep` in the screen) + `listSessions` are
// stubbed so the real axios client (via @/api/client) never loads.
const mockLogSleep = jest.fn((..._args: unknown[]) => Promise.resolve({ id: 'sleep-1' }));
const mockListSessions = jest.fn((..._args: unknown[]) => Promise.resolve([]));
jest.mock('@/api/sleep', () => ({
  log: (...args: any[]) => mockLogSleep(...args),
  listSessions: (...args: any[]) => mockListSessions(...args),
}));

// The @/components/ui barrel re-exports Card/Skeleton/EmptyState (→ GlassCard →
// SafeBlurView → expo-blur) and DateTimeField (→ a native date picker); stub the
// handful log-sleep imports with lightweight components so importing the barrel
// pulls in no native module. nowDateString/nowTimeString are the same fixed
// helpers the sibling suite uses.
jest.mock('@/components/ui', () => {
  const RN = require('react-native');
  return {
    Button: ({ title, onPress, accessibilityLabel }: any) => (
      <RN.Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
        <RN.Text>{title}</RN.Text>
      </RN.Pressable>
    ),
    Card: ({ children }: any) => <RN.View>{children}</RN.View>,
    Skeleton: () => <RN.View />,
    EmptyState: ({ title, actionLabel, onAction }: any) => (
      <RN.View>
        <RN.Text>{title}</RN.Text>
        {actionLabel ? (
          <RN.Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction}>
            <RN.Text>{actionLabel}</RN.Text>
          </RN.Pressable>
        ) : null}
      </RN.View>
    ),
    DateTimeField: ({ label }: any) => <RN.Text>{label ?? ''}</RN.Text>,
    nowDateString: () => '2026-06-20',
    nowTimeString: () => '12:00',
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import LogSleepModal from '../../app/(modals)/log-sleep';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <LogSleepModal />
    </ThemeContext.Provider>,
  );
}

describe('LogSleepModal', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogSleep.mockClear();
    mockListSessions.mockClear();
    mockInvalidateQueries.mockClear();
    mockOnSuccess.current = null;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  test('renders the modal (Sleep & Recovery header)', () => {
    expect(() => renderScreen()).not.toThrow();
    expect(screen.getByText('Sleep & Recovery')).toBeTruthy();
  });

  // ── Sleep split-brain regression lock ─────────────────────────────────────
  // A successful sleep create must refresh ALL three sleep cache keys via the
  // shared invalidateSleep helper — in particular ['sleep-analytics'], the Sleep
  // Optimizer's quality-score + 7-day-chart key, which the manual invalidation
  // here used to omit (it hit only ['today-progress'] + ['sleep-sessions']).
  test('success: invalidates sleep-sessions + sleep-analytics + today-progress (via invalidateSleep)', () => {
    renderScreen();

    // The screen registered an onSuccess via useMutation.
    expect(mockOnSuccess.current).toBeTruthy();

    // Drive the success path (as react-query would after logSleep resolves).
    // Wrapped in act() because the screen's onSuccess also runs its form-reset
    // setState calls; the cache-invalidation assertions below are unaffected.
    act(() => {
      mockOnSuccess.current!({ id: 'sleep-1' });
    });

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([['sleep-sessions'], ['sleep-analytics'], ['today-progress']]),
    );
    // The Sleep-Optimizer analytics key specifically — the one this fix added;
    // deleting that invalidation (from the helper or here) must turn this red.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['sleep-analytics'] });

    // And the success Alert still fires.
    expect(alertSpy).toHaveBeenCalledWith('Saved ✓', 'Sleep recovery data logged successfully.');
  });
});
