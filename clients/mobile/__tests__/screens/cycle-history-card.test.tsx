/**
 * cycle-history-card.test.tsx
 *
 * Coverage for the cycle HISTORY view (F28) —
 * src/components/cycle/CycleHistoryCard.tsx. Driven by GET /v1/users/me/cycle/
 * history { cycles[], averages{} }.
 *
 * Pins:
 *   1. With averages, it renders the avg cycle + avg period length and a
 *      VARIABILITY RANGE ("28-34 days") derived from the observed cycle lengths,
 *      plus a regularity chip and the per-cycle rows.
 *   2. With too little data (null averages / UNKNOWN regularity) it shows the
 *      honest "log a couple of cycles" hint instead of a fabricated average.
 *
 * @/components/ui + @/theme are left REAL; only blur / icons are stubbed.
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
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import { CycleHistoryCard } from '../../src/components/cycle/CycleHistoryCard';
import type { CycleHistoryResponse } from '@/api/cycle';

function renderCard(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

// Three cycles: lengths 28 and 34 (most-recent has null cycleLengthDays) → range
// "28-34 days". Bleed lengths present.
const HISTORY: CycleHistoryResponse = {
  cycles: [
    { startDate: '2026-06-01', endDate: '2026-06-05', cycleLengthDays: null, periodLengthDays: 5 },
    { startDate: '2026-05-04', endDate: '2026-05-08', cycleLengthDays: 28, periodLengthDays: 5 },
    { startDate: '2026-04-01', endDate: '2026-04-06', cycleLengthDays: 34, periodLengthDays: 6 },
  ],
  averages: {
    avgCycleLengthDays: 31,
    avgPeriodLengthDays: 5,
    cycleLengthStdDev: 3.2,
    cycleRegularity: 'REGULAR',
    loggedCycleCount: 3,
  },
};

describe('CycleHistoryCard (F28) — averages, variability range, rows', () => {
  test('renders averages, the variability range, regularity chip and rows', () => {
    renderCard(<CycleHistoryCard history={HISTORY} />);

    // Averages.
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText(/avg cycle/i)).toBeTruthy();
    expect(screen.getByText(/avg period/i)).toBeTruthy();

    // Variability range computed from the observed 28 + 34 lengths.
    expect(screen.getByText(/Range 28-34 days/i)).toBeTruthy();

    // Regularity chip.
    expect(screen.getByText('Regular')).toBeTruthy();

    // Per-cycle rows (start dates present, rendered as soft human "Mon 4 May"
    // labels rather than a raw-ISO CSV column).
    expect(screen.getByText('Mon 4 May')).toBeTruthy();
    expect(screen.getByText('Wed 1 Apr')).toBeTruthy();
  });

  test('with no averages it shows the honest "log a couple of cycles" hint', () => {
    const empty: CycleHistoryResponse = {
      cycles: [],
      averages: {
        avgCycleLengthDays: null,
        avgPeriodLengthDays: null,
        cycleLengthStdDev: null,
        cycleRegularity: 'UNKNOWN',
        loggedCycleCount: 0,
      },
    };
    renderCard(<CycleHistoryCard history={empty} />);

    expect(screen.getByText(/log a couple of cycles/i)).toBeTruthy();
    expect(screen.getByText('Not enough data')).toBeTruthy();
    // No fabricated average number / range.
    expect(screen.queryByText(/avg cycle/i)).toBeNull();
    expect(screen.queryByText(/Range/i)).toBeNull();
  });
});
