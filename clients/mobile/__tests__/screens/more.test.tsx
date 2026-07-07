/**
 * more.test.tsx
 *
 * Screen-level coverage for the "More" tab — `app/(tabs)/more.tsx` — focused on
 * the HONESTY of every settings row: a row that looks tappable MUST actually do
 * something on press, and a row that does nothing MUST be rendered explicitly
 * disabled (dimmed, no chevron, `accessibilityState.disabled === true`) so the
 * UI never implies a dead tap target.
 *
 * Background: the Support rows "Help Center" and "Terms of Service" used to carry
 * NO route, NO url, and were not switches — so the row `onPress` (`() => item.route
 * && router.push(...)`) was a SILENT NO-OP, yet the row still rendered a misleading
 * chevron and never set `accessibilityState.disabled`. This suite pins the fix:
 * those rows now open a real external url via `Linking.openURL`, and the disabled-
 * rendering contract is enforced for any genuinely actionless row.
 *
 * Contract pinned here:
 *   - every NON-switch row is either a real navigation (`router.push`) or a real
 *     external link (`Linking.openURL`) — pressing it fires exactly one of those
 *     mocks; there is NO bare `() => {}` row that looks tappable but does nothing;
 *   - the two Support rows specifically fire `Linking.openURL` with the canonical
 *     Zeitra urls (matching the (settings)/index.tsx Support rows);
 *   - the Manage Subscription row is UNCHANGED — it still navigates to
 *     `/(settings)/subscription` and shows its "Pro Tier" value (payments/IAP path
 *     is USER-GATED and must not be touched);
 *   - NO live row is rendered as a "disabled-but-chevroned" decoy: every row that
 *     exposes `accessibilityState.disabled === true` fires NEITHER push NOR openURL
 *     on press AND renders no chevron. (With the urls wired, the live config has no
 *     such row — so this is asserted as the strong invariant "nothing is silently
 *     disabled," which is exactly the honesty guarantee.)
 *
 * Cites react-native-skills: ui-pressable (interactive rows expose an accessible
 * role + label so they are queryable/assertable as press targets) and
 * rendering-no-falsy-and (the chevron is suppressed via ternary-null, never a
 * falsy `{cond && <JSX/>}`, so a disabled row can never leak a raw value).
 *
 * Additive + verify-only: NEW test file only. Mock conventions mirror the sibling
 * Settings suite (settings-index.test.tsx) and the (tabs) screen suites
 * (exercises-index / circadian): useThemeStore / useAuthStore / expo-router /
 * react-query / native loaders are stubbed; `@/components/SafeBlurView` is a
 * passthrough View so the REAL GlassCard mounts without expo-blur's native module;
 * the `(tabs)/_layout` import is stubbed to just `{ TAB_BAR_H }` so the real tab
 * navigator never loads.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// `useAuthStore` is read as a hook (`{ user }`) AND statically via
// `useAuthStore.getState().logout()` in the Sign out handler. Provide both shapes;
// the `mock`-prefixed holder satisfies babel-plugin-jest-hoist's closure rule.
const mockLogout = jest.fn(async () => undefined);
jest.mock('@/store/authStore', () => {
    const useAuthStore: any = () => ({ user: { name: 'Test User', email: 't@example.com' } });
    useAuthStore.getState = () => ({ logout: mockLogout });
    return { useAuthStore };
});

// themeStore: the screen destructures this slice for the Dark Mode switch. A
// static holder with a spy `setTheme` lets the switch-toggle case assert it fires.
const mockSetTheme = jest.fn();
jest.mock('@/store/themeStore', () => ({
    useThemeStore: () => ({ theme: 'dark', setTheme: mockSetTheme }),
}));

// expo-router: capture `push` (row navigation) and `replace` (post-logout nav) so
// both are assertable.
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

// react-query: the screen fires the 'user-profile' query. Return benign empty
// success so the profile hero falls back to the auth-store name/email.
jest.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
}));

// API module is statically imported by the screen; stub the named export so the
// real axios client never loads (useQuery is mocked, so this never runs).
jest.mock('@/api/users', () => ({ getProfile: jest.fn() }));

// SafeBlurView → passthrough View so the REAL GlassCard (kept real) mounts its
// frosted fill + children without expo-blur's native module.
jest.mock('@/components/SafeBlurView', () => {
    const RN = require('react-native');
    return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

// Decorative glyphs → plain <Text> surfacing the icon name so they are inert and
// never collide with assertable copy. (Lets a test detect a rendered chevron by
// its "icon:chevron-forward" text.)
jest.mock('@expo/vector-icons', () => {
    const { Text: RNText } = require('react-native');
    return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// expo-image / expo-linear-gradient ship native loaders → passthrough host views.
jest.mock('expo-image', () => {
    const RN = require('react-native');
    return { Image: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-linear-gradient', () => {
    const RN = require('react-native');
    return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// expo-constants: the screen reads `Constants.expoConfig?.version`.
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// _layout stub: more.tsx only needs the TAB_BAR_H constant from it. Mocking it
// keeps the real tab navigator (expo-router <Tabs>, reanimated, gesture-handler,
// auth store, SafeBlurView) out of the render entirely.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 72 }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
    ThemeContext,
    getThemeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
} from '@/theme';
import MoreScreen from '../../app/(tabs)/more';

function renderScreen() {
    return render(
        <ThemeContext.Provider
            value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
            <MoreScreen />
        </ThemeContext.Provider>,
    );
}

// The settings rows that are real NAVIGATION (push) targets, by accessible label
// + the route each must push to. (Manage Subscription is pinned here too — its
// route/value must stay byte-identical; payments/IAP path is USER-GATED.)
const NAV_ROWS: { label: string; route: string }[] = [
    { label: 'My Profile & Preferences', route: '/(tabs)/profile' },
    { label: 'Manage Subscription', route: '/(settings)/subscription' },
    { label: 'Health & Vitals', route: '/(performance)' },
    { label: 'Heart Rate', route: '/(performance)/heart-rate' },
    { label: 'Sleep & Circadian', route: '/(tabs)/circadian' },
    { label: 'Analytics Dashboard', route: '/(tabs)/analytics' },
    { label: 'Achievements & Badges', route: '/(community)/achievements' },
    { label: 'AI Workout Planner', route: '/(exercises)/ai-planner' },
    { label: 'Calculators (1RM & Macros)', route: '/(exercises)/calculator' },
    { label: 'Notification Settings', route: '/(settings)/notification-preferences' },
    { label: 'Notification History', route: '/(settings)/notifications' },
    { label: 'Connected Devices', route: '/(settings)/devices' },
];

// The Support rows that are real external LINK targets, by accessible label + url.
const LINK_ROWS: { label: string; url: string }[] = [
    { label: 'Help Center', url: 'https://zeitra.app/support' },
    { label: 'Terms of Service', url: 'https://zeitra.app/terms' },
];

let openURLSpy: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    // Spy on Linking.openURL so the link rows are assertable without invoking the
    // native module. It resolves (never throws) and records its url argument.
    openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
});

afterEach(() => {
    openURLSpy.mockRestore();
});

describe('More tab — every settings row is functional or honestly disabled', () => {
    it('renders the section headers and the profile hero falls back to the auth-store identity', () => {
        renderScreen();

        // Section headers prove the grouped list mounted (the GlassCard rows under each).
        expect(screen.getByText('Account')).toBeTruthy();
        expect(screen.getByText('Insights & Tools')).toBeTruthy();
        expect(screen.getByText('App Settings')).toBeTruthy();
        expect(screen.getByText('Support')).toBeTruthy();

        // Profile hero uses the auth-store fallback (the 'user-profile' query is empty).
        expect(screen.getByText('Test User')).toBeTruthy();
        expect(screen.getByText('t@example.com')).toBeTruthy();
    });

    it('each navigation row exposes an accessible button and pushes its exact route on press (no link, no no-op)', () => {
        renderScreen();

        for (const { label, route } of NAV_ROWS) {
            const row = screen.getByRole('button', { name: label });
            // It is NOT silently disabled — it advertises itself as enabled.
            expect(row.props.accessibilityState).toEqual(
                expect.objectContaining({ disabled: false }),
            );

            fireEvent.press(row);

            // Exactly this press routed exactly here…
            expect(mockPush).toHaveBeenCalledWith(route);
            // …and a navigation row NEVER opens an external url.
            expect(openURLSpy).not.toHaveBeenCalled();

            jest.clearAllMocks();
        }

        // Every navigation row was exercised.
        expect(NAV_ROWS).toHaveLength(12);
    });

    it('the Support rows are real links: pressing each opens the canonical Zeitra url via Linking.openURL (the former silent no-op is fixed)', () => {
        renderScreen();

        for (const { label, url } of LINK_ROWS) {
            // A url row advertises the 'link' role (not 'button') and is enabled.
            const row = screen.getByRole('link', { name: label });
            expect(row.props.accessibilityState).toEqual(
                expect.objectContaining({ disabled: false }),
            );

            fireEvent.press(row);

            // It opens the external url exactly once…
            expect(openURLSpy).toHaveBeenCalledTimes(1);
            expect(openURLSpy).toHaveBeenCalledWith(url);
            // …and a link row NEVER navigates the in-app router.
            expect(mockPush).not.toHaveBeenCalled();

            jest.clearAllMocks();
        }
    });

    it('the Manage Subscription row is UNCHANGED — it shows its "Pro Tier" value and navigates to the subscription route (payments/IAP path untouched)', () => {
        renderScreen();

        // The value chip is still rendered verbatim.
        expect(screen.getByText('Pro Tier')).toBeTruthy();

        const row = screen.getByRole('button', { name: 'Manage Subscription' });
        fireEvent.press(row);

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith('/(settings)/subscription');
        // It is a route, not an external link.
        expect(openURLSpy).not.toHaveBeenCalled();
    });

    it('the Dark Mode switch is the only non-navigating interactive row, and toggling it drives setTheme (it is not a tappable no-op)', () => {
        renderScreen();

        // The switch is queryable by its accessible label. (The row's own
        // TouchableOpacity sets accessibilityLabel=undefined for switch rows, so
        // 'Dark Mode' resolves unambiguously to the Switch itself.)
        const darkSwitch = screen.getByLabelText('Dark Mode');
        expect(darkSwitch).toBeTruthy();
        // It reflects the store's current theme ('dark' → on).
        expect(darkSwitch.props.value).toBe(true);

        // Toggling it off persists 'light' (a real handler, not a no-op).
        fireEvent(darkSwitch, 'valueChange', false);
        expect(mockSetTheme).toHaveBeenCalledTimes(1);
        expect(mockSetTheme).toHaveBeenCalledWith('light');

        // A switch toggle neither navigates nor opens a url.
        expect(mockPush).not.toHaveBeenCalled();
        expect(openURLSpy).not.toHaveBeenCalled();
    });

    it('NO row is a disabled-but-chevroned decoy: anything exposing accessibilityState.disabled===true fires no handler on press', () => {
        renderScreen();

        // Collect every pressable row (button + link roles) in the tree.
        const rows = [
            ...screen.queryAllByRole('button'),
            ...screen.queryAllByRole('link'),
        ];
        expect(rows.length).toBeGreaterThan(0);

        for (const row of rows) {
            const disabled = row.props.accessibilityState?.disabled === true;
            if (!disabled) continue;

            // A genuinely disabled row must fire NOTHING on press — no silent no-op
            // that merely looks tappable. (TouchableOpacity's `disabled` already
            // blocks onPress; this asserts the contract end-to-end.)
            fireEvent.press(row);
            expect(mockPush).not.toHaveBeenCalled();
            expect(openURLSpy).not.toHaveBeenCalled();
        }

        // With the Support urls wired, the live config exposes NO disabled row at
        // all — the honesty invariant: nothing is silently disabled.
        const disabledRows = rows.filter((r) => r.props.accessibilityState?.disabled === true);
        expect(disabledRows).toHaveLength(0);
    });

    it('does not leak a bare no-op tappable row: the count of interactive press targets equals the wired rows (9 nav + 2 link), each with a real handler', () => {
        renderScreen();

        // The Sign out control is also a 'button'; exclude it so we count only the
        // grouped settings rows. Every remaining button is a NAV_ROW, every link is
        // a LINK_ROW — i.e. there is no extra, unaccounted, dead tappable row.
        const settingButtons = screen
            .queryAllByRole('button')
            .filter((b) => b.props.accessibilityLabel !== 'Sign out');
        const links = screen.queryAllByRole('link');

        const buttonLabels = settingButtons.map((b) => b.props.accessibilityLabel).sort();
        const linkLabels = links.map((l) => l.props.accessibilityLabel).sort();

        expect(buttonLabels).toEqual(NAV_ROWS.map((r) => r.label).sort());
        expect(linkLabels).toEqual(LINK_ROWS.map((r) => r.label).sort());
    });
});
