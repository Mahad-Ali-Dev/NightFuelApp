/**
 * root-index.test.tsx
 *
 * Screen-level coverage for the auth gate / pre-redirect splash —
 * `app/index.tsx` — the ONLY genuine full-screen bare-`ActivityIndicator`
 * offender that the spinner-debt burn-down converts to an honest, a11y-complete
 * loading state. This suite pins that conversion:
 *
 *   - Test A (loading): while the auth store is `isLoading`, the screen renders
 *     a single ACCESSIBLE loading container — queryable by
 *     accessibilityRole="progressbar" + accessibilityLabel "Loading your
 *     account" + accessibilityState={{ busy: true }} — and NOT a bare,
 *     unannounced full-screen <ActivityIndicator>: any ActivityIndicator that
 *     is present lives INSIDE that labelled container, never at the root as the
 *     silent primary loading state. No Redirect is emitted while loading.
 *   - Test B (authenticated + onboarded): with isLoading=false and an
 *     authenticated, onboarding-complete user, the screen emits the (tabs)
 *     Redirect and no loading container.
 *   - Test C (authenticated, onboarding incomplete): preserves the existing
 *     onboarding redirect (behaviour unchanged by the spinner-debt fix).
 *   - Test D (unauthenticated): the screen emits the (auth)/login Redirect.
 *
 * Why no ThemeContext provider / why @/components/ui is mocked: app/index.tsx
 * reads its palette directly from `@/theme/colors` (a plain const object, no
 * provider needed). The only design-system dependency is the Skeleton logo /
 * tagline placeholder, which we stub to a passthrough <View testID> so the
 * suite rides on the screen's OWN a11y container + redirect logic rather than
 * the Skeleton's Animated internals (mirrors the sibling state suites that stub
 * native-module-backed primitives). expo-router's Redirect is stubbed to a
 * <Text> that surfaces its `href`, so each redirect path is directly assertable.
 *
 * Rules cited (see ~/.claude/skills/react-native-skills/rules):
 *  - rendering-no-falsy-and.md: app/index.tsx branches via early returns only
 *    (no `x && <JSX>` leaked render), so there is no falsy render-crash to test.
 *  - ui-safe-area-scroll.md: n/a — the splash is a single centered, NON-scrolling
 *    view with no list/content to collide with safe-area insets (it is replaced
 *    by a redirect the instant isLoading flips), so there is nothing to assert
 *    about SafeAreaView / contentInsetAdjustmentBehavior here.
 *  - ui-styling.md: the loading container uses StyleSheet tokens (spacing + theme
 *    colors); the test asserts the role/label/busy contract, not raw style.
 *  - react-state-fallback.md: n/a — the screen holds no local component state;
 *    the loading flag is the auth store's ground truth, driven here via the mock.
 *  - ui-pressable.md (a11y): the splash has no pressables; the a11y win this suite
 *    locks in is the ANNOUNCED progressbar container (role + label + busy) that
 *    replaces the previously silent, unlabelled full-screen spinner.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router Redirect → a <Text> surfacing the `href` so each redirect target
// is directly assertable by its route string.
jest.mock('expo-router', () => {
  const { Text: RNText } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <RNText>{`redirect:${href}`}</RNText>,
  };
});

// Controlled auth state — each test mutates this holder BEFORE render(); the
// hooked store factory reads it at call-time. app/index.tsx calls
// `useAuthStore()` with NO selector and destructures { isAuthenticated,
// isLoading, user }, so the mock returns the whole holder object.
type AuthState = { isAuthenticated: boolean; isLoading: boolean; user: any };
const mockAuth: AuthState = { isAuthenticated: false, isLoading: true, user: null };
jest.mock('@/store/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

// Skeleton placeholder → passthrough <View testID="skeleton"> so the suite does
// not depend on the real Skeleton's Animated/ThemeContext internals. The other
// barrel exports are unused by app/index.tsx.
jest.mock('@/components/ui', () => {
  const RN = require('react-native');
  return {
    Skeleton: (props: any) => <RN.View testID="skeleton" {...props} />,
  };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import RootIndex from '../../app/index';

describe('RootIndex (auth gate) — honest, a11y-complete loading + redirect paths', () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = true;
    mockAuth.user = null;
  });

  // ── Test A: loading → announced progressbar container, NOT a bare spinner ──
  test('loading: renders the accessible loading container (role/label/busy), not a bare unlabelled spinner', () => {
    mockAuth.isLoading = true;

    expect(() => render(<RootIndex />)).not.toThrow();

    // The loading state IS an announced container: a progressbar with the
    // "Loading your account" label and busy state — exactly the a11y contract
    // the bare spinner lacked.
    const loader = screen.getByRole('progressbar');
    expect(loader).toBeTruthy();
    expect(screen.getByLabelText('Loading your account')).toBe(loader);
    expect(loader.props.accessibilityState).toEqual({ busy: true });

    // It is NOT a bare full-screen spinner: any ActivityIndicator that renders
    // is a DESCENDANT of the labelled progressbar container (never the silent
    // top-level primary loading element). We assert this by walking up from each
    // spinner to confirm the announced progressbar is one of its ancestors.
    const hasAnnouncedAncestor = (node: any): boolean => {
      for (let cur = node.parent; cur; cur = cur.parent) {
        if (cur.props?.accessibilityRole === 'progressbar') return true;
      }
      return false;
    };
    const spinners = screen.root.findAllByType(ActivityIndicator);
    spinners.forEach((spinner: any) => {
      expect(hasAnnouncedAncestor(spinner)).toBe(true);
    });

    // While loading, NO redirect is emitted (the gate is still deciding).
    expect(screen.queryByText(/^redirect:/)).toBeNull();
  });

  // ── Test B: not loading + authenticated + onboarded → (tabs) Redirect ──────
  test('authenticated + onboarding complete: redirects to (tabs) and shows no loading container', () => {
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = true;
    mockAuth.user = { onboardingComplete: true };

    render(<RootIndex />);

    expect(screen.getByText('redirect:/(tabs)')).toBeTruthy();
    // The loading container is gone once the gate resolves.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  // ── Test C: authenticated but onboarding incomplete → onboarding Redirect ──
  // (Behaviour preserved by the spinner-debt fix — the redirect logic is unchanged.)
  test('authenticated + onboarding incomplete: redirects to onboarding metrics-goals', () => {
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = true;
    mockAuth.user = { onboardingComplete: false };

    render(<RootIndex />);

    expect(screen.getByText('redirect:/(onboarding)/metrics-goals')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  // ── Test D: not loading + unauthenticated → (auth)/login Redirect ──────────
  test('unauthenticated: redirects to (auth)/login and shows no loading container', () => {
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;

    render(<RootIndex />);

    expect(screen.getByText('redirect:/(auth)/login')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });
});
