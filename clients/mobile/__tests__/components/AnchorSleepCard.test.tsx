/**
 * Render tests for the dashboard's <AnchorSleepCard /> core-sleep coaching card.
 *
 * AnchorSleepCard is a pure presentational card with an IDENTICAL prop contract
 * to LightPlanCard / ShiftTransitionCard (shift + loading/error/onRetry). It owns
 * no data fetching; the PRIMARY rendered window IS the fixed 4h core block from
 * the shared, unit-tested `computeAnchorSleep` (src/lib/circadian/anchorSleep.ts)
 * — so we assert that row against THAT source of truth (the same instant the
 * nf-anchor-sleep reminder fires at, and whose body coaches the same 4h core),
 * not a hand-rolled arithmetic copy. A SECONDARY "Full sleep window" line shows
 * the surrounding ~8h recovery `sleepWindow` from `computeShiftTransition`, which
 * we assert under its DISTINCT label. It renders one of four states:
 *
 *   1. loading            → Skeleton blocks (no window text yet)
 *   2. error (truthy)     → inline "Couldn't load…" copy + a Retry button
 *   3. empty (no shift)   → EmptyState "Log a shift to see your anchor sleep"
 *   4. populated          → an "Anchor sleep (4h core)" row + a Full sleep window
 *                           context line + the short WHY copy
 *
 * The header doubles as a deep-link affordance (role=button, label "Open your
 * anchor sleep plan") into the sleep optimizer screen.
 *
 * Mocks (matching LightPlanCard.test.tsx / CaffeineTimerTile.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>` so
 *    glyphs are assertable as text and the card mounts without native code.
 *  - `expo-router` useRouter → a push spy so the header affordance mounts in an
 *    isolated render (the component calls `push?.(...)` on tap).
 *  - Theme comes from the real `ThemeContext.Provider`.
 *  - The Aurora glass fill (GlassCard → SafeBlurView → expo-blur) mounts under
 *    jest-expo with no extra mock, exactly as EntrainmentCard.test.tsx does.
 *
 * The header text ("Anchor sleep") renders in EVERY state, so — exactly like the
 * LightPlanCard suite — the loading state is pinned by the combined ABSENCE of
 * every other branch's distinctive content (the Aurora `Skeleton` exposes no
 * testID to query directly).
 *
 * Timestamps are UTC; the populated-state expected window string is produced by
 * the SAME toLocaleTimeString call the component uses, against the SAME instants
 * `computeShiftTransition` returns, so the assertions are timezone-portable AND
 * provably free of any 'Invalid Date' / 'NaN' formatting.
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
// card only calls `push?.(...)`; a push spy is enough.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Import AFTER the mocks are registered. `computeAnchorSleep` is the shared
// helper the card delegates to — its `anchor` IS the rendered PRIMARY (4h core)
// window. `computeShiftTransition` supplies the surrounding ~8h `sleepWindow`
// the card shows on the SECONDARY "Full sleep window" line. Importing both lets
// us assert each rendered row is the EXACT one its source returns (card ↔
// source-of-truth parity), not the test's hand-rolled arithmetic.
import AnchorSleepCard from '@/components/home/AnchorSleepCard';
import { computeShiftTransition } from '@/lib/shiftTransition';
import { computeAnchorSleep } from '@/lib/circadian/anchorSleep';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

// A valid overnight shift (22:00 → 06:00 next-day UTC). The PRIMARY anchor block
// is computeAnchorSleep's 4h core: sleepWindow.start … +4h (i.e. end + 1h … end +
// 5h). The SECONDARY full window is the engine's ~8h sleepWindow: (end + 1h) …
// (end + 9h).
const START = '2026-01-02T22:00:00.000Z';
const END = '2026-01-03T06:00:00.000Z';
const SHIFT = { startTime: START, endTime: END };

// Expected formatted window strings, built with the SAME toLocaleTimeString call
// the card uses (formatTime) against the SAME instants the shared helpers
// return, so they match whatever timezone the runner uses.
const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const { anchor } = computeAnchorSleep(SHIFT);
const { sleepWindow } = computeShiftTransition(SHIFT);
// PRIMARY row: the 4h core block (computeAnchorSleep), NOT the 8h sleepWindow.
const anchorValue = `${fmt(anchor.start)} – ${fmt(anchor.end)}`;
// SECONDARY "Full sleep window" line: the surrounding ~8h sleepWindow, rendered
// with a distinct two-space-separated label so it's queryable on its own.
const fullWindowValue = `Full sleep window  ${fmt(sleepWindow.start)} – ${fmt(sleepWindow.end)}`;

describe('AnchorSleepCard', () => {
  // Fail loudly on ANY console.error/warn during a render (a leaked falsy child,
  // an unkeyed list, an act() warning, a bad prop type) across every test here.
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('loading', () => {
    test('renders the header but none of the other branches\' content (skeleton state)', () => {
      renderWithTheme(<AnchorSleepCard loading shift={SHIFT} />);

      // The header ("Anchor sleep") renders in every state.
      expect(screen.getByText('Anchor sleep')).toBeTruthy();
      // What pins down the LOADING skeleton is the combined absence of every
      // other branch's distinctive content (the Aurora Skeleton has no testID):
      //   - no populated window label or WHY copy
      expect(screen.queryByText('Anchor sleep (4h core)')).toBeNull();
      expect(
        screen.queryByText(
          'A fixed core-sleep block held steady across your rotation stabilizes your body clock.',
        ),
      ).toBeNull();
      //   - no error Retry control
      expect(screen.queryByText('Retry')).toBeNull();
      //   - no empty-state subtitle
      expect(screen.queryByText('Log a shift to see your anchor sleep')).toBeNull();
    });
  });

  describe('error', () => {
    test('renders the error copy and a Retry control; pressing Retry fires onRetry', () => {
      const onRetry = jest.fn();
      renderWithTheme(<AnchorSleepCard error={new Error('boom')} onRetry={onRetry} />);

      // Inline error message (note the curly apostrophe in the source copy).
      expect(screen.getByText('Couldn’t load your anchor sleep.')).toBeTruthy();
      // A Retry button is present…
      const retry = screen.getByText('Retry');
      expect(retry).toBeTruthy();
      // …and pressing it invokes the onRetry callback. fireEvent.press bubbles
      // from the Button's <Text> to its Pressable's onPress.
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('error WITHOUT onRetry renders the copy but no Retry control', () => {
      renderWithTheme(<AnchorSleepCard error={new Error('boom')} />);
      expect(screen.getByText('Couldn’t load your anchor sleep.')).toBeTruthy();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('error state does not render the populated window label', () => {
      renderWithTheme(<AnchorSleepCard error={new Error('boom')} onRetry={jest.fn()} />);
      expect(screen.queryByText('Anchor sleep (4h core)')).toBeNull();
    });
  });

  describe('empty (no shift)', () => {
    test('shift={null} renders the EmptyState subtitle', () => {
      renderWithTheme(<AnchorSleepCard shift={null} />);
      expect(screen.getByText('Log a shift to see your anchor sleep')).toBeTruthy();
      // The populated and error affordances must NOT be present.
      expect(screen.queryByText('Anchor sleep (4h core)')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('a shift missing its times is also treated as empty (no throw)', () => {
      // Bypass the compile-time type: a partial shift (no startTime/endTime)
      // routes to the empty branch rather than throwing in compute.
      renderWithTheme(<AnchorSleepCard shift={{} as any} />);
      expect(screen.getByText('Log a shift to see your anchor sleep')).toBeTruthy();
      expect(screen.queryByText('Anchor sleep (4h core)')).toBeNull();
    });
  });

  describe('malformed shift (bad ISO)', () => {
    test('renders the honest "times look off" inline message instead of throwing', () => {
      // Times present but unparseable → computeShiftTransition throws → the
      // populated branch's catch degrades to the inline message (never an
      // 'Invalid Date' string, never a crash).
      renderWithTheme(
        <AnchorSleepCard shift={{ startTime: 'nonsense', endTime: 'also-bad' } as any} />,
      );
      expect(
        screen.getByText('This shift’s times look off — re-log it to see your plan.'),
      ).toBeTruthy();
      expect(screen.queryByText('Anchor sleep (4h core)')).toBeNull();
    });
  });

  describe('populated (valid shift)', () => {
    test('renders the 4h anchor label + value, the Full sleep window line, and the WHY copy', () => {
      renderWithTheme(<AnchorSleepCard shift={SHIFT} />);

      // The PRIMARY 4h-core label renders (truthful: the value below is the 4h
      // anchor, not the 8h sleepWindow)…
      expect(screen.getByText('Anchor sleep (4h core)')).toBeTruthy();
      // …with the formatted 4h-core value (timezone-portable: same
      // toLocaleTimeString call, same instants as the component)…
      expect(screen.getByText(anchorValue)).toBeTruthy();
      // …the SECONDARY Full sleep window context line under its distinct label…
      expect(screen.getByText(fullWindowValue)).toBeTruthy();
      // …and the short WHY rationale.
      expect(
        screen.getByText(
          'A fixed core-sleep block held steady across your rotation stabilizes your body clock.',
        ),
      ).toBeTruthy();
      // And the empty-state subtitle must NOT be present.
      expect(screen.queryByText('Log a shift to see your anchor sleep')).toBeNull();
    });

    test('the formatted anchor window is a stable, non-"Invalid Date" / non-"NaN" string', () => {
      renderWithTheme(<AnchorSleepCard shift={SHIFT} />);
      // The exact rendered window value, fetched back from the tree…
      const node = screen.getByText(anchorValue);
      const rendered = String(node.props.children);
      // …never degrades to an Intl failure string.
      expect(rendered).not.toMatch(/Invalid Date/);
      expect(rendered).not.toMatch(/NaN/);
      // It is a two-time range separated by the en-dash.
      expect(rendered).toContain(' – ');
    });

    test('the PRIMARY row is the EXACT 4h core block computeAnchorSleep returns (and is a 4h span)', () => {
      // Card ↔ source-of-truth parity: build the expected PRIMARY row from the
      // SAME computeAnchorSleep output (anchor) with the SAME fmt call the card
      // uses, so the rendered window is provably the 4h core the shared helper
      // derives — the same anchor.start the nf-anchor-sleep reminder fires at —
      // and NOT the 8h sleepWindow.
      const { anchor: a } = computeAnchorSleep(SHIFT);
      const expectedPrimary = `${fmt(a.start)} – ${fmt(a.end)}`;
      renderWithTheme(<AnchorSleepCard shift={SHIFT} />);
      expect(screen.getByText('Anchor sleep (4h core)')).toBeTruthy();
      expect(screen.getByText(expectedPrimary)).toBeTruthy();
      // The anchor block is exactly the 4h core (ANCHOR_SLEEP_HOURS), so the
      // PRIMARY row can never silently widen back to the ~8h sleepWindow.
      expect(a.end.getTime() - a.start.getTime()).toBe(4 * 3_600_000);

      // The SECONDARY full window is the surrounding ~8h sleepWindow, asserted
      // under its DISTINCT label so the two rows can't be confused.
      const { sleepWindow: sw } = computeShiftTransition(SHIFT);
      const expectedFull = `Full sleep window  ${fmt(sw.start)} – ${fmt(sw.end)}`;
      expect(screen.getByText(expectedFull)).toBeTruthy();
    });

    test('the header exposes the "Open your anchor sleep plan" deep-link affordance (role=button)', () => {
      renderWithTheme(<AnchorSleepCard shift={SHIFT} />);
      const affordance = screen.getByRole('button', { name: 'Open your anchor sleep plan' });
      expect(affordance).toBeTruthy();
    });
  });
});
