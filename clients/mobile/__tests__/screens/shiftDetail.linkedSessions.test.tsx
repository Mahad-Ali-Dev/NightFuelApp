/**
 * Render tests for the Shift Detail screen's read-only
 * "Training around this shift" section (`app/(shifts)/index.tsx`).
 *
 * That screen shows the active shift card (the ['current-shift'] query) and now
 * ALSO renders the inverse of the calendar's create/link flow: the sessions the
 * user has linked to the current shift, fetched via
 * getScheduledSessionsForShift and keyed ['shift-linked-sessions', shiftId].
 * It is a READ surface — there is intentionally NO create/link affordance here
 * (that lives on (performance)/calendar, which this screen must never import).
 *
 * These tests drive the three honest branches the section must support and pin
 * the no-redbox guarantee on the empty / error paths:
 *
 *   (a) SESSIONS PRESENT — the linked-sessions query resolves with rows; each
 *       renders its title and a formatted local "when" (e.g. "… · 6:00 PM"),
 *       and optional notes when present.
 *   (b) EMPTY [] — the honest zero-data EmptyState ("No sessions linked to this
 *       shift yet"). This is ALSO the normal state while the user-gated
 *       scheduled_sessions migration returns []; it must NOT throw / redbox.
 *   (c) ERROR — the connection-error EmptyState ("Couldn't load sessions") with
 *       a working Retry that calls the linked-sessions query's refetch; it must
 *       NOT throw / redbox.
 *
 * Mocks (same conventions as the sibling calendar / dashboard suites):
 *  - `@tanstack/react-query` useQuery → switched on queryKey[0]. The
 *    ['current-shift'] query always returns a fixed shift; the
 *    ['shift-linked-sessions', …] query is driven by a mutable
 *    `mockLinkedState` so each test sets data / isLoading / isError. useMutation
 *    is a no-op stub (the generate-plan mutation is never exercised here).
 *  - `@/api/shifts` getCurrent + `@/api/training` getScheduledSessionsForShift →
 *    jest.fns (never actually called; useQuery is fully stubbed) so the import
 *    graph resolves. `@/api/plans` generatePlan likewise.
 *  - expo-router, @expo/vector-icons, react-native-safe-area-context, expo-image
 *    — stubbed exactly as the sibling screen tests do.
 */
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

