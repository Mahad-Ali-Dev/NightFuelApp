/**
 * nightReadProvider.test.tsx
 *
 * Locks the "Night Read" provider wiring added in this sprint (Step 2):
 *
 *   1. The pure selector contract in `@/theme`:
 *        - `getThemeColors('dark')` is UNCHANGED (Aurora is untouched) and
 *          `resolveTheme('aurora')` still !== the Night Read palette — i.e. the
 *          existing nightRead.test.ts invariant still holds from the consumer's
 *          side.
 *        - `getNightReadColors()` returns the deep-red palette
 *          (`background.primary === '#0A0000'`) and maps coral → `brand`.
 *        - `resolveThemeColors(scheme, nightRead)` picks Night Read when ON and
 *          is byte-identical to `getThemeColors(scheme)` when OFF.
 *
 *   2. A real `useTheme()` consumer mounted under a `ThemeContext.Provider`
 *      built from each selector reads `colors.background.primary` ===
 *      '#0A0000' (ON) vs Aurora's '#0A0C12' (OFF) — the end-to-end re-theme
 *      every screen relies on.
 *
 *   3. The Settings screen exposes a 'Night Read' switch that defaults OFF
 *      (reflecting the persisted flag) and calls `setNightRead(true)` when
 *      flipped. The old 'Dark Mode' toggle was retired from THIS screen (commit
 *      b555fca — "remove the redundant Dark Mode toggle — the 9-theme picker
 *      covers it"; the toggle still lives on the More tab), so Night Read is now
 *      the Settings screen's only switch.
 *
 * The Settings-screen `jest.mock` calls below are hoisted above the imports, so
 * they apply to EVERY test in the file. The pure selector/consumer tests don't
 * import any mocked module (they touch only the real `@/theme` + `@/theme/
 * nightRead`), so the mocks are harmless to them.
 */

// ── jest.mock hoisting block ─────────────────────────────────────────────────
// Mutable, `mock`-prefixed theme-store holder. The `mock` prefix is REQUIRED by
// babel-plugin-jest-hoist so the hoisted factory may close over it. Tests reset
// `nightRead` + the spies in beforeEach.
const mockSetNightRead = jest.fn();
const mockSetTheme = jest.fn();
const mockThemeStoreState: {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  isDarkTheme: (s: 'light' | 'dark' | null | undefined) => boolean;
  nightRead: boolean;
  setNightRead: (on: boolean) => void;
} = {
  theme: 'dark',
  setTheme: mockSetTheme,
  isDarkTheme: () => true,
  nightRead: false, // default OFF — overridden per test
  setNightRead: mockSetNightRead,
};

jest.mock('@/store/themeStore', () => ({
  // The screen calls `useThemeStore()` and destructures the slice; return the
  // mutable holder so a test can flip `nightRead` before render.
  useThemeStore: () => mockThemeStoreState,
}));

// authStore: the screen reads `{ user }` and calls `useAuthStore.getState().
// logout()` in the (un-exercised) logout button. Provide both shapes.
jest.mock('@/store/authStore', () => {
  const useAuthStore: any = () => ({ user: { name: 'Test User', email: 't@example.com' } });
  useAuthStore.getState = () => ({ logout: jest.fn() });
  return { useAuthStore };
});

// react-query: the screen fires 'user-profile' and 'subscription-status'
// queries. Return benign empty success for both so the row config is static.
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
}));

// API modules are statically imported by the screen; stub the named exports so
// the real axios client never loads (useQuery is mocked, so these never run).
jest.mock('@/api/users', () => ({ getProfile: jest.fn() }));
jest.mock('@/api/subscriptions', () => ({ getStatus: jest.fn() }));

// expo-router: stub the one hook the screen uses.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Decorative glyphs → surface the icon name as text so 'icon:eye-outline' is
// assertable and the expo-font → expo-asset chain never loads.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
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

// expo-constants: the screen reads `Constants.expoConfig?.version`.
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  getNightReadColors,
  resolveThemeColors,
  useTheme,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import { nightReadColors } from '@/theme/nightRead';
import { resolveTheme } from '@/theme/nightRead';
import SettingsIndexScreen from '../../app/(settings)/index';

// ── 1. Pure selector contract ────────────────────────────────────────────────
// No React, no mocks consumed — direct assertions against the real selectors.

