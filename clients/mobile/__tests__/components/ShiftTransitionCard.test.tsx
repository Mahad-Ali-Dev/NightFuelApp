/**
 * Render tests for the dashboard's <ShiftTransitionCard /> "Next shift
 * transition" circadian readiness card.
 *
 * ShiftTransitionCard is a pure presentational card (shift + loading/error/
 * onRetry props). It owns no data fetching; it derives the three transition
 * anchors from the shared, unit-tested `computeShiftTransition`
 * (src/lib/shiftTransition.ts) and renders one of four states:
 *
 *   1. loading            → Skeleton blocks (no anchor text yet)
 *   2. error (truthy)     → inline "Couldn't load…" copy + a Retry button
 *   3. empty (no shift)   → EmptyState "Log a shift to see your transition plan"
 *   4. populated          → "Recommended sleep" / "Caffeine cutoff" /
 *                           "Bright light" rows with formatted local times
 *   (4b) malformed ISO    → a malformed shift throws in compute and degrades to
 *                           the inline "times look off" error treatment
 *
 * This suite ALSO makes the perf refactor observable: AnchorRow and Header were
 * lifted out of the render body to stable module-scope components. By rendering
 * every state through the public component and asserting the exact labels +
 * computeShiftTransition-derived values, it pins behaviour/layout/text byte-for-
 * byte across that hoist (the dashboard.shiftTransition suite exercises the same
 * card via the full screen and remains unchanged).
 *
 * Mocks (matching the component-test style in LightPlanCard.test.tsx /
 * dashboard.shiftTransition.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>` so
 *    glyphs are assertable as text and the card mounts without native code.
 *  - Theme comes from the real `ThemeContext.Provider`.
 *
 * The header text ("Next shift transition") renders in EVERY state, so — exactly
 * like the LightPlanCard / dashboard.shiftTransition suites — the loading state
 * is pinned by the combined ABSENCE of every other branch's distinctive content
 * (the Aurora `Skeleton` exposes no testID to query directly).
 *
 * Timestamps are UTC; the populated-state expected strings are produced by the
 * SAME Intl.DateTimeFormat call the component uses, against the SAME instants
 * returned by computeShiftTransition, so the assertions are timezone-portable.
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

// Import AFTER the mocks are registered. `computeShiftTransition` is the pure
// anchor math the card renders from; importing it lets us assert the rendered
// rows use the EXACT instants computeShiftTransition returns (card ↔
// source-of-truth parity), not just the test's hand-rolled arithmetic.
import ShiftTransitionCard from '@/components/home/ShiftTransitionCard';
import { computeShiftTransition } from '@/lib/shiftTransition';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

// A valid overnight shift (22:00 → 06:00 next-day UTC). The anchor math comes
// from computeShiftTransition: caffeineCutoff = end-6h; sleepWindow =
// end+1h … end+9h; brightLightWindow = start … start+2h.
const START = '2026-06-13T22:00:00.000Z';
const END = '2026-06-14T06:00:00.000Z';
const SHIFT = { startTime: START, endTime: END };

// Expected formatted strings, built with the SAME Intl call the card uses
// (formatTime → toLocaleTimeString) against the SAME instants computeShiftTransition
// returns, so they match whatever timezone the runner uses.
const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const { sleepWindow, caffeineCutoff, brightLightWindow } = computeShiftTransition(SHIFT);
const sleepValue = `${fmt(sleepWindow.start)} – ${fmt(sleepWindow.end)}`;
const caffeineValue = fmt(caffeineCutoff);
const brightLightValue = `${fmt(brightLightWindow.start)} – ${fmt(brightLightWindow.end)}`;

describe('ShiftTransitionCard', () => {
  describe('loading', () => {
    test('renders the header but none of the other branches\' content (skeleton state)', () => {
      renderWithTheme(<ShiftTransitionCard loading shift={SHIFT} />);

      // The header ("Next shift transition") renders in every state.
      expect(screen.getByText('Next shift transition')).toBeTruthy();
      // What pins down the LOADING skeleton is the combined absence of every
      // other branch's distinctive content (the Aurora Skeleton has no testID):
      //   - no populated anchor labels
      expect(screen.queryByText('Recommended sleep')).toBeNull();
      expect(screen.queryByText('Caffeine cutoff')).toBeNull();
      expect(screen.queryByText('Bright light')).toBeNull();
      //   - no error Retry control
      expect(screen.queryByText('Retry')).toBeNull();
      //   - no empty-state subtitle
      expect(screen.queryByText('Log a shift to see your transition plan')).toBeNull();
    });
  });

  describe('error', () => {
    test('renders the error copy and a Retry control; pressing Retry fires onRetry', () => {
      const onRetry = jest.fn();
      renderWithTheme(<ShiftTransitionCard error={new Error('boom')} onRetry={onRetry} />);

      // The header still renders in the error state.
      expect(screen.getByText('Next shift transition')).toBeTruthy();
      // Inline error message (note the curly apostrophe in the source copy).
      expect(screen.getByText('Couldn’t load your transition plan.')).toBeTruthy();
      // A Retry button is present…
      const retry = screen.getByText('Retry');
      expect(retry).toBeTruthy();
      // …and pressing it invokes the onRetry callback. fireEvent.press bubbles
      // from the Button's <Text> to its Pressable's onPress.
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('error without onRetry renders the message but no Retry control', () => {
      renderWithTheme(<ShiftTransitionCard error={new Error('boom')} />);
      expect(screen.getByText('Couldn’t load your transition plan.')).toBeTruthy();
      expect(screen.queryByText('Retry')).toBeNull();
      // And none of the populated anchor labels leak into the error state.
      expect(screen.queryByText('Recommended sleep')).toBeNull();
      expect(screen.queryByText('Caffeine cutoff')).toBeNull();
      expect(screen.queryByText('Bright light')).toBeNull();
    });
  });

  describe('empty (no shift)', () => {
    test('shift={null} renders the EmptyState subtitle', () => {
      renderWithTheme(<ShiftTransitionCard shift={null} />);
      expect(screen.getByText('Next shift transition')).toBeTruthy();
      expect(screen.getByText('Log a shift to see your transition plan')).toBeTruthy();
      // The populated and error affordances must NOT be present.
      expect(screen.queryByText('Recommended sleep')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('a shift missing its times is also treated as empty', () => {
      // Bypass the compile-time type: a partial shift (no startTime/endTime)
      // routes to the empty branch rather than throwing in compute.
      renderWithTheme(<ShiftTransitionCard shift={{} as any} />);
      expect(screen.getByText('Log a shift to see your transition plan')).toBeTruthy();
    });
  });

  describe('populated (valid overnight shift)', () => {
    test('renders the three anchor labels with formatted times', () => {
      renderWithTheme(<ShiftTransitionCard shift={SHIFT} />);

      // The three anchor labels render…
      expect(screen.getByText('Recommended sleep')).toBeTruthy();
      expect(screen.getByText('Caffeine cutoff')).toBeTruthy();
      expect(screen.getByText('Bright light')).toBeTruthy();
      // …with the formatted anchor values (timezone-portable: same Intl call,
      // same instants as the component).
      expect(screen.getByText(sleepValue)).toBeTruthy();
      expect(screen.getByText(caffeineValue)).toBeTruthy();
      expect(screen.getByText(brightLightValue)).toBeTruthy();
      // And the empty-state subtitle must NOT be present.
      expect(screen.queryByText('Log a shift to see your transition plan')).toBeNull();
    });

    test('each anchor value is built from the exact instant computeShiftTransition returns', () => {
      // Card ↔ source-of-truth parity: rebuild every expected row value from the
      // SAME computeShiftTransition output with the SAME Intl/fmt call the card
      // uses, so the rendered anchors are provably the ones the helper derives
      // (and that the local circadian reminders fire at — see shiftTransition.ts).
      const { sleepWindow: s, caffeineCutoff: c, brightLightWindow: b } = computeShiftTransition(SHIFT);
      renderWithTheme(<ShiftTransitionCard shift={SHIFT} />);
      expect(screen.getByText(`${fmt(s.start)} – ${fmt(s.end)}`)).toBeTruthy();
      expect(screen.getByText(fmt(c))).toBeTruthy();
      expect(screen.getByText(`${fmt(b.start)} – ${fmt(b.end)}`)).toBeTruthy();
    });
  });

  describe('malformed shift (bad ISO)', () => {
    test('a shift whose times are unparseable degrades to the inline error treatment', () => {
      // A non-empty but unparseable ISO passes the empty-branch guard (truthy
      // startTime/endTime) but throws inside computeShiftTransition, which the
      // card catches and renders as its own inline "times look off" message —
      // not a crash and not the cloud-offline error copy.
      renderWithTheme(<ShiftTransitionCard shift={{ startTime: 'not-a-date', endTime: 'also-bad' }} />);

      expect(screen.getByText('Next shift transition')).toBeTruthy();
      expect(screen.getByText('This shift’s times look off — re-log it to see your plan.')).toBeTruthy();
      // It is the malformed branch, NOT the empty or populated branch.
      expect(screen.queryByText('Log a shift to see your transition plan')).toBeNull();
      expect(screen.queryByText('Recommended sleep')).toBeNull();
      expect(screen.queryByText('Caffeine cutoff')).toBeNull();
      expect(screen.queryByText('Bright light')).toBeNull();
      // And no Retry control in this branch (it has no onRetry affordance).
      expect(screen.queryByText('Retry')).toBeNull();
    });
  });
});
