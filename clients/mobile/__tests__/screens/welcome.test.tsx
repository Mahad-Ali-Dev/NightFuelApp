/**
 * welcome.test.tsx
 *
 * Screen-level coverage for the unauthenticated landing screen —
 * app/(auth)/welcome.tsx — the branded intro that `app/index.tsx` now routes
 * unauthenticated visitors to (instead of straight to the sign-in form). This
 * suite pins the screen's content + navigation contract:
 *
 *   - BRAND + COPY: the ZEITRA wordmark (announced as a single "Zeitra" image,
 *     not spelled out), the "STRONG TODAY · BETTER EVERYDAY" tagline, the
 *     broadened headline "Fitness that runs on your rhythm" and its rhythm/cycle
 *     sub all render.
 *   - PRIMARY CTA: the shared <CtaButton label="Get started" /> is MOUNTED
 *     (resolved by its stable testID="welcome-get-started-cta", which CtaButton
 *     forwards verbatim to its root Pressable) and pressing it pushes the FIRST
 *     onboarding route — `router.push('/(onboarding)/metrics-goals')` — with no
 *     stray param. A new visitor begins onboarding, not the login form.
 *   - SIGN-IN LINK: the "Sign in" affordance is an accessible link to
 *     /(auth)/login (returning users' path). Copy is "Get started" / "Sign in"
 *     — never "Log in".
 *
 * Mock conventions mirror the sibling screen suites (dashboard.cta /
 * onboarding-metrics-goals): @/components/ui + @/theme are left REAL — the
 * assertions ride on the actual CtaButton accessibilityState/testID and the
 * real typography tokens. Only the native-module leaves (gradient / icons /
 * status bar / safe-area) and expo-router are stubbed to passthroughs so the
 * real tree mounts on the jest renderer. expo-router's Link is stubbed to a
 * passthrough that surfaces its `href` so the sign-in destination is assertable,
 * and `useRouter().push` is a hoisted spy so the CTA's destination/arity is too.
 * react-native-reanimated's `entering` animations are handled by jest-expo's
 * built-in reanimated mock (Animated.View/Text render as plain hosts).
 *
 * Additive: NEW test file only. app/(auth)/welcome.tsx is NOT modified by it.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so the test can assert
// exactly where (and with what arity) the "Get started" CTA navigated. `Link` is
// a passthrough that renders its children and surfaces `href` as text so the
// "Sign in" destination is directly assertable.
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { Text: RNText } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <>
        <RNText>{`link-href:${href}`}</RNText>
        {children}
      </>
    ),
  };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suites).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// expo-linear-gradient ships a native module — passthrough View so the REAL
// CtaButton (a lime LinearGradient fill) and the screen's hero scrims mount on
// the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

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
import WelcomeScreen from '../../app/(auth)/welcome';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <WelcomeScreen />
    </ThemeContext.Provider>,
  );
}

describe('WelcomeScreen (auth landing) — brand + primary CTA + sign-in link', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  test('renders the wordmark, tagline, headline and rhythm/cycle sub', () => {
    renderScreen();

    // The wordmark is announced as one "Zeitra" image (not spelled glyph-by-glyph).
    expect(screen.getByLabelText('Zeitra')).toBeTruthy();
    expect(screen.getByText('STRONG TODAY · BETTER EVERYDAY')).toBeTruthy();

    // The broadened headline + sub. The headline is split across a hard line
    // break, so match each fragment.
    expect(screen.getByText(/Fitness that runs/)).toBeTruthy();
    expect(screen.getByText(/on your rhythm/)).toBeTruthy();
    expect(screen.getByText(/even your cycle\./)).toBeTruthy();
  });

  test('the primary "Get started" CtaButton is mounted and labelled', () => {
    renderScreen();

    const cta = screen.getByTestId('welcome-get-started-cta');
    expect(cta).toBeTruthy();
    // CtaButton falls back accessibilityLabel → label.
    expect(String(cta.props.accessibilityLabel)).toBe('Get started');
  });

  test('pressing "Get started" pushes the FIRST onboarding route with no stray param', () => {
    renderScreen();

    fireEvent.press(screen.getByTestId('welcome-get-started-cta'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/metrics-goals');
  });

  test('the "Sign in" affordance is an accessible link to /(auth)/login', () => {
    renderScreen();

    // The link copy is "Sign in" — never "Log in".
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.queryByText(/Log in/i)).toBeNull();

    // The accessible sign-in link is present…
    const link = screen.getByLabelText('Sign in to your account');
    expect(link).toBeTruthy();
    expect(String(link.props.accessibilityRole)).toBe('link');

    // …and it targets the existing login screen (surfaced by the Link href stub).
    expect(screen.getByText('link-href:/(auth)/login')).toBeTruthy();
  });
});
