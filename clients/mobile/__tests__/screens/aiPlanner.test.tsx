/**
 * aiPlanner.test.tsx
 *
 * Screen-level coverage for the AI Workout Planner's failure UX —
 * `app/(exercises)/ai-planner.tsx`.
 *
 * The planner generates a routine via `generateRoutineWithAI` (@/api/exercises).
 * On failure its mutation onError forks on the shared daily-limit contract:
 *
 *   - a 429 `{ error:'ai_quota_exceeded', limit, plan, resetsAt }` flips into a
 *     DISTINCT "Daily AI limit reached" upgrade state whose <CtaButton
 *     label="Upgrade" /> routes to '/(modals)/premium' — and ONLY that route;
 *   - ANY other failure (a 500, a network error) keeps the EXISTING retryable
 *     inline "Generation Failed" error with its Try Again control.
 *
 * Additive + verify-only: NEW test file only; the screen path under test is
 * driven through its real react-query useMutation (a real QueryClientProvider)
 * so the production onError runs. `generateRoutineWithAI` is mocked so the
 * mutationFn rejects with the exact error bodies; expo-router push is a hoisted
 * holder so the Upgrade destination + arity are pinned. Mock conventions mirror
 * the sibling ai-coach.quota.test.tsx.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// ── Hoisted mock holders ─────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The single generate call the screen makes. A mutable spy so each test sets
// its own resolved/rejected value (success body or one of the error shapes).
const mockGenerate = jest.fn();
jest.mock('@/api/exercises', () => ({
  generateRoutineWithAI: (...args: any[]) => mockGenerate(...args),
}));

// Decorative glyphs → plain text so labels are assertable / icons inert.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// react-query: real QueryClientProvider so useMutation's real onError runs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import the screen AFTER the mocks are registered.
import AIWorkoutPlannerScreen from '../../app/(exercises)/ai-planner';

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <AIWorkoutPlannerScreen />
      </ThemeContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AI planner — generation failure UX', () => {
  it('on a 429 ai_quota_exceeded shows the daily-limit upgrade state and routes to /(modals)/premium', async () => {
    mockGenerate.mockRejectedValue({
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' },
      },
    });

    renderScreen();

    fireEvent.press(screen.getByText('GENERATE MY PLAN'));

    // Distinct quota state — NOT the generic "Generation Failed".
    await waitFor(() => expect(screen.getByText('Daily AI limit reached')).toBeTruthy());
    expect(screen.getByText('Upgrade')).toBeTruthy();
    // The free cap is surfaced in the explanatory copy.
    expect(screen.getByText(/used all 5 of your free daily AI plans/i)).toBeTruthy();
    // The generic retryable error must NOT be present in the quota branch.
    expect(screen.queryByText('Generation Failed')).toBeNull();

    // Pressing Upgrade routes to the premium modal — only that, exactly once.
    fireEvent.press(screen.getByText('Upgrade'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(modals)/premium'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls.every(([r]) => r === '/(modals)/premium')).toBe(true);
  });

  it('surfaces the pro cap + resolved tier when the 429 body says plan=pro', async () => {
    mockGenerate.mockRejectedValue({
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', limit: 20, plan: 'pro', resetsAt: '2099-01-02T00:00:00.000Z' },
      },
    });

    renderScreen();
    fireEvent.press(screen.getByText('GENERATE MY PLAN'));

    await waitFor(() => expect(screen.getByText(/used all 20 of your Pro daily AI plans/i)).toBeTruthy());
    expect(screen.getByText('Upgrade')).toBeTruthy();
  });

  it('on a 500 shows the existing retryable "Generation Failed" error, not the upgrade state', async () => {
    mockGenerate.mockRejectedValue({ response: { status: 500, data: { message: 'Ria is taking a breather.' } } });

    renderScreen();
    fireEvent.press(screen.getByText('GENERATE MY PLAN'));

    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.getByText('Try Again')).toBeTruthy();
    expect(screen.getByText('Ria is taking a breather.')).toBeTruthy();
    // NOT the quota upgrade state.
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  it('on a network error (no response) shows the retryable error, not the upgrade state', async () => {
    mockGenerate.mockRejectedValue({ message: 'Network Error' });

    renderScreen();
    fireEvent.press(screen.getByText('GENERATE MY PLAN'));

    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.getByText('Network Error')).toBeTruthy();
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
  });
});
