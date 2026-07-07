/**
 * devices.test.tsx
 *
 * Screen-level coverage for the Connected Devices screen —
 * `app/(settings)/devices.tsx`.
 *
 * The screen lists the three supported health sources off the health-sync seam
 * (`@/lib/healthSync`), each as a GlassCard row with a Connect <CtaButton> and a
 * Sync-now affordance. The DEFAULT adapter shipped in Expo Go is a no-op: its
 * `connect()` / `syncNow()` resolve (never throw) to a `{ status: 'unavailable',
 * reason }` result whose reason explains a native dev build is required. The
 * screen MUST surface that reason verbatim and MUST NEVER fake a "Connected"
 * state.
 *
 * This suite mocks `@/lib/healthSync` so the adapter is a controllable spy
 * resolving the honest unavailable result, and asserts:
 *   1. a light render lists all three sources, each with Connect + "Never synced"
 *      + a Sync-now control, and shows no fabricated "Connected" status;
 *   2. pressing Connect surfaces the honest "requires a native dev build"
 *      message — and never a fake success;
 *   3. pressing Sync now drives the same honest path via `syncNow()`;
 *   4. the Connect + Sync controls are reachable by accessibility ROLE + NAME
 *      (descriptive accessibilityLabels), carry an honest disabled:false state +
 *      hint, and meet the 44pt touch-target minimum;
 *   5. the honest reason renders inside an `accessibilityRole="alert"` notice via
 *      the ternary-null guard (no alert before an attempt → no falsy leak);
 *   6. after an unavailable attempt the controls ANNOUNCE the unavailable state
 *      through their accessible names while never claiming "Connected".
 *
 * The real `@/lib/healthSync.types` (pure type + const declarations, zero native
 * deps) is left un-mocked so the source labels are exercised for real. Mock
 * conventions (icon → text, gradient → passthrough View, deterministic insets)
 * mirror the sibling screen suites (dashboard.cta / aiPlanner).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// The honest unavailable reason the no-op adapter returns. Must contain the
// phrase the UI shows and this suite asserts ("requires a native dev build").
const MOCK_UNAVAILABLE_REASON =
    'Health sync requires a native dev build — it is unavailable in Expo Go.';

// Controllable adapter spies. `connect` / `syncNow` default to the honest
// unavailable result; a test may override per case. `lastSyncedAt` → null so
// every row renders "Never synced". `getStatus` → 'unavailable' (ground truth).
// Returns are annotated where a union is needed (no `jest.fn<…>` generic, which
// differs across jest type versions — annotate the callback instead).
const mockConnect = jest.fn(
    async (): Promise<import('@/lib/healthSync.types').HealthSyncResult> => ({
        status: 'unavailable',
        reason: MOCK_UNAVAILABLE_REASON,
    }),
);
const mockSyncNow = jest.fn(
    async (): Promise<import('@/lib/healthSync.types').HealthSyncResult> => ({
        status: 'unavailable',
        reason: MOCK_UNAVAILABLE_REASON,
    }),
);
const mockLastSyncedAt = jest.fn((): string | null => null);
const mockGetStatus = jest.fn((): string => 'unavailable');
const mockDisconnect = jest.fn(async (): Promise<void> => undefined);

const mockAdapter = {
    connect: mockConnect,
    disconnect: mockDisconnect,
    getStatus: mockGetStatus,
    syncNow: mockSyncNow,
    lastSyncedAt: mockLastSyncedAt,
};

// Mock the health-sync seam: the screen imports `getHealthSyncAdapter` +
// `SUPPORTED_HEALTH_SOURCES` from here. We provide the real three sources and
// the controllable adapter. (`mock`-prefixed holders satisfy babel-plugin-jest
// -hoist's closure rule.)
jest.mock('@/lib/healthSync', () => ({
    getHealthSyncAdapter: () => mockAdapter,
    SUPPORTED_HEALTH_SOURCES: ['apple_health', 'google_fit', 'generic_ble'] as const,
    NOOP_UNAVAILABLE_REASON: MOCK_UNAVAILABLE_REASON,
}));

// expo-router: a benign router; `back` is the only control this screen calls.
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: jest.fn(),
}));

// BLE manager is a separate seam (direct Bluetooth) the generic_ble row reads —
// mock it so the health-source test doesn't pull in AsyncStorage / ble-plx.
jest.mock('@/lib/ble/bleManager', () => ({
    bleManager: {
        getStatusForRow: () => 'disconnected',
        lastReadingAt: () => null,
        isSupported: () => false,
    },
}));

// Decorative glyphs → plain <Text> surfacing the icon name so they are inert
// and never collide with assertable copy.
jest.mock('@expo/vector-icons', () => {
    const { Text: RNText } = require('react-native');
    return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// expo-linear-gradient ships a native module — replace <LinearGradient> with a
// passthrough View so the REAL CtaButton primitive mounts on the jest renderer.
jest.mock('expo-linear-gradient', () => {
    const RN = require('react-native');
    return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
    ThemeContext,
    getThemeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
} from '@/theme';
import ConnectedDevicesScreen from '../../app/(settings)/devices';

function renderScreen() {
    return render(
        <ThemeContext.Provider
            value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
            <ConnectedDevicesScreen />
        </ThemeContext.Provider>,
    );
}

/**
 * Flatten a node's `style` to a single object regardless of shape. A
 * TouchableOpacity's style is a (possibly nested) array; the CtaButton root
 * Pressable's style is a FUNCTION `({ pressed }) => StyleProp` — so we call it
 * with the resting (`pressed: false`) state first, then flatten. This lets a
 * single helper assert the resolved 44pt touch target on BOTH the Connect
 * Pressable and the Sync TouchableOpacity.
 */
