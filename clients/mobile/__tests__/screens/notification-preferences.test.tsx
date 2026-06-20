/**
 * notification-preferences.test.tsx
 *
 * First screen-level coverage for the Notification Settings screen —
 * `app/(settings)/notification-preferences.tsx`.
 *
 * The screen reads the user's notification preferences off `@/api/notifications`
 * (`getNotificationPreferences`) via react-query, renders each boolean
 * preference as a labelled <Switch>, and persists edits with
 * `saveNotificationPreferences`. The shipped UX moved the SAVE feedback INLINE:
 * a successful/failed save no longer raises `Alert.alert` (which a screen reader
 * does not announce as a status) — instead it surfaces a GlassCard notice
 * carrying `accessibilityRole="alert"` + a polite live region, and the failure
 * variant offers a Retry that re-invokes the real save path. (The Disable-All
 * confirm and the system-settings deep-link STILL use Alert.alert by design —
 * they are not the save path and are out of scope here.)
 *
 * This suite pins the four load-bearing states so a future edit can't silently
 * regress them:
 *
 *   1. LOADING — while ['notification-preferences'] is `isLoading`, the screen
 *      mounts the Skeleton scaffold ONLY: no real preference rows, no <Switch>,
 *      and no leaked switch values / labels are in the tree yet.
 *   2. QUERY ERROR — on `isError` (and no cached prefs), the friendly EmptyState
 *      renders and its Retry calls `prefsQuery.refetch()` (scoped, exactly once),
 *      never a fabricated list.
 *   3. POPULATED — the prefs render as switches reflecting the server values;
 *      Save is DISABLED until an edit, and toggling a <Switch> flips its
 *      `accessibilityState.checked` AND enables Save.
 *   4a. SAVE SUCCESS — a successful save surfaces the INLINE 'Saved' GlassCard
 *       with `accessibilityRole="alert"` and raises NO `Alert.alert` (asserted
 *       via a spy).
 *   4b. SAVE FAILURE — a failed save surfaces the inline retryable status, and
 *       its Retry re-invokes the save mutation (re-calls saveNotificationPreferences).
 *
 * Mock conventions mirror the sibling screen suites:
 *   - `@tanstack/react-query` is stubbed: `useQuery` reads a mutable holder for
 *     ['notification-preferences'] (data / isLoading / isError / refetch) so each
 *     test picks its branch BEFORE render; `useMutation` CAPTURES the screen's
 *     onSuccess/onError config and returns a `mutate` that synchronously drives
 *     the configured outcome (mirrors circadian.test.tsx), so the screen's REAL
 *     onSuccess/onError logic (setHasChanges/setSaveStatus) runs without pulling
 *     in real react-query. `mutate` also records each call so the Retry re-invoke
 *     can be asserted.
 *   - `@/api/notifications` is a plain jest.fn module (the queryFn/mutationFn are
 *     never actually invoked — useQuery/useMutation are stubbed — but the screen
 *     imports them, and the suite asserts saveNotificationPreferences is wired as
 *     the mutationFn the mutate path re-invokes).
 *   - decorative glyphs → inert <Text>, deterministic insets, status-bar → null,
 *     expo-router → benign router, expo-linear-gradient → passthrough View (so the
 *     REAL EmptyState <Button> / GlassCard mount on the jest renderer).
 *   - the `@/components/ui` barrel + `@/theme` are deliberately REAL: assertions
 *     ride on the actual GlassCard (the inline status surface) + EmptyState copy +
 *     the real <Switch> accessibilityState — so a copy/role drift turns this RED.
 *   - `Alert.alert` is spied so the save-success test can prove it is NEVER raised
 *     on the save path (the inline GlassCard replaced it).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Mutable holder for the ['notification-preferences'] query. Each test mutates
// this BEFORE render() to pick the loading / error / populated branch. `refetch`
// is a stable spy so the query-error test can prove the EmptyState Retry is
// scoped to it (exactly once).
const mockPrefsRefetch = jest.fn();
type PrefsQueryState = {
    data: import('@/api/notifications').NotificationPreferences | undefined;
    isLoading: boolean;
    isError: boolean;
};
const mockPrefsQuery: PrefsQueryState = { data: undefined, isLoading: false, isError: false };

// Controllable mutation outcome. 'idle' → mutate captures the call but drives no
// callback; 'success' → mutate runs onSuccess; 'error' → mutate runs onError.
// `mockMutate` records every (args) so the Retry re-invoke is assertable.
type MutationMode = 'idle' | 'success' | 'error';
const mockMutation: { mode: MutationMode; isPending: boolean } = { mode: 'idle', isPending: false };
const mockMutate = jest.fn();

jest.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        if (queryKey[0] === 'notification-preferences') {
            return {
                data: mockPrefsQuery.data,
                isLoading: mockPrefsQuery.isLoading,
                isError: mockPrefsQuery.isError,
                refetch: mockPrefsRefetch,
            };
        }
        return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
    },
    // Capture the screen's onSuccess/onError and drive them synchronously per
    // mockMutation.mode so the screen's REAL save-feedback logic runs. The
    // mutationFn is preserved + invoked so the suite can prove the Retry path
    // actually calls saveNotificationPreferences (not a no-op).
    useMutation: (config: any) => ({
        isPending: mockMutation.isPending,
        mutate: (vars: unknown) => {
            mockMutate(vars);
            // Run the real mutationFn (saveNotificationPreferences) so the wiring
            // is exercised; it is a jest.fn in this suite so it resolves inertly.
            config?.mutationFn?.(vars);
            if (mockMutation.mode === 'success') {
                config?.onSuccess?.(undefined, vars, undefined);
            } else if (mockMutation.mode === 'error') {
                config?.onError?.(new Error('save failed'), vars, undefined);
            }
        },
    }),
}));

// The api module the screen statically imports. Plain jest.fns: the queryFn is
// never invoked (useQuery stubbed) and the mutationFn resolves inertly, but the
// suite asserts saveNotificationPreferences is the fn the mutate path calls.
jest.mock('@/api/notifications', () => ({
    getNotificationPreferences: jest.fn(),
    saveNotificationPreferences: jest.fn(() => Promise.resolve()),
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
import { Alert } from 'react-native';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
    ThemeContext,
    getThemeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
} from '@/theme';
import { saveNotificationPreferences, type NotificationPreferences } from '@/api/notifications';
import NotificationPreferencesScreen from '../../app/(settings)/notification-preferences';

const saveSpy = saveNotificationPreferences as jest.MockedFunction<typeof saveNotificationPreferences>;

// A fully-populated preferences object (all the boolean keys + quiet hours).
// `workoutReminderEnabled` starts true so toggling it flips checked → false.
const FULL_PREFS: NotificationPreferences = {
    workoutReminderEnabled: true,
    mealReminderEnabled: true,
    shiftAlertEnabled: true,
    planReadyEnabled: true,
    adherenceAlertEnabled: true,
    sleepReminderEnabled: true,
    streakUpdateEnabled: true,
    weeklyReportEnabled: true,
    coachMessageEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
};

function renderScreen() {
    return render(
        <ThemeContext.Provider
            value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
            <NotificationPreferencesScreen />
        </ThemeContext.Provider>,
    );
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    mockPrefsQuery.data = undefined;
    mockPrefsQuery.isLoading = false;
    mockPrefsQuery.isError = false;
    mockMutation.mode = 'idle';
    mockMutation.isPending = false;
    saveSpy.mockImplementation(() => Promise.resolve());
    // The shipped UX moved save feedback INLINE; spy so the success test can
    // assert Alert.alert is NEVER raised on the save path.
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    alertSpy.mockRestore();
});

describe('NotificationPreferencesScreen', () => {
    // ── State 1: LOADING → skeleton scaffold only ─────────────────────────────
    it('loading: mounts the skeleton scaffold only — no real preference rows or switch values leak', () => {
        mockPrefsQuery.isLoading = true;
        mockPrefsQuery.data = undefined;

        expect(() => renderScreen()).not.toThrow();

        // No real preference row labels are in the tree yet (the populated render
        // is gated behind the loaded prefs).
        expect(screen.queryByText('Workout Reminders')).toBeNull();
        expect(screen.queryByText('Meal & Nutrition')).toBeNull();
        expect(screen.queryByText('Coach Messages')).toBeNull();
        // No interactive switches, and the Quiet Hours section is not rendered.
        expect(screen.queryAllByRole('switch')).toHaveLength(0);
        expect(screen.queryByText('QUIET HOURS')).toBeNull();
        // No inline save-status surface before any save attempt.
        expect(screen.queryByTestId('save-status-success')).toBeNull();
        expect(screen.queryByTestId('save-status-error')).toBeNull();
        // The query fn must NOT have errored into the EmptyState path.
        expect(screen.queryByText("Couldn't load preferences")).toBeNull();
    });

    // ── State 2: QUERY ERROR → EmptyState whose Retry calls prefsQuery.refetch ─
    it('query error: shows the EmptyState and its Retry calls prefsQuery.refetch() exactly once', () => {
        mockPrefsQuery.isError = true;
        mockPrefsQuery.data = undefined;

        renderScreen();

        // The friendly retry state — not a spinner, not a fabricated list.
        expect(screen.getByText("Couldn't load preferences")).toBeTruthy();
        // No switches on the error screen.
        expect(screen.queryAllByRole('switch')).toHaveLength(0);

        // The EmptyState CTA is the only Retry on screen; pressing it fires the
        // scoped prefsQuery.refetch exactly once.
        fireEvent.press(screen.getByText('Try Again'));
        expect(mockPrefsRefetch).toHaveBeenCalledTimes(1);
    });

    // ── State 3: POPULATED → toggling a Switch flips checked + enables Save ────
    it('populated: renders switches from server prefs; Save is disabled until a toggle flips a switch', () => {
        mockPrefsQuery.data = { ...FULL_PREFS };

        renderScreen();

        // The boolean prefs render as labelled switches reflecting the server
        // values (all true here).
        const workoutSwitch = screen.getByLabelText('Workout Reminders');
        expect(workoutSwitch).toBeTruthy();
        expect(workoutSwitch.props.accessibilityState).toMatchObject({ checked: true });

        // Save starts DISABLED — nothing has changed yet.
        const save = screen.getByLabelText('Save notification preferences');
        expect(save.props.accessibilityState).toMatchObject({ disabled: true });

        // Toggling the switch flips its checked state to false AND enables Save.
        fireEvent(workoutSwitch, 'valueChange', false);

        expect(screen.getByLabelText('Workout Reminders').props.accessibilityState).toMatchObject({
            checked: false,
        });
        expect(
            screen.getByLabelText('Save notification preferences').props.accessibilityState,
        ).toMatchObject({ disabled: false });
    });

    // ── State 4a: SAVE SUCCESS → inline 'Saved' GlassCard, NO Alert.alert ─────
    it('save success: surfaces the inline "Saved" status with role=alert and raises NO Alert.alert', async () => {
        mockPrefsQuery.data = { ...FULL_PREFS };
        mockMutation.mode = 'success';

        renderScreen();

        // No status surface before a save.
        expect(screen.queryByTestId('save-status-success')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();

        // Make an edit so Save is enabled, then save.
        fireEvent(screen.getByLabelText('Workout Reminders'), 'valueChange', false);
        fireEvent.press(screen.getByLabelText('Save notification preferences'));

        // The mutation ran the real mutationFn (saveNotificationPreferences) and
        // the screen's onSuccess flipped saveStatus → 'success'.
        expect(mockMutate).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledTimes(1);

        // The INLINE GlassCard status surfaces, announced as an alert region.
        const statusCard = await screen.findByTestId('save-status-success');
        expect(statusCard).toBeTruthy();
        const alert = screen.getByRole('alert');
        expect(alert.props.accessibilityLiveRegion).toBe('polite');
        expect(screen.getByText('Saved. Your notification preferences have been updated.')).toBeTruthy();

        // CRITICAL: the save path raised NO Alert.alert (the inline GlassCard
        // replaced it).
        expect(alertSpy).not.toHaveBeenCalled();
    });

    // ── State 4b: SAVE FAILURE → inline retryable status; Retry re-saves ──────
    it('save failure: surfaces an inline retryable status with role=alert (no Alert.alert), and Retry re-invokes the save', async () => {
        mockPrefsQuery.data = { ...FULL_PREFS };
        mockMutation.mode = 'error';

        renderScreen();

        // Edit so Save is enabled, then trigger the failing save.
        fireEvent(screen.getByLabelText('Workout Reminders'), 'valueChange', false);
        fireEvent.press(screen.getByLabelText('Save notification preferences'));

        expect(mockMutate).toHaveBeenCalledTimes(1);

        // The inline error status surfaces (announced as an alert), NOT Alert.alert.
        const errorCard = await screen.findByTestId('save-status-error');
        expect(errorCard).toBeTruthy();
        expect(screen.getByText('Save failed')).toBeTruthy();
        const alert = screen.getByRole('alert');
        expect(alert.props.accessibilityLiveRegion).toBe('polite');
        expect(alertSpy).not.toHaveBeenCalled();

        // The Retry affordance re-invokes the save path (mutate fires again, and
        // the real saveNotificationPreferences is called once more).
        const retry = screen.getByTestId('save-status-retry');
        expect(retry.props.accessibilityRole).toBe('button');
        fireEvent.press(retry);

        expect(mockMutate).toHaveBeenCalledTimes(2);
        expect(saveSpy).toHaveBeenCalledTimes(2);
    });
});
