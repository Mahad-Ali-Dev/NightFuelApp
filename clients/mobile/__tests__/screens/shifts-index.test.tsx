/**
 * shifts-index.test.tsx
 *
 * Daily-AI-limit UPGRADE-state coverage for the Circadian Planner / shift screen
 * (`app/(shifts)/index.tsx`).
 *
 * The screen's "Generate AI Nutrition Plan" hero drives the METERED plan-service
 * path — `POST /v1/plans/generate` (via `@/api/plans` generatePlan) — which counts
 * toward the per-plan generations quota and returns the SHARED
 * `429 { error:'ai_quota_exceeded', limit, plan, resetsAt }` contract. The screen
 * runs the caught error through the shared `parseAiQuotaError` (from `@/api/ai`)
 * and flips into ONE of two mutually-exclusive ground-truth states, REPLACING the
 * old destructive `Alert.alert('Error', …)` / `Alert.alert('Success', …)`:
 *
 *   - a 429 daily-limit → the distinct "Daily AI limit reached" upgrade GlassCard
 *     whose <CtaButton label="Upgrade" /> routes to '/(modals)/premium';
 *   - any other failure (network / 5xx / non-quota 4xx) → a retryable GlassCard
 *     "Generation Failed" notice with a "Try Again" control (NOT the upgrade CTA).
 *
 * This suite pins:
 *   (a) 429 ai_quota_exceeded → upgrade card + Upgrade CTA → press pushes
 *       '/(modals)/premium' exactly once and ONLY that route; NO 'Generation
 *       Failed' text; Alert.alert is NEVER called;
 *   (b) a generic 500 → the retryable "Generation Failed" notice whose "Try Again"
 *       re-invokes generatePlan; NO upgrade card; Alert.alert NEVER called;
 *   (c) success → navigates to '/(tabs)/nutrition' (and ONLY that), with neither
 *       failure card present and NO Alert (the prior success Alert was dropped);
 *   (d) quota and genError never both render (a 429 then a 500 swaps the card).
 *
 * Additive + verify-only: NEW test file only; the screen is exercised through its
 * real react-query useMutation lifecycle (a real QueryClientProvider, retry:false)
 * so the production onMutate/onSuccess/onError run.
 *
 * Mock conventions mirror planner.quota.test.tsx / aiPlanner.test.tsx:
 *   - expo-router exposes a hoisted `mockPush` so the deep-link is asserted by
 *     route + arity.
 *   - `@/api/plans` is fully stubbed: `generatePlan` is a mutable `mockGenerate`
 *     spy each test resolves or rejects (the screen imports nothing else from it).
 *   - `@/api/ai` delegates to the REAL implementation (jest.requireActual) so the
 *     genuine `parseAiQuotaError` does the 429-vs-generic discrimination; its leaf
 *     deps (`@/api/client`, `@/lib/sentry`) are mocked so no axios/env or native
 *     Sentry subtree loads.
 *   - `@/api/shifts` getCurrent resolves a fixed active night shift so the
 *     `currentShift` branch (and its generate hero) renders.
 *   - `@/api/training` getScheduledSessionsForShift resolves [] (the honest
 *     zero-data state — NOT an error).
 *   - Decorative glyphs, safe-area insets, the linear gradient and the status bar
 *     are stubbed the same way as the sibling screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The metered plan-service generate call — a mutable spy each test wires. It is
// the ONLY thing the screen imports from `@/api/plans`.
const mockGenerate = jest.fn();
jest.mock('@/api/plans', () => ({
  generatePlan: (...args: any[]) => mockGenerate(...args),
}));

// `@/api/ai` → the REAL module (so parseAiQuotaError is genuine), with its leaf
// deps mocked below so the axios client / native sentry never load.
jest.mock('@/api/ai', () => jest.requireActual('@/api/ai'));
jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getAccessToken: jest.fn(() => Promise.resolve(null)),
  resolveApiUrl: (p: string) => `http://test${p}`,
}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

// A fixed active night shift so the current-shift query settles and the
// `currentShift` render branch (with the generate hero) mounts.
const ACTIVE_SHIFT = {
  id: 's1',
  userId: 'u1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
  timezone: 'UTC',
  createdAt: '2026-06-13T00:00:00.000Z',
  updatedAt: '2026-06-13T00:00:00.000Z',
};
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn(() => Promise.resolve(ACTIVE_SHIFT)) }));

// The linked-sessions query — the honest zero-data state (200 []), NOT an error,
// so the "Training around this shift" section renders its empty state and never
// steals an assertion.
jest.mock('@/api/training', () => ({ getScheduledSessionsForShift: jest.fn(() => Promise.resolve([])) }));

// Decorative glyphs → plain <Text> surfacing the icon name.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient (used by the hero overlay + CtaButton) ships a native
// module; passthrough so the gradient fill mounts.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import ShiftCalendarScreen from '../../app/(shifts)/index';

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <ShiftCalendarScreen />
      </ThemeContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

// The generate hero ("Generate AI Nutrition Plan") is the entry point. It only
// renders once the active-shift query resolves; wait for it, then press it to
// kick off a generation.
async function pressGenerate() {
  await waitFor(() => expect(screen.getByText('Generate AI Nutrition Plan')).toBeTruthy());
  fireEvent.press(screen.getByText('Generate AI Nutrition Plan'));
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('ShiftCalendarScreen — daily-AI-limit upgrade state', () => {
  // ── (a) 429 ai_quota_exceeded → upgrade card + route to premium, NO Alert ──
  it('on a 429 ai_quota_exceeded shows the Upgrade CtaButton, routes to /(modals)/premium (only that route), and never calls Alert.alert', async () => {
    mockGenerate.mockRejectedValue({
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' },
      },
    });

    renderScreen();
    await pressGenerate();

    // The distinct upgrade card appears (NOT the generic error / Alert).
    await waitFor(() => expect(screen.getByText('Daily AI limit reached')).toBeTruthy());
    // The free cap is surfaced in the explanatory copy.
    expect(screen.getByText(/used all 5 of your free daily AI plans/i)).toBeTruthy();
    // The retryable error card must NOT be present in the quota branch.
    expect(screen.queryByText('Generation Failed')).toBeNull();
    // The destructive Alert is GONE — the quota case is no longer an Alert.
    expect(alertSpy).not.toHaveBeenCalled();

    // Press the Upgrade CtaButton → routes to the premium modal, only that.
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
    await pressGenerate();

    await waitFor(() => expect(screen.getByText(/used all 20 of your Pro daily AI plans/i)).toBeTruthy());
    expect(screen.getByText('Upgrade')).toBeTruthy();
    expect(screen.queryByText('Generation Failed')).toBeNull();
  });

  // ── (b) generic 500 → retryable error notice, Try Again re-invokes ─────────
  it('on a generic 500 shows the retryable "Generation Failed" notice whose "Try Again" re-invokes generatePlan, NOT the upgrade card, and never calls Alert.alert', async () => {
    mockGenerate.mockRejectedValue({ response: { status: 500, data: { message: 'Ria is taking a breather.' } } });

    renderScreen();
    await pressGenerate();

    // The retryable inline error — with a Try Again action — appears.
    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.getByText('Ria is taking a breather.')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();

    // NOT the upgrade state, and no navigation / no Alert.
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByText('Upgrade')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();

    // First attempt happened once; "Try Again" re-invokes the metered generate.
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Try Again'));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));
  });

  it('on a network error (no response) shows the retryable error, not the upgrade card', async () => {
    mockGenerate.mockRejectedValue({ message: 'Network Error' });

    renderScreen();
    await pressGenerate();

    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.getByText('Network Error')).toBeTruthy();
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  // ── (c) success → navigate to nutrition tab, no Alert, neither card ────────
  it('on success navigates to /(tabs)/nutrition (only that route), fires NO Alert, and shows neither failure card', async () => {
    // Resolve a normalized plan (the shape generatePlan returns).
    mockGenerate.mockResolvedValue({
      id: 'plan-1',
      userId: 'u1',
      date: '2026-06-20',
      meals: [{ time: '08:00', label: 'Breakfast', description: 'Eggs', macros: { protein: 30, carbs: 20, fat: 10, calories: 320 } }],
      supplements: [],
      hydrationTargetMl: 2500,
      createdAt: '2026-06-20T00:00:00.000Z',
    });

    renderScreen();
    await pressGenerate();

    // Navigation IS the success confirmation (the prior success Alert is dropped).
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/nutrition'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls.every(([r]) => r === '/(tabs)/nutrition')).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();

    // Neither failure card is present on the success path.
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByText('Generation Failed')).toBeNull();
  });

  // ── (d) the two ground-truth surfaces are mutually exclusive ───────────────
  it('quota and genError never both render — a quota 429 then a generic 500 swaps the visible card, never both', async () => {
    // First attempt: a 429 → the upgrade card.
    mockGenerate.mockRejectedValueOnce({
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' },
      },
    });

    renderScreen();
    await pressGenerate();

    await waitFor(() => expect(screen.getByText('Daily AI limit reached')).toBeTruthy());
    expect(screen.queryByText('Generation Failed')).toBeNull();

    // Second attempt: a 500 → the error card REPLACES the upgrade card; the
    // upgrade card is cleared (onMutate resets both, onError sets exactly one).
    mockGenerate.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Boom' } } });
    fireEvent.press(screen.getByText('Generate AI Nutrition Plan'));

    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
  });
});
