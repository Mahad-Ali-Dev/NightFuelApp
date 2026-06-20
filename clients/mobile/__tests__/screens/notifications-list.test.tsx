/**
 * notifications-list.test.tsx
 *
 * First screen-level coverage for the in-app NOTIFICATION LIST screen —
 * `app/(settings)/notifications.tsx` (DISTINCT from notification-preferences.tsx,
 * which is the boolean-Switch settings form). This screen is a FlatList of
 * `@/api/notifications.getAll` rows with a per-row `markRead` mutation; it has NO
 * Switch rows and NO next-fire time math.
 *
 * This suite pins the load-bearing honest states + the guarded timestamp so a
 * future edit can't silently regress them:
 *
 *   1. LOADING (state-ground-truth) — while ['notifications'] is `isLoading`, the
 *      screen mounts its Skeleton row scaffold ONLY: real <Skeleton> blocks are in
 *      the tree, the FlatList has NOT mounted (so no real rows / EmptyState leak),
 *      and none of the error / empty copy is present.
 *   2. QUERY ERROR — on `isError`, the friendly "Couldn't load notifications"
 *      EmptyState renders and its "Try Again" action calls the query's `refetch`
 *      exactly once (never a fabricated list).
 *   3. EMPTY [] — a resolved-empty query renders the FlatList's ListEmptyComponent
 *      EmptyState ("No notifications yet") and no rows.
 *   4. TIMESTAMP GUARD (rendering-no-falsy-and / js-hoist-intl) — a row with a
 *      malformed/empty `createdAt` renders a BLANK date string (never the literal
 *      "Invalid Date" that `new Date('').toLocaleDateString()` would yield), while a
 *      valid `createdAt` renders a real locale date.
 *   5. ROW A11Y + markRead (ui-pressable) — each row exposes
 *      accessibilityRole="button" + the UNREAD-qualified accessibilityLabel
 *      ("Unread. <title>. <body>"); tapping an UNREAD row calls markRead's mutate
 *      once with that row's id, while tapping a READ row calls it zero times (the
 *      onPress is guarded by `!item.read`).
 *   6. MARK-READ FAILURE → inline GlassCard alert (replaces Alert.alert) — when the
 *      markRead mutation FAILS, the screen surfaces the inline GlassCard status
 *      (testID `mark-read-error`) announced via accessibilityRole="alert" + a
 *      polite live region (NOT Alert.alert), and its Retry re-invokes markRead's
 *      mutate exactly once with the failed id (a genuine retry, never a fabricated
 *      success).
 *   7. MARK-READ SUCCESS → no alert, invalidates ['notifications'] — when the
 *      markRead mutation SUCCEEDS, NO inline alert renders and the screen
 *      invalidates the ['notifications'] query so the list refetches.
 *
 * react-native-skills cited & how this suite locks them:
 *   - state-ground-truth: the screen renders straight off the query's
 *     isLoading/isError/data ground truth — Test 1/2/3 assert each branch is driven
 *     ONLY by that state (the FlatList is absent until data resolves).
 *   - rendering-no-falsy-and: the createdAt cell is a ternary returning '' (never a
 *     bare `{x && …}` that could leak a falsy/`Invalid Date`) — Test 4 locks that
 *     the malformed row's date is exactly '' and never "Invalid Date".
 *   - js-hoist-intl: `toLocaleDateString()` formats the valid date — Test 4 pins a
 *     deterministic locale render (Date is mocked for tz-stability).
 *   - ui-pressable: the row is the screen's only press target — Test 5 rides on its
 *     accessibilityRole/label and proves the unread-only markRead wiring.
 *
 * Mock conventions mirror the sibling screen suites (notification-preferences.test.tsx
 * / leaderboard.states.test.tsx):
 *   - `@tanstack/react-query` stubbed: `useQuery` reads a mutable holder for
 *     ['notifications'] (data / isLoading / isError / refetch) so each test picks its
 *     branch BEFORE render; `useMutation` returns a captured `mutate` spy (markRead)
 *     and `useQueryClient` exposes an inert invalidateQueries.
 *   - `@/api/notifications` is a plain jest.fn module (getAll / markRead) so the real
 *     axios client never loads; useQuery/useMutation are stubbed, so they only
 *     satisfy the import graph.
 *   - decorative glyphs → inert <Text>, deterministic insets, status-bar → null,
 *     expo-router → benign router, expo-linear-gradient → passthrough View (so the
 *     REAL EmptyState <Button> mounts on the jest renderer).
 *   - the `@/components/ui` barrel + `@/theme` are deliberately REAL — assertions
 *     ride on the actual EmptyState copy + the real <Skeleton>, so a copy/role drift
 *     turns this RED.
 *
 * Additive: NEW test file only (paired with the dead-`Switch`-import removal).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Mutable holder for the ['notifications'] query. Each test mutates this BEFORE
// render() (the factory reads it at call-time) to pick the loading / error /
// populated branch. `refetch` is a stable spy so the error test can prove the
// EmptyState "Try Again" is scoped to it (exactly once).
const mockRefetch = jest.fn();
type NotifQueryState = { data: any; isLoading: boolean; isError: boolean };
const mockNotifQuery: NotifQueryState = { data: undefined, isLoading: false, isError: false };

// The markRead mutation's `mutate` spy — the row's onPress (and the inline-error
// Retry) call this with the row id (guarded by `!item.read`). It records every
// call so the unread-only wiring AND the Retry re-invoke (with the failed id) are
// assertable.
const mockMutate = jest.fn();

// Controllable mark-read mutation outcome (mirrors notification-preferences.test).
// 'idle' → mutate captures the call but drives no callback (tests 1-5 want this so
// onSuccess/onError don't fire); 'success' → mutate runs the screen's onSuccess;
// 'error' → mutate runs the screen's onError with the passed id as the variables
// arg (TanStack onError signature is (error, variables, context)) — that id is
// what the screen stores as the failed id.
type MutationMode = 'idle' | 'success' | 'error';
const mockMutation: { mode: MutationMode; isPending: boolean } = { mode: 'idle', isPending: false };

// Stable invalidateQueries spy so the success-path test can assert the screen
// invalidates the ['notifications'] query (a fresh jest.fn per call would not be
// observable across the render).
const mockInvalidate = jest.fn(() => Promise.resolve());

// react-query: branch useQuery on queryKey[0] so ['notifications'] reads the
// holder above + the shared refetch spy. useMutation CAPTURES the screen's
// onSuccess/onError config and drives them synchronously per mockMutation.mode so
// the screen's REAL mark-read feedback logic (setMarkReadError / invalidate) runs
// without pulling in real react-query; `mockMutate` records each (vars) so the
// unread-only wiring + the Retry re-invoke are assertable. useQueryClient exposes
// the stable invalidate spy (called in onSuccess).
jest.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        if (queryKey[0] === 'notifications') {
            return {
                data: mockNotifQuery.data,
                isLoading: mockNotifQuery.isLoading,
                isError: mockNotifQuery.isError,
                refetch: mockRefetch,
            };
        }
        return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
    },
    useMutation: (config: any) => ({
        isPending: mockMutation.isPending,
        isError: false,
        reset: jest.fn(),
        mutate: (vars: unknown) => {
            mockMutate(vars);
            if (mockMutation.mode === 'success') {
                config?.onSuccess?.(undefined, vars, undefined);
            } else if (mockMutation.mode === 'error') {
                config?.onError?.(new Error('mark-read failed'), vars, undefined);
            }
        },
    }),
    useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// The api module the screen statically imports. Plain jest.fns: useQuery /
// useMutation are stubbed above, so these are never actually invoked — they only
// satisfy the import graph (and keep the real axios client from loading).
// `Notification` is a type-only import (erased by Babel), so no runtime export is
// needed for it.
jest.mock('@/api/notifications', () => ({
    getAll: jest.fn(),
    markRead: jest.fn(),
}));

// expo-router: a benign router; `back` is the only control this screen calls.
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name so they are inert and
// never collide with assertable copy.
jest.mock('@expo/vector-icons', () => {
    const { Text: RNText } = require('react-native');
    return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// expo-linear-gradient ships a native module — replace <LinearGradient> with a
// passthrough View so the REAL EmptyState <Button> mounts on the jest renderer.
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
import { FlatList, View } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
    ThemeContext,
    getThemeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
} from '@/theme';
import type { Notification } from '@/api/notifications';
import NotificationsScreen from '../../app/(settings)/notifications';

// The elevated-surface color every <Skeleton> block paints itself with (see
// Skeleton.tsx → colors.background.tertiary). Used to fingerprint skeleton host
// Views in the loading scaffold without depending on the memo wrapper identity.
const SKELETON_BG = getThemeColors('dark').background.tertiary;

function flattenStyle(style: unknown): Record<string, unknown> {
    if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
    return (style as Record<string, unknown>) ?? {};
}

// Count host Views that look like a Skeleton block: the elevated-surface
// background + a pulse `opacity` in the animation's [0.4, 1] range. This is the
// same static fingerprint Skeleton's own unit test asserts, so it's a robust
// positive signal the honest loading scaffold (not real rows) is on screen.
function countSkeletonBlocks(): number {
    return screen.root.findAllByType(View).filter((node: any) => {
        const style = flattenStyle(node.props.style);
        if (style.backgroundColor !== SKELETON_BG) return false;
        const opacity = Number(style.opacity);
        return !Number.isNaN(opacity) && opacity >= 0.4 && opacity <= 1;
    }).length;
}

function renderScreen() {
    return render(
        <ThemeContext.Provider
            value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
            <NotificationsScreen />
        </ThemeContext.Provider>,
    );
}

// A small fixture factory: one row, defaulting to a VALID createdAt + read=false.
function makeNotification(overrides: Partial<Notification> = {}): Notification {
    return {
        id: 'n1',
        userId: 'u1',
        type: 'workout',
        title: 'Time to train',
        body: 'Your scheduled workout is ready.',
        read: false,
        createdAt: '2026-06-13T00:00:00.000Z',
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockNotifQuery.data = undefined;
    mockNotifQuery.isLoading = false;
    mockNotifQuery.isError = false;
    // Default the mutation to idle so tests 1-5 capture mutate() calls WITHOUT
    // firing the screen's onSuccess/onError (the failure/success suites opt in).
    mockMutation.mode = 'idle';
    mockMutation.isPending = false;
});

describe('NotificationsScreen (in-app notification list)', () => {
    // ── State 1: LOADING → skeleton row scaffold only (no leaked rows) ─────────
    it('loading: mounts the Skeleton row scaffold only — no real rows or EmptyState leak', () => {
        mockNotifQuery.isLoading = true;
        mockNotifQuery.data = undefined;

        expect(() => renderScreen()).not.toThrow();

        // The loading branch renders the real <Skeleton> scaffold (6 rows × 4
        // blocks each) — a positive signal the honest placeholder is on screen.
        // Fingerprinted by the skeleton's elevated-surface bg + pulse opacity so
        // the assertion survives the React.memo wrapper.
        expect(countSkeletonBlocks()).toBeGreaterThanOrEqual(4);

        // The FlatList only mounts in the resolved branch, so no real row content
        // and no EmptyState copy can leak while loading.
        expect(screen.root.findAllByType(FlatList)).toHaveLength(0);
        expect(screen.queryByText('No notifications yet')).toBeNull();
        expect(screen.queryByText("Couldn't load notifications")).toBeNull();
        expect(screen.queryByText('Time to train')).toBeNull();

        // The header title renders in every branch — a sanity check the screen mounted.
        expect(screen.getByText('Notifications')).toBeTruthy();
    });

    // ── State 2: QUERY ERROR → EmptyState whose Try Again calls refetch once ───
    it('query error: shows the EmptyState and its Try Again calls refetch() exactly once', () => {
        mockNotifQuery.isError = true;
        mockNotifQuery.data = undefined;

        renderScreen();

        // The friendly retry state — not a spinner, not a fabricated list.
        expect(screen.getByText("Couldn't load notifications")).toBeTruthy();
        // The FlatList (and thus any rows / the empty state) is not mounted on error.
        expect(screen.root.findAllByType(FlatList)).toHaveLength(0);
        expect(screen.queryByText('No notifications yet')).toBeNull();

        // The EmptyState CTA is the only "Try Again" on screen; pressing it fires the
        // scoped refetch exactly once (and never the markRead mutation).
        fireEvent.press(screen.getByText('Try Again'));
        expect(mockRefetch).toHaveBeenCalledTimes(1);
        expect(mockMutate).not.toHaveBeenCalled();
    });

    // ── State 3: EMPTY [] → FlatList ListEmptyComponent EmptyState ─────────────
    it('empty []: renders the ListEmptyComponent "No notifications yet" EmptyState and no rows', () => {
        mockNotifQuery.data = [];

        renderScreen();

        // The FlatList mounted (resolved branch) and surfaced its ListEmptyComponent.
        expect(screen.root.findAllByType(FlatList)).toHaveLength(1);
        expect(screen.getByText('No notifications yet')).toBeTruthy();
        // No error copy, and no fabricated rows.
        expect(screen.queryByText("Couldn't load notifications")).toBeNull();
        expect(screen.queryByText('Time to train')).toBeNull();
    });

    // ── State 4: TIMESTAMP GUARD → blank date for malformed, locale date valid ─
    it('timestamp guard: a malformed/empty createdAt renders a BLANK date (never "Invalid Date"); a valid one renders a locale date', () => {
        const goodIso = '2026-06-13T00:00:00.000Z';
        // toLocaleDateString is locale/tz-dependent on the runner — pin it to a
        // deterministic, recognizable token so the assertion is stable AND we can
        // prove the malformed row never reaches the formatter.
        const dateProto = Date.prototype as any;
        const localeSpy = jest
            .spyOn(dateProto, 'toLocaleDateString')
            .mockReturnValue('JUN-13-2026');

        mockNotifQuery.data = [
            // Malformed createdAt: `new Date('not-a-date')` is Invalid → the guard
            // must short-circuit to '' and NEVER call toLocaleDateString (which
            // would yield the literal "Invalid Date").
            makeNotification({ id: 'bad', title: 'Bad date row', body: 'malformed ts', createdAt: 'not-a-date' }),
            // Empty createdAt: `''` is falsy → same blank-date path.
            makeNotification({ id: 'empty', title: 'Empty date row', body: 'empty ts', createdAt: '' }),
            // Valid createdAt → renders the (mocked) locale date.
            makeNotification({ id: 'good', title: 'Good date row', body: 'valid ts', createdAt: goodIso }),
        ];

        try {
            renderScreen();

            // The literal "Invalid Date" never appears anywhere in the tree.
            expect(screen.queryByText('Invalid Date')).toBeNull();
            // The valid row shows the formatted locale date.
            expect(screen.getByText('JUN-13-2026')).toBeTruthy();
            // Exactly one row reached the formatter (the valid one); the two
            // malformed rows short-circuited to '' before calling it.
            expect(localeSpy).toHaveBeenCalledTimes(1);
            // All three rows still render their title (the bad-date rows are not dropped).
            expect(screen.getByText('Bad date row')).toBeTruthy();
            expect(screen.getByText('Empty date row')).toBeTruthy();
            expect(screen.getByText('Good date row')).toBeTruthy();
        } finally {
            localeSpy.mockRestore();
        }
    });

    // ── State 5: ROW A11Y + unread-only markRead wiring ────────────────────────
    it('rows expose accessibilityRole="button" + an unread-qualified label, and tapping an unread row calls markRead once with its id', () => {
        mockNotifQuery.data = [
            makeNotification({ id: 'unread-1', title: 'New PR', body: 'You hit a new best.', read: false }),
            makeNotification({ id: 'read-1', title: 'Old alert', body: 'Already seen.', read: true }),
        ];

        renderScreen();

        // The UNREAD row carries the unread-qualified label ("Unread. <title>. <body>")
        // and is a button.
        const unreadRow = screen.getByLabelText('Unread. New PR. You hit a new best.');
        expect(unreadRow.props.accessibilityRole).toBe('button');

        // The READ row drops the "Unread. " prefix (its label is just "<title>. <body>")
        // and is also a button.
        const readRow = screen.getByLabelText('Old alert. Already seen.');
        expect(readRow.props.accessibilityRole).toBe('button');

        // Tapping the UNREAD row marks it read exactly once, with THIS row's id.
        fireEvent.press(unreadRow);
        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(mockMutate).toHaveBeenCalledWith('unread-1');

        // Tapping the already-READ row is a no-op (onPress is guarded by `!item.read`),
        // so markRead is never fired again.
        fireEvent.press(readRow);
        expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    // ── State 6: MARK-READ FAILURE → inline GlassCard alert (no Alert.alert) ────
    it('mark-read failure: surfaces the inline GlassCard alert (role=alert, polite live region) and its Retry re-invokes markRead once with the failed id', async () => {
        // The mutation will FAIL: the screen's onError fires with the tapped id as
        // the variables arg, and the screen stores it as the failed id.
        mockMutation.mode = 'error';
        mockNotifQuery.data = [
            makeNotification({ id: 'unread-1', title: 'New PR', body: 'You hit a new best.', read: false }),
        ];

        renderScreen();

        // No inline alert before any mark-read attempt.
        expect(screen.queryByTestId('mark-read-error')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();

        // Tap the unread row → markRead fires (recorded) and, because the mutation
        // fails, the screen's onError sets the failed id.
        fireEvent.press(screen.getByLabelText('Unread. New PR. You hit a new best.'));
        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(mockMutate).toHaveBeenCalledWith('unread-1');

        // The INLINE GlassCard failure surface renders (testID-addressable),
        // announced as a polite alert region — NOT Alert.alert.
        const errorCard = await screen.findByTestId('mark-read-error');
        expect(errorCard).toBeTruthy();
        expect(screen.getByText("Couldn't mark as read")).toBeTruthy();
        const alert = screen.getByRole('alert');
        expect(alert.props.accessibilityLiveRegion).toBe('polite');

        // The Retry affordance is an independently-focusable button that re-invokes
        // markRead's mutate exactly once MORE with the SAME failed id — a genuine
        // retry of the failed id, never a fabricated success.
        const retry = screen.getByTestId('mark-read-error-retry');
        expect(retry.props.accessibilityRole).toBe('button');
        fireEvent.press(retry);
        expect(mockMutate).toHaveBeenCalledTimes(2);
        expect(mockMutate).toHaveBeenNthCalledWith(2, 'unread-1');
    });

    // ── State 7: MARK-READ SUCCESS → no alert, invalidates ['notifications'] ────
    it('mark-read success: renders NO inline alert and invalidates the ["notifications"] query', () => {
        // The mutation will SUCCEED: the screen's onSuccess clears any failed id and
        // invalidates the list query.
        mockMutation.mode = 'success';
        mockNotifQuery.data = [
            makeNotification({ id: 'unread-1', title: 'New PR', body: 'You hit a new best.', read: false }),
        ];

        renderScreen();

        // Tap the unread row → markRead fires and succeeds.
        fireEvent.press(screen.getByLabelText('Unread. New PR. You hit a new best.'));
        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(mockMutate).toHaveBeenCalledWith('unread-1');

        // NO inline failure alert on the success path.
        expect(screen.queryByTestId('mark-read-error')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByText("Couldn't mark as read")).toBeNull();

        // The screen invalidated the ['notifications'] query so the list refetches.
        expect(mockInvalidate).toHaveBeenCalledTimes(1);
        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    });
});
