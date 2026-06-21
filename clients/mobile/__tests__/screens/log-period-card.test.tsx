/**
 * log-period-card.test.tsx
 *
 * Coverage for the "Log Period" action (F28) —
 * src/components/cycle/LogPeriodCard.tsx. The card lets the user pick a start
 * date (today or a past day) and POSTs to /v1/users/me/cycle/period, then
 * INVALIDATES the forecast / history / status queries so the calendar + phase
 * card refresh.
 *
 * Pins:
 *   1. Tapping "Log Period" calls the logPeriod API wrapper with the chosen
 *      startDate (defaults to today via nowDateString).
 *   2. On success the mutation's onSuccess invalidates ['cycle-forecast'],
 *      ['cycle-history'] and ['my-status'] — the three keys the cycle screen +
 *      the live phase card derive from.
 *
 * Mock conventions mirror body-metrics: react-query useMutation is stubbed to
 * capture the screen's config and synchronously fire onSuccess so we can assert
 * the invalidations; @/api/cycle is a jest.fn map; DateTimeField is stubbed to a
 * passthrough that exposes its value (the picker is exercised by its own
 * DateTimeField suite).
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

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// DateTimeField: passthrough that renders the current value (exercised fully by
// its own suite). The card defaults the start to nowDateString, so we don't need
// to drive the picker here.
jest.mock('@/components/ui/DateTimeField', () => {
  const { Text: RNText } = require('react-native');
  return {
    DateTimeField: ({ value, accessibilityLabel }: any) => (
      <RNText accessibilityLabel={accessibilityLabel}>{value || ''}</RNText>
    ),
    nowDateString: () => '2026-06-20',
    nowTimeString: () => '12:00',
  };
});

// The API wrapper — captured spy. logPeriod resolves with a benign stats object.
const mockLogPeriod = jest.fn().mockResolvedValue({
  avgCycleLengthDays: 28,
  avgPeriodLengthDays: 5,
  cycleLengthStdDev: 1.2,
  cycleRegularity: 'REGULAR',
  lastPeriodStartDate: '2026-06-20',
  loggedCycleCount: 3,
});
jest.mock('@/api/cycle', () => ({ logPeriod: (...a: any[]) => mockLogPeriod(...a) }));

// react-query: useMutation captures the config and returns a `mutate` that calls
// mutationFn then synchronously invokes onSuccess with its result (so the
// invalidations run). useQueryClient returns a spyable invalidateQueries.
const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: any) => ({
    mutate: async (vars: any) => {
      const res = await config.mutationFn(vars);
      config.onSuccess?.(res, vars, undefined);
    },
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import { LogPeriodCard } from '../../src/components/cycle/LogPeriodCard';

function renderCard(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  mockLogPeriod.mockClear();
  mockInvalidate.mockClear();
});

describe('LogPeriodCard (F28) — log + invalidate', () => {
  test('tapping Log Period POSTs with the default (today) start date', async () => {
    renderCard(<LogPeriodCard />);

    fireEvent.press(screen.getByTestId('log-period-submit'));

    await waitFor(() => expect(mockLogPeriod).toHaveBeenCalledTimes(1));
    expect(mockLogPeriod).toHaveBeenCalledWith({ startDate: '2026-06-20' });
  });

  test('on success it invalidates forecast, history and status queries', async () => {
    const onLogged = jest.fn();
    renderCard(<LogPeriodCard onLogged={onLogged} />);

    fireEvent.press(screen.getByTestId('log-period-submit'));

    await waitFor(() => expect(mockInvalidate).toHaveBeenCalled());

    const invalidatedKeys = mockInvalidate.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toEqual(expect.arrayContaining(['cycle-forecast', 'cycle-history', 'my-status']));
    expect(onLogged).toHaveBeenCalledTimes(1);
  });
});
