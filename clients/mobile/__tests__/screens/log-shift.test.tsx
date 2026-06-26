/**
 * log-shift.test.tsx
 *
 * Behaviour lock on `app/(modals)/log-shift.tsx` — the Log Shift modal reached
 * from the dashboard quick-actions. The screen validates a shift form and, on a
 * successful create, must invalidate every cache key that feeds a shift surface
 * before navigating back.
 *
 * The load-bearing assertion (F16 finding #2 — the dashboard Next-shift card went
 * stale after saving a new shift): the mutation's onSuccess must invalidate
 * ['current-shift'] + ['shifts'] AND ['shifts-upcoming'] — the SEPARATE key the
 * dashboard NextShiftCard countdown reads off api/shifts.list (app/(tabs)/index.tsx).
 * Without the ['shifts-upcoming'] invalidation the card stays stale until
 * refocus/staleTime; this test fails closed if that one line is ever removed.
 *
 * Mock conventions mirror the sibling (meals) suites: expo-router exposes a
 * hoisted `mockBack`; `@tanstack/react-query` captures the mutation's `onSuccess`
 * into a holder and returns a stable `invalidateQueries` spy from useQueryClient;
 * `@/api/shifts.create` is stubbed so the real axios client never loads; and the
 * `@/components/ui` barrel is stubbed with lightweight Button / DateTimeField /
 * now* so no native module (expo-blur via GlassCard, the native date picker)
 * loads at import time.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

// react-query: capture the mutation's onSuccess so the test can drive the success
// path and observe the cache invalidation + navigation it performs; isPending is
// fixed false so the Save button renders its label, not the spinner.
const mockMutate = jest.fn();
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useMutation: ({ onSuccess }: { onSuccess?: (data?: unknown) => unknown }) => {
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => mockQueryClient,
}));

// api/shifts — `create` is stubbed so the real axios client never loads.
const mockCreateShift = jest.fn((_payload?: unknown) => Promise.resolve({ id: 'shift-1' }));
jest.mock('@/api/shifts', () => ({
  create: (...args: any[]) => mockCreateShift(...args),
}));

// The @/components/ui barrel re-exports GlassCard (→ SafeBlurView → expo-blur) and
// DateTimeField (→ a native date picker); stub the handful log-shift imports with
// lightweight components so importing the barrel pulls in no native module.
jest.mock('@/components/ui', () => {
  const RN = require('react-native');
  return {
    Button: ({ title, onPress, accessibilityLabel }: any) => (
      <RN.Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
        <RN.Text>{title}</RN.Text>
      </RN.Pressable>
    ),
    DateTimeField: ({ label }: any) => <RN.Text>{label}</RN.Text>,
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
import { render, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import LogShiftModal from '../../app/(modals)/log-shift';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <LogShiftModal />
    </ThemeContext.Provider>,
  );
}

describe('LogShiftModal', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockMutate.mockClear();
    mockCreateShift.mockClear();
    mockInvalidateQueries.mockClear();
    mockOnSuccess.current = null;
  });

  test('renders the form (Add shift header + Save Shift CTA)', () => {
    expect(() => renderScreen()).not.toThrow();
    expect(screen.getByText('Add shift')).toBeTruthy();
    expect(screen.getByText('Save Shift')).toBeTruthy();
  });

  // ── F16 finding #2 regression lock ────────────────────────────────────────
  // A successful shift create must refresh ALL three shift cache keys before
  // navigating back — in particular ['shifts-upcoming'], the dashboard
  // Next-shift countdown's key, which a writer is easy to forget.
  test('success: invalidates current-shift + shifts + shifts-upcoming (dashboard Next-shift card) then navigates back', () => {
    renderScreen();

    // The screen registered an onSuccess via useMutation.
    expect(mockOnSuccess.current).toBeTruthy();

    // Drive the success path (as react-query would after createShift resolves).
    mockOnSuccess.current!({ id: 'shift-1' });

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([['current-shift'], ['shifts'], ['shifts-upcoming']]),
    );
    // The dashboard Next-shift countdown key specifically — the one F16 finding #2
    // added; deleting that invalidation must turn this test red.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['shifts-upcoming'] });

    // And it routes back after a successful save.
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