describe('Night Read selectors — pure contract', () => {
  test('getThemeColors("dark") is unchanged (Aurora dark palette, lime brand)', () => {
    const dark = getThemeColors('dark');
    expect(dark.background.primary).toBe('#0A0C12');
    expect(dark.brand).toBe('#C2F03C');
    // The deep-red Night Read primary must NOT have leaked into Aurora dark.
    expect(dark.background.primary).not.toBe('#0A0000');
  });

  test('resolveTheme("aurora") is NOT the Night Read palette (no Aurora edits)', () => {
    // Mirrors the invariant in nightRead.test.ts from the consumer side: wiring
    // Night Read into the provider must not touch Aurora's resolveTheme.
    expect(resolveTheme('aurora').background.primary).not.toBe('#0A0000');
  });

  test('getNightReadColors() returns the deep-red palette', () => {
    expect(getNightReadColors().background.primary).toBe('#0A0000');
  });

  test('getNightReadColors() maps accent.coral → brand (exactly as getThemeColors)', () => {
    expect(getNightReadColors().brand).toBe(nightReadColors.accent.coral);
    expect(getNightReadColors().brand).toBe('#8C1A1A');
  });

  test('getNightReadColors() passes the remaining ThemeColors keys through from nightReadColors', () => {
    const c = getNightReadColors();
    expect(c.background).toBe(nightReadColors.background);
    expect(c.border).toBe(nightReadColors.border);
    expect(c.text).toBe(nightReadColors.text);
    expect(c.accent).toBe(nightReadColors.accent);
    expect(c.gradients).toBe(nightReadColors.gradients);
    expect(c.success).toBe(nightReadColors.success);
    expect(c.error).toBe(nightReadColors.error);
    expect(c.warning).toBe(nightReadColors.warning);
    expect(c.info).toBe(nightReadColors.info);
  });

  test('resolveThemeColors picks Night Read when ON and is identical to getThemeColors when OFF', () => {
    // ON → deep-red, regardless of scheme.
    expect(resolveThemeColors('dark', true).background.primary).toBe('#0A0000');
    expect(resolveThemeColors('light', true).background.primary).toBe('#0A0000');
    expect(resolveThemeColors('dark', true).brand).toBe('#8C1A1A');

    // OFF → byte-identical to the Aurora resolver for the same scheme.
    expect(resolveThemeColors('dark', false)).toEqual(getThemeColors('dark'));
    expect(resolveThemeColors('light', false)).toEqual(getThemeColors('light'));
  });
});

// ── 2. Provider re-theme — a real useTheme() consumer ────────────────────────

function ColorProbe() {
  const { colors } = useTheme();
  return <Text>{`bg:${colors.background.primary}|brand:${colors.brand}`}</Text>;
}

function renderProbe(nightRead: boolean) {
  const colors = resolveThemeColors('dark', nightRead);
  return render(
    <ThemeContext.Provider value={{ scheme: 'dark', colors, typography, spacing, borderRadius, shadows }}>
      <ColorProbe />
    </ThemeContext.Provider>,
  );
}

describe('Night Read provider — useTheme() consumer re-themes', () => {
  test('ON → consumer reads the deep-red primary + red brand', () => {
    renderProbe(true);
    expect(screen.getByText('bg:#0A0000|brand:#8C1A1A')).toBeTruthy();
  });

  test('OFF → consumer reads the unchanged Aurora dark primary + lime brand', () => {
    renderProbe(false);
    expect(screen.getByText('bg:#0A0C12|brand:#C2F03C')).toBeTruthy();
  });
});

// ── 3. Settings screen — the 'Night Read' switch ─────────────────────────────

describe('Settings screen — Night Read switch', () => {
  beforeEach(() => {
    mockSetNightRead.mockClear();
    mockSetTheme.mockClear();
    mockThemeStoreState.theme = 'dark';
    mockThemeStoreState.nightRead = false; // default OFF
  });

  test('renders a labelled "Night Read" switch that defaults OFF', () => {
    render(<SettingsIndexScreen />);

    // Night Read is the screen's only switch (Dark Mode was retired — see the
    // final test in this block); query it by label. It exposes
    // accessibilityRole="switch".
    const nightSwitches = screen
      .getAllByLabelText('Night Read')
      .filter((n) => n.props.accessibilityRole === 'switch');
    expect(nightSwitches.length).toBe(1);

    const sw = nightSwitches[0]!;
    expect(sw.props.accessibilityRole).toBe('switch');
    // Persisted flag is OFF → both the value and the announced checked state.
    expect(sw.props.value).toBe(false);
    expect(sw.props.accessibilityState).toMatchObject({ checked: false });
  });

  test('reflects an ON persisted flag in value + accessibilityState.checked', () => {
    mockThemeStoreState.nightRead = true;
    render(<SettingsIndexScreen />);

    const sw = screen
      .getAllByLabelText('Night Read')
      .find((n) => n.props.accessibilityRole === 'switch')!;
    expect(sw.props.value).toBe(true);
    expect(sw.props.accessibilityState).toMatchObject({ checked: true });
  });

  test('flipping the switch calls setNightRead(true) and does NOT touch setTheme', () => {
    render(<SettingsIndexScreen />);

    const sw = screen
      .getAllByLabelText('Night Read')
      .find((n) => n.props.accessibilityRole === 'switch')!;
    fireEvent(sw, 'valueChange', true);

    expect(mockSetNightRead).toHaveBeenCalledTimes(1);
    expect(mockSetNightRead).toHaveBeenCalledWith(true);
    // Night Read must never route to setTheme — no Dark-Mode-style toggle lives
    // on this screen anymore.
    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  test('the Dark Mode switch was retired from Settings — Night Read is now the only switch (the 9-theme picker covers dark mode)', () => {
    render(<SettingsIndexScreen />);

    // Dark Mode was intentionally dropped from THIS screen in commit b555fca
    // ("remove the redundant Dark Mode toggle — the 9-theme picker covers it";
    // the toggle still lives on the More tab). It must NOT resurface here, so no
    // switch carries its label. queryAll* (never getAll*) so a clean absence is
    // 0 matches rather than a throw.
    expect(
      screen
        .queryAllByLabelText('Dark Mode')
        .filter((n) => n.props.accessibilityRole === 'switch'),
    ).toHaveLength(0);

    // With Dark Mode gone, Night Read is the screen's single switch — so nothing
    // on this screen is wired to setTheme (dark/light now lives in the Theme
    // picker + the More tab).
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(1);
    expect(switches[0]!.props.accessibilityLabel).toBe('Night Read');
  });
});
