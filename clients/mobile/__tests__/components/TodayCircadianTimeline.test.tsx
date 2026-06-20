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

  // ──────────────────────────────────────────────────────────────────────────
  // Time-aware behaviour: the OPTIONAL `now` prop adds a now-marker (per-row
  // past/current/upcoming classification) and a single countdown to the next
  // instant. These cases inject a FIXED clock so they are deterministic; they
  // assert classification via accessibilityState / accessibilityLabel / testID
  // (NOT styling), and assert the countdown text equals `formatRelative` applied
  // to the SAME helper instant minus the SAME fixed clock — so the surface is
  // proven to derive purely from the helpers' getTime(), never NaN/Invalid Date.
  //
  // For the SHIFT fixture (22:00 → 06:00 UTC) the helpers yield (UTC):
  //   seekLight      22:00 … 00:00   caffeineCutoff 00:00 (instant)
  //   avoidLight     05:00 … 07:00   anchor         07:00 … 11:00
  //   fullSleep      07:00 … 15:00
  // so a clock of 06:00 sits INSIDE exactly one window (avoidLight): the two
  // earlier rows are past and the two later rows are upcoming.
  // ──────────────────────────────────────────────────────────────────────────
  describe('time-aware (fixed now)', () => {
    // Mirror of the component's module-scope formatRelative (pure integer math),
    // exactly as this suite mirrors formatTime via `fmt`. Asserting against a
    // re-derivation from the SAME helper instant + SAME clock proves the rendered
    // countdown is the helper's, not a hand-rolled copy.
    const formatRelative = (ms: number) => {
      if (!Number.isFinite(ms) || ms <= 0) return '0m';
      const totalMinutes = Math.floor(ms / 60_000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    // 06:00 UTC: past=[seek-light, caffeine-cutoff], current=[avoid-light],
    // upcoming=[anchor-sleep, full-sleep].
    const NOW_MID = new Date('2026-01-03T06:00:00.000Z');

    test('(a) marks exactly the in-progress row current, earlier rows past, later rows upcoming', () => {
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} now={NOW_MID} />);

      // The single current row is the avoid-light window (05:00 ≤ 06:00 < 07:00).
      const current = screen.getByTestId('today-timeline-row-avoid-light');
      expect(current.props.accessibilityState).toEqual({ selected: true, disabled: false });
      expect(String(current.props.accessibilityLabel)).toContain(', current');

      // Earlier rows (their window already closed / instant already passed) are past.
      for (const key of ['seek-light', 'caffeine-cutoff']) {
        const node = screen.getByTestId(`today-timeline-row-${key}`);
        expect(node.props.accessibilityState).toEqual({ selected: false, disabled: true });
        expect(String(node.props.accessibilityLabel)).toContain(', past');
      }

      // Later rows (start strictly after now) are upcoming.
      for (const key of ['anchor-sleep', 'full-sleep']) {
        const node = screen.getByTestId(`today-timeline-row-${key}`);
        expect(node.props.accessibilityState).toEqual({ selected: false, disabled: false });
        expect(String(node.props.accessibilityLabel)).toContain(', upcoming');
      }

      // EXACTLY one current row across the whole timeline.
      const currentRows = screen
        .getAllByTestId(/^today-timeline-row-/)
        .filter((n) => n.props.accessibilityState?.selected === true);
      expect(currentRows).toHaveLength(1);
    });

    test('(b) countdown — before all rows — counts to the first instant via the SAME helper', () => {
      // 20:00 UTC, before seekLight.start (22:00). Next instant = seekLight.start.
      const now = new Date('2026-01-02T20:00:00.000Z');
      const seekStart = computeLightPlan(SHIFT).seekLight.start;
      const expected = `Seek bright light in ${formatRelative(seekStart.getTime() - now.getTime())}`;

      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} now={now} />);
      // The countdown container is present, and its text is the exact helper-derived label.
      expect(screen.getByTestId('today-timeline-countdown')).toBeTruthy();
      expect(screen.getByText(expected)).toBeTruthy();
      expect(expected).not.toMatch(/NaN|Invalid Date/);
      // Sanity: with this clock every row is still upcoming (nothing has passed).
      const past = screen
        .getAllByTestId(/^today-timeline-row-/)
        .filter((n) => n.props.accessibilityState?.disabled === true);
      expect(past).toHaveLength(0);
    });

    test('(b) countdown — between two rows — counts to the next instant via the SAME helper', () => {
      // 06:00 UTC is inside avoidLight, so the next future instant is that
      // window's CLOSE (avoidLight.end = 07:00) — the moment the in-progress
      // window ends — counted from the SAME helper instant.
      const avoidEnd = computeLightPlan(SHIFT).avoidLight.end;
      const expected = `Avoid light / blue-blockers in ${formatRelative(avoidEnd.getTime() - NOW_MID.getTime())}`;

      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} now={NOW_MID} />);
      expect(screen.getByTestId('today-timeline-countdown')).toBeTruthy();
      expect(screen.getByText(expected)).toBeTruthy();
      expect(expected).not.toMatch(/NaN|Invalid Date/);
    });

    test('(b) countdown — after all rows — shows the terminal copy, never NaN/Invalid Date', () => {
      // 18:00 UTC, after fullSleep.end (15:00): nothing remains.
      const now = new Date('2026-01-03T18:00:00.000Z');
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} now={now} />);
      expect(screen.getByTestId('today-timeline-countdown')).toBeTruthy();
      // Terminal copy — defined, human, never a NaN/Invalid-Date leak.
      expect(screen.getByText('Day plan complete')).toBeTruthy();
      expect(screen.queryByText(/NaN|Invalid Date/)).toBeNull();
      // Every row is in the past once the whole plan has elapsed.
      const rows = screen.getAllByTestId(/^today-timeline-row-/);
      for (const n of rows) {
        expect(n.props.accessibilityState?.disabled).toBe(true);
        expect(n.props.accessibilityState?.selected).toBe(false);
      }
    });

    test('(c) classification derives only from the helpers — current row matches computeLightPlan.avoidLight', () => {
      // Prove the rendered "current" decision is the helpers' getTime() and not
      // an independent recomputation: avoidLight from the helper brackets NOW_MID
      // (start ≤ now < end), and that is exactly the row the surface marks current.
      const { avoidLight } = computeLightPlan(SHIFT);
      expect(avoidLight.start.getTime()).toBeLessThanOrEqual(NOW_MID.getTime());
      expect(NOW_MID.getTime()).toBeLessThan(avoidLight.end.getTime());

      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} now={NOW_MID} />);
      const current = screen.getByTestId('today-timeline-row-avoid-light');
      expect(current.props.accessibilityState?.selected).toBe(true);
    });

    test('omitting `now` adds NEITHER a countdown NOR any now-state to the rows (default-safe)', () => {
      // The additive contract: with no clock the surface is the time-blind render
      // — no countdown node, and rows carry no accessibilityState and no ", past/
      // current/upcoming" suffix on their label.
      renderWithTheme(<TodayCircadianTimeline shift={SHIFT} />);
      expect(screen.queryByTestId('today-timeline-countdown')).toBeNull();
      const seek = screen.getByTestId('today-timeline-row-seek-light');
      expect(seek.props.accessibilityState).toBeUndefined();
      expect(String(seek.props.accessibilityLabel)).not.toMatch(/, (past|current|upcoming)$/);
    });
  });
});