// The current shift the screen renders its card (and links section) for. Its id
// is what getScheduledSessionsForShift is keyed/filtered on.
const mockShift = {
  id: 'shift_1',
  userId: 'u_1',
  type: 'FIXED_NIGHT',
  startTime: '2026-06-20T19:00:00.000Z',
  endTime: '2026-06-21T07:00:00.000Z',
  timezone: 'UTC',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

// ── Controlled linked-sessions query state ───────────────────────────────────
type LinkedState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockLinkedState: LinkedState = {
  data: [],
  isLoading: false,
  isError: false,
};
const mockLinkedRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'current-shift') {
      return { data: mockShift, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'shift-linked-sessions') {
      return {
        data: mockLinkedState.data,
        isLoading: mockLinkedState.isLoading,
        isError: mockLinkedState.isError,
        refetch: mockLinkedRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  // The generate-plan mutation is not exercised here; a no-op stub suffices.
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API modules: useQuery is fully stubbed, so these jest.fns are never invoked —
// they only satisfy the screen's import graph.
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/training', () => ({ getScheduledSessionsForShift: jest.fn() }));
jest.mock('@/api/plans', () => ({ generatePlan: jest.fn() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Decorative glyphs; stub to plain text so the icon name is assertable.
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

// expo-image isn't imported by this screen today, but stub it defensively (per
// the work-item) so the suite stays resilient if an image is ever added.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// Import AFTER the mocks are registered.
import ShiftCalendarScreen from '../../app/(shifts)/index';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ShiftCalendarScreen />
    </ThemeContext.Provider>,
  );
}

describe('Shift Detail — "Training around this shift" (read-only inverse link)', () => {
  beforeEach(() => {
    mockLinkedState.data = [];
    mockLinkedState.isLoading = false;
    mockLinkedState.isError = false;
    mockLinkedRefetch.mockClear();
  });

  test('(a) sessions present → the section heading + each linked row (title + local when) render', () => {
    mockLinkedState.data = [
      {
        id: 'sess_1',
        userId: 'u_1',
        title: 'Push Day',
        // 18:00 UTC on Jun 20 2026. The screen formats in LOCAL tz, so we don't
        // pin the exact clock string (runner tz varies) — we assert the title
        // and that a "·"-joined when label is present (the screen's format).
        scheduledAt: '2026-06-20T18:00:00.000Z',
        notes: 'Bring straps',
        shiftId: 'shift_1',
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
      {
        id: 'sess_2',
        userId: 'u_1',
        title: 'Mobility',
        scheduledAt: '2026-06-21T09:00:00.000Z',
        notes: null,
        shiftId: 'shift_1',
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ];

    renderScreen();

    // Section heading present.
    expect(screen.getByText('Training around this shift')).toBeTruthy();

    // Both rows render their titles.
    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Mobility')).toBeTruthy();

    // The optional notes render only when present.
    expect(screen.getByText('Bring straps')).toBeTruthy();

    // Each row shows a formatted local "when" using the screen's "· " join.
    // We don't pin the exact local clock (tz-dependent); we assert the format
    // by matching the "Sat, Jun 20 · …"-style separator appears for a row.
    const whenLabels = screen.getAllByText(/·/);
    expect(whenLabels.length).toBeGreaterThanOrEqual(2);

    // It is NOT the empty / error state.
    expect(screen.queryByText('No sessions linked to this shift yet')).toBeNull();
    expect(screen.queryByText("Couldn't load sessions")).toBeNull();
  });

  test('(b) empty [] → honest zero-data EmptyState, no redbox', () => {
    mockLinkedState.data = [];

    // Rendering the empty branch must not throw (no redbox on []).
    expect(() => renderScreen()).not.toThrow();

    // The heading still renders above the honest empty state.
    expect(screen.getByText('Training around this shift')).toBeTruthy();
    expect(screen.getByText('No sessions linked to this shift yet')).toBeTruthy();

    // Not the error state, and no Retry button for the (non-error) empty case.
    expect(screen.queryByText("Couldn't load sessions")).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  test('(c) error → connection EmptyState with a Retry that refetches, no redbox', () => {
    mockLinkedState.isError = true;

    // Rendering the error branch must not throw (no redbox on error).
    expect(() => renderScreen()).not.toThrow();

    expect(screen.getByText('Training around this shift')).toBeTruthy();
    expect(screen.getByText("Couldn't load sessions")).toBeTruthy();

    // Retry is wired to the linked-sessions query's refetch — and only that.
    fireEvent.press(screen.getByText('Retry'));
    expect(mockLinkedRefetch).toHaveBeenCalledTimes(1);

    // Not the empty zero-data copy in the error case.
    expect(screen.queryByText('No sessions linked to this shift yet')).toBeNull();
  });

  test('loading → skeleton placeholders, not the empty/error copy', () => {
    mockLinkedState.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // Heading renders; neither the empty nor error copy shows while loading.
    expect(screen.getByText('Training around this shift')).toBeTruthy();
    expect(screen.queryByText('No sessions linked to this shift yet')).toBeNull();
    expect(screen.queryByText("Couldn't load sessions")).toBeNull();
  });

  test('read-only: the section exposes NO create/link affordance', () => {
    mockLinkedState.data = [];
    renderScreen();

    // Create/link lives on the calendar. This read surface must not surface an
    // "add session" control of any kind.
    expect(screen.queryByLabelText('Add scheduled session')).toBeNull();
    expect(screen.queryByLabelText('Add session')).toBeNull();
    expect(screen.queryByText('New Session')).toBeNull();
  });
});
