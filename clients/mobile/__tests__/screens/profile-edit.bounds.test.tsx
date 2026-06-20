/**
 * profile-edit.bounds.test.tsx
 *
 * Client-side mirror of the user-service `updateProfileSchema` bounds, pinned at
 * the two screens that actually edit those fields (ANTI-DORMANT — both are live
 * editors, neither is a polished-in-isolation component):
 *
 *   - app/(tabs)/profile/edit.tsx is the LIVE profile editor (the updateProfile
 *     PUT, Save disabled while the mutation is pending). It edits the display
 *     name (server: displayName z.string().min(2).max(64)). There are NO
 *     height/weight fields here.
 *   - app/(performance)/body-metrics.tsx is where weight is edited (server:
 *     weightKg z.coerce.number().positive().max(600) → (0, 600]; height shares the
 *     same family with heightCm …positive().max(300) → (0, 300]).
 *
 * This suite asserts the FULL bound mirror + the accessible validation contract:
 *
 *   profile-edit:
 *     - an out-of-bounds display name — length 1, length 65, and whitespace-only —
 *       keeps BOTH Save controls (the header "Save" and the bottom "Save changes"
 *       primary Button) disabled (accessibilityState.disabled) AND blocks the
 *       updateProfile mutation (mutate is never called);
 *     - a valid display name (length 2 and length 64, the inclusive edges) enables
 *       Save and fires updateProfile EXACTLY ONCE per press;
 *     - while invalid, the inline validation copy is present AND accessible — it
 *       carries accessibilityRole="alert" + accessibilityLiveRegion="polite" so a
 *       screen reader announces it (react-native-skills: a11y live-region +
 *       disabled-state).
 *
 *   body-metrics (separate describe):
 *     - an out-of-bounds weight — 601 (> max), 0 (not strictly positive) and a
 *       non-numeric "abc" (→ NaN) — keeps "Save snapshot" disabled
 *       (accessibilityState.disabled) AND blocks the logBodyMetrics mutation;
 *     - an in-range weight at the inclusive max (600) enables it and fires the
 *       mutation EXACTLY ONCE;
 *     - the inline validation copy is present + accessible (role="alert" +
 *       live-region "polite");
 *     - the CLIENT bound constants exported by both screens equal the user-service
 *       schema bounds (displayName 2..64, height (0,300], weight (0,600]).
 *
 * Mock conventions mirror the sibling screen suites (body-metrics.test.tsx /
 * userProfile.test.tsx): the hoisted `mock`-prefixed holder pattern (the prefix
 * lets babel-plugin-jest-hoist allow the factory to close over the holder),
 * react-query fully stubbed so neither screen touches axios, the API modules
 * stubbed to plain jest.fns, and gradient/blur/image/icon passthroughs so the
 * REAL Button / GlassCard / fields mount on the jest renderer. The validation +
 * the `@/components/ui` barrel are left REAL — the assertions ride on the actual
 * disabled state, the real inline alert copy, and the real mutate spy.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// react-query is fully stubbed. `useMutation` captures the screen's lifecycle
// config and returns a SHARED `mutate` spy (so the test can assert call counts)
// whose `isPending` is read from a mutable holder. `useQuery` returns the profile
// for ['my-profile'] (so profile/edit renders its form, not the skeleton) and a
// benign empty history for ['body-metrics']. `useQueryClient` is a no-op.
const mockMutate = jest.fn();
const mockMutation = { isPending: false };
const mockProfile: { data: any } = {
  data: { id: 'u1', name: 'Original Name', aboutMe: '', occupation: '', avatarUrl: null },
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'my-profile') {
      return { data: mockProfile.data, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'body-metrics') {
      return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: (_config: any) => ({ mutate: mockMutate, isPending: mockMutation.isPending }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API modules the screens statically import — stub to plain jest.fns so the real
// axios client (via @/api/client) never loads. useQuery / useMutation are fully
// stubbed above, so these are never actually invoked; they only satisfy the
// import graph.
jest.mock('@/api/profile', () => ({ getMyProfile: jest.fn(), updateProfile: jest.fn() }));
jest.mock('@/api/progress', () => ({ getBodyMetrics: jest.fn(), logBodyMetrics: jest.fn() }));

// expo-image-picker ships a native module — the profile editor imports it for the
// avatar picker (never pressed here). Stub the one fn it touches.
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

// expo-image → passthrough View (the avatar uses it).
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screens lay out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient ships a native module — passthrough View so the primary
// "Save changes" Button (a coral LinearGradient fill) mounts on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test (body-metrics imports it).
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// body-metrics wraps its form in the GlassCard primitive (a SafeBlurView fill).
// Replace SafeBlurView with a passthrough View — preserving forwarded props — so
// the REAL GlassCard mounts deterministically regardless of the Android<12 path.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

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
import EditProfileScreen, {
  DISPLAY_NAME_MIN,
  DISPLAY_NAME_MAX,
} from '../../app/(tabs)/profile/edit';
import BodyMetricsScreen, {
  HEIGHT_CM_MAX,
  WEIGHT_KG_MAX,
} from '../../app/(performance)/body-metrics';

function renderWithTheme(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

// The two Save controls on the profile editor: the header "Save" link and the
// bottom primary "Save changes" Button. Both must reflect the same disabled state.
function getProfileSaveControls() {
  const headerSave = screen.getByLabelText('Save');
  // The primary Button's label flips with the pending flag; idle copy here.
  const bottomSave = screen.getByLabelText('Save changes');
  return { headerSave, bottomSave };
}

function isDisabled(node: any): boolean {
  return node.props.accessibilityState?.disabled === true;
}

describe('EditProfileScreen — displayName bounds mirror (2..64) + accessible validation', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockMutation.isPending = false;
    // A valid starting profile so the editor renders its form (not the skeleton).
    mockProfile.data = { id: 'u1', name: 'Original Name', aboutMe: '', occupation: '', avatarUrl: null };
  });

  // The DISPLAY NAME field is the one we drive. We grab it by its accessible label.
  function nameField() {
    return screen.getByLabelText('DISPLAY NAME');
  }

  test.each([
    ['too short (length 1)', 'A'],
    ['too long (length 65)', 'x'.repeat(DISPLAY_NAME_MAX + 1)],
    ['whitespace-only', '     '],
  ])('invalid displayName %s → both Save controls disabled, mutation blocked, accessible alert shown', (_label, value) => {
    renderWithTheme(<EditProfileScreen />);

    fireEvent.changeText(nameField(), value);

    // BOTH Save controls announce the disabled state…
    const { headerSave, bottomSave } = getProfileSaveControls();
    expect(isDisabled(headerSave)).toBe(true);
    expect(isDisabled(bottomSave)).toBe(true);

    // …and pressing either does NOT fire the updateProfile mutation.
    fireEvent.press(headerSave);
    fireEvent.press(bottomSave);
    expect(mockMutate).not.toHaveBeenCalled();

    // The inline validation copy is present AND accessible: it carries an alert
    // role + a polite live region so a screen reader announces it.
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const announced = alerts.find((a) => a.props.accessibilityLiveRegion === 'polite');
    expect(announced).toBeTruthy();
    // It has a non-empty accessible label (the message itself).
    expect(typeof announced?.props.accessibilityLabel).toBe('string');
    expect((announced?.props.accessibilityLabel as string).length).toBeGreaterThan(0);
  });

  test.each([
    ['min edge (length 2)', 'x'.repeat(DISPLAY_NAME_MIN)],
    ['max edge (length 64)', 'x'.repeat(DISPLAY_NAME_MAX)],
  ])('valid displayName %s → Save enabled, no alert, fires updateProfile exactly once', (_label, value) => {
    renderWithTheme(<EditProfileScreen />);

    fireEvent.changeText(nameField(), value);

    const { headerSave, bottomSave } = getProfileSaveControls();
    expect(isDisabled(headerSave)).toBe(false);
    expect(isDisabled(bottomSave)).toBe(false);

    // No validation alert in the valid state.
    expect(screen.queryByRole('alert')).toBeNull();

    // Pressing the bottom Save fires the mutation exactly once with the payload
    // the server actually accepts: `displayName` (NOT `name` — that key is dropped
    // by updateProfileSchema, which is why the rename used to silently no-op).
    fireEvent.press(bottomSave);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ displayName: value });
  });

  test('client displayName bounds equal the user-service schema bounds (2..64)', () => {
    // services/user-service/src/schemas.ts → displayName: z.string().min(2).max(64)
    expect(DISPLAY_NAME_MIN).toBe(2);
    expect(DISPLAY_NAME_MAX).toBe(64);
  });
});

describe('BodyMetricsScreen — weight bounds mirror (0,600] + accessible validation', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockMutation.isPending = false;
  });

  // The Weight (kg) field — grabbed by its accessible label.
  function weightField() {
    return screen.getByLabelText('Weight (kg)');
  }
  function saveSnapshot() {
    return screen.getByLabelText('Save snapshot');
  }

  test.each([
    ['above max (601)', '601'],
    ['not positive (0)', '0'],
    ['non-numeric (NaN)', 'abc'],
  ])('invalid weight %s → Save snapshot disabled, mutation blocked, accessible alert shown', (_label, value) => {
    renderWithTheme(<BodyMetricsScreen />);

    fireEvent.changeText(weightField(), value);

    // The submit control announces the disabled state…
    expect(isDisabled(saveSnapshot())).toBe(true);

    // …and pressing it does NOT fire the logBodyMetrics mutation.
    fireEvent.press(saveSnapshot());
    expect(mockMutate).not.toHaveBeenCalled();

    // The inline validation copy is present AND accessible (alert + polite region).
    const alerts = screen.getAllByRole('alert');
    const announced = alerts.find((a) => a.props.accessibilityLiveRegion === 'polite');
    expect(announced).toBeTruthy();
    expect((announced?.props.accessibilityLabel as string).length).toBeGreaterThan(0);
  });

  test('in-range weight at max (600) → Save enabled, no alert, fires logBodyMetrics exactly once', () => {
    renderWithTheme(<BodyMetricsScreen />);

    fireEvent.changeText(weightField(), String(WEIGHT_KG_MAX)); // 600 — inclusive edge

    expect(isDisabled(saveSnapshot())).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.press(saveSnapshot());
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ weightKg: WEIGHT_KG_MAX });
  });

  test('client height/weight bounds equal the user-service schema bounds ((0,300] / (0,600])', () => {
    // services/user-service/src/schemas.ts →
    //   heightCm: z.coerce.number().positive().max(300)
    //   weightKg: z.coerce.number().positive().max(600)
    expect(HEIGHT_CM_MAX).toBe(300);
    expect(WEIGHT_KG_MAX).toBe(600);
  });
});
