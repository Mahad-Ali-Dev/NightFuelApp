/**
 * Render + interaction tests for the chat composer's <QuickReplies /> chip row.
 *
 * QuickReplies is a PURE presentational row (no data fetching, no live DB, all
 * plain props { replies, onSelect }) that maps a short, static array of strings
 * to a horizontally-scrolling row of suggested-reply chips. It sits alongside
 * ChatBubble in src/components/chat and, like that sibling, is load-bearing for
 * the F1 chat surface — so this suite locks its contracts against regression:
 *
 *   (a) Pressing a chip calls onSelect EXACTLY once with that chip's exact label
 *       — the per-chip `() => onSelect(reply)` closure forwards the right string.
 *   (b) An empty `replies={[]}` renders NO chip and emits NO console.error: the
 *       component uses `replies.map(...)` (an empty array maps to `[]`, which
 *       React renders as nothing) — never the `{value && <Component/>}` falsy-&&
 *       pattern that would leak a `0`/'' text node and crash. (rule:
 *       rendering-no-falsy-and). The afterEach error spy proves the absence.
 *   (c) Each chip is queryable by accessibility role 'button' AND by its exact
 *       label `Quick reply: <text>` — the a11y contract every chip carries.
 *   (d) Press-handler / chip identity is stable across a re-render with identical
 *       props: re-rendering the SAME element resolves the SAME node instances and
 *       a press still fires onSelect once with the right label (no remount, no
 *       duplicate fire).
 *
 * Mocks (matching the sibling component suite — ChatBubble / AnchorSleepCard /
 * CaffeineTimerTile): theme comes from the real `ThemeContext.Provider` (no theme
 * mock). QuickReplies pulls only `useTheme` + `withAlpha` and renders plain
 * RN primitives (ScrollView / TouchableOpacity / Text), so no native mock is
 * needed.
 *
 * Posture (matching AnchorSleepCard.test.tsx / ChatBubble.test.tsx): every test
 * fails loudly if React logs a console.error / console.warn during render (a
 * leaked falsy child, an unkeyed list, an act() warning, a bad prop type) — this
 * is also assertion group (b)'s "no stray text node" guard: the spies are never
 * called.
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
import { QuickReplies } from '@/components/chat/QuickReplies';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

const REPLIES = ['Yes', 'No', 'Tell me more'] as const;

describe('QuickReplies', () => {
  // Fail loudly on ANY console.error/warn during a render across every test here
  // (this IS assertion group (b)'s "no leaked falsy child" guard: the spies are
  // never called).
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

  // ── (a) pressing a chip calls onSelect exactly once with that chip's label ─────
  test('pressing a chip calls onSelect exactly once with that chip\'s exact label', () => {
    const onSelect = jest.fn();
    renderWithTheme(<QuickReplies replies={[...REPLIES]} onSelect={onSelect} />);

    // Press the middle chip by its a11y label so we exercise the same node a
    // screen-reader user would activate.
    fireEvent.press(screen.getByLabelText('Quick reply: No'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('No');

    // A different chip forwards its OWN label — the per-chip closure is not
    // sharing a stale value.
    fireEvent.press(screen.getByLabelText('Quick reply: Tell me more'));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith('Tell me more');
  });

  // ── (b) empty replies=[] renders no chip and leaks no stray text node ──────────
  test('empty replies=[] renders no chip and emits no console.error from a leaked falsy child', () => {
    const onSelect = jest.fn();
    renderWithTheme(<QuickReplies replies={[]} onSelect={onSelect} />);

    // No chip button is rendered…
    expect(screen.queryByRole('button')).toBeNull();
    // …and no reply label exists either.
    for (const reply of REPLIES) {
      expect(screen.queryByLabelText(`Quick reply: ${reply}`)).toBeNull();
    }
    // No press could have fired.
    expect(onSelect).not.toHaveBeenCalled();
    // The afterEach error/warn spies (asserted not-called) prove the empty
    // `.map()` leaked no 0/'' text node outside a <Text>. This is the
    // rendering-no-falsy-and guarantee.
  });

  // ── (c) each chip is queryable by accessibility role AND label ─────────────────
  test('each chip is queryable by accessibility role button and by its exact label', () => {
    const onSelect = jest.fn();
    renderWithTheme(<QuickReplies replies={[...REPLIES]} onSelect={onSelect} />);

    // One button per reply, and each is reachable by its `Quick reply: <text>`
    // label — the a11y contract the component documents.
    expect(screen.getAllByRole('button')).toHaveLength(REPLIES.length);
    for (const reply of REPLIES) {
      expect(screen.getByLabelText(`Quick reply: ${reply}`)).toBeTruthy();
      // The labelled node is itself the role=button chip (label sits on the
      // touchable, not a nested wrapper).
      expect(screen.getByRole('button', { name: `Quick reply: ${reply}` })).toBeTruthy();
    }
  });

  // ── (d) handler/chip identity stable across a re-render with identical props ───
  test('re-rendering with identical props keeps the same chip nodes and fires onSelect once', () => {
    const onSelect = jest.fn();
    const element = <QuickReplies replies={[...REPLIES]} onSelect={onSelect} />;
    const { rerender } = renderWithTheme(element);

    const before = screen.getByLabelText('Quick reply: Yes');

    // Re-render the SAME element (identical props). Stable `key={reply}` chips
    // reconcile in place — the resolved node is the same instance, not a remount.
    rerender(
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        {element}
      </ThemeContext.Provider>,
    );

    const after = screen.getByLabelText('Quick reply: Yes');
    expect(after).toBe(before);

    // And the chip still behaves: one press → one onSelect with the right label,
    // confirming the post-rerender closure is wired (no double-fire from a
    // duplicated subtree).
    fireEvent.press(after);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Yes');
  });
});
