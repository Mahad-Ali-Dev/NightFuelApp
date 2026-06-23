/**
 * shift-detail.test.tsx
 *
 * Locks the SHIFT-DETAIL → CALENDAR tap-through on the read-only "Training
 * around this shift" section of `app/(shifts)/index.tsx`.
 *
 * Item 6 added that section (the inverse of the calendar's create/link flow:
 * the sessions linked to the current shift, keyed ['shift-linked-sessions',
 * shiftId]). The sibling `shiftDetail.linkedSessions.test.tsx` pins the section
 * CONTENT (heading, titles, notes, the three honest branches). This file owns a
 * disjoint concern — the tap-through ITSELF:
 *
 *   - each linked row is exposed with accessibilityRole="button" AND an
 *     accessibility label that carries the session TITLE and the formatted local
 *     "when" (so screen-reader users get a self-describing target);
 *   - pressing a row navigates to the calendar route '/(performance)/calendar'
 *     and NOTHING ELSE — no stray 2nd argument / params object (a stray param
 *     would silently change deep-link behaviour);
 *   - the loading / error / empty branches stay honest (skeletons with no
 *     session text; a retryable "Couldn't load sessions" whose Retry calls the
 *     linked-sessions query's refetch; the "No sessions linked…" zero-data copy).
 *
 * Navigation is asserted through a hoisted `mockPush` holder (the `mock` prefix
 * lets babel-plugin-jest-hoist allow the hoisted factory to close over it), so a
 * regression that drops the row's button role/label, stops navigating to the
 * calendar route, adds a stray param, or breaks any honest state turns RED.
 *
 * Mock conventions mirror the sibling screen suites (calendar / dashboard /
 * shiftDetail.linkedSessions) and the hoisted-holder pattern in
 * __tests__/constants/curatedDemos-resolution.test.tsx.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so each test can
// assert exactly where (and with what arity) the row navigated. `back`/`replace`
// are benign no-ops the screen's other controls call.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The fixed active shift the screen renders its card (and links section) for.
// Its id is what the linked-sessions query would key/filter on; the linked
// query is fully stubbed below, so the id only needs to be present + stable.
const mockShift = {
  id: 'shift-1',
  userId: 'u-1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
  timezone: 'UTC',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

// Controlled state for the ['shift-linked-sessions', …] query — each test drives
// the list / loading / error / empty branch by mutating this holder before
// render(). `refetch` is the spy the error branch's Retry must call.
type LinkedState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockLinked: LinkedState = {
  data: [],
  isLoading: false,
  isError: false,
};
const mockLinkedRefetch = jest.fn();

// react-query: branch on queryKey[0]. ['current-shift'] is always a present
// shift; ['shift-linked-sessions', …] reads the mutable holder above (read at
// call-time so a test that mutates it before render sees its chosen branch).
// useMutation is a benign no-op — the generate-plan mutation isn't exercised
// here. (`mock`-prefixed holders satisfy babel-plugin-jest-hoist.)
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'current-shift') {
      return { data: mockShift, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'shift-linked-sessions') {
      return {
        data: mockLinked.data,
        isLoading: mockLinked.isLoading,
        isError: mockLinked.isError,
        refetch: mockLinkedRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API modules the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery is fully stubbed above, so these are
// never actually invoked; they only satisfy the import graph. The ScheduledSession
// type is type-only, so no runtime export is needed for it.
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/training', () => ({ getScheduledSessionsForShift: jest.fn() }));
jest.mock('@/api/plans', () => ({ generatePlan: jest.fn() }));

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
import ShiftCalendarScreen from '../../app/(shifts)/index';

/**
 * Mirror of the screen's local `formatSessionWhen` (toLocaleDateString + ' · ' +
 * toLocaleTimeString). Re-derived here — rather than pinning a wall-clock string
 * — so the assertion is correct regardless of the CI runner's timezone: we feed
 * the SAME ISO the test fixture uses and compare against the SAME locale calls
 * the screen makes.
 */
function expectedWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ShiftCalendarScreen />
    </ThemeContext.Provider>,
  );
}

