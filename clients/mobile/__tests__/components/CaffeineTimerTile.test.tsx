/**
 * Render tests for the dashboard's <CaffeineTimerTile /> mini-card.
 *
 * CaffeineTimerTile is a pure presentational tile driven by ONE prop:
 *   `shift?: ShiftLike | null`.
 *
 * It computes the caffeine cutoff (= shift.endTime - 6h) and the sleep window
 * start (= shift.endTime + 1h) via the shared, unit-tested
 * `computeShiftTransition` and renders one of three EXACT display strings:
 *
 *   1. shift && now <  caffeineCutoff → "Caffeine OK for Xh Ym"
 *   2. shift && now >= caffeineCutoff → "No more caffeine (sleep window starts at HH:MM)"
 *   3. !shift                         → empty state w/ subtitle
 *                                       "Log a shift to track your caffeine window"
 *
 * Time travel is done with `jest.useFakeTimers({ doNotFake: ['nextTick'] })`
 * + `jest.setSystemTime(...)`. The wall-clock anchors are absolute UTC
 * instants, so the assertions are timezone-portable.
 *
 * Mocks:
 *  - `@expo/vector-icons` Ionicons → text glyph (matches the rest of the suite)
 *  - Theme comes from the real `ThemeContext.Provider`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { CaffeineTimerTile } from '@/components/home/CaffeineTimerTile';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('CaffeineTimerTile', () => {
  // Anchors (UTC) — caffeineCutoff = end - 6h, sleepStart = end + 1h.
  const END = new Date('2026-06-14T06:00:00.000Z');
  const CAFFEINE_CUTOFF = new Date(END.getTime() - 6 * 3_600_000); // 00:00 UTC
  const SLEEP_START = new Date(END.getTime() + 1 * 3_600_000);     // 07:00 UTC
  const SHIFT = {
    startTime: '2026-06-13T22:00:00.000Z',
    endTime: END.toISOString(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('pre-cutoff: now < caffeineCutoff renders "Caffeine OK for Xh Ym"', () => {
    // 90 min before the caffeine cutoff → "1h 30m"
    const now = new Date(CAFFEINE_CUTOFF.getTime() - 90 * 60_000);
    jest.setSystemTime(now);

    renderWithTheme(<CaffeineTimerTile shift={SHIFT} />);

    expect(screen.getByText('Caffeine OK for 1h 30m')).toBeTruthy();
    // Sanity: the post-cutoff copy must NOT be present.
    expect(screen.queryByText(/No more caffeine/)).toBeNull();
    // And the no-shift empty subtitle must NOT be present.
    expect(screen.queryByText('Log a shift to track your caffeine window')).toBeNull();
  });

  test('post-cutoff: now >= caffeineCutoff renders the sleep-anchored copy', () => {
    // 1 min after the caffeine cutoff (boundary inclusive of "now >= cutoff").
    const now = new Date(CAFFEINE_CUTOFF.getTime() + 60_000);
    jest.setSystemTime(now);

    // Match how CaffeineTimerTile formats sleepStart so the assertion is
    // timezone-portable (matches whatever Intl returns for this instant).
    const sleepStartFmt = SLEEP_START.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    renderWithTheme(<CaffeineTimerTile shift={SHIFT} />);

    expect(
      screen.getByText(`No more caffeine (sleep window starts at ${sleepStartFmt})`),
    ).toBeTruthy();
    expect(screen.queryByText(/Caffeine OK for/)).toBeNull();
  });

  test('no shift: renders the empty-state subtitle', () => {
    renderWithTheme(<CaffeineTimerTile shift={null} />);
    expect(screen.getByText('Log a shift to track your caffeine window')).toBeTruthy();
    // The two populated-state strings must NOT be present.
    expect(screen.queryByText(/Caffeine OK for/)).toBeNull();
    expect(screen.queryByText(/No more caffeine/)).toBeNull();
  });
});
