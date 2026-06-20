/**
 * Render tests for the dashboard's <NextShiftCard /> "Next shift" countdown card.
 *
 * NextShiftCard is a pure presentational card with the SAME prop posture as
 * ShiftTransitionCard / LightPlanCard (shifts + loading/error/onRetry). It owns
 * NO data fetching; it derives the soonest upcoming shift from the shared,
 * unit-tested `getNextShift` and the countdown from `formatStartsIn`
 * (src/lib/nextShift.ts) and renders one of four states:
 *
 *   1. loading                    → Skeleton blocks (no shift text yet)
 *   2. error (truthy)             → inline "Couldn't load…" copy + a Retry button
 *   3. empty (no upcoming shift)  → EmptyState "No upcoming shift scheduled" with
 *                                   a "View shifts" link into the shifts stack
 *   4. populated                  → shift.type + "starts in <countdown>" + the
 *                                   absolute start time
 *
 * It renders on a REAL <GlassCard> (the Aurora dark-glass primitive). We assert
 * that by querying the testID GlassCard forwards to its outer wrapper
 * (NEXT_SHIFT_CARD_TEST_ID) — proving a real GlassCard, never an inline
 * SafeBlurView. `@/components/ui` + `@/theme` are kept REAL (only the icon font,
 * router, and react-query/api are mocked, per the sibling component suites).
 *
 * Mocks (matching LightPlanCard.test.tsx / AnchorSleepCard.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>`.
 *  - `expo-router` useRouter → a push spy so the empty-state link mounts and is
 *    assertable (the card calls `push?.('/(shifts)')`).
 *  - `@/api/shifts` → a no-op `list` so importing the card (which imports the
 *    Shift type + would otherwise pull the real api/client) never hits network.
 *  - The Aurora glass fill (GlassCard → SafeBlurView → expo-blur) mounts under
 *    jest-expo with no extra mock, exactly as AnchorSleepCard.test.tsx does.
 *
 * Timestamps are UTC; the populated start-time string is produced by the SAME
 * toLocaleTimeString call the component uses against the SAME instant, so it is
 * timezone-portable. The live countdown text is asserted by its STABLE shape
 * (/^starts in \d+h \d+m$/) rather than an exact value, since the card reads the
 * wall-clock `now` internally.
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

// Decorative glyphs → plain text so icon names are assertable and no native
// font loader runs. Matches the rest of the component suite.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// expo-router: stub useRouter with a push spy so the empty-state "View shifts"
// link mounts AND we can assert it routes into the shifts stack on tap.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// `@/api/shifts` is imported by the card for the `Shift` type; stub `list` so no
// real api/client (network) is dragged into the isolated render.
jest.mock('@/api/shifts', () => ({
  list: jest.fn(),
  getCurrent: jest.fn(),
}));

// Import AFTER the mocks are registered. `getNextShift`/`formatStartsIn` are the
// pure helpers the card renders from; importing them lets us assert card ↔
// source-of-truth parity rather than hand-rolled arithmetic.
import NextShiftCard, { NEXT_SHIFT_CARD_TEST_ID } from '@/components/home/NextShiftCard';
import { getNextShift, formatStartsIn } from '@/lib/nextShift';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

const HOUR = 3_600_000;
const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** A shift whose start is `hours` from now (so the populated case is stable). */
function futureShift(hours: number, type = 'night') {
  return {
    id: `shift-${hours}`,
    userId: 'u1',
    type,
    startTime: new Date(Date.now() + hours * HOUR).toISOString(),
    endTime: new Date(Date.now() + (hours + 8) * HOUR).toISOString(),
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('NextShiftCard', () => {
  // Fail loudly on ANY console.error/warn during a render (a leaked falsy child,
  // an unkeyed list, an act() warning) across every test here — same guard as
  // AnchorSleepCard.test.tsx.
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    mockPush.mockClear();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('renders a real GlassCard (not an inline SafeBlurView)', () => {
    test('the outer surface is the GlassCard primitive in every state', () => {
      // GlassCard forwards `testID` to its outer wrapper <View>; querying it
      // proves a REAL GlassCard mounts (the inline-glass guard forbids a hand-
      // rolled <SafeBlurView> card anyway, and this pins it from the test side).
      renderWithTheme(<NextShiftCard loading />);
      expect(screen.getByTestId(NEXT_SHIFT_CARD_TEST_ID)).toBeTruthy();

      screen.rerender(
        <ThemeContext.Provider
          value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
          <NextShiftCard shifts={[futureShift(5)]} />
        </ThemeContext.Provider>,
      );
      expect(screen.getByTestId(NEXT_SHIFT_CARD_TEST_ID)).toBeTruthy();
    });
  });

  describe('loading', () => {
    test('renders the header but none of the other branches\' content (skeleton state)', () => {
      renderWithTheme(<NextShiftCard loading shifts={[futureShift(5)]} />);

      // The header ("Next shift") renders in every state.
      expect(screen.getByText('Next shift')).toBeTruthy();
      // It is on a real GlassCard.
      expect(screen.getByTestId(NEXT_SHIFT_CARD_TEST_ID)).toBeTruthy();
      // What pins down the LOADING skeleton is the combined absence of every
      // other branch's distinctive content (the Aurora Skeleton has no testID):
      expect(screen.queryByText('Upcoming shift')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
      expect(screen.queryByText('No upcoming shift scheduled')).toBeNull();
    });
  });

  describe('error', () => {
    test('renders the error copy and a Retry control; pressing Retry fires onRetry once', () => {
      const onRetry = jest.fn();
      renderWithTheme(<NextShiftCard error={new Error('boom')} onRetry={onRetry} />);

      // The header still renders in the error state.
      expect(screen.getByText('Next shift')).toBeTruthy();
      // Inline error message (note the curly apostrophe in the source copy).
      expect(screen.getByText('Couldn’t load your next shift.')).toBeTruthy();
      // A Retry button is present…
      const retry = screen.getByText('Retry');
      expect(retry).toBeTruthy();
      // …and pressing it invokes the onRetry callback exactly once. fireEvent.press
      // bubbles from the Button's <Text> to its Pressable's onPress.
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
      // The populated affordances must NOT leak into the error state.
      expect(screen.queryByText('Upcoming shift')).toBeNull();
    });

    test('error WITHOUT onRetry renders the copy but no Retry control', () => {
      renderWithTheme(<NextShiftCard error={new Error('boom')} />);
      expect(screen.getByText('Couldn’t load your next shift.')).toBeTruthy();
      expect(screen.queryByText('Retry')).toBeNull();
    });
  });

  describe('empty (no upcoming shift)', () => {
    test('shifts={null} renders the EmptyState with the "View shifts" link into /(shifts)', () => {
      renderWithTheme(<NextShiftCard shifts={null} />);

      expect(screen.getByText('No upcoming shift scheduled')).toBeTruthy();
      // The link is a role=button labelled "View shifts"…
      const link = screen.getByText('View shifts');
      expect(link).toBeTruthy();
      // …and tapping it routes into the shifts stack.
      fireEvent.press(link);
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(shifts)');
      // The populated and error affordances must NOT be present.
      expect(screen.queryByText('Upcoming shift')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('a list of only PAST shifts is treated as empty (no upcoming)', () => {
      // getNextShift returns null when every start is <= now → empty branch.
      const past = { ...futureShift(-10, 'day') };
      expect(getNextShift([past as any], new Date())).toBeNull();
      renderWithTheme(<NextShiftCard shifts={[past as any]} />);
      expect(screen.getByText('No upcoming shift scheduled')).toBeTruthy();
      expect(screen.queryByText('Upcoming shift')).toBeNull();
    });

    test('a list with ONLY a malformed-startTime shift degrades to empty (no throw)', () => {
      const bad = { ...futureShift(5), startTime: 'garbage' };
      renderWithTheme(<NextShiftCard shifts={[bad as any]} />);
      expect(screen.getByText('No upcoming shift scheduled')).toBeTruthy();
    });
  });

  describe('populated (a valid upcoming shift)', () => {
    test('renders the shift type, a "starts in <countdown>" line, and the absolute start time', () => {
      const shift = futureShift(7, 'night');
      const start = new Date(shift.startTime);
      // The card picks THIS shift via getNextShift, and its start-time chip is
      // formatTime(start) — timezone-portable (same Intl call, same instant).
      expect(getNextShift([shift], new Date())?.startTime).toBe(shift.startTime);
      const expectedStartsAt = fmt(start);

      renderWithTheme(<NextShiftCard shifts={[shift]} />);

      // On a real GlassCard…
      expect(screen.getByTestId(NEXT_SHIFT_CARD_TEST_ID)).toBeTruthy();
      // …the shift kind renders…
      expect(screen.getByText('Upcoming shift')).toBeTruthy();
      expect(screen.getByText('night')).toBeTruthy();
      // …a "starts in <countdown>" line of the stable Xh Ym shape renders (the
      // exact value floats with the wall clock, so assert its SHAPE)…
      expect(screen.getByText(/^starts in \d+h \d+m$/)).toBeTruthy();
      // …and the absolute start-time chip shows formatTime(start).
      expect(screen.getByText(expectedStartsAt)).toBeTruthy();
      // The empty/error affordances must NOT be present.
      expect(screen.queryByText('No upcoming shift scheduled')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('picks the EARLIEST upcoming shift among several, and its countdown is non-null', () => {
      // Several future shifts (+ a past one): the card must surface the soonest.
      const soon = futureShift(3, 'soon');
      const later = futureShift(20, 'later');
      const past = futureShift(-2, 'past');
      const picked = getNextShift([later, past, soon], new Date());
      expect(picked?.type).toBe('soon');
      // The countdown for the picked shift is a real Xh Ym string (not null/NaN),
      // since its start is comfortably in the future.
      expect(formatStartsIn(new Date(picked!.startTime), new Date())).toMatch(/^\d+h \d+m$/);

      renderWithTheme(<NextShiftCard shifts={[later, past, soon]} />);
      // The EARLIEST shift's type is shown — not "later".
      expect(screen.getByText('soon')).toBeTruthy();
      expect(screen.queryByText('later')).toBeNull();
      expect(screen.getByText(/^starts in \d+h \d+m$/)).toBeTruthy();
    });

    test('the rendered start time is a stable string — never "Invalid Date" / "NaN"', () => {
      const shift = futureShift(9, 'evening');
      const expectedStartsAt = fmt(new Date(shift.startTime));
      renderWithTheme(<NextShiftCard shifts={[shift]} />);
      const node = screen.getByText(expectedStartsAt);
      const rendered = String(node.props.children);
      expect(rendered).not.toMatch(/Invalid Date/);
      expect(rendered).not.toMatch(/NaN/);
    });
  });
});
