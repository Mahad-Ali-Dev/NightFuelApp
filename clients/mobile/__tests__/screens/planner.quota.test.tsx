/**
 * planner.quota.test.tsx
 *
 * Daily-AI-limit UPGRADE-state coverage for the Meal Planner
 * (`app/(meals)/planner.tsx`).
 *
 * The planner's "GENERATE AI PLAN" / "REGENERATE PLAN" actions drive the METERED
 * plan-service path — `POST /v1/plans/generate` (via `@/api/plans` generatePlan)
 * — which counts toward the per-plan generations quota and returns the SHARED
 * `429 { error:'ai_quota_exceeded', limit, plan, resetsAt }` contract. The screen
 * runs the caught error through the shared `parseAiQuotaError` (from `@/api/ai`)
 * and flips into ONE of two mutually-exclusive ground-truth states (replacing the
 * old destructive `Alert.alert('Generation Failed', …)`):
 *
 *   - a 429 daily-limit → the distinct "Daily AI limit reached" upgrade card
 *     whose <CtaButton label="Upgrade" /> routes to '/(modals)/premium';
 *   - any other failure (network / 5xx / non-quota 4xx) → a retryable inline
 *     "Generation Failed" notice with a "Try Again" action (NOT the upgrade CTA).
 *
 * This suite pins:
 *   (a) 429 ai_quota_exceeded → upgrade card + Upgrade CTA → press pushes
 *       '/(modals)/premium' exactly once and ONLY that route; NO 'Generation
 *       Failed' text;
 *   (b) a generic 500 → the retryable "Generation Failed" notice whose "Try
 *       Again" re-invokes generatePlan; NO upgrade card;
 *   (c) success → invalidates ['nutrition-plan', dateStr] and fires the success
 *       Alert; neither failure card present;
 *   (d) quota and genError never both render.
 *
 * Additive + verify-only: NEW test file only; the screen is exercised through its
 * real react-query useMutation lifecycle (a real QueryClientProvider, retry:false)
 * so the production onSuccess/onError run.
 *
 * Mock conventions mirror aiPlanner.test.tsx / circadian.quota.test.tsx:
 *   - expo-router exposes a hoisted `mockPush` so the deep-link is asserted by
 *     route + arity.
 *   - `@/api/plans` is fully stubbed: `getPlanByDate` resolves null (a 404 → the
 *     empty state, so the "GENERATE AI PLAN" CTA is the entry point), `ratePlan`
 *     is inert, and `generatePlan` is a mutable `mockGenerate` spy each test
 *     resolves or rejects.
 *   - `@/api/ai` delegates to the REAL implementation (jest.requireActual) so the
 *     genuine `parseAiQuotaError` does the 429-vs-generic discrimination; its leaf
 *     deps (`@/api/client`, `@/lib/sentry`) are mocked so no axios/env or native
 *     Sentry subtree loads.
 *   - `@/api/shifts` getCurrent resolves a fixed active night shift.
 *   - Decorative glyphs, safe-area insets, the linear gradient, expo-image and the
 *     status bar are stubbed the same way as the sibling screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The metered plan-service generate call — a mutable spy each test wires. The
// other two plan endpoints the screen imports are inert: getPlanByDate resolves
// null (404 → empty state so the "GENERATE AI PLAN" CTA renders), ratePlan noop.
const mockGenerate = jest.fn();
jest.mock('@/api/plans', () => ({
  getPlanByDate: jest.fn(() => Promise.resolve(null)),
  generatePlan: (...args: any[]) => mockGenerate(...args),
  ratePlan: jest.fn(() => Promise.resolve({})),
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

// A fixed active night shift so shiftQ settles (the screen passes its id/type to
// the metered generate call).
const ACTIVE_SHIFT = {
  id: 's1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
};
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn(() => Promise.resolve(ACTIVE_SHIFT)) }));

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

// expo-linear-gradient (used by CtaButton) ships a native module; passthrough so
// the gradient fill mounts.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-image ships a native loader — passthrough host view (the meal thumbnails
// never render in the empty state, but the import must resolve).
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Alert } from 'react-native';
import { format } from 'date-fns';
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
import MealPlannerScreen from '../../app/(meals)/planner';

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <MealPlannerScreen />
      </ThemeContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

// The empty-state generate CTA is the entry point (getPlanByDate → null = no
// plan). Wait for it, then press it to kick off a generation.
async function pressGenerate() {
  await waitFor(() => expect(screen.getByText('GENERATE AI PLAN')).toBeTruthy());
  fireEvent.press(screen.getByText('GENERATE AI PLAN'));
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('MealPlannerScreen — daily-AI-limit upgrade state', () => {
  // ── (a) 429 ai_quota_exceeded → upgrade card + route to premium ────────────
  it('on a 429 ai_quota_exceeded shows the upgrade CTA and routes to /(modals)/premium (only that route), with NO "Generation Failed"', async () => {
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
    // The destructive Alert is gone — the quota case is no longer an Alert.
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
  it('on a generic 500 shows the retryable "Generation Failed" notice whose "Try Again" re-invokes generatePlan, NOT the upgrade card', async () => {
    mockGenerate.mockRejectedValue({ response: { status: 500, data: { message: 'Ria is taking a breather.' } } });

    renderScreen();
    await pressGenerate();

    // The retryable inline error — with a Try Again action — appears.
    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.getByText('Ria is taking a breather.')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();

    // NOT the upgrade state, and no navigation (no Alert, no premium route).
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

  // ── (c) success → invalidates the plan query + fires the success Alert ─────
  it('on success invalidates [\'nutrition-plan\', dateStr] and fires the success Alert, with neither failure card present', async () => {
    // Resolve a normalized plan (the shape getPlanByDate would return).
    mockGenerate.mockResolvedValue({
      id: 'plan-1',
      userId: 'u1',
      date: '2026-06-20',
      meals: [{ time: '08:00', label: 'Breakfast', description: 'Eggs', macros: { protein: 30, carbs: 20, fat: 10, calories: 320 } }],
      supplements: [],
      hydrationTargetMl: 2500,
      createdAt: '2026-06-20T00:00:00.000Z',
    });

    const { client } = renderScreen();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    await pressGenerate();

    // The success Alert fires; the invalidation targets the dated plan key.
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Plan Generated', expect.any(String)));
    // Derive dateStr EXACTLY as the screen does — date-fns `format(selDate,
    // 'yyyy-MM-dd')` on its `new Date()` default — so the key matches in local
    // time with no UTC/midnight-boundary skew (a raw toISOString().slice would
    // disagree across the day boundary in non-UTC zones).
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['nutrition-plan', dateStr] });

    // Neither failure card is present on the success path, and no navigation.
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByText('Generation Failed')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    invalidateSpy.mockRestore();
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

    // Second attempt (via the Upgrade card is route-only, so re-press the
    // still-present empty-state CTA): a 500 → the error card REPLACES the upgrade
    // card; the upgrade card is cleared (runGenerate resets both, onError sets one).
    mockGenerate.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Boom' } } });
    fireEvent.press(screen.getByText('GENERATE AI PLAN'));

    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeTruthy());
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
  });
});
