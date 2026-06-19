/**
 * circadian.quota.test.tsx
 *
 * Daily-AI-limit UPGRADE-state coverage for the Circadian planner
 * (`app/(tabs)/circadian.tsx`).
 *
 * The "Regenerate" action on the AI Protocol tab now drives the METERED
 * plan-service path — `POST /v1/plans/generate` (via `@/api/plans` generatePlan)
 * — which counts toward the per-plan generations quota and returns the SHARED
 * `429 { error:'ai_quota_exceeded', limit, plan, resetsAt }` contract. The screen
 * runs the caught error through the shared `parseAiQuotaError` (from `@/api/ai`)
 * and flips into ONE of two mutually-exclusive ground-truth states:
 *
 *   - a 429 daily-limit → the distinct "Daily AI limit reached" upgrade block
 *     whose CtaButton routes to '/(modals)/premium';
 *   - any other failure (network / 5xx / non-quota 4xx) → a retryable inline
 *     "Generation failed" notice with a "Try Again" action (NOT the upgrade CTA,
 *     and — critically — NOT the old destructive Alert.alert).
 *
 * This suite pins all three branches:
 *   (1) 429 ai_quota_exceeded → upgrade block + Upgrade CTA → press pushes
 *       '/(modals)/premium' exactly once and ONLY that route;
 *   (2) success → the protocol timeline renders, with neither the upgrade nor the
 *       error block present;
 *   (3) a generic 500 → the retryable "Generation failed" notice (with Try Again),
 *       NOT the upgrade CTA.
 *
 * Additive + verify-only: NEW test file only; the screen is exercised through its
 * real mutation lifecycle.
 *
 * Mock conventions mirror ai-coach.quota.test.tsx:
 *   - expo-router exposes a hoisted `mockPush` so the deep-link is asserted by
 *     route + arity.
 *   - A REAL QueryClientProvider (retry:false) so the screen's useMutation
 *     onMutate/onError/onSuccess actually run; `@/api/plans` generatePlan is a
 *     mutable `mockGenerate` spy that each test resolves or rejects.
 *   - `@/api/ai` delegates to the REAL implementation (jest.requireActual) so the
 *     genuine `parseAiQuotaError` does the 429-vs-generic discrimination; its
 *     leaf deps (`@/api/client`, `@/lib/sentry`) are mocked so no axios/env or
 *     native Sentry subtree loads.
 *   - `@/api/shifts` getCurrent resolves a fixed active night shift (so the AI
 *     Protocol tab is reachable); `@/api/circadian` getModel resolves null (the
 *     screen estimates metrics from the shift).
 *   - `../../app/(tabs)/_layout` is stubbed to just `{ TAB_BAR_H }`; decorative
 *     glyphs, safe-area insets, the linear gradient and the status bar are stubbed
 *     the same way as circadian.test.tsx. SafeBlurView → passthrough so the real
 *     GlassCard / CtaButton render under jest.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The metered plan-service generate call — a mutable spy each test wires.
const mockGenerate = jest.fn();
jest.mock('@/api/plans', () => ({ generatePlan: (...args: any[]) => mockGenerate(...args) }));

// `@/api/ai` → the REAL module (so parseAiQuotaError is genuine), with its leaf
// deps mocked below so the axios client / native sentry never load.
jest.mock('@/api/ai', () => jest.requireActual('@/api/ai'));
jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getAccessToken: jest.fn(() => Promise.resolve(null)),
  resolveApiUrl: (p: string) => `http://test${p}`,
}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

// A fixed active night shift so the screen reaches the populated AI Protocol tab;
// getModel resolves null so metrics estimate from the shift (no model branch).
const ACTIVE_SHIFT = {
  id: 's1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
};
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn(() => Promise.resolve(ACTIVE_SHIFT)) }));
jest.mock('@/api/circadian', () => ({ getModel: jest.fn(() => Promise.resolve(null)) }));

// _layout stub: circadian.tsx only needs the TAB_BAR_H constant from it.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

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

// expo-linear-gradient ships a native module; replace <LinearGradient> with a
// passthrough View so the screen's (and CtaButton's) gradients mount.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// SafeBlurView (used by GlassCard) → passthrough View so children render.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children }: any) => <RN.View>{children}</RN.View> };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
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
import CircadianScreen from '../../app/(tabs)/circadian';

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <CircadianScreen />
      </ThemeContext.Provider>
    </QueryClientProvider>,
  );
}

// Switch to the AI Protocol tab (the screen mounts on the Profile Hub tab; the
// timeline + the upgrade/error notices live on the AI Protocol tab).
async function gotoProtocolTab() {
  // The active-shift metric grid confirms the populated render is settled.
  await waitFor(() => expect(screen.getByText('Biological Windows')).toBeTruthy());
  fireEvent.press(screen.getByRole('tab', { name: /AI Protocol/ }));
  expect(screen.getByText("Today's Protocol")).toBeTruthy();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CircadianScreen — daily-AI-limit upgrade state', () => {
  // ── (1) 429 ai_quota_exceeded → upgrade block + route to premium ──────────
  it('on a 429 ai_quota_exceeded shows the upgrade CTA and routes to /(modals)/premium (only that route)', async () => {
    // The metered plan-service call rejects with the exact shared 429 body.
    mockGenerate.mockRejectedValue({
      response: { status: 429, data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' } },
    });

    renderScreen();
    await gotoProtocolTab();

    // Kick off a (re)generation via the Regenerate button.
    fireEvent.press(screen.getByRole('button', { name: /Regenerate protocol/ }));

    // The distinct upgrade block appears (NOT the generic error / Alert).
    await waitFor(() => expect(screen.getByText('Daily AI limit reached')).toBeTruthy());
    expect(screen.queryByText('Generation failed')).toBeNull();

    // Press the Upgrade CtaButton → routes to the premium modal, only that.
    const upgrade = screen.getByRole('button', { name: /Upgrade to remove the daily AI limit/ });
    fireEvent.press(upgrade);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(modals)/premium'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls.every(([r]) => r === '/(modals)/premium')).toBe(true);
  });

  // ── (2) success → timeline renders, no upgrade/error ──────────────────────
  it('on success renders the protocol timeline with neither the upgrade nor the error block', async () => {
    // Resolve an AI plan carrying a recognizable meal row in `items`.
    mockGenerate.mockResolvedValue({
      items: [
        { type: 'meal', title: 'Generated Wake Fuel', time: '07:00', macros: '40P / 20C / 15F' },
        { type: 'workout', title: 'Activation Protocol', time: '08:00', duration: '30m' },
      ],
    });

    renderScreen();
    await gotoProtocolTab();

    fireEvent.press(screen.getByRole('button', { name: /Regenerate protocol/ }));

    // The AI-generated timeline row renders; neither failure block is present.
    await waitFor(() => expect(screen.getByText('Generated Wake Fuel')).toBeTruthy());
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByText('Generation failed')).toBeNull();
    // No navigation happened on a successful generation.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (3) generic 500 → retryable error notice, NOT the upgrade CTA ─────────
  it('on a generic 500 shows the retryable "Generation failed" notice (Try Again), NOT the upgrade CTA', async () => {
    mockGenerate.mockRejectedValue({
      response: { status: 500, data: { message: 'Internal error' } },
    });

    renderScreen();
    await gotoProtocolTab();

    fireEvent.press(screen.getByRole('button', { name: /Regenerate protocol/ }));

    // The retryable inline error — with a Try Again action — appears.
    await waitFor(() => expect(screen.getByText('Generation failed')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();

    // NOT the upgrade state, and no navigation (no Alert, no premium route).
    expect(screen.queryByText('Daily AI limit reached')).toBeNull();
    expect(screen.queryByRole('button', { name: /Upgrade to remove the daily AI limit/ })).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
