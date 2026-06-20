/**
 * settings-index.test.tsx
 *
 * Screen-level coverage for the Settings root — `app/(settings)/index.tsx` —
 * focused on the destructive "Log Out" control.
 *
 * Logging out is a deliberate, destructive account action (it clears the
 * session and bounces to the auth stack), so it MUST be gated behind an
 * explicit confirmation rather than firing on the first tap. This is the
 * textbook-legitimate `Alert.alert` use. This suite pins that contract:
 *
 *   - the Log Out row is queryable by its accessibility role + label;
 *   - pressing Log Out does NOT call `logout()` immediately — it surfaces a
 *     confirm prompt via `Alert.alert` whose buttons include an explicit
 *     Cancel (style 'cancel') and a destructive Log Out (style 'destructive');
 *   - invoking the captured destructive button calls `logout()` exactly once
 *     and then navigates to the auth stack;
 *   - invoking the captured Cancel button calls `logout()` ZERO times and does
 *     not navigate.
 *
 * Additive + verify-only: NEW test file only.
 *
 * Mock conventions mirror the sibling screen suites (devices.test.tsx) and the
 * proven Settings-screen recipe in __tests__/theme/nightReadProvider.test.tsx:
 * `Alert.alert` is spied so the buttons array is captured and driven directly;
 * `useAuthStore` exposes a `getState().logout` spy; expo-router is stubbed;
 * react-query / API / native-loader modules are neutralised so the screen
 * mounts on the jest renderer.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// `useAuthStore` is read as a hook (`{ user }`) AND statically via
// `useAuthStore.getState().logout()` in the Log Out handler. Provide both
// shapes; `mock`-prefixed holder satisfies babel-plugin-jest-hoist's closure
// rule so a test can assert against the same logout spy the screen invokes.
const mockLogout = jest.fn(async () => undefined);
jest.mock('@/store/authStore', () => {
    const useAuthStore: any = () => ({ user: { name: 'Test User', email: 't@example.com' } });
    useAuthStore.getState = () => ({ logout: mockLogout });
    return { useAuthStore };
});

// themeStore: the screen destructures this slice for the Dark Mode / Night Read
// switches. A static holder is enough — those switches are not under test here.
jest.mock('@/store/themeStore', () => ({
    useThemeStore: () => ({
        theme: 'dark',
        setTheme: jest.fn(),
        isDarkTheme: () => true,
        nightRead: false,
        setNightRead: jest.fn(),
    }),
}));

// expo-router: capture `replace` so the post-confirm navigation is assertable.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

// react-query: the screen fires 'user-profile' and 'subscription-status'
// queries. Return benign empty success for both so the row config is static.
jest.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
}));

// API modules are statically imported by the screen; stub the named exports so
// the real axios client never loads (useQuery is mocked, so these never run).
jest.mock('@/api/users', () => ({ getProfile: jest.fn() }));
jest.mock('@/api/subscriptions', () => ({ getStatus: jest.fn() }));

// Decorative glyphs → plain <Text> surfacing the icon name so they are inert
// and never collide with assertable copy.
jest.mock('@expo/vector-icons', () => {
    const { Text: RNText } = require('react-native');
    return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-image / expo-linear-gradient use native loaders → passthrough host views.
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

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
    ThemeContext,
    getThemeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
} from '@/theme';
import SettingsIndexScreen from '../../app/(settings)/index';

type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };

function renderScreen() {
    return render(
        <ThemeContext.Provider
            value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
            <SettingsIndexScreen />
        </ThemeContext.Provider>,
    );
}

// Resolve the single Log Out row by its accessibility role + label. Two other
// nodes carry a 'Log Out'-ish label space (none do here), so we pin role+label.
function getLogoutRow() {
    return screen
        .getAllByLabelText('Log Out')
        .find((n) => n.props.accessibilityRole === 'button')!;
}

// The most recent Alert.alert call's buttons array, with helpers to find the
// Cancel and the destructive confirm buttons by their declared style.
function lastAlertButtons(): AlertButton[] {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const buttons = calls[calls.length - 1][2] as AlertButton[];
    expect(Array.isArray(buttons)).toBe(true);
    return buttons;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    // Spy on Alert.alert so we capture the buttons array WITHOUT showing a
    // native alert. It is inert (no auto-press) — the test drives the handlers.
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    alertSpy.mockRestore();
});

describe('Settings screen — Log Out confirmation gate', () => {
    it('exposes the Log Out control by its accessibility role + label', () => {
        renderScreen();

        const row = getLogoutRow();
        expect(row).toBeTruthy();
        expect(row.props.accessibilityRole).toBe('button');
        expect(row.props.accessibilityLabel).toBe('Log Out');
    });

    it('does NOT call logout immediately on press — it surfaces a confirm prompt', () => {
        renderScreen();

        fireEvent.press(getLogoutRow());

        // The destructive action is gated: no logout, no navigation on first tap.
        expect(mockLogout).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();

        // A confirmation prompt was raised instead.
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
        expect(String(title)).toMatch(/log out/i);
        expect(String(message)).toMatch(/\?$/); // it asks a question
        expect(Array.isArray(buttons)).toBe(true);

        // The prompt offers an explicit Cancel and a destructive confirm.
        const cancel = (buttons as AlertButton[]).find((b) => b.style === 'cancel');
        const destructive = (buttons as AlertButton[]).find((b) => b.style === 'destructive');
        expect(cancel).toBeTruthy();
        expect(destructive).toBeTruthy();
        expect(typeof destructive!.onPress).toBe('function');
    });

    it('invoking the destructive confirm button calls logout exactly once and navigates', async () => {
        renderScreen();

        fireEvent.press(getLogoutRow());

        const destructive = lastAlertButtons().find((b) => b.style === 'destructive')!;
        await destructive.onPress!();

        expect(mockLogout).toHaveBeenCalledTimes(1);
        // Only after confirming does it leave for the auth stack.
        expect(mockReplace).toHaveBeenCalledTimes(1);
        expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });

    it('invoking the Cancel button calls logout ZERO times and does not navigate', async () => {
        renderScreen();

        fireEvent.press(getLogoutRow());

        const cancel = lastAlertButtons().find((b) => b.style === 'cancel')!;
        // Cancel may legitimately omit an onPress (dismiss-only). If present, it
        // must be a pure no-op for the destructive action.
        if (typeof cancel.onPress === 'function') {
            await cancel.onPress();
        }

        expect(mockLogout).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
    });
});
