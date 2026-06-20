/**
 * performance-reports.test.tsx
 *
 * Render + behaviour coverage for the AI Performance Reports screen
 * (`app/(performance)/reports.tsx`) — the Progress hub's "AI Reports"
 * destination — after its finite-guard + honest-state sweep:
 *
 *   - `activeReport.score` is rendered through a finite-guard (`safeScore`): a
 *     NaN / undefined / Infinity score collapses to 0, so the badge numeral
 *     never prints 'NaN'/'undefined'/'Infinity' AND the score-colour threshold
 *     (`>= 80` / `>= 60`) stays deterministic.
 *   - the history-tab calendar date is rendered through `formatHistoryDate`,
 *     which returns '' when `item.date` is missing / unparseable so
 *     'Invalid Date' never leaks.
 *   - the generate-audit mutation no longer fires `Alert.alert`; instead it
 *     drives an inline, accessible banner (a GlassCard whose inner content View
 *     carries `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`)
 *     with verbatim success/error copy and, on failure, a Retry that re-invokes
 *     the mutation.
 *
 * Mock conventions mirror the sibling area suites (performance-index /
 * calendar / nutrition.errorStates):
 *  - `@tanstack/react-query` is stubbed. `useQuery` branches on queryKey[0]
 *    (['performance-reports'] reads a mutable `mockReportsState` holder so each
 *    test picks the loading / error / loaded / empty branch) and returns the
 *    shared `mockRefetch` spy so the error branch's Retry → refetch-once can be
 *    asserted. `useMutation` captures the screen's { mutationFn, onSuccess,
 *    onError } config (so a test can fire the genuine onError/onSuccess to drive
 *    the inline banner) and returns a `mockMutate` spy + a mutable isPending
 *    flag. `useQueryClient` is a benign no-op (the onSuccess invalidateQueries
 *    isn't asserted here).
 *  - `@/api/progress` is a plain jest.fn map so the real axios client (via
 *    @/api/client) never loads; useQuery/useMutation are fully stubbed so these
 *    fns are never invoked — they only satisfy the import graph.
 *  - expo-router exposes a benign router; @expo/vector-icons → plain <Text>
 *    surfacing `icon:<name>`; safe-area insets, expo-linear-gradient and
 *    expo-status-bar are stubbed as in the rest of the suite.
 *  - `@/components/SafeBlurView` is a passthrough View so the REAL GlassCard
 *    (kept real, alongside the rest of `@/components/ui` and `@/theme`) mounts
 *    its frosted fill + children without expo-blur's native module — the
 *    assertions ride on the genuine GlassCard / EmptyState / Button surfaces.
 */

// ── Hoisted mock holders (mock-prefixed for babel-plugin-jest-hoist) ─────────
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockReportsState: QueryState = { data: [], isLoading: false, isError: false };
const mockRefetch = jest.fn();