// A single linked session used by the tap-through cases. 18:00 UTC on Jun 20
// 2026; the row formats in LOCAL tz, so the expected "when" is derived above.
const SCHEDULED_AT = '2026-06-20T18:00:00.000Z';
const LINKED_SESSION = {
  id: 's1',
  userId: 'u-1',
  title: 'Lower Body',
  scheduledAt: SCHEDULED_AT,
  notes: null,
  shiftId: 'shift-1',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

describe('ShiftCalendarScreen — linked-session tap-through', () => {
  beforeEach(() => {
    mockLinked.data = [];
    mockLinked.isLoading = false;
    mockLinked.isError = false;
    mockLinkedRefetch.mockClear();
    mockPush.mockClear();
  });

  // ── (i) sessions present: row a11y + navigation ───────────────────────────
  describe('with >=1 linked session', () => {
    beforeEach(() => {
      mockLinked.data = [LINKED_SESSION];
    });

    test('exposes the row as a button whose label carries the title and formatted local time', () => {
      renderScreen();

      // The row is reachable by ITS button role + accessible name (the screen
      // sets accessibilityRole="button" on the TouchableOpacity). The name is
      // the accessibilityLabel: "Open <title> on your training calendar, <when>".
      const row = screen.getByRole('button', { name: /Lower Body/ });
      expect(row).toBeTruthy();

      // The label must carry BOTH the human title AND the formatted local time,
      // so a screen-reader user hears a self-describing target. We read the label
      // off the resolved node and assert both substrings (tz-agnostic via the
      // re-derived expectedWhen).
      const label = String(row.props.accessibilityLabel);
      expect(label).toContain('Lower Body');
      expect(label).toContain(expectedWhen(SCHEDULED_AT));

      // Sanity: querying by the full label (title + when) resolves the SAME node,
      // proving the label is the one assembled from both pieces.
      const byLabel = screen.getByLabelText(
        `Open Lower Body on your training calendar, ${expectedWhen(SCHEDULED_AT)}`,
      );
      expect(byLabel).toBe(row);
    });

    test('pressing the row navigates to the calendar route with NO stray param', () => {
      renderScreen();

      const row = screen.getByRole('button', { name: /Lower Body/ });
      fireEvent.press(row);

      // Navigates to the read calendar route…
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(performance)/calendar');

      // …and with EXACTLY one argument — a stray 2nd param (params object) would
      // silently change the deep-link target, so we lock the arity.
      expect(mockPush.mock.calls[0]).toHaveLength(1);
      expect(mockPush.mock.calls[0][0]).toBe('/(performance)/calendar');
    });
  });

  // ── (ii) loading branch: skeletons, no session text ───────────────────────
  test('loading → skeletons present, no session text and no navigation', () => {
    mockLinked.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The section heading still renders above the skeleton placeholders. The
    // redesign splits the single heading into a "TRAINING" overline + an
    // "Around this shift" h3 — assert both parts.
    expect(screen.getByText('TRAINING')).toBeTruthy();
    expect(screen.getByText('Around this shift')).toBeTruthy();
    // …but no row text / row button while loading.
    expect(screen.queryByText('Lower Body')).toBeNull();
    expect(screen.queryByRole('button', { name: /Lower Body/ })).toBeNull();
    // Neither the empty nor the error copy shows while loading.
    expect(screen.queryByText('No sessions linked to this shift yet')).toBeNull();
    expect(screen.queryByText("Couldn't load sessions")).toBeNull();
    // Nothing was tapped, so no navigation fired on mount.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (iii) error branch: retryable EmptyState wired to refetch ─────────────
  test('error → "Couldn\'t load sessions" EmptyState whose Retry calls refetch', () => {
    mockLinked.isError = true;

    expect(() => renderScreen()).not.toThrow();

    // The retryable connection-error copy is present (not the empty copy).
    expect(screen.getByText("Couldn't load sessions")).toBeTruthy();
    expect(screen.queryByText('No sessions linked to this shift yet')).toBeNull();

    // Retry is wired to the linked-sessions query's refetch — and only that.
    fireEvent.press(screen.getByText('Retry'));
    expect(mockLinkedRefetch).toHaveBeenCalledTimes(1);

    // The error branch renders no session rows and triggers no navigation.
    expect(screen.queryByRole('button', { name: /Lower Body/ })).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (iv) zero-data branch: honest empty EmptyState ────────────────────────
  test('empty [] → "No sessions linked to this shift yet" EmptyState, no row/Retry', () => {
    mockLinked.data = [];

    expect(() => renderScreen()).not.toThrow();

    // The honest zero-data copy is present…
    expect(screen.getByText('No sessions linked to this shift yet')).toBeTruthy();
    // …with no row, no error copy, and no Retry affordance (empty is not error).
    expect(screen.queryByRole('button', { name: /Lower Body/ })).toBeNull();
    expect(screen.queryByText("Couldn't load sessions")).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
