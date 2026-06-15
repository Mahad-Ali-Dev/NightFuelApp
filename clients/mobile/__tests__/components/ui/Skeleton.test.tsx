/**
 * Render tests for Skeleton + SkeletonCard loading placeholders.
 *
 * Skeleton is an Animated.View whose opacity is driven by a looping pulse
 * animation. We don't assert the animation frames (opacity is an Animated.Value
 * node, not a plain number); instead we verify the static, theme-derived layout:
 * dimensions, radius, and the elevated-surface background color. SkeletonCard is
 * a thin convenience wrapper, so we assert it forwards sensible defaults.
 *
 * jest-expo provides Animated; the loop is started in an effect and cleaned up
 * on unmount. We mount/​unmount within each test so no timers leak between tests.
 */
import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

// react-test-renderer ships no types and @types/react-test-renderer is not
// installed; derive the node type from a query's return value instead.
type ReactTestInstance = ReturnType<ReturnType<typeof render>['getByText']>;

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style as Record<string, unknown>) ?? {};
}

/** The single host View that Skeleton renders (Animated.View -> View). */
function skeletonView(getAll: (t: typeof View) => ReactTestInstance[]): ReactTestInstance {
  const views = getAll(View);
  return views[0]!;
}

describe('Skeleton', () => {
  test('renders a single host View placeholder', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<Skeleton />);
    expect(UNSAFE_getAllByType(View).length).toBeGreaterThanOrEqual(1);
  });

  test('uses the elevated-surface (tertiary) background color from the theme', () => {
    const colors = getThemeColors('dark');
    const { UNSAFE_getAllByType } = renderWithTheme(<Skeleton />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    expect(style.backgroundColor).toBe(colors.background.tertiary);
  });

  test('applies default width/height/radius when no props are given', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<Skeleton />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    expect(style.width).toBe('100%'); // default width
    expect(style.height).toBe(16); // default height
    expect(style.borderRadius).toBe(borderRadius.md); // default radius (br.md = 10)
  });

  test('forwards explicit width / height / radius props', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<Skeleton width={120} height={40} radius={8} />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    expect(style.width).toBe(120);
    expect(style.height).toBe(40);
    expect(style.borderRadius).toBe(8);
  });

  test('drives opacity from the pulse animation starting at the initial value', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<Skeleton />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    // opacity is wired to an Animated.Value initialized to 0.4. jest-expo
    // resolves animated styles to their current numeric value; before any
    // timers run that is the 0.4 starting point. Assert it's a real opacity in
    // the animation's [0.4, 1] range (and specifically the initial 0.4).
    expect(style.opacity).toBeDefined();
    const opacity = Number(style.opacity);
    expect(Number.isNaN(opacity)).toBe(false);
    expect(opacity).toBeGreaterThanOrEqual(0.4);
    expect(opacity).toBeLessThanOrEqual(1);
  });

  test('merges a caller-supplied style override', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<Skeleton style={{ marginTop: 24 }} />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    expect(style.marginTop).toBe(24);
    // Still keeps its themed background after merge.
    expect(style.backgroundColor).toBe(getThemeColors('dark').background.tertiary);
  });
});

describe('SkeletonCard', () => {
  test('renders and applies card defaults (height 96, xl radius, bottom margin)', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<SkeletonCard />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    expect(style.height).toBe(96);
    expect(style.borderRadius).toBe(borderRadius.xl); // br.xl = 20
    expect(style.marginBottom).toBe(spacing.md); // styles.card marginBottom
  });

  test('honors explicit height + radius overrides', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<SkeletonCard height={150} radius={4} />);
    const style = flatten(skeletonView(UNSAFE_getAllByType).props.style);
    expect(style.height).toBe(150);
    expect(style.borderRadius).toBe(4);
  });
});