function flattenStyle(style: unknown): Record<string, unknown> {
    const resolved = typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
    return StyleSheet.flatten(resolved as never) ?? {};
}

beforeEach(() => {
    jest.clearAllMocks();
    // Restore the honest defaults after clearAllMocks wipes implementations.
    mockConnect.mockImplementation(async () => ({ status: 'unavailable', reason: MOCK_UNAVAILABLE_REASON }));
    mockSyncNow.mockImplementation(async () => ({ status: 'unavailable', reason: MOCK_UNAVAILABLE_REASON }));
    mockLastSyncedAt.mockImplementation(() => null);
    mockGetStatus.mockImplementation(() => 'unavailable');
});

describe('Connected Devices screen', () => {
    it('lists the three supported sources, each with Connect + a never-synced state + Sync now', () => {
        renderScreen();

        // All three sources are listed by their canonical labels.
        expect(screen.getByText('Apple Health')).toBeTruthy();
        expect(screen.getByText('Google Fit')).toBeTruthy();
        expect(screen.getByText('Bluetooth Device')).toBeTruthy();

        // Each row exposes a Connect CtaButton (pinned by its stable testID,
        // which CtaButton forwards to its root Pressable) and a Sync-now control.
        expect(screen.getByTestId('connect-apple_health')).toBeTruthy();
        expect(screen.getByTestId('connect-google_fit')).toBeTruthy();
        expect(screen.getByTestId('connect-generic_ble')).toBeTruthy();
        expect(screen.getByTestId('sync-apple_health')).toBeTruthy();
        expect(screen.getByTestId('sync-google_fit')).toBeTruthy();
        expect(screen.getByTestId('sync-generic_ble')).toBeTruthy();

        // last-synced derives from the adapter (null → "Never synced") on each row.
        expect(screen.getAllByText('Never synced')).toHaveLength(3);
        expect(mockLastSyncedAt).toHaveBeenCalled();

        // No fabricated "Connected" status anywhere (the header title is the
        // distinct string "Connected Devices", not a bare "Connected").
        expect(screen.queryByText('Connected')).toBeNull();
        // The honest reason has not yet been triggered (no attempt made).
        expect(screen.queryByText(MOCK_UNAVAILABLE_REASON)).toBeNull();
    });

    it('exposes an accessible Connect control and Sync control per source', () => {
        renderScreen();

        // Every actionable control carries an explicit accessibilityLabel.
        expect(screen.getByLabelText('Connect Apple Health')).toBeTruthy();
        expect(screen.getByLabelText('Connect Google Fit')).toBeTruthy();
        expect(screen.getByLabelText('Connect Bluetooth Device')).toBeTruthy();
        expect(screen.getByLabelText('Sync Apple Health now')).toBeTruthy();
        expect(screen.getByLabelText('Go back')).toBeTruthy();
    });

    it('on Connect resolving unavailable, surfaces the honest "requires a native dev build" message — never a fake success', async () => {
        renderScreen();

        fireEvent.press(screen.getByTestId('connect-apple_health'));

        // The adapter's honest reason is shown verbatim.
        await waitFor(() => expect(screen.getByText(MOCK_UNAVAILABLE_REASON)).toBeTruthy());
        expect(screen.getByText(/requires a native dev build/i)).toBeTruthy();
        expect(mockConnect).toHaveBeenCalledTimes(1);

        // It NEVER claims a connection succeeded. The regex is anchored to the
        // START so it matches a standalone "Connected"/"Connected!" success claim
        // only — NOT the redesign's honest summary copy ("/ 3 connected") or the
        // "Not connected" status pill, both of which legitimately end in
        // "connected" and must not be read as a fabricated success.
        expect(screen.queryByText('Connected')).toBeNull();
        expect(screen.queryByText(/^connected!?$/i)).toBeNull();
    });

    it('on Sync now resolving unavailable, drives syncNow() and surfaces the same honest message', async () => {
        renderScreen();

        fireEvent.press(screen.getByTestId('sync-google_fit'));

        await waitFor(() => expect(screen.getByText(MOCK_UNAVAILABLE_REASON)).toBeTruthy());
        expect(mockSyncNow).toHaveBeenCalledTimes(1);
        // Connect was NOT called by a Sync-now press.
        expect(mockConnect).not.toHaveBeenCalled();
        expect(screen.queryByText('Connected')).toBeNull();
    });

    it('does not fabricate a success even when the adapter reports unavailable without a reason', async () => {
        // A future adapter could omit `reason`; the screen must still NOT claim
        // success — it shows a safe fallback sentence instead.
        mockConnect.mockImplementation(async () => ({ status: 'unavailable' }));

        renderScreen();
        fireEvent.press(screen.getByTestId('connect-google_fit'));

        await waitFor(() =>
            expect(screen.getByText('This source is unavailable on the current build.')).toBeTruthy(),
        );
        expect(screen.queryByText('Connected')).toBeNull();
    });

    // ── Added: a11y-robustness coverage (extends the suite, does not collide) ──

    it('exposes the Connect + Sync controls by role with descriptive names that meet the 44pt touch target', () => {
        renderScreen();

        // Both affordances are reachable by accessibility ROLE + NAME (the
        // accessible name comes from the explicit accessibilityLabel), not just
        // by testID — a real screen-reader user can find them.
        const connect = screen.getByRole('button', { name: 'Connect Apple Health' });
        const sync = screen.getByRole('button', { name: 'Sync Apple Health now' });

        // The same nodes are the stable testID handles the screen documents.
        expect(connect).toBe(screen.getByTestId('connect-apple_health'));
        expect(sync).toBe(screen.getByTestId('sync-apple_health'));

        // The Sync control carries an explicit hint + an HONEST (never faked)
        // disabled:false state — it stays pressable so a tap surfaces the reason.
        expect(sync.props.accessibilityHint).toMatch(/sync/i);
        expect(sync.props.accessibilityState).toMatchObject({ disabled: false });

        // Both resolved touch targets meet the 44pt minimum. The Connect node is
        // the CtaButton root Pressable (function style, resolved at rest); the
        // Sync node is a TouchableOpacity (array style). connectBtn forwards
        // minHeight:44 over sm's intrinsic 40, and syncBtn declares minHeight:44.
        expect(flattenStyle(connect.props.style).minHeight).toBe(44);
        expect(flattenStyle(sync.props.style).minHeight).toBe(44);
    });

    it('renders the honest reason inside an accessibilityRole="alert" notice on an unavailable Connect', async () => {
        renderScreen();

        // No alert before any attempt — the ternary-null guard renders nothing,
        // so an absent message can never leak a falsy node into the tree.
        expect(screen.queryByRole('alert')).toBeNull();

        fireEvent.press(screen.getByTestId('connect-apple_health'));

        // After the unavailable result the reason surfaces inside an alert region
        // (announced by a screen reader), carrying the verbatim adapter reason.
        const alert = await screen.findByRole('alert');
        expect(alert).toBeTruthy();
        expect(screen.getByText(MOCK_UNAVAILABLE_REASON)).toBeTruthy();
        // Exactly one row surfaced a notice (the one we pressed), not all three.
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('after an unavailable attempt the controls announce the honest unavailable state — never a fake "Connected"', async () => {
        renderScreen();

        fireEvent.press(screen.getByTestId('sync-google_fit'));
        await waitFor(() => expect(screen.getByText(MOCK_UNAVAILABLE_REASON)).toBeTruthy());

        // The pressed row's controls now ANNOUNCE the unavailable result via
        // their accessible names (honest a11y), while the unpressed rows keep
        // their plain names — and nothing anywhere claims "Connected".
        expect(screen.getByRole('button', { name: 'Sync Google Fit now, currently unavailable' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Connect Google Fit, currently unavailable' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Sync Apple Health now' })).toBeTruthy();
        // The Sync control is still honestly NOT disabled (re-pressable).
        expect(
            screen.getByRole('button', { name: 'Sync Google Fit now, currently unavailable' }).props
                .accessibilityState,
        ).toMatchObject({ disabled: false });
        // Anchored to the START so it catches only a standalone "Connected"
        // success claim — not the redesign's honest "/ N connected" summary copy
        // or the "Not connected" status pill (both legitimately end in
        // "connected" without claiming a fabricated success).
        expect(screen.queryByText('Connected')).toBeNull();
        expect(screen.queryByText(/^connected!?$/i)).toBeNull();
    });

    // ── Added: sync-feedback state transitions (#7 stale label, #11 silent success) ──

    it('#7 refreshes the "Last synced" label after a SUCCESSFUL sync even with no prior notice', async () => {
        // The adapter advances its last-synced timestamp on success. Model that:
        // lastSyncedAt() returns null until syncNow() resolves connected, then an
        // ISO string. The DERIVED label must move from "Never synced" to the
        // formatted value — i.e. the row must re-render on a plain success (which
        // changes no message), not stay stale.
        const SYNCED_ISO = '2026-06-20T08:30:00.000Z';
        let synced: string | null = null;
        mockLastSyncedAt.mockImplementation(() => synced);
        mockSyncNow.mockImplementation(async () => {
            synced = SYNCED_ISO;
            return { status: 'connected' };
        });

        renderScreen();

        // Before the sync: all three rows read the adapter's null → "Never synced".
        expect(screen.getAllByText('Never synced')).toHaveLength(3);

        fireEvent.press(screen.getByTestId('sync-apple_health'));

        // After a plain success the rows re-derive lastSyncedAt() and the stale
        // "Never synced" is replaced by a real "Last synced …" label (#7). (The
        // mock's lastSyncedAt() is global, so all rows re-read the same advanced
        // value — the point is the label is no longer stale at "Never synced".)
        await waitFor(() => expect(screen.getAllByText(/^Last synced /).length).toBeGreaterThan(0));
        // The two HEALTH rows refreshed; generic_ble (BLE) is a SEPARATE source
        // that didn't sync, so it legitimately stays "Never synced".
        expect(screen.getAllByText('Never synced')).toHaveLength(1);
        expect(mockSyncNow).toHaveBeenCalledTimes(1);
        // A plain success surfaces NO notice and NEVER fakes a banner reason.
        expect(screen.queryByTestId('notice-apple_health')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('#11 surfaces a benign "nothing new" confirmation on a CONNECTED result that carries a reason', async () => {
        // healthSyncNative returns { status: 'connected', reason: 'No new health
        // data to sync.' } when a sync succeeds but finds nothing. The screen
        // previously CLEARED the reason on connected → zero user feedback. It must
        // now surface the reason as a benign info confirmation.
        const NOTHING_NEW = 'No new health data to sync.';
        mockSyncNow.mockImplementation(async () => ({ status: 'connected', reason: NOTHING_NEW }));

        renderScreen();
        fireEvent.press(screen.getByTestId('sync-google_fit'));

        // The confirmation text is shown to the user (no more silent success).
        await waitFor(() => expect(screen.getByText(NOTHING_NEW)).toBeTruthy());
        expect(screen.getByTestId('notice-google_fit')).toBeTruthy();

        // It is an HONEST success, not an error: the controls must NOT announce
        // "currently unavailable", and it is NOT an alert region.
        expect(screen.getByRole('button', { name: 'Sync Google Fit now' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Connect Google Fit' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /currently unavailable/ })).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        // And never a fabricated "Connected" badge.
        expect(screen.queryByText('Connected')).toBeNull();
    });

    it('#11/#7 a benign confirmation clears once a later plain success returns no reason', async () => {
        const NOTHING_NEW = 'No new health data to sync.';
        // First sync: connected-with-reason. Second sync: plain connected.
        mockSyncNow
            .mockImplementationOnce(async () => ({ status: 'connected', reason: NOTHING_NEW }))
            .mockImplementationOnce(async () => ({ status: 'connected' }));

        renderScreen();

        fireEvent.press(screen.getByTestId('sync-google_fit'));
        await waitFor(() => expect(screen.getByText(NOTHING_NEW)).toBeTruthy());

        // A subsequent plain success drops the confirmation (no stale notice).
        fireEvent.press(screen.getByTestId('sync-google_fit'));
        // Explicit 5s timeout: the two-sync state settle can exceed waitFor's
        // default 1s under full-suite load (passes in isolation at ~1.3s), which
        // made this assertion flaky on a busy gate run. The behavior is correct;
        // the default was just too impatient.
        await waitFor(() => expect(screen.queryByText(NOTHING_NEW)).toBeNull(), { timeout: 5000 });
        expect(screen.queryByTestId('notice-google_fit')).toBeNull();
        expect(mockSyncNow).toHaveBeenCalledTimes(2);
    });
});
