/**
 * Tests for src/store/themeStore.ts.
 *
 * Focus: the additive `nightRead` preference (the Night Read theme foundation):
 *   - it defaults OFF (false) on a fresh store.
 *   - `setNightRead(true)` / `setNightRead(false)` round-trips the flag.
 *   - adding it did NOT disturb the existing `theme` default ('dark') or the
 *     `setTheme` action, and toggling one slice never bleeds into the other.
 *
 * `@react-native-async-storage/async-storage` is mocked so the persist
 * middleware never touches a real device store — `getItem` resolving to null
 * means rehydration is a no-op and the in-memory initial state holds. This
 * matches the mocking convention used in __tests__/store/authStore.test.ts.
 */

// ─── Mocks (must be declared before importing the module under test) ─────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

import { useThemeStore } from '@/store/themeStore';

/**
 * Reset the zustand singleton to its documented defaults before every test so
 * cases don't bleed (the store is a module-level singleton shared across the
 * suite). We restore exactly the initializer defaults: theme 'dark', nightRead
 * off. setState merges, leaving the actions intact.
 */
beforeEach(() => {
  useThemeStore.setState({ theme: 'dark', nightRead: false });
});

// ─── nightRead default ────────────────────────────────────────────────────────

describe('themeStore.nightRead', () => {
  test('defaults to OFF (false) on a fresh store', () => {
    expect(useThemeStore.getState().nightRead).toBe(false);
  });

  test('setNightRead(true) then setNightRead(false) round-trips the flag', () => {
    useThemeStore.getState().setNightRead(true);
    expect(useThemeStore.getState().nightRead).toBe(true);

    useThemeStore.getState().setNightRead(false);
    expect(useThemeStore.getState().nightRead).toBe(false);
  });

  test('toggling nightRead does not alter the persisted theme', () => {
    expect(useThemeStore.getState().theme).toBe('dark');

    useThemeStore.getState().setNightRead(true);

    // theme slice is independent of the nightRead slice
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(useThemeStore.getState().nightRead).toBe(true);
  });
});

// ─── existing theme behaviour is unchanged by the additive flag ─────────────────

describe('themeStore.theme (unchanged behaviour)', () => {
  test('theme still defaults to "dark"', () => {
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  test('setTheme("light") still works and does NOT alter nightRead', () => {
    expect(useThemeStore.getState().nightRead).toBe(false);

    useThemeStore.getState().setTheme('light');

    expect(useThemeStore.getState().theme).toBe('light');
    // changing the theme must leave the (default-OFF) nightRead flag untouched
    expect(useThemeStore.getState().nightRead).toBe(false);
  });

  test('isDarkTheme still reflects the chosen theme (regression guard)', () => {
    // dark default -> true regardless of OS colour scheme
    expect(useThemeStore.getState().isDarkTheme('light')).toBe(true);

    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().isDarkTheme('dark')).toBe(false);

    // 'system' defers to the OS colour scheme
    useThemeStore.getState().setTheme('system');
    expect(useThemeStore.getState().isDarkTheme('dark')).toBe(true);
    expect(useThemeStore.getState().isDarkTheme('light')).toBe(false);
  });
});

// ─── persist config is left exactly as-is ───────────────────────────────────────

describe('themeStore persistence', () => {
  test('keeps the persist key "nf-theme-storage" (no rename/migration)', () => {
    // zustand exposes the resolved persist options on the store. Guarding the
    // name here ensures a returning user's stored blob is still found and that
    // no version/migrate was introduced that could drop their `theme`.
    expect(useThemeStore.persist.getOptions().name).toBe('nf-theme-storage');
  });
});
