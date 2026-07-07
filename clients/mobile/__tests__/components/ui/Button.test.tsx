/**
 * Render + interaction tests for the Button UI primitive.
 *
 * Button has five variants. The `primary` variant renders its content inside an
 * expo-linear-gradient (mocked to a passthrough by jest-expo); the other four
 * render a plain Pressable. We assert that:
 *   - every variant renders the title and is pressable,
 *   - onPress fires when enabled and is suppressed when disabled/loading,
 *   - the loading state swaps in an ActivityIndicator,
 *   - custom icons render alongside the label.
 *
 * fireEvent.press drives the Pressable; no network/native side effects exist.
 */
import React from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Button } from '@/components/ui/Button';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;

describe('Button', () => {
  test.each(VARIANTS)('renders the title for the "%s" variant', (variant) => {
    renderWithTheme(<Button title={`Tap ${variant}`} variant={variant} onPress={() => {}} />);
    expect(screen.getByText(`Tap ${variant}`)).toBeTruthy();
  });

  test.each(VARIANTS)('fires onPress when the "%s" variant is pressed', (variant) => {
    const onPress = jest.fn();
    renderWithTheme(<Button title="Press me" variant={variant} onPress={onPress} />);
    fireEvent.press(screen.getByText('Press me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button title="Nope" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Nope'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('does not fire onPress while loading', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button title="Loading" onPress={onPress} loading />);
    fireEvent.press(screen.getByText('Loading'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('shows an ActivityIndicator when loading', () => {
    renderWithTheme(<Button title="Saving" onPress={() => {}} loading />);
    expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
    // Label is still rendered alongside the spinner.
    expect(screen.getByText('Saving')).toBeTruthy();
  });

  test('does not render an ActivityIndicator when not loading', () => {
    renderWithTheme(<Button title="Idle" onPress={() => {}} />);
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });

  test('renders a provided left icon node', () => {
    renderWithTheme(
      <Button title="With Icon" onPress={() => {}} icon={<Text>★</Text>} />,
    );
    expect(screen.getByText('★')).toBeTruthy();
    expect(screen.getByText('With Icon')).toBeTruthy();
  });

  test('renders a provided right icon node', () => {
    renderWithTheme(
      <Button title="Next" onPress={() => {}} iconRight={<Text>→</Text>} />,
    );
    expect(screen.getByText('→')).toBeTruthy();
  });

  test('outline variant tints the label with the coral accent', () => {
    const colors = getThemeColors('dark');
    renderWithTheme(<Button title="Outlined" variant="outline" onPress={() => {}} />);
    const label = screen.getByText('Outlined');
    const flat = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.filter(Boolean))
      : label.props.style;
    expect(flat.color).toBe(colors.accent.coral);
  });

  test('multiple presses each invoke the handler', () => {
    const onPress = jest.fn();
    renderWithTheme(<Button title="Counter" onPress={onPress} />);
    const node = screen.getByText('Counter');
    fireEvent.press(node);
    fireEvent.press(node);
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(3);
  });
});
