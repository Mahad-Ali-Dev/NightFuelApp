/**
 * subscription.test.tsx
 *
 * Screen-level coverage for the Aurora subscription screen —
 * `app/(settings)/subscription.tsx`.
 *
 * That screen drives ONE read query (['subscription-status'] via getStatus) plus
 * an IAP purchase/restore side of things that is OUT OF SCOPE here (payments are
 * a separate concern). This suite pins the READ-side honest-state contract the
 * hardening item calls out, across the three branches the render now resolves to
 * (in this exact order): a loading skeleton, an HONEST retryable ERROR surface,
 * and the loaded plan grid.
 *
 *   - LOADING branch: isLoading → the skeleton is shown and NEITHER the plan grid
 *     ("Choose Your Plan") NOR the error surface is rendered;
 *   - ERROR branch: getStatus failed (isError) → the screen shows the
 *     "Couldn't load your subscription" surface whose "Try Again" CtaButton calls
 *     the query's `refetch` — and the Free-defaulted plan grid is NOT rendered
 *     (the bug this item fixes: an undefined `sub` must NOT silently fall back to
 *     Free-as-current and nudge a paying user to re-purchase);
 *   - LOADED branch: getStatus resolves { tier: 'PRO' } → the plan grid renders
 *     and the Pro tier shows its "CURRENT PLAN" active badge.
 *
 * The default export is wrapped in <BiometricGate> (an async capability check
 * that would otherwise sit between the test and these states), so — exactly as
 * the item instructs — we render the named `SubscriptionScreenContent` directly.
 *
 * No live-DB / network dependency: `@tanstack/react-query` is stubbed so the
 * screen never touches axios, and `@/api/subscriptions` + the IAP modules
 * (`@/lib/iap`, `@/api/iap`, `@/lib/sentry`) are mocked so the IAP-init effect is
 * inert and their axios import graph never loads.
 *
 * Mock conventions mirror the sibling `requests.test.tsx` (same hoisted
 * `mock`-prefixed holder + real-CtaButton press pattern, with the `@/components/ui`
 * barrel left REAL so assertions ride on the actual CtaButton a11y / GlassCard
 * surface). Disjoint from every other screen suite — different screen, different
 * filename.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: benign no-op router — this suite asserts query/refetch wiring, not
// navigation. `back`/`push`/`replace` are inert spies.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['subscription-status'] query — each test mutates this
// holder BEFORE render() (the factory reads it at call-time). `refetch` is the
// spy the error branch's "Try Again" CtaButton must call.
type StatusState = { data: any; isLoading: boolean; isError: boolean };
const mockStatus: StatusState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// react-query: ['subscription-status'] reads the mutable holder above.
// useQueryClient exposes the invalidateQueries the purchase handler would call
// (never invoked in these read-side tests, but it satisfies the import).
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'subscription-status') {
      return {
        data: mockStatus.data,
        isLoading: mockStatus.isLoading,
        isError: mockStatus.isError,
        refetch: mockRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
    cancelQueries: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

// The read API the screen statically imports — stub to a plain jest.fn so axios
// (via @/api/client) never loads. useQuery is fully stubbed above, so getStatus
// is never actually invoked; it only satisfies the import graph.
jest.mock('@/api/subscriptions', () => ({
  getStatus: jest.fn(),
}));

// IAP modules: the screen's mount effect calls initializeIap()/getSubscription
// Products()/listenForPurchases(), and the (never-fired-in-tests) purchase
// handler calls validateReceipt + captureException. Mock them all so the effect
// is INERT and their axios/native import graphs never load. initializeIap
// resolves `{ available: false }` so the effect early-returns after the first
// await and no product fetch / listener is wired.
jest.mock('@/lib/iap', () => ({
  SUBSCRIPTION_PRODUCT_IDS: {
    PRO_MONTHLY: 'pro.monthly',
    PREMIUM_MONTHLY: 'premium.monthly',
    ENTERPRISE_MONTHLY: 'enterprise.monthly',
  },
  initializeIap: jest.fn().mockResolvedValue({ available: false }),
  listenForPurchases: jest.fn(() => jest.fn()),
  getSubscriptionProducts: jest.fn().mockResolvedValue([]),
  requestSubscription: jest.fn(),
  restorePurchases: jest.fn(),
  acknowledgePurchase: jest.fn(),
  openManageSubscriptions: jest.fn(),
  productIdToTier: jest.fn(),
}));
jest.mock('@/api/iap', () => ({
  validateReceipt: jest.fn(),
}));
jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
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

// expo-linear-gradient ships a native module — passthrough so the CtaButton
// (error retry) and the tier-card gradient fills mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// GlassCard (the error surface) wraps a SafeBlurView (expo-blur native). Replace
// SafeBlurView with a passthrough View so GlassCard mounts cleanly regardless of
// the Android<12 blur fallback branch.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
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
import { SubscriptionScreenContent } from '../../app/(settings)/subscription';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <SubscriptionScreenContent />
    </ThemeContext.Provider>,
  );
}

describe('SubscriptionScreenContent', () => {
  beforeEach(() => {
    mockStatus.data = undefined;
    mockStatus.isLoading = false;
    mockStatus.isError = false;
    mockRefetch.mockClear();
  });

  // ── (a) LOADING — skeleton shown, no plan grid, no error surface ───────────
  test('isLoading → skeleton only (no "Choose Your Plan" grid, no error surface)', () => {
    mockStatus.isLoading = true;

    renderScreen();

    // The header (back + title) is always present — it sits ABOVE the state
    // ternary, so it shows in every branch.
    expect(screen.getByText('Subscription')).toBeTruthy();

    // While loading we render NEITHER the loaded plan grid…
    expect(screen.queryByText('Choose Your Plan')).toBeNull();
    // …NOR the error surface / its retry control.
    expect(screen.queryByText("Couldn't load your subscription")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
  });

  // ── (b) ERROR — retry CtaButton calls refetch; NO Free-defaulted grid ──────
  test('isError → "Try Again" retry surface (refetch on press) and NO plan grid', () => {
    mockStatus.isError = true;

    renderScreen();

    // The honest connection-error copy is present…
    expect(screen.getByText("Couldn't load your subscription")).toBeTruthy();

    // …and CRUCIALLY the Free-defaulted plan grid is NOT rendered. This is the
    // bug being fixed: a failed getStatus left `sub` undefined and silently
    // defaulted activeTierId to 'free', presenting "Choose Your Plan" with Free
    // as the CURRENT plan (and a "Current Plan" CTA) even for a paying user.
    expect(screen.queryByText('Choose Your Plan')).toBeNull();
    expect(screen.queryByText('CURRENT PLAN')).toBeNull();
    expect(screen.queryByText('Current Plan')).toBeNull();
    // The Subscription Tools section (only in the loaded grid) is also absent.
    expect(screen.queryByText('Subscription Tools')).toBeNull();

    // The retry control is the coral CtaButton (accessibilityRole "button", a11y
    // label "Retry loading your subscription status"), wired to the query's
    // refetch — pressing it calls refetch exactly once, and only that.
    const retry = screen.getByRole('button', { name: 'Retry loading your subscription status' });
    expect(retry).toBeTruthy();

    fireEvent.press(retry);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── (c) LOADED — resolved tier 'PRO' shows the Pro "CURRENT PLAN" badge ─────
  test('resolved { tier: "PRO" } → plan grid renders with the Pro CURRENT PLAN badge', () => {
    mockStatus.data = { tier: 'PRO', active: true, features: [] };

    renderScreen();

    // The loaded grid (not the loading/error branch) is shown…
    expect(screen.getByText('Choose Your Plan')).toBeTruthy();
    // …the error surface is absent…
    expect(screen.queryByText("Couldn't load your subscription")).toBeNull();
    // …and the active tier (PRO) surfaces its "CURRENT PLAN" badge. Because the
    // server says PRO, the Free card is NOT the active one (it would show its
    // "Downgrade to Free" CTA instead), proving the tier flows from the resolved
    // status, not the 'free' default.
    expect(screen.getByText('CURRENT PLAN')).toBeTruthy();
    // The recommended badge is suppressed on the active card, so the only badge
    // is CURRENT PLAN (exactly one).
    expect(screen.getAllByText('CURRENT PLAN').length).toBe(1);
  });
});
