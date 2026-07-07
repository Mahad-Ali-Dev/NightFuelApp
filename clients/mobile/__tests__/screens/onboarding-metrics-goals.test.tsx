/**
 * onboarding-metrics-goals.test.tsx
 *
 * Screen-level coverage for the onboarding biological-profile step —
 * app/(onboarding)/metrics-goals.tsx — the cleanest not-yet-covered onboarding
 * input flow (previously referenced only as a redirect TARGET in
 * root-index.test.tsx). This suite pins the input-hardening + accessible
 * validation contract the step gained:
 *
 *   - INPUT BOUNDS: the numeric Weight (kg) / Height (cm) TextInputs carry a
 *     `maxLength={MEASUREMENT_MAX_LENGTH}` cap (so a worker cannot paste an
 *     arbitrarily long value) AND keep keyboardType="numeric". The cap is passed
 *     additively through the shared Input's ...props spread — Input.tsx itself is
 *     NOT modified (asserted indirectly: the real Input mounts and forwards the
 *     prop to its underlying TextInput).
 *
 *   - ACCESSIBLE VALIDATION: an over-long / invalid entry surfaces an inline
 *     summary that is a polite live region with accessibilityRole="alert" +
 *     accessibilityLiveRegion="polite" + a non-empty accessibilityLabel, so a
 *     screen reader announces it. (The shared Input's own per-field error <Text>
 *     is left as-is and has no alert role; this sibling node is the announcement.)
 *
 *   - DISABLED CONTINUE IS COMMUNICATED, NOT REMOVED: while inputs are invalid the
 *     "Continue" CtaButton stays MOUNTED and announces accessibilityState.disabled
 *     (the control is never hidden). A fully valid entry flips it enabled and
 *     pressing it advances via router.push('/(onboarding)/shift-type').
 *
 * Mock conventions mirror the sibling screen suites (profile-edit.bounds.test.tsx
 * / calendar.test.tsx): expo-router + the onboarding store are stubbed via the
 * hoisted `mock`-prefixed holder pattern, while @/components/ui and @/theme are
 * left REAL — the assertions ride on the actual CtaButton accessibilityState, the
 * real maxLength forwarded to the real Input's TextInput, and the screen's own
 * live-region alert. Only the native-module leaves the real components depend on
 * (gradient / blur / icons / status bar / date picker / safe-area) are stubbed to
 * passthroughs so the real tree mounts on the jest renderer.
 *
 * Rules cited (see ~/.claude/skills/react-native-skills/rules):
 *  - rendering-no-falsy-and.md: the live-region alert renders via an explicit
 *    ternary-null (`validationSummary ? <Text/> : null`) on a STRING summary
 *    ('' when clean) — never a leaked falsy `&&`. The "clean state has no alert"
 *    assertion pins that no empty-string node leaks.
 *  - ui-pressable.md (a11y) + state-ground-truth.md: the disabled state is derived
 *    from the screen's ground-truth `isValid` (DOB + weight + height + sex) and
 *    flows to the mounted CtaButton's accessibilityState.disabled — asserted here
 *    rather than the button disappearing.
 *  - ui-styling.md: the alert copy uses @/theme tokens (typography.caption +
 *    colors.error); the test asserts the role/label/live-region contract, not raw
 *    style.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router → a shared push spy so "advancing" is directly assertable.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Onboarding store — a mutable holder the screen reads at mount for its initial
// field values (DOB / weight / height / sex). Each test seeds `mockStore.data`
// BEFORE render(); `updateData` is a shared spy. metrics-goals calls
// `useOnboardingStore()` with NO selector and destructures { data, updateData }.
const mockUpdateData = jest.fn();
const mockStore: { data: any; updateData: jest.Mock } = {
  data: {},
  updateData: mockUpdateData,
};
jest.mock('@/store/onboardingStore', () => ({
  useOnboardingStore: () => mockStore,
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
// CtaButton (a coral LinearGradient fill) mounts on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// GlassCard wraps the biological-sex options in a SafeBlurView fill. Replace
// SafeBlurView with a passthrough View — preserving forwarded props/children —
// so the REAL GlassCard mounts deterministically regardless of the Android<12 path.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// Native date picker → host <View>; never opened here (the DOB is seeded via the
// store holder, so the picker trigger is not driven). Keeps the import graph
// resolvable through the REAL DateTimeField.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: Record<string, unknown>) => <View {...props} /> };
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
import BiologicalDataScreen, { MEASUREMENT_MAX_LENGTH } from '../../app/(onboarding)/metrics-goals';

// A real, valid past DOB the isValidDob() guard accepts (YYYY-MM-DD, in the past).
const VALID_DOB = '1990-05-15';

function renderWithTheme(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

function weightField() {
  return screen.getByLabelText('Weight (kg)');
}
function heightField() {
  return screen.getByLabelText('Height (cm)');
}
// The mounted Continue CTA — grabbed by its accessible label (CtaButton falls
// back accessibilityLabel → label). getByLabelText (not query) also asserts it
// is present in EVERY state under test (never hidden).
function continueButton() {
  return screen.getByLabelText('Continue');
}
function isDisabled(node: any): boolean {
  return node.props.accessibilityState?.disabled === true;
}

describe('BiologicalDataScreen (onboarding) — bounds + accessible validation + communicated-disabled Continue', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUpdateData.mockClear();
    // Default: empty profile so the step opens with Continue disabled and clean
    // (no inline errors until the worker types something invalid).
    mockStore.data = {};
  });

  test('the numeric weight/height inputs carry the maxLength bound and stay numeric', () => {
    renderWithTheme(<BiologicalDataScreen />);

    // The shared Input forwards ...props to its TextInput, so the additive
    // maxLength cap (and the numeric keyboard) land on the real underlying field.
    [weightField(), heightField()].forEach((field) => {
      // The resolved element is the underlying host TextInput (its accessible
      // label was set additively via the Input's ...props spread).
      expect(field.type).toBe('TextInput');
      expect(field.props.maxLength).toBe(MEASUREMENT_MAX_LENGTH);
      expect(field.props.keyboardType).toBe('numeric');
    });
    // Sanity-check the cap is a sensible small bound (fits the backend (0,600] /
    // (0,300] ranges with room for one decimal, e.g. "600.5").
    expect(MEASUREMENT_MAX_LENGTH).toBe(6);
  });

  test('an over-long / invalid weight surfaces an accessible inline alert (role=alert + polite live region)', () => {
    renderWithTheme(<BiologicalDataScreen />);

    // No alert while the inputs are still clean (pins the ternary-null guard: an
    // empty-string summary renders nothing, never a leaked falsy node).
    expect(screen.queryByRole('alert')).toBeNull();

    // A non-numeric paste (parseFloat → NaN, not > 0) trips the weight validator.
    fireEvent.changeText(weightField(), 'abcdef');

    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    // The announcement is a polite live region with a non-empty accessible label
    // (the active error copy) — exactly the a11y contract the shared Input lacks.
    const announced = alerts.find((a) => a.props.accessibilityLiveRegion === 'polite');
    expect(announced).toBeTruthy();
    expect(typeof announced?.props.accessibilityLabel).toBe('string');
    expect((announced?.props.accessibilityLabel as string).length).toBeGreaterThan(0);
  });

  test('while inputs are invalid the Continue control is MOUNTED and announces disabled (not removed)', () => {
    // Seed an otherwise-complete profile, then type an invalid weight so the
    // step is incomplete for a reason other than "not filled in".
    mockStore.data = { dateOfBirth: VALID_DOB, biologicalSex: 'MALE' };
    renderWithTheme(<BiologicalDataScreen />);

    fireEvent.changeText(heightField(), '180');
    fireEvent.changeText(weightField(), 'abc'); // NaN → invalid

    const cta = continueButton(); // getByLabelText → also proves it is still mounted
    expect(isDisabled(cta)).toBe(true);

    // Pressing the disabled control does NOT advance.
    fireEvent.press(cta);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('an empty step keeps Continue mounted + disabled (communicated, never hidden)', () => {
    renderWithTheme(<BiologicalDataScreen />);

    const cta = continueButton();
    expect(isDisabled(cta)).toBe(true);
    // No inline alert yet — nothing has been typed, so there is nothing to announce.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a fully valid entry enables Continue and advancing calls router.push to the next step', () => {
    // DOB + sex seeded; weight + height typed as valid numbers → isValid true.
    // MALE here so the cycle-basics step is SKIPPED (the original next step).
    mockStore.data = { dateOfBirth: VALID_DOB, biologicalSex: 'MALE' };
    renderWithTheme(<BiologicalDataScreen />);

    fireEvent.changeText(weightField(), '72');
    fireEvent.changeText(heightField(), '168');

    const cta = continueButton();
    expect(isDisabled(cta)).toBe(false);
    // A valid state shows no validation alert.
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.press(cta);

    // It persists the entry to the onboarding store…
    expect(mockUpdateData).toHaveBeenCalledTimes(1);
    expect(mockUpdateData.mock.calls[0][0]).toMatchObject({
      dateOfBirth: VALID_DOB,
      weightKg: 72,
      heightCm: 168,
      biologicalSex: 'MALE',
    });
    // …and advances to the next onboarding step exactly once.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/shift-type');
  });

  // ── Conditional cycle step routing (F25) ───────────────────────────────────

  test('FEMALE routes to the OPT-IN cycle-basics step (not straight to shift-type)', () => {
    mockStore.data = { dateOfBirth: VALID_DOB, biologicalSex: 'FEMALE' };
    renderWithTheme(<BiologicalDataScreen />);

    fireEvent.changeText(weightField(), '72');
    fireEvent.changeText(heightField(), '168');

    fireEvent.press(continueButton());

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/cycle-basics');
    expect(mockPush).not.toHaveBeenCalledWith('/(onboarding)/shift-type');
  });

  test.each(['MALE', 'OTHER', 'PREFER_NOT_TO_SAY'])(
    'non-female (%s) SKIPS the cycle step and goes straight to shift-type (unchanged flow)',
    (sexValue) => {
      mockStore.data = { dateOfBirth: VALID_DOB, biologicalSex: sexValue };
      renderWithTheme(<BiologicalDataScreen />);

      fireEvent.changeText(weightField(), '80');
      fireEvent.changeText(heightField(), '180');

      fireEvent.press(continueButton());

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(onboarding)/shift-type');
      expect(mockPush).not.toHaveBeenCalledWith('/(onboarding)/cycle-basics');
    },
  );
});
