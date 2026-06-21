/**
 * cycle-calendar.test.tsx
 *
 * Component coverage for the menstrual-cycle month CALENDAR (F28) —
 * src/components/cycle/CycleCalendar.tsx. The calendar is driven by the F28
 * forecast `days[]` (each day carries phase / confidence / isLogged /
 * isPredictedFertile / isPredictedOvulation) from GET /v1/users/me/cycle/forecast.
 *
 * Pins the research must-haves:
 *   1. Renders phase-coded days + the month header for the current month.
 *   2. LOGGED vs PREDICTED is visually distinguished — a logged day's disc is a
 *      SOLID fill (no dotted border) while a predicted-fertile/ovulation day is a
 *      FADED fill with a DOTTED border. We assert on the rendered style of the
 *      day cells (grabbed by their testID) so a regression that flattens the
 *      distinction fails.
 *   3. A LOW-confidence forecast shows the "Low confidence — log more cycles"
 *      note; a HIGH-confidence one does not.
 *
 * Mock conventions mirror cycle-phase-card / body-metrics: @/components/ui +
 * @/theme are left REAL (assertions ride on the real GlassCard); only the
 * native-only leaves (blur / icons) are stubbed.
 *
 * Additive: NEW test file only.
 */

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import { CycleCalendar } from '../../src/components/cycle/CycleCalendar';
import type { ForecastDay, Confidence } from '@/api/cycle';

function renderWithTheme(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

// Build a tiny forecast inside the CURRENT month so the default-month view shows
// the seeded days without any nav. We pick 3 distinct days:
//   - day 5  = LOGGED menstrual (solid)
//   - day 14 = predicted OVULATION (dotted)
//   - day 20 = plain luteal phase (faint wash)
const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth();
function iso(d: number): string {
  return `${Y}-${String(M + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const LOGGED_DAY = 5;
const OVULATION_DAY = 14;
const PHASE_DAY = 20;

function makeDays(): ForecastDay[] {
  return [
    { date: iso(LOGGED_DAY), phase: 'MENSTRUAL', confidence: 'HIGH', isPredictedFertile: false, isPredictedOvulation: false, isLogged: true },
    { date: iso(OVULATION_DAY), phase: 'OVULATORY', confidence: 'HIGH', isPredictedFertile: true, isPredictedOvulation: true, isLogged: false },
    { date: iso(PHASE_DAY), phase: 'LUTEAL', confidence: 'HIGH', isPredictedFertile: false, isPredictedOvulation: false, isLogged: false },
  ];
}

/** Flatten a testID'd cell's style and return the merged object. */
function cellStyle(testID: string): any {
  const node = screen.getByTestId(testID);
  return StyleSheet.flatten(node.props.style);
}

describe('CycleCalendar (F28) — month grid, logged-vs-predicted, confidence', () => {
  test('renders phase days + the current month header', () => {
    renderWithTheme(<CycleCalendar days={makeDays()} confidence="HIGH" />);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    expect(screen.getByText(new RegExp(`${MONTHS[M]} ${Y}`))).toBeTruthy();

    // Each seeded day cell is present.
    expect(screen.getByTestId(`cell-${iso(LOGGED_DAY)}`)).toBeTruthy();
    expect(screen.getByTestId(`cell-${iso(OVULATION_DAY)}`)).toBeTruthy();
    expect(screen.getByTestId(`cell-${iso(PHASE_DAY)}`)).toBeTruthy();
  });

  test('LOGGED day is SOLID; PREDICTED day is DOTTED-bordered (visually distinct)', () => {
    renderWithTheme(<CycleCalendar days={makeDays()} confidence="HIGH" />);

    const logged = cellStyle(`cell-${iso(LOGGED_DAY)}`);
    const predicted = cellStyle(`cell-${iso(OVULATION_DAY)}`);

    // Logged: solid filled disc, NO dotted border.
    expect(logged.backgroundColor).toBeTruthy();
    expect(logged.borderStyle).not.toBe('dotted');
    expect(logged.borderWidth ?? 0).toBe(0);

    // Predicted ovulation: dotted border + a non-zero border width — never a
    // solid block — so a prediction is never presented as fact.
    expect(predicted.borderStyle).toBe('dotted');
    expect(predicted.borderWidth).toBeGreaterThan(0);

    // The two must not render identically.
    expect(logged.backgroundColor).not.toBe(predicted.backgroundColor);

    // a11y label distinguishes the two states.
    expect(screen.getByLabelText(/logged period/i)).toBeTruthy();
    expect(screen.getByLabelText(/predicted ovulation/i)).toBeTruthy();
  });

  test('LOW confidence shows the "log more cycles" note; HIGH does not', () => {
    const { rerender } = renderWithTheme(<CycleCalendar days={makeDays()} confidence={'LOW' as Confidence} />);
    expect(screen.getByText(/low confidence/i)).toBeTruthy();

    rerender(
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <CycleCalendar days={makeDays()} confidence="HIGH" />
      </ThemeContext.Provider>,
    );
    expect(screen.queryByText(/low confidence/i)).toBeNull();
  });

  test('trackingOnly (confidence NONE) hides prediction overlays', () => {
    const days = makeDays();
    renderWithTheme(<CycleCalendar days={days} confidence={'NONE' as Confidence} trackingOnly />);

    // The ovulation overlay must NOT render its dotted prediction border when we
    // can only track, not predict.
    const predicted = cellStyle(`cell-${iso(OVULATION_DAY)}`);
    expect(predicted.borderStyle).not.toBe('dotted');
    // The low-confidence note is shown for NONE too.
    expect(screen.getByText(/low confidence/i)).toBeTruthy();
  });
});
