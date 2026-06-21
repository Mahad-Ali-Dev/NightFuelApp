/**
 * privacy-data.test.tsx
 *
 * Screen-level coverage for app/(settings)/privacy-data.tsx — the GDPR
 * data-export + account-deletion surface that wires F37 (GET /v1/users/me/export)
 * and F36 (DELETE /v1/users/me) into the app.
 *
 * Contracts pinned:
 *   EXPORT
 *     - pressing "Export my data" calls exportMyData() (the F37 endpoint) and
 *       hands the returned JSON to the OS share sheet (React Native `Share.share`);
 *   DELETE — confirmation gating
 *     - the Delete CTA is DISABLED until the user types DELETE exactly;
 *     - once armed, pressing it does NOT delete immediately — it raises a final
 *       destructive confirm (Alert) with an explicit Cancel + destructive Delete;
 *     - Cancel calls deleteAccount() ZERO times and does not navigate;
 *     - confirming calls deleteAccount() (the F36 endpoint) exactly once, then
 *       clears the session (authStore.logout) and replaces to the auth stack.
 *
 * Additive + verify-only: NEW test file only. Mock conventions mirror
 * settings-index.test.tsx (Alert spied & driven directly; useAuthStore exposes a
 * getState().logout spy; expo-router stubbed; native loaders neutralised). The
 * real react-query is used with a fresh QueryClient so the mutations actually run.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// API layer: spy the two new wrappers so we can assert the endpoints fire.
const mockExportMyData = jest.fn(async () => ({ data: { user: { id: 'u1' }, meals: [] } }));
const mockDeleteAccount = jest.fn(async () => ({ data: {} }));
jest.mock('@/api/users', () => ({
    exportMyData: () => mockExportMyData(),
    deleteAccount: () => mockDeleteAccount(),
}));

// authStore: the delete success path calls useAuthStore.getState().logout().
const mockLogout = jest.fn(async () => undefined);
jest.mock('@/store/authStore', () => {
    const useAuthStore: any = () => ({});
    useAuthStore.getState = () => ({ logout: mockLogout });
    return { useAuthStore };
});

// expo-router: capture replace/back so navigation is assertable.
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

// expo-file-system/legacy: provide a writable dir + writeAsStringAsync spy so
// the export flow takes the file-write branch.
const mockWriteFile = jest.fn(async (_uri: string, _contents: string) => undefined);
jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///docs/',
    cacheDirectory: 'file:///cache/',
    writeAsStringAsync: (uri: string, contents: string) => mockWriteFile(uri, contents),
}));

// Decorative glyphs → inert <Text>.
jest.mock('@expo/vector-icons', () => {
    const { Text: RNText } = require('react-native');
    return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// GlassCard wraps children in SafeBlurView (native). Render a plain passthrough
// so children mount on the jest renderer; forward testID.
jest.mock('@/components/ui', () => {
    const RN = require('react-native');
    return {
        GlassCard: ({ children, testID }: any) => <RN.View testID={testID}>{children}</RN.View>,
        CtaButton: ({ label, onPress, loading, testID, accessibilityLabel }: any) => (
            <RN.Pressable
                testID={testID}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={{ disabled: !!loading, busy: !!loading }}
                onPress={onPress}
            >
                <RN.Text>{label}</RN.Text>
            </RN.Pressable>
        ),
        Input: ({ onChangeText, value, testID, accessibilityLabel, placeholder }: any) => (
            <RN.TextInput
                testID={testID}
                accessibilityLabel={accessibilityLabel}
                placeholder={placeholder}
                value={value}
                onChangeText={onChangeText}
            />
        ),
    };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Alert, Share } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    ThemeContext,
    getThemeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
} from '@/theme';
import PrivacyDataScreen from '../../app/(settings)/privacy-data';

type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };

function renderScreen() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <ThemeContext.Provider
                value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
            >
                <PrivacyDataScreen />
            </ThemeContext.Provider>
        </QueryClientProvider>,
    );
}

function getDeleteCta() {
    return screen.getByTestId('delete-cta');
}

function lastAlertButtons(): AlertButton[] {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const buttons = calls[calls.length - 1][2] as AlertButton[];
    expect(Array.isArray(buttons)).toBe(true);
    return buttons;
}

let alertSpy: jest.SpyInstance;
let shareSpy: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
});

afterEach(() => {
    alertSpy.mockRestore();
    shareSpy.mockRestore();
});

describe('Privacy & Data — export', () => {
    it('calls exportMyData and shares the returned data via the OS share sheet', async () => {
        renderScreen();

        fireEvent.press(screen.getByTestId('export-cta'));

        await waitFor(() => expect(mockExportMyData).toHaveBeenCalledTimes(1));
        // The export payload was written to a file and handed to Share.share.
        await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
        expect(mockWriteFile).toHaveBeenCalledTimes(1);

        const fileUri = mockWriteFile.mock.calls[0]![0];
        expect(fileUri).toContain('zeitra-data-export');
        expect(fileUri).toMatch(/\.json$/);

        // The shared file URL is the file we just wrote.
        const shareArg = (shareSpy.mock.calls[0] as any[])[0] as { url?: string; message?: string };
        expect(shareArg.url).toBe(fileUri);
        // And the JSON body reflects the exported payload.
        expect(String(shareArg.message)).toContain('u1');

        // Inline success surface appears.
        await waitFor(() => expect(screen.getByTestId('export-status-success')).toBeTruthy());
    });

    it('surfaces an error status when the export endpoint fails', async () => {
        mockExportMyData.mockRejectedValueOnce(new Error('boom'));
        renderScreen();

        fireEvent.press(screen.getByTestId('export-cta'));

        await waitFor(() => expect(screen.getByTestId('export-status-error')).toBeTruthy());
        expect(shareSpy).not.toHaveBeenCalled();
    });
});

describe('Privacy & Data — delete account confirmation gate', () => {
    it('keeps the Delete CTA disabled until DELETE is typed exactly', () => {
        renderScreen();

        // Initially disabled.
        expect(getDeleteCta().props.accessibilityState?.disabled).toBe(true);

        // Wrong text → still disabled.
        fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'delete me');
        expect(getDeleteCta().props.accessibilityState?.disabled).toBe(true);

        // Exact word (case-insensitive, trimmed) → armed.
        fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
        expect(getDeleteCta().props.accessibilityState?.disabled).toBe(false);
    });

    it('does NOT call deleteAccount while the gate is unarmed', () => {
        renderScreen();

        fireEvent.press(getDeleteCta());

        expect(mockDeleteAccount).not.toHaveBeenCalled();
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('once armed, pressing Delete raises a destructive confirm instead of deleting immediately', () => {
        renderScreen();
        fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');

        fireEvent.press(getDeleteCta());

        expect(mockDeleteAccount).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();

        expect(Alert.alert).toHaveBeenCalledTimes(1);
        const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
        expect(String(title)).toMatch(/delete/i);
        expect(String(message)).toMatch(/permanent|cannot be undone|irreversible/i);
        const cancel = (buttons as AlertButton[]).find((b) => b.style === 'cancel');
        const destructive = (buttons as AlertButton[]).find((b) => b.style === 'destructive');
        expect(cancel).toBeTruthy();
        expect(destructive).toBeTruthy();
    });

    it('confirming calls deleteAccount once, clears the session and navigates to login', async () => {
        renderScreen();
        fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
        fireEvent.press(getDeleteCta());

        const destructive = lastAlertButtons().find((b) => b.style === 'destructive')!;
        await destructive.onPress!();

        await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
    });

    it('cancelling the confirm calls deleteAccount ZERO times and does not navigate', async () => {
        renderScreen();
        fireEvent.changeText(screen.getByTestId('delete-confirm-input'), 'DELETE');
        fireEvent.press(getDeleteCta());

        const cancel = lastAlertButtons().find((b) => b.style === 'cancel')!;
        if (typeof cancel.onPress === 'function') {
            await cancel.onPress();
        }

        expect(mockDeleteAccount).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
        expect(mockLogout).not.toHaveBeenCalled();
    });
});
