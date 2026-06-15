/**
 * Render + interaction tests for the EmptyState UI primitive.
 *
 * EmptyState shows a themed icon, a required title, an optional subtitle, and an
 * optional CTA. The CTA (a Button) renders ONLY when *both* `actionLabel` and
 * `onAction` are supplied — that conditional is the core behavior we pin down,
 * along with subtitle presence/absence and the onAction callback wiring.
 *
 * @expo/vector-icons (Ionicons) is mocked by jest-expo, so the icon mounts
 * without native code. We assert on visible text + the CTA press, not on the
 * icon mock's internals.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';

// @expo/vector-icons pulls in expo-font -> expo-asset, which isn't resolvable in
// the jest env. EmptyState only uses Ionicons as a decorative glyph, so we stub
// it with a lightweight host component that surfaces the icon name as text. This
// mirrors how the existing suite mocks native modules it doesn't exercise.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { EmptyState } from '@/components/ui/EmptyState';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('EmptyState', () => {
  test('renders the title', () => {
    renderWithTheme(<EmptyState title="No workouts yet" />);
    expect(screen.getByText('No workouts yet')).toBeTruthy();
  });

  test('renders the subtitle when provided', () => {
    renderWithTheme(<EmptyState title="Empty" subtitle="Add your first plan to begin" />);
    expect(screen.getByText('Add your first plan to begin')).toBeTruthy();
  });

  test('does not render a subtitle when omitted', () => {
    renderWithTheme(<EmptyState title="Just a title" />);
    expect(screen.queryByText('Add your first plan to begin')).toBeNull();
  });

  test('renders the action button and fires onAction when BOTH actionLabel and onAction are given', () => {
    const onAction = jest.fn();
    renderWithTheme(
      <EmptyState title="Nothing here" actionLabel="Create plan" onAction={onAction} />,
    );

    const cta = screen.getByText('Create plan');
    expect(cta).toBeTruthy();

    fireEvent.press(cta);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('does NOT render the action button when only actionLabel is given (no onAction)', () => {
    renderWithTheme(<EmptyState title="Nothing" actionLabel="Create plan" />);
    expect(screen.queryByText('Create plan')).toBeNull();
  });

  test('does NOT render the action button when only onAction is given (no actionLabel)', () => {
    const onAction = jest.fn();
    renderWithTheme(<EmptyState title="Nothing" onAction={onAction} />);
    // With no label there is no button to press, and the handler stays untouched.
    expect(onAction).not.toHaveBeenCalled();
  });

  test('title uses the primary text color from the theme', () => {
    const colors = getThemeColors('dark');
    renderWithTheme(<EmptyState title="Themed title" />);
    const label = screen.getByText('Themed title');
    const flat = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.filter(Boolean))
      : label.props.style;
    expect(flat.color).toBe(colors.text.primary);
  });

  test('subtitle uses the secondary text color from the theme', () => {
    const colors = getThemeColors('dark');
    renderWithTheme(<EmptyState title="T" subtitle="Sub copy" />);
    const sub = screen.getByText('Sub copy');
    const flat = Array.isArray(sub.props.style)
      ? Object.assign({}, ...sub.props.style.filter(Boolean))
      : sub.props.style;
    expect(flat.color).toBe(colors.text.secondary);
  });

  test('renders the default sparkles icon when no icon prop is given', () => {
    renderWithTheme(<EmptyState title="Default icon" />);
    expect(screen.getByText('icon:sparkles-outline')).toBeTruthy();
  });

  test('forwards a custom icon name', () => {
    renderWithTheme(<EmptyState title="Custom icon" icon="barbell-outline" />);
    expect(screen.getByText('icon:barbell-outline')).toBeTruthy();
  });
});
