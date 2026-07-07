/**
 * shifts-index.invalidDate.test.tsx
 *
 * Finite / Invalid-Date guard coverage for the Circadian Planner / shift screen
 * (`app/(shifts)/index.tsx`) "Today's Timeline".
 *
 * The active-shift card renders the shift's wall-clock times in THREE places:
 *   - the start–end header line under the shift type,
 *   - the "Shift Starts" timeline node (cyan),
 *   - the "Shift Ends" timeline node (purple).
 *
 * Previously each was an UNGUARDED `new Date(currentShift.startTime/endTime)
 * .toLocaleTimeString(...)`, so a malformed or empty ISO produced the literal
 * dishonest string 'Invalid Date'. The screen now routes all three through the
 * module-scope `formatShiftTime` helper, which returns the neutral '--:--'
 * sentinel for an empty or unparseable value and never throws.
 *
 * react-native-skills applied:
 *   - js-hoist-intl: the formatter helper is defined ONCE at module scope, so
 *     the three renders share it instead of each allocating a per-render Intl /
 *     Date formatter.
 *   - rendering-no-falsy-and: the guard yields a STRING sentinel ('--:--'),
 *     never a bare falsy value rendered outside a <Text> (which would crash).
 *
 * This suite pins:
 *   (a) startTime/endTime = '' (empty)        → the two standalone timeline
 *       nodes AND the combined header line all show '--:--', no 'Invalid Date',
 *       the screen still mounts, nothing throws;
 *   (b) startTime/endTime = 'not-a-date'      → identical guarded behaviour;
 *   (c) a valid ISO → the two nodes + the combined header render the SAME local
 *       HH:MM the helper's own
 *       `toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })` formula
 *       yields (re-derived in-test, never a hardcoded wall-clock), and crucially
 *       NOT '--:--' and NOT 'Invalid Date'.
 *
 * NOTE on the header: RNTL flattens the header's
 * `{formatShiftTime(start)} - {formatShiftTime(end)}` into a SINGLE text node
 * ("<start> - <end>"), so it is asserted as that one combined string rather
 * than as two separate matches of the bare value.
 *
 * Additive + verify-only: NEW test file only. Mock conventions mirror the
 * sibling `shifts-index.test.tsx` (expo-router, @/api/plans, @/api/ai +
 * leaf deps, @/api/shifts, @/api/training, glyphs, insets, gradient, status
 * bar). The current-shift query is the ONLY thing varied per test via the
 * `getCurrent` spy.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The screen imports only `generatePlan` from `@/api/plans`; a no-op spy keeps
// the generate hero inert (this suite never presses it).
jest.mock('@/api/plans', () => ({ generatePlan: jest.fn() }));

// `@/api/ai` → the REAL module (parseAiQuotaError) with its leaf deps mocked so
// the axios client / native sentry never load.
jest.mock('@/api/ai', () => jest.requireActual('@/api/ai'));
jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getAccessToken: jest.fn(() => Promise.resolve(null)),
  resolveApiUrl: (p: string) => `http://test${p}`,
}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

// getCurrent is a mutable spy each test wires with the shift under test so the
// `currentShift` render branch (and its timeline) mounts with chosen times.
const mockGetCurrent = jest.fn();
jest.mock('@/api/shifts', () => ({ getCurrent: () => mockGetCurrent() }));

// Linked-sessions query → the honest zero-data state (200 []), never an error,
// so the "Training around this shift" section never steals an assertion.
jest.mock('@/api/training', () => ({ getScheduledSessionsForShift: jest.fn(() => Promise.resolve([])) }));

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

// expo-linear-gradient ships a native module; passthrough so the fill mounts.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import type { Shift } from '@/api/shifts';
import ShiftCalendarScreen from '../../app/(shifts)/index';

// A fixed active night shift; per test we override only startTime / endTime.
const baseShift: Shift = {
  id: 's1',
  userId: 'u1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
  timezone: 'UTC',
  createdAt: '2026-06-13T00:00:00.000Z',
  updatedAt: '2026-06-13T00:00:00.000Z',
};

function shiftWith(startTime: string, endTime: string): Shift {
  return { ...baseShift, startTime, endTime };
}

/**
 * Re-derive the expected LOCAL HH:MM exactly as the production `formatShiftTime`
 * helper does — never a hardcoded wall-clock — so the valid-case assertion is
 * timezone-agnostic and pins behavioural identity to today's render.
 */
function expectedHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <ShiftCalendarScreen />
      </ThemeContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ShiftCalendarScreen — Today\'s Timeline Invalid-Date guard', () => {
  // ── (a) empty ISO → the two nodes + the header fall back to '--:--' ────────
  it("renders '--:--' in the two timeline nodes + the header line for empty startTime/endTime, never 'Invalid Date', and still mounts", async () => {
    mockGetCurrent.mockResolvedValue(shiftWith('', ''));

    expect(() => renderScreen()).not.toThrow();

    // The active-shift card mounts (its timeline header + labels are present).
    await waitFor(() => expect(screen.getByText("Today's Timeline")).toBeTruthy());
    expect(screen.getByText('Shift Starts')).toBeTruthy();
    expect(screen.getByText('Shift Ends')).toBeTruthy();

    // The two standalone node slots (cyan "Shift Starts", purple "Shift Ends").
    expect(screen.getAllByText('--:--')).toHaveLength(2);
    // The combined start–end header line — both its halves guarded.
    expect(screen.getByText('--:-- - --:--')).toBeTruthy();

    // The dishonest literal never appears in any of the three slots.
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  // ── (b) non-date string → identical guarded behaviour ──────────────────────
  it("renders '--:--' in the two nodes + the header for startTime/endTime = 'not-a-date', never 'Invalid Date', and still mounts", async () => {
    mockGetCurrent.mockResolvedValue(shiftWith('not-a-date', 'not-a-date'));

    expect(() => renderScreen()).not.toThrow();

    await waitFor(() => expect(screen.getByText("Today's Timeline")).toBeTruthy());
    expect(screen.getAllByText('--:--')).toHaveLength(2);
    expect(screen.getByText('--:-- - --:--')).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  // ── (c) valid ISO → identical local HH:MM to today, never the sentinel ─────
  it('renders the expected local HH:MM in all three slots for a valid ISO (never \'--:--\', never \'Invalid Date\')', async () => {
    // Distinct start/end minutes so each formatted label is unique; the constant
    // UTC→local offset preserves the difference in any timezone.
    const startIso = '2026-06-13T22:13:00.000Z';
    const endIso = '2026-06-14T06:47:00.000Z';
    mockGetCurrent.mockResolvedValue(shiftWith(startIso, endIso));

    const startStr = expectedHHMM(startIso);
    const endStr = expectedHHMM(endIso);
    // Guard the fixture itself: the two must format differently for the counts below.
    expect(startStr).not.toEqual(endStr);

    renderScreen();

    await waitFor(() => expect(screen.getByText("Today's Timeline")).toBeTruthy());

    // The cyan "Shift Starts" node shows start; the purple "Shift Ends" node
    // shows end — one standalone match each (the header is a combined node).
    expect(screen.getAllByText(startStr)).toHaveLength(1);
    expect(screen.getAllByText(endStr)).toHaveLength(1);
    // The combined start–end header line — identical to today's render.
    expect(screen.getByText(`${startStr} - ${endStr}`)).toBeTruthy();

    // The fallback sentinel and the dishonest literal are both absent.
    expect(screen.queryByText('--:--')).toBeNull();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
});
