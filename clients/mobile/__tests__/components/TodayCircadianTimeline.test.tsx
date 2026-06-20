/**
 * Render tests for the dashboard's <TodayCircadianTimeline /> composed circadian
 * day-plan surface.
 *
 * TodayCircadianTimeline is a pure presentational surface with an IDENTICAL prop
 * contract to AnchorSleepCard / LightPlanCard / ShiftTransitionCard (shift +
 * loading/error/onRetry). It owns no data fetching; it COMPOSES the existing pure
 * helpers — `computeShiftTransition` (src/lib/shiftTransition.ts), `computeLightPlan`
 * (src/lib/lightPlan.ts), and `computeAnchorSleep` (src/lib/circadian/anchorSleep.ts)
 * — into ONE chronologically sorted list of rows. So we assert each rendered row
 * time against THOSE sources of truth (the same instants the circadian reminders
 * fire at), not a hand-rolled arithmetic copy. It renders one of five states:
 *
 *   1. loading            → Skeleton blocks (no row text yet)
 *   2. error (truthy)     → inline "Couldn't load…" copy + a Retry button
 *   3. empty (no shift)   → EmptyState "Log a shift to see your day plan"
 *   4. malformed ISO      → the honest "times look off" inline message (no throw)
 *   5. populated          → the sorted timeline rows
 *
 * The header doubles as a deep-link affordance (role=button, label "Open your
 * circadian plan") into the circadian screen.
 *
 * Mocks (matching AnchorSleepCard.test.tsx / LightPlanCard.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>` so
 *    glyphs are assertable as text and the surface mounts without native code.
 *  - `expo-router` useRouter → a push spy so the header affordance mounts in an
 *    isolated render (the component calls `push?.(...)` on tap).
 *  - Theme comes from the real `ThemeContext.Provider`.
 *  - The Aurora glass fill (GlassCard → SafeBlurView → expo-blur) mounts under
 *    jest-expo with no extra mock, exactly as AnchorSleepCard.test.tsx does.
 *
 * The header text ("Today") renders in EVERY state, so — exactly like the sibling
 * suites — the loading state is pinned by the combined ABSENCE of every other
 * branch's distinctive content (the Aurora `Skeleton` exposes no testID).
 *
 * Timestamps are UTC; every expected row string is produced by the SAME
 * toLocaleTimeString call the component uses, against the SAME instants the
 * helpers return, so the assertions are timezone-portable AND provably free of
 * any 'Invalid Date' / 'NaN' formatting.
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
// component only calls `push?.(...)`; a push spy is enough.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Import AFTER the mocks are registered. The three helpers are the engines the
// timeline composes — importing them lets us assert each rendered row time is
// the EXACT instant the helper returns (surface ↔ source-of-truth parity), not
// the test's hand-rolled arithmetic.
import TodayCircadianTimeline from '@/components/home/TodayCircadianTimeline';
import { computeShiftTransition } from '@/lib/shiftTransition';
import { computeLightPlan } from '@/lib/lightPlan';
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

// A valid overnight shift (22:00 → 06:00 next-day UTC). With these instants:
//   seekLight       = 22:00 … 00:00   (start … start+2h)
//   caffeineCutoff  = 00:00           (end − 6h)
//   avoidLight      = 05:00 … 07:00   (sleepStart−2h … sleepStart)
//   anchor          = 07:00 … 11:00   (sleepStart … sleepStart+4h)
//   fullSleep       = 07:00 … 15:00   (sleepStart … end+9h)
// so the chronological order STARTS seek-light → caffeine-cutoff → avoid-light.
const START = '2026-01-02T22:00:00.000Z';
const END = '2026-01-03T06:00:00.000Z';
const SHIFT = { startTime: START, endTime: END };

// Expected formatted strings, built with the SAME toLocaleTimeString call the
// component uses (formatTime) against the SAME instants the helpers return, so
// they match whatever timezone the runner uses.
const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const range = (a: Date, b: Date) => `${fmt(a)} – ${fmt(b)}`;

describe('TodayCircadianTimeline', () => {
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
    test("renders the header but none of the other branches' content (skeleton state)", () => {
      renderWithTheme(<TodayCircadianTimeline loading shift={SHIFT} />);

      // The header ("Today") renders in every state.
      expect(screen.getByText('Today')).toBeTruthy();
      // What pins the LOADING skeleton is the combined absence of every other
      // branch's distinctive content (the Aurora Skeleton has no testID):
      //   - no populated row labels
      expect(screen.queryByText('Seek bright light')).toBeNull();
      expect(screen.queryByText('Anchor (core) sleep')).toBeNull();
      //   - no error Retry control
      expect(screen.queryByText('Retry')).toBeNull();
      //   - no empty-state subtitle
      expect(screen.queryByText('Log a shift to see your day plan')).toBeNull();
    });
  });

  describe('error', () => {
    test('renders the error copy and a Retry control; pressing Retry fires onRetry', () => {
      const onRetry = jest.fn();
      renderWithTheme(<TodayCircadianTimeline error={new Error('boom')} onRetry={onRetry} />);

      // Inline error message (note the curly apostrophe in the source copy).
      expect(screen.getByText('Couldn’t load your day plan.')).toBeTruthy();
      // A Retry button is present…
      const retry = screen.getByText('Retry');
      expect(retry).toBeTruthy();
      // …and pressing it invokes the onRetry callback. fireEvent.press bubbles
      // from the Button's <Text> to its Pressable's onPress.
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('error WITHOUT onRetry renders the copy but no Retry control', () => {
      renderWithTheme(<TodayCircadianTimeline error={new Error('boom')} />);
      expect(screen.getByText('Couldn’t load your day plan.')).toBeTruthy();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('error state does not render any populated row label', () => {
      renderWithTheme(<TodayCircadianTimeline error={new Error('boom')} onRetry={jest.fn()} />);
      expect(screen.queryByText('Seek bright light')).toBeNull();
    });
  });

  describe('empty (no shift)', () => {
    test('shift={null} renders the EmptyState subtitle', () => {
      renderWithTheme(<TodayCircadianTimeline shift={null} />);
      expect(screen.getByText('Log a shift to see your day plan')).toBeTruthy();
      // The populated and error affordances must NOT be present.
      expect(screen.queryByText('Seek bright light')).toBeNull();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    test('a shift missing its times is also treated as empty (no throw)', () => {
      // Bypass the compile-time type: a partial shift (no startTime/endTime)
      // routes to the empty branch rather than throwing in compute.
      renderWithTheme(<TodayCircadianTimeline shift={{} as any} />);
      expect(screen.getByText('Log a shift to see your day plan')).toBeTruthy();
      expect(screen.queryByText('Seek bright light')).toBeNull();
    });
  });

  describe('malformed shift (bad ISO)', () => {
    test('renders the honest "times look off" inline message instead of throwing', () => {
      // Times present but unparseable → the helpers throw → the populated
      // branch's single try/catch degrades to the inline message (never an
      // 'Invalid Date' string, never a crash).
      renderWithTheme(
        <TodayCircadianTimeline shift={{ startTime: 'nonsense', endTime: 'also-bad' } as any} />,
      );
      expect(
        screen.getByText('This shift’s times look off — re-log it to see your plan.'),
      ).toBeTruthy();
      expect(screen.queryByText('Seek bright light')).toBeNull();
    });
  });

  describe('populated (valid shift)', () => {
    test('renders every composed row label', () => {
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      expect(screen.getByText('Seek bright light')).toBeTruthy();
      expect(screen.getByText('Caffeine cutoff')).toBeTruthy();
      expect(screen.getByText('Avoid light / blue-blockers')).toBeTruthy();
      expect(screen.getByText('Anchor (core) sleep')).toBeTruthy();
      expect(screen.getByText('Full sleep window')).toBeTruthy();
      // And the empty-state subtitle must NOT be present.
      expect(screen.queryByText('Log a shift to see your day plan')).toBeNull();
    });

    test('the anchor-sleep row time is built from computeAnchorSleep(shift).anchor', () => {
      // Surface ↔ source-of-truth parity: build the expected row value from the
      // SAME computeAnchorSleep output with the SAME fmt call the component uses,
      // so the rendered time is provably the one the helper derives — not a
      // hand-rolled offset.
      const { anchor } = computeAnchorSleep(SHIFT);
      const expected = range(anchor.start, anchor.end);
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      expect(screen.getByText('Anchor (core) sleep')).toBeTruthy();
      expect(screen.getByText(expected)).toBeTruthy();
    });

    test('the avoid-light row time is built from computeLightPlan(shift).avoidLight', () => {
      // Same parity assertion against the light-plan helper (not arithmetic).
      const { avoidLight } = computeLightPlan(SHIFT);
      const expected = range(avoidLight.start, avoidLight.end);
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      expect(screen.getByText('Avoid light / blue-blockers')).toBeTruthy();
      expect(screen.getByText(expected)).toBeTruthy();
    });

    test('the caffeine-cutoff row renders the single computeShiftTransition instant as a "by …" deadline', () => {
      // The caffeine cutoff is a single instant (no range): it renders as
      // "by <time>" — built from the SAME helper instant — and is NOT a range.
      // The "by " qualifier also keeps it textually distinct from the sibling
      // ShiftTransitionCard's bare `formatTime(caffeineCutoff)`, so the same
      // instant on both surfaces never collapses into one ambiguous node.
      const { caffeineCutoff } = computeShiftTransition(SHIFT);
      const expected = `by ${fmt(caffeineCutoff)}`;
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      expect(screen.getByText('Caffeine cutoff')).toBeTruthy();
      const node = screen.getByText(expected);
      expect(node).toBeTruthy();
      // A single instant, never a range.
      expect(String(node.props.children)).not.toContain(' – ');
      // And it embeds the EXACT helper-derived time string.
      expect(String(node.props.children)).toContain(fmt(caffeineCutoff));
    });

    test('rows render in chronological order: seek-light precedes caffeine cutoff', () => {
      // For this fixture the helpers place seekLight.start (22:00) strictly
      // before caffeineCutoff (00:00 next day), so the sorted timeline must
      // render the seek-light row ABOVE the caffeine row. We assert ordering
      // against the helpers' getTime() (the component's own sort key), then
      // confirm the rendered DOM order matches.
      const seekStart = computeLightPlan(SHIFT).seekLight.start;
      const caffeine = computeShiftTransition(SHIFT).caffeineCutoff;
      expect(seekStart.getTime()).toBeLessThan(caffeine.getTime());

      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      const labels = screen.getAllByText(/Seek bright light|Caffeine cutoff/);
      // getAllByText returns nodes in tree (render) order.
      expect(labels).toHaveLength(2);
      expect(String(labels[0].props.children)).toBe('Seek bright light');
      expect(String(labels[1].props.children)).toBe('Caffeine cutoff');
    });

    test('the rendered times never degrade to an "Invalid Date" / "NaN" string', () => {
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      const { anchor } = computeAnchorSleep(SHIFT);
      const node = screen.getByText(range(anchor.start, anchor.end));
      const rendered = String(node.props.children);
      expect(rendered).not.toMatch(/Invalid Date/);
      expect(rendered).not.toMatch(/NaN/);
      expect(rendered).toContain(' – ');
    });

    test('the header exposes the "Open your circadian plan" deep-link affordance (role=button)', () => {
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      const affordance = screen.getByRole('button', { name: 'Open your circadian plan' });
      expect(affordance).toBeTruthy();
    });
  });
});
