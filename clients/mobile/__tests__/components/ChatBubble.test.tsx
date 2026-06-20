/**
 * Render + interaction tests for the unified chat screen's <ChatBubble /> row.
 *
 * ChatBubble is a PURE presentational transcript row (no data fetching, no live
 * DB, all plain props) that owns BOTH the own-message and peer-message bubble.
 * It is load-bearing for the F1 chat surface, so this suite locks its two
 * contracts so a future refactor can't silently regress them:
 *
 *   1. The own-bubble TRAILING STATUS TICK, driven entirely by the `status`
 *      prop (the bubble stores no state — it derives the glyph from ground
 *      truth). Each state maps to an EXACT Ionicons glyph + screen-reader label:
 *        sending → 'time-outline'   / "Sending"
 *        sent    → 'checkmark'      / "Sent"
 *        read    → 'checkmark-done' / "Read"   (coral-tinted double check)
 *        failed  → 'alert-circle'   / "Failed" (the label this work-item adds)
 *      Peer bubbles (isOwn=false) NEVER carry a status tick.
 *
 *   2. The FAILED-own affordance: a failed own bubble (with id + onRetry) wraps
 *      its body in a role=button "Message failed to send. Tap to retry." and
 *      pressing it calls onRetry exactly once with this row's id. A non-failed
 *      own bubble exposes no retry button.
 *
 * Mocks (matching the sibling component suite — AnchorSleepCard /
 * CaffeineTimerTile / a11y-controls):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>` so
 *    the glyph is assertable as text and no native font loader runs. The stub
 *    ALSO forwards `accessibilityLabel` onto that <Text> (a strict superset of
 *    the `({ name }) => icon:<name>` sibling stub) so the per-status tick label
 *    — the exact contract this suite exists to lock — is queryable by label.
 *  - Theme comes from the real `ThemeContext.Provider` (no theme mock).
 *  - The own bubble's coral fill (expo-linear-gradient <LinearGradient>) mounts
 *    under jest-expo with no extra mock, exactly as EntrainmentCard's Aurora
 *    glass fill does.
 *
 * Posture (matching AnchorSleepCard.test.tsx): every test fails loudly if React
 * logs a console.error / console.warn during render (a leaked falsy child, an
 * unkeyed list, an act() warning, a bad prop type) — which is also assertion
 * group (d): the spies are never called.
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

// Decorative glyphs → plain text so the icon name is assertable, and forward the
// accessibilityLabel onto that text so the per-status tick label is queryable by
// label. (The sibling suites only forward `name`; this suite asserts the label,
// so it forwards both.) No native font loader runs either way.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name, accessibilityLabel }: { name?: string; accessibilityLabel?: string }) => (
      <RNText accessibilityLabel={accessibilityLabel}>{`icon:${name ?? ''}`}</RNText>
    ),
  };
});

// Import AFTER the mock is registered.
import { ChatBubble } from '@/components/chat/ChatBubble';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

// The four own-bubble tick labels — kept in one place so a "no tick" assertion
// can prove the combined ABSENCE of every status label at once.
const TICK_LABELS = ['Sending', 'Sent', 'Read', 'Failed'] as const;

describe('ChatBubble', () => {
  // Fail loudly on ANY console.error/warn during a render across every test here
  // (this IS assertion group (d): the spies are never called).
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

  // ── (a) own-bubble status tick: each status → exact glyph + a11y label ─────────
  describe('own bubble status tick', () => {
    test("status='read' renders the 'checkmark-done' glyph carrying accessibilityLabel 'Read'", () => {
      renderWithTheme(<ChatBubble text="hi" isOwn timestamp="9:41 AM" status="read" />);
      // The double-check glyph…
      expect(screen.getByText('icon:checkmark-done')).toBeTruthy();
      // …is the SAME node that carries the 'Read' screen-reader label.
      expect(screen.getByLabelText('Read')).toBe(screen.getByText('icon:checkmark-done'));
      // And it is not the single 'checkmark'/sent glyph.
      expect(screen.queryByText('icon:checkmark')).toBeNull();
    });

    test("status='sent' renders the 'checkmark' glyph carrying accessibilityLabel 'Sent'", () => {
      renderWithTheme(<ChatBubble text="hi" isOwn timestamp="9:41 AM" status="sent" />);
      expect(screen.getByText('icon:checkmark')).toBeTruthy();
      expect(screen.getByLabelText('Sent')).toBe(screen.getByText('icon:checkmark'));
      // Sent is the single check, never the double-check.
      expect(screen.queryByText('icon:checkmark-done')).toBeNull();
    });

    test("status='sending' renders the 'time-outline' glyph carrying accessibilityLabel 'Sending'", () => {
      renderWithTheme(<ChatBubble text="hi" isOwn timestamp="9:41 AM" status="sending" />);
      expect(screen.getByText('icon:time-outline')).toBeTruthy();
      expect(screen.getByLabelText('Sending')).toBe(screen.getByText('icon:time-outline'));
    });

    test("status='failed' renders the 'alert-circle' glyph carrying accessibilityLabel 'Failed'", () => {
      // This is the gap this work-item closes: the failed tick previously had NO
      // accessibilityLabel while its sending/sent/read siblings did.
      renderWithTheme(<ChatBubble text="hi" isOwn timestamp="9:41 AM" status="failed" />);
      expect(screen.getByText('icon:alert-circle')).toBeTruthy();
      expect(screen.getByLabelText('Failed')).toBe(screen.getByText('icon:alert-circle'));
    });
  });

  // ── (b) peer bubble: senderName when present, and NO status tick ───────────────
  describe('peer bubble (isOwn=false)', () => {
    test('renders the senderName when present', () => {
      renderWithTheme(
        <ChatBubble text="yo" isOwn={false} timestamp="9:40 AM" senderName="Ria" />,
      );
      expect(screen.getByText('Ria')).toBeTruthy();
      expect(screen.getByText('yo')).toBeTruthy();
    });

    test('omits the sender name row when senderName is absent', () => {
      renderWithTheme(<ChatBubble text="yo" isOwn={false} timestamp="9:40 AM" />);
      expect(screen.getByText('yo')).toBeTruthy();
      expect(screen.queryByText('Ria')).toBeNull();
    });

    test('exposes NO status tick even if a status prop leaks in (peers ignore status)', () => {
      // Peer bubbles never read `status`; pass one anyway to prove no tick (glyph
      // OR label) ever renders on a peer row.
      renderWithTheme(
        <ChatBubble text="yo" isOwn={false} timestamp="9:40 AM" senderName="Ria" status="read" />,
      );
      for (const label of TICK_LABELS) {
        expect(screen.queryByLabelText(label)).toBeNull();
      }
      expect(screen.queryByText('icon:checkmark-done')).toBeNull();
      expect(screen.queryByText('icon:checkmark')).toBeNull();
      expect(screen.queryByText('icon:time-outline')).toBeNull();
      expect(screen.queryByText('icon:alert-circle')).toBeNull();
    });
  });

  // ── (c) failed-own retry affordance ────────────────────────────────────────────
  describe('failed own bubble retry affordance', () => {
    test("exposes role=button 'Message failed to send. Tap to retry.' and fires onRetry once with the exact id", () => {
      const onRetry = jest.fn();
      renderWithTheme(
        <ChatBubble
          text="oops"
          isOwn
          timestamp="9:41 AM"
          status="failed"
          id="msg-42"
          onRetry={onRetry}
        />,
      );

      const retry = screen.getByRole('button', {
        name: 'Message failed to send. Tap to retry.',
      });
      expect(retry).toBeTruthy();

      fireEvent.press(retry);
      // Exactly once, with THIS row's id (the list forwards id so it keeps ONE
      // hoisted callback).
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith('msg-42');
    });

    test('a non-failed own bubble renders no retry button', () => {
      const onRetry = jest.fn();
      renderWithTheme(
        <ChatBubble
          text="hi"
          isOwn
          timestamp="9:41 AM"
          status="sent"
          id="msg-7"
          onRetry={onRetry}
        />,
      );
      expect(
        screen.queryByRole('button', { name: 'Message failed to send. Tap to retry.' }),
      ).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(onRetry).not.toHaveBeenCalled();
    });
  });
});
