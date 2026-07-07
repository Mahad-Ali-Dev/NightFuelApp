/**
 * Render tests for the CtaButton UI primitive — focused on the additive
 * `testID` prop and the unchanged accessibility contract.
 *
 * CtaButton is the Aurora primary CTA: a coral→pink gradient-fill Pressable.
 * It does NOT spread an unbounded `...rest`, so `testID` is forwarded by an
 * explicit `testID={testID}` prop on the root Pressable. These tests pin that
 * forwarding down, and confirm that omitting `testID` renders without error
 * while still exposing accessibilityRole "button" — i.e. no behavior changed
 * for existing no-testID callers.
 *
 * Both native-ish deps are stubbed to passthroughs (as the sibling ui suites
 * do): @expo/vector-icons pulls in expo-font → expo-asset, and
 * expo-linear-gradient is a native view — neither is needed to exercise the
 * Pressable, so we render them as lightweight host components.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';

// expo-linear-gradient is a native view; render it as a passthrough host View
// so the gradient fill mounts without native code.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: (props: Record<string, unknown>) => <View {...props} /> };
});

// @expo/vector-icons pulls in expo-font -> expo-asset, which isn't resolvable in
// the jest env. CtaButton only uses Ionicons as a decorative leading glyph, so
// we stub it with a lightweight host component that surfaces the icon name as
// text. This mirrors how the sibling ui suite mocks native modules.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { CtaButton } from '@/components/ui/CtaButton';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('CtaButton', () => {
  test('forwards testID to its root Pressable', () => {
    renderWithTheme(<CtaButton label="X" testID="cta-x" />);
    expect(screen.getByTestId('cta-x')).toBeTruthy();
  });

  test('the forwarded testID node is the button and still carries the a11y role', () => {
    renderWithTheme(<CtaButton label="X" testID="cta-x" />);
    const node = screen.getByTestId('cta-x');
    expect(node.props.accessibilityRole).toBe('button');
    // The label renders inside that same Pressable.
    expect(screen.getByText('X')).toBeTruthy();
  });

  test('renders without error and exposes accessibilityRole "button" when testID is omitted', () => {
    renderWithTheme(<CtaButton label="X" />);
    // Label still renders for the no-testID caller (byte-identical behavior).
    expect(screen.getByText('X')).toBeTruthy();
    // The Pressable is still reachable by its accessibility role.
    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
    expect(button.props.accessibilityRole).toBe('button');
  });

  test('does not register a testID node when testID is omitted', () => {
    renderWithTheme(<CtaButton label="X" />);
    expect(screen.queryByTestId('cta-x')).toBeNull();
  });
});
