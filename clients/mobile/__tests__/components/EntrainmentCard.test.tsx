/**
 * Render tests for the dashboard's <EntrainmentCard /> circadian-entrainment
 * insight card — the FIRST consumer of the F3 helper src/lib/circadian/entrainment.ts.
 *
 * EntrainmentCard is a pure presentational card driven by:
 *   - `score`  : number | null  (the entrainment alignment score)
 *   - `shift?` : { startTime, endTime }  (optional — drives a window hint)
 *
 * It renders the advice copy returned by `entrainmentAdvice(score)`:
 *   1. score >= 80          → ENTRAINMENT_ADVICE.good   ("Good alignment…")
 *   2. finite score < 80    → ENTRAINMENT_ADVICE.improve ("Room for improvement…")
 *   3. score === null       → ENTRAINMENT_ADVICE.none   ("Log more shifts…")
 *
 * These assertions import the REAL `ENTRAINMENT_ADVICE` / `GOOD_ALIGNMENT_THRESHOLD`
 * constants and the REAL `entrainmentAdvice` mapping from the helper, so the
 * suite goes RED the moment that advice mapping regresses (copy drift, a flipped
 * threshold, or a broken null branch) — exactly the dormant-helper guard this
 * card was built to provide.
 *
 * Mocks (matching CaffeineTimerTile.test.tsx / LightPlanCard.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> ("icon:<name>") so glyphs
 *    mount without native code.
 *  - Theme comes from the real `ThemeContext.Provider`.
 *  - The Aurora glass fill (GlassCard → SafeBlurView → expo-blur) mounts under
 *    jest-expo with no extra mock, same as the two suites above.
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

// Import AFTER the mocks. We pull in the REAL advice constants + mapping so the
// rendered copy is asserted against the source of truth, not a hand-copied
// string — if entrainment.ts's mapping changes, these tests fail loudly.
import { EntrainmentCard } from '@/components/dashboard/EntrainmentCard';
import {
  ENTRAINMENT_ADVICE,
  GOOD_ALIGNMENT_THRESHOLD,
  entrainmentAdvice,
} from '@/lib/circadian/entrainment';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('EntrainmentCard', () => {
  describe('advice copy by score', () => {
    test('score >= 80 shows the good-alignment copy', () => {
      renderWithTheme(<EntrainmentCard score={92} />);

      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
      // The other two advice strings must NOT be present.
      expect(screen.queryByText(ENTRAINMENT_ADVICE.improve)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.none)).toBeNull();
    });

    test('exactly at the threshold (80) still counts as good alignment', () => {
      renderWithTheme(<EntrainmentCard score={GOOD_ALIGNMENT_THRESHOLD} />);
      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
    });

    test('a finite score below 80 shows the improvement copy', () => {
      renderWithTheme(<EntrainmentCard score={42} />);

      expect(screen.getByText(ENTRAINMENT_ADVICE.improve)).toBeTruthy();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.good)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.none)).toBeNull();
    });

    test('score === null shows the "log more shifts" copy and never throws', () => {
      // Default-safe path: rendering with score=null must not throw.
      expect(() => renderWithTheme(<EntrainmentCard score={null} />)).not.toThrow();

      expect(screen.getByText(ENTRAINMENT_ADVICE.none)).toBeTruthy();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.good)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.improve)).toBeNull();
    });

    test('rendered copy matches entrainmentAdvice() across the score range', () => {
      // Card ↔ helper parity: for each representative score the rendered string
      // is exactly what entrainmentAdvice() returns. Regressing the mapping in
      // either place breaks this.
      for (const score of [null, 0, 50, 79, 80, 100]) {
        const { unmount } = renderWithTheme(<EntrainmentCard score={score} />);
        expect(screen.getByText(entrainmentAdvice(score))).toBeTruthy();
        unmount();
      }
    });
  });

  describe('optional shift window hint', () => {
    test('a valid shift adds the derived wind-down window line', () => {
      // melatoninStart = endTime + 1h → formatted local time. We don't pin the
      // exact clock string (timezone-portable), only that the hint label renders.
      renderWithTheme(
        <EntrainmentCard
          score={88}
          shift={{ startTime: '2026-01-02T22:00:00.000Z', endTime: '2026-01-03T06:00:00.000Z' }}
        />,
      );
      expect(screen.getByText(/Wind-down window opens around/)).toBeTruthy();
    });

    test('a malformed shift never throws — the hint line is simply omitted', () => {
      // deriveWindowsFromShift throws on unparseable input; the card swallows it.
      expect(() =>
        renderWithTheme(
          <EntrainmentCard score={88} shift={{ startTime: 'not-a-date', endTime: '' }} />,
        ),
      ).not.toThrow();
      // Advice still renders; the window hint does not.
      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
      expect(screen.queryByText(/Wind-down window opens around/)).toBeNull();
    });

    test('with no shift prop the card renders advice only (no hint line)', () => {
      renderWithTheme(<EntrainmentCard score={50} />);
      expect(screen.getByText(ENTRAINMENT_ADVICE.improve)).toBeTruthy();
      expect(screen.queryByText(/Wind-down window opens around/)).toBeNull();
    });
  });
});
