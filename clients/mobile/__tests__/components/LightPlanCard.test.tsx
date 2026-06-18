/**
 * Render tests for the dashboard's <LightPlanCard /> light-exposure coaching
 * card.
 *
 * LightPlanCard is a pure presentational card with an IDENTICAL prop contract to
 * ShiftTransitionCard (shift + loading/error/onRetry). It owns no data fetching;
 * it derives the two light windows from the shared, unit-tested
 * `computeLightPlan` (src/lib/lightPlan.ts → computeShiftTransition) and renders
 * one of four states:
 *
 *   1. loading            → Skeleton blocks (no window text yet)
 *   2. error (truthy)     → inline "Couldn't load…" copy + a Retry button
 *   3. empty (no shift)   → EmptyState "Log a shift to see your light plan"
 *   4. populated          → "Seek bright light" + "Avoid light / blue-blockers"
 *                           rows with formatted local times
 *
 * The header doubles as a deep-link affordance (role=button, label "Open your
 * light plan") into the sleep optimizer screen.
 *
 * Mocks (matching the component-test style in CaffeineTimerTile.test.tsx /
 * dashboard.shiftTransition.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>` so
 *    glyphs are assertable as text and the card mounts without native code.
 *  - `expo-router` useRouter → a push spy so the header affordance mounts in an
 *    isolated render (the component calls `router?.push(...)` on tap).
 *  - Theme comes from the real `ThemeContext.Provider`.
 *
 * The header text ("Light plan") renders in EVERY state, so — exactly like the
 * dashboard.shiftTransition suite — the loading state is pinned by the combined
 * ABSENCE of every other branch's distinctive content (the Aurora `Skeleton`
 * exposes no testID to query directly).
 *
 * Timestamps are UTC; the populated-state expected strings are produced by the
 * SAME Intl.DateTimeFormat call the component uses, against the SAME instants,
 * so the assertions are timezone-portable.
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

// expo-router: stub useRouter so the header's deep-link affordance mounts. The
// card only calls `router?.push(...)`; a push spy is enough.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Import AFTER the mocks are registered. `computeLightPlan` is the pure window
// math the card renders from; importing it lets us assert the rendered
// "Avoid light / blue-blockers" row uses the EXACT window computeLightPlan
// returns (card ↔ source-of-truth parity), not just the test's hand-rolled
// arithmetic — the same instant the nf-avoid-light reminder fires at.
import LightPlanCard from '@/components/home/LightPlanCard';
import { computeLightPlan } from '@/lib/lightPlan';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

// A valid day shift (07:00 → 19:00 UTC same day). The window math comes from
// computeLightPlan: seekLight = start … start+2h; avoidLight = (end+1h)-2h …
// end+1h.
const START = '2026-01-02T07:00:00.000Z';
const END = '2026-01-02T19:00:00.000Z';
const SHIFT = { startTime: START, endTime: END };

// Expected formatted window strings, built with the SAME Intl call the card
// uses (formatTime → toLocaleTimeString) against the SAME instants, so they
// match whatever timezone the runner uses.
const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const HOUR = 3_600_000;
const startMs = new Date(START).getTime();
const endMs = new Date(END).getTime();
const seekValue = `${fmt(new Date(startMs))} – ${fmt(new Date(startMs + 2 * HOUR))}`;
const avoidValue = `${fmt(new Date(endMs + 1 * HOUR - 2 * HOUR))} – ${fmt(new Date(endMs + 1 * HOUR))}`;

describe('LightPlanCard', () => {
  describe('loading', () => {
    test('renders the header but none of the other branches\' content (skeleton state)', () => {
      renderWithTheme(<LightPlanCard loading shift={SHIFT} />);

      // The header ("Light plan") renders in every state.
      expect(screen.getByText('Light plan')).toBeTruthy();
      // What pins down the LOADING skeleton is the combined absence of every
      // other branch's distinctive content (the Aurora Skeleton has no testID):
      //   - no populated window labels
      expect(screen.queryByText('Seek bright light')).toBeNull();
      expect(screen.queryByText('Avoid light / blue-blockers')).toBeNull();
      //   - no error Retry control
      expect(screen.queryByText('Retry')).toBeNull();
      //   - no empty-state subtitle
      expect(screen.queryByText('Log a shift to see your light plan')).toBeNull();
    });
  });

  describe('error', () => {
    test('renders the error copy and a Retry control; pressing Retry fires onRetry', () => {
      const onRetry = jest.fn();
      renderWithTheme(<LightPlanCard error={new Error('boom')} onRetry={onRetry} />);

      // Inline error message (note the curly apostrophe in the source copy).
      expect(screen.getByText('Couldn’t load your light plan.')).toBeTruthy();
      // A Retry button is present…
      const retry = screen.getByText('Retry');
      expect(retry).toBeTruthy();
      // …and pressing it invokes the onRetry callback. fireEvent.press bubbles
      // from the Button's <Text> to its Pressable's onPress.
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('error state does not render the populated window labels', () => {
      renderWithTheme(<LightPlanCard error={new Error('boom')} onRetry={jest.fn()} />);
      expect(screen.queryByText('Seek bright light')).toBeNull();
      expect(screen.queryByText('Avoid light / blue-blockers')).toBeNull();
    });
  });

  describe('empty (no shift)', () => {
    test('shift={null} renders the EmptyState subtitle', () => {
      renderWithTheme(<LightPlanCard shift={null} />);
      expect(screen.getByText('Log a shift to see your light plan')).toBeTruthy();
      // The populated and error affordances must NOT be present.
      expect(screen.queryByText('Seek bright light')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('a shift missing its times is also treated as empty', () => {
      // Bypass the compile-time type: a partial shift (no startTime/endTime)
      // routes to the empty branch rather than throwing in compute.
      renderWithTheme(<LightPlanCard shift={{} as any} />);
      expect(screen.getByText('Log a shift to see your light plan')).toBeTruthy();
    });
  });

  describe('populated (valid day-shift)', () => {
    test('renders BOTH window labels with formatted times', () => {
      renderWithTheme(<LightPlanCard shift={SHIFT} />);

      // Both light-window labels render…
      expect(screen.getByText('Seek bright light')).toBeTruthy();
      expect(screen.getByText('Avoid light / blue-blockers')).toBeTruthy();
      // …with the formatted window values (timezone-portable: same Intl call,
      // same instants as the component).
      expect(screen.getByText(seekValue)).toBeTruthy();
      expect(screen.getByText(avoidValue)).toBeTruthy();
      // And the empty-state subtitle must NOT be present.
      expect(screen.queryByText('Log a shift to see your light plan')).toBeNull();
    });

    test('the header exposes the "Open your light plan" deep-link affordance (role=button)', () => {
      renderWithTheme(<LightPlanCard shift={SHIFT} />);
      const affordance = screen.getByRole('button', { name: 'Open your light plan' });
      expect(affordance).toBeTruthy();
    });

    test('the "Avoid light / blue-blockers" row uses the exact window computeLightPlan returns', () => {
      // Card ↔ source-of-truth parity: build the expected row value from the SAME
      // computeLightPlan output (avoidLight) with the SAME Intl/fmt call the card
      // uses, so the rendered window is provably the one computeLightPlan derives
      // — the same avoidLight.start the nf-avoid-light circadian reminder fires at
      // (see __tests__/lib/lightPlanReminderParity.test.ts).
      const { avoidLight } = computeLightPlan(SHIFT);
      const expected = `${fmt(avoidLight.start)} – ${fmt(avoidLight.end)}`;
      renderWithTheme(<LightPlanCard shift={SHIFT} />);
      expect(screen.getByText('Avoid light / blue-blockers')).toBeTruthy();
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });
});
