/**
 * onboarding-profile-summary.test.tsx
 *
 * Screen-level locking coverage for the FINAL onboarding step —
 * app/(onboarding)/profile-summary.tsx — specifically the guarded
 * shift-persistence the step gained on "Finish & Sync" (Flow G).
 *
 * Background: shiftType is a REQUIRED onboarding selection (sleep-schedule.tsx
 * persists it into the onboarding store) but the original handleFinish only
 * sent the profile + preferences + onboarding-complete payloads — it never
 * created a Shift. A brand-new user therefore finished with NO Shift row, so
 * getCurrent() returned null, the dashboard hero read "No active shift", and the
 * circadian tab's ['circadian-model'] query (enabled only when a current shift
 * exists) stayed disabled. The fix adds a best-effort createShift, derived from
 * the collected sleep window, AFTER the existing calls succeed.
 *
 * This suite pins two contracts:
 *
 *   1. PERSISTED SHIFT: finishing calls createShift exactly once, carrying the
 *      shiftType collected in onboarding (e.g. 'FIXED_NIGHT') plus a shiftDate
 *      and ISO start/end times derived from the sleep window.
 *
 *   2. NON-BLOCKING: the new createShift step is best-effort — when it REJECTS,
 *      onboarding still completes (router.replace('/(tabs)') still runs). Its
 *      failure must never strand the user on the summary screen.
 *
 * Mock conventions mirror onboarding-metrics-goals.test.tsx: expo-router + the
 * onboarding store are stubbed via the hoisted `mock`-prefixed holder pattern;
 * @/components/ui and @/theme are left REAL so the assertions ride on the actual
 * CtaButton (its accessibilityLabel falls back to its `label`). The api layers
 * (@/api/users, @/api/shifts) and the auth store are mocked, and the native-only
 * leaves the real tree depends on (gradient / blur / icons / status bar /
 * safe-area) are stubbed to passthroughs so the real components mount on the
 * jest renderer. Social/chat are not imported by this screen.
 *
 * Rules cited (see ~/.claude/skills/react-native-skills/rules):
 *  - rendering-no-falsy-and.md: the screen's summary JSX already guards optional
 *    fields with `?? undefined` / ternaries; the fix is async logic only and
 *    adds no new JSX, so no falsy-`&&` leak is introduced. The "completion still
 *    runs on reject" test indirectly pins that the guard never throws into render.
 *  - ui-pressable.md (a11y): the Finish control is grabbed by its accessible
 *    label (CtaButton label fallback) — proving it stays a real, labelled button.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router → a shared replace spy so the final redirect is directly assertable.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

// Onboarding store — a mutable holder the screen reads at mount. profile-summary
// calls useOnboardingStore() with NO selector and destructures { data }, and on
// finish calls useOnboardingStore.getState().reset() to clear the persisted
// health-PII draft (F22). The mock exposes both the hook and a static getState().
const mockReset = jest.fn();
const mockStore: { data: any } = { data: {} };
jest.mock('@/store/onboardingStore', () => {
  const hook: any = () => mockStore;
  hook.getState = () => ({ data: mockStore.data, reset: mockReset });
  return { useOnboardingStore: hook };
});

// Auth store — the screen destructures { updateUser }; a shared spy is enough.
const mockUpdateUser = jest.fn();
jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ updateUser: mockUpdateUser }),
}));

// User API — all three onboarding writes resolve so the success path reaches the
// new guarded shift-creation block and the final redirect.
const mockUpdateProfile = jest.fn().mockResolvedValue({ data: {} });
const mockUpdatePreferences = jest.fn().mockResolvedValue({ data: {} });
const mockUpdateOnboarding = jest.fn().mockResolvedValue({ data: {} });
jest.mock('@/api/users', () => ({
  updateProfile: (...args: any[]) => mockUpdateProfile(...args),
  updatePreferences: (...args: any[]) => mockUpdatePreferences(...args),
  updateOnboarding: (...args: any[]) => mockUpdateOnboarding(...args),
}));

// Shifts API — the unit under test. `create` is the named export the screen
// imports as `createShift`.
const mockCreateShift = jest.fn().mockResolvedValue({ id: 'shift_1' });
jest.mock('@/api/shifts', () => ({
  create: (...args: any[]) => mockCreateShift(...args),
}));

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
// CtaButton (a coral LinearGradient fill) + the hero badge gradient mount.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// GlassCard wraps the summary in a SafeBlurView fill. Replace SafeBlurView with a
// passthrough View — preserving forwarded props/children — so the REAL GlassCard
// mounts deterministically regardless of the Android<12 path.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import ProfileSummaryScreen from '../../app/(onboarding)/profile-summary';

// A fully-populated onboarding payload, including the REQUIRED shiftType and the
// sleep window the fix derives the shift start/end from.
function populatedData() {
  return {
    dateOfBirth: '1990-05-15',
    biologicalSex: 'MALE',
    heightCm: 180,
    weightKg: 80,
    fitnessGoal: 'FAT_LOSS',
    lifestyleType: 'NIGHT_SHIFT_WORKER',
    experienceLevel: 'INTERMEDIATE',
    activityLevel: 'MODERATELY_ACTIVE',
    shiftType: 'FIXED_NIGHT',
    sleepWindowStart: '08:00',
    sleepWindowEnd: '16:00',
    dietaryPreference: 'NONE',
    dietMode: 'BALANCED',
    healthConditions: [],
  };
}

function renderWithTheme(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

// The mounted Finish CTA — grabbed by its accessible label (CtaButton falls back
// accessibilityLabel → label).
function finishButton() {
  return screen.getByLabelText('Finish & Sync');
}

describe('ProfileSummaryScreen (onboarding) — guarded shift persistence on finish (Flow G)', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUpdateUser.mockClear();
    mockUpdateProfile.mockClear();
    mockUpdatePreferences.mockClear();
    mockUpdateOnboarding.mockClear();
    mockCreateShift.mockReset();
    mockCreateShift.mockResolvedValue({ id: 'shift_1' });
    mockStore.data = populatedData();
  });

  test('finishing persists the collected shiftType via createShift exactly once (with derived date + ISO window)', async () => {
    renderWithTheme(<ProfileSummaryScreen />);

    fireEvent.press(finishButton());

    // The existing onboarding writes still fire…
    await waitFor(() => expect(mockUpdateOnboarding).toHaveBeenCalledTimes(1));
    // …and the new guarded shift-creation runs exactly once.
    await waitFor(() => expect(mockCreateShift).toHaveBeenCalledTimes(1));

    const payload = mockCreateShift.mock.calls[0][0];
    // It carries the shiftType collected in onboarding — the dropped field this fixes.
    expect(payload.shiftType).toBe(mockStore.data.shiftType);
    expect(payload.shiftType).toBe('FIXED_NIGHT');
    // shiftDate is a YYYY-MM-DD calendar day…
    expect(payload.shiftDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // …and start/end are real ISO timestamps derived from the sleep window
    // (here a same-day window: 08:00 → 16:00, end > start, so no day roll).
    expect(typeof payload.startTime).toBe('string');
    expect(typeof payload.endTime).toBe('string');
    expect(() => new Date(payload.startTime).toISOString()).not.toThrow();
    expect(new Date(payload.endTime).getTime()).toBeGreaterThan(new Date(payload.startTime).getTime());

    // Completion still redirects to the dashboard.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  test('a REJECTED createShift does NOT block completion — router.replace still runs', async () => {
    mockCreateShift.mockRejectedValueOnce(new Error('shift-service down'));
    renderWithTheme(<ProfileSummaryScreen />);

    fireEvent.press(finishButton());

    // The shift step was attempted…
    await waitFor(() => expect(mockCreateShift).toHaveBeenCalledTimes(1));
    // …but its failure is swallowed: onboarding completion still redirects.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test('with no sleep window collected, the shift step is SKIPPED but completion still runs', async () => {
    mockStore.data = { ...populatedData(), sleepWindowStart: null, sleepWindowEnd: null };
    renderWithTheme(<ProfileSummaryScreen />);

    fireEvent.press(finishButton());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    // No times to derive → no fabricated shift is sent.
    expect(mockCreateShift).not.toHaveBeenCalled();
  });
});
