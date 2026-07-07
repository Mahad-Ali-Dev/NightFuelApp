/**
 * Render tests for the dashboard's <SleepWindowCard /> mini-card.
 *
 * SleepWindowCard is a pure presentational tile driven by three primitive props:
 *   `{ targetTime: string; progress: number; hint?: string }`.
 *
 * It renders, inside the Aurora `Card` primitive (NOT a glass SafeBlurView, so
 * check-no-inline-glass is unaffected):
 *   - a "Sleep Window" header with a moon glyph,
 *   - a CircularProgress ring whose centre shows the `targetTime` + "Target",
 *   - and the `hint` line (defaulting to "Melatonin rising in 3h").
 *
 * It owns no state and no data fetching — it is wrapped in React.memo because all
 * props are primitives — so these tests just assert it mounts and surfaces the
 * targetTime / hint strings, plus that a re-render with identical props is stable
 * (the memo path produces the same output, never a throw).
 *
 * Mocks (matching CaffeineTimerTile.test.tsx / AnchorSleepCard.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> surfacing `icon:<name>` so the
 *    glyph is assertable as text and no native font loader runs.
 *  - Theme comes from the real `ThemeContext.Provider`.
 *  - The `Card` primitive (LinearGradient/View under jest-expo) mounts with no
 *    extra mock, exactly as the sibling card suites do.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// Decorative glyph → plain text so the icon name is assertable and no native
// font loader runs. Matches the rest of the component suite.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Import AFTER the mock is registered.
import { SleepWindowCard } from '@/components/dashboard/SleepWindowCard';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('SleepWindowCard', () => {
  // Fail loudly on ANY console.error/warn during a render (a leaked falsy child,
  // an unkeyed list, an act() warning, a bad prop type) across every test here.
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('renders with the targetTime / progress / hint props (mounts without throwing)', () => {
    renderWithTheme(
      <SleepWindowCard targetTime="11:30 PM" progress={0.5} hint="Melatonin rising in 2h" />,
    );

    // The static header label, the moon glyph, and the centre "Target" caption.
    expect(screen.getByText('Sleep Window')).toBeTruthy();
    expect(screen.getByText('icon:moon')).toBeTruthy();
    expect(screen.getByText('Target')).toBeTruthy();

    // The two data-driven strings render verbatim.
    expect(screen.getByText('11:30 PM')).toBeTruthy();
    expect(screen.getByText('Melatonin rising in 2h')).toBeTruthy();
  });

  test('falls back to the default hint when none is supplied', () => {
    renderWithTheme(<SleepWindowCard targetTime="11:00 PM" progress={0} />);
    // Default hint from the prop default.
    expect(screen.getByText('Melatonin rising in 3h')).toBeTruthy();
    expect(screen.getByText('11:00 PM')).toBeTruthy();
  });

  test('a re-render with identical props is stable (memo path, no throw)', () => {
    const props = { targetTime: '10:45 PM', progress: 0.75, hint: 'Wind-down soon' };
    const { rerender } = renderWithTheme(<SleepWindowCard {...props} />);
    expect(screen.getByText('10:45 PM')).toBeTruthy();
    expect(screen.getByText('Wind-down soon')).toBeTruthy();

    // Re-render the memoized component with the SAME prop values: output is
    // unchanged and nothing throws.
    rerender(
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <SleepWindowCard {...props} />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText('10:45 PM')).toBeTruthy();
    expect(screen.getByText('Wind-down soon')).toBeTruthy();
  });
});