const mockMutate = jest.fn();
const mockMutationState = { isPending: false };
let capturedMutationOptions: any = null;
const mockInvalidate = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'performance-reports') {
      return {
        data: mockReportsState.data,
        isLoading: mockReportsState.isLoading,
        isError: mockReportsState.isError,
        refetch: mockRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  // Capture the screen's lifecycle config so a test can fire the genuine
  // onError / onSuccess (the production callbacks that set auditStatus), and
  // return a mutate spy whose isPending is read from the mutable holder.
  useMutation: (options: any) => {
    capturedMutationOptions = options;
    return { mutate: mockMutate, isPending: mockMutationState.isPending };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// API module the screen statically imports — stub to plain jest.fns so the real
// axios client (via @/api/client) and its env config never load. useQuery /
// useMutation are fully stubbed above, so these fns are never invoked.
jest.mock('@/api/progress', () => ({
  getPerformanceReports: jest.fn(),
  generateWeeklyAudit: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name.
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

// expo-linear-gradient ships a native module; passthrough View so the score
// banner's gradient + the empty-state CTA mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// SafeBlurView wraps a native expo-blur module; passthrough View so the REAL
// GlassCard mounts its frosted fill + children under the jest renderer.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: (props: any) => <RN.View {...props} /> };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, within, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import AIReportsScreen from '../../app/(performance)/reports';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <AIReportsScreen />
    </ThemeContext.Provider>,
  );
}

// A complete, valid report fixture — the "happy path" the partial/invalid
// fixtures below deviate from one field at a time.
const validReport = {
  id: 'r1',
  userId: 'u1',
  weekRange: 'Jun 9 – Jun 15',
  score: 84,
  summary: 'Strong adherence this week.',
  highlights: ['Hit protein 6/7 days'],
  improvements: ['Earlier light exposure'],
  focusArea: 'Wind-down routine',
  date: '2026-06-15T00:00:00.000Z',
  createdAt: '2026-06-15T00:00:00.000Z',
};

// Strings that must NEVER appear in the rendered tree — the symptoms a missing
// finite/date guard would leak.
const FORBIDDEN = ['NaN', 'Infinity', 'Invalid Date', 'undefined'];
function assertNoGarbage() {
  for (const bad of FORBIDDEN) {
    expect(screen.queryByText(new RegExp(bad))).toBeNull();
  }
}

describe('AIReportsScreen — finite-guard + honest generate-audit state', () => {
  beforeEach(() => {
    mockReportsState.data = [];
    mockReportsState.isLoading = false;
    mockReportsState.isError = false;
    mockMutationState.isPending = false;
    mockRefetch.mockClear();
    mockMutate.mockClear();
    mockInvalidate.mockClear();
    capturedMutationOptions = null;
  });

  // ── Valid data renders the REAL rounded score, unchanged ───────────────────
  test('valid report renders the real score and week range, and no garbage text', () => {
    mockReportsState.data = [validReport];
    renderScreen();

    // The genuine score numeral (84) is present in the badge…
    expect(screen.getByText('84')).toBeTruthy();
    // …alongside its week range (rendered in both the history tab and banner).
    expect(screen.getAllByText('Jun 9 – Jun 15').length).toBeGreaterThanOrEqual(1);
    // …and the summary body. None of the guard symptoms leak for valid data.
    expect(screen.getByText('"Strong adherence this week."')).toBeTruthy();
    assertNoGarbage();
  });

  // A fractional score is ROUNDED (safeScore → Math.round) for valid finite data.
  test('a fractional finite score is rounded (84.6 → 85), not truncated or raw', () => {
    mockReportsState.data = [{ ...validReport, score: 84.6 }];
    renderScreen();

    expect(screen.getByText('85')).toBeTruthy();
    // The raw fractional value must not appear.
    expect(screen.queryByText('84.6')).toBeNull();
    assertNoGarbage();
  });

  // ── NaN score + malformed date → 0 numeral, '' date, NO garbage ────────────
  test('a NaN score collapses to 0 and a malformed date renders nothing (no NaN/Invalid Date)', () => {
    mockReportsState.data = [
      { ...validReport, score: NaN, date: 'not-a-real-date' },
    ];
    renderScreen();

    // The finite-guard renders 0 in place of the NaN score…
    expect(screen.getByText('0')).toBeTruthy();
    // …and none of the guard symptoms leak (no 'NaN', no 'Invalid Date', etc.).
    assertNoGarbage();
  });

  // undefined score (a partial/fallback report) is equally guarded.
  test('an undefined score collapses to 0 and never prints "undefined"/"NaN"', () => {
    mockReportsState.data = [
      { ...validReport, score: undefined as any, date: undefined as any },
    ];
    renderScreen();

    expect(screen.getByText('0')).toBeTruthy();
    assertNoGarbage();
  });

  // An Infinity score is non-finite → also collapses to 0.
  test('an Infinity score collapses to 0 (non-finite guard), no "Infinity" leak', () => {
    mockReportsState.data = [{ ...validReport, score: Infinity }];
    renderScreen();

    expect(screen.getByText('0')).toBeTruthy();
    assertNoGarbage();
  });

  // ── Loading branch → skeletons, never a crash or garbage ───────────────────
  test('loading: renders the skeleton scaffold without leaking score/date garbage', () => {
    mockReportsState.isLoading = true;
    mockReportsState.data = undefined;
    const { toJSON } = renderScreen();

    expect(() => toJSON()).not.toThrow();
    expect(toJSON()).not.toBeNull();
    // The header is always present; the loaded score banner is not reached yet.
    expect(screen.getByText('AI Performance Reports')).toBeTruthy();
    assertNoGarbage();
  });

  // ── Query-error branch → EmptyState + a Retry that calls refetch ONCE ──────
  test('query error: shows the EmptyState and a Retry that calls refetch exactly once', () => {
    mockReportsState.isError = true;
    mockReportsState.data = undefined;
    renderScreen();

    // The genuine EmptyState copy (not a fabricated report).
    expect(screen.getByText("Couldn't load reports")).toBeTruthy();
    const retry = screen.getByText('Try Again');
    expect(retry).toBeTruthy();

    fireEvent.press(retry);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    // The error branch is mutually exclusive with the score banner / inline alert.
    expect(screen.queryByRole('alert')).toBeNull();
    assertNoGarbage();
  });

  // ── Generate FAILURE → inline role="alert" surface (no Alert.alert) + Retry ─
  test('generate failure: firing the mutation onError renders the inline accessibility alert with a working Retry', () => {
    mockReportsState.data = [validReport];
    renderScreen();

    // Press the header generate affordance — this calls the mutation's mutate()
    // via the screen's runGenerate (which also clears any prior auditStatus).
    fireEvent.press(screen.getByLabelText('Generate with AI'));
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // No inline alert yet (auditStatus is still null until the mutation settles).
    expect(screen.queryByRole('alert')).toBeNull();

    // Fire the GENUINE onError the screen registered → it sets auditStatus='error'.
    mockMutate.mockClear();
    expect(typeof capturedMutationOptions?.onError).toBe('function');
    act(() => capturedMutationOptions.onError(new Error('boom')));

    // The inline accessible alert surface renders with the verbatim error copy…
    const alertSurface = screen.getByRole('alert');
    expect(within(alertSurface).getByText('Generation failed')).toBeTruthy();
    expect(within(alertSurface).getByText('Failed to generate audit. Try again later.')).toBeTruthy();

    // …and its Retry (a sibling of the role="alert" region, kept independently
    // focusable for VoiceOver) re-invokes the mutation: clearing auditStatus and
    // calling mutate(). It is the only "Try again" on screen in this state.
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  // ── Generate SUCCESS → inline role="alert" success surface (no Retry) ──────
  test('generate success: firing the mutation onSuccess renders the inline success alert (no Retry, invalidates cache)', () => {
    mockReportsState.data = [validReport];
    renderScreen();

    expect(typeof capturedMutationOptions?.onSuccess).toBe('function');
    act(() => capturedMutationOptions.onSuccess(validReport));

    const alertSurface = screen.getByRole('alert');
    expect(within(alertSurface).getByText('Audit ready')).toBeTruthy();
    expect(within(alertSurface).getByText('New weekly audit generated!')).toBeTruthy();
    // Success has no Retry affordance anywhere on screen.
    expect(screen.queryByLabelText('Try again')).toBeNull();
    // The onSuccess invalidated the reports cache.
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['performance-reports'] });
  });

  // ── Empty branch → the generate affordance (CTA) stays present ─────────────
  test('empty: renders the "No Reports Yet" CTA so the generate affordance is always reachable', () => {
    mockReportsState.data = [];
    renderScreen();

    expect(screen.getByText('No Reports Yet')).toBeTruthy();
    const cta = screen.getByText('Generate First Audit');
    expect(cta).toBeTruthy();
    fireEvent.press(cta);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    assertNoGarbage();
  });
});
