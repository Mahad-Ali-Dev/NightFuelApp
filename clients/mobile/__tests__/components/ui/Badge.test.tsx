/**
 * Render tests for the Badge UI primitive.
 *
 * Badge is a pure presentational pill: a styled <View> wrapping a <Text> label,
 * themed by `variant` and sized by `size`. We render it inside the app's
 * ThemeContext (the component calls `useTheme()`), then assert on the visible
 * label text and on the *resolved, flattened* styles so variant/size genuinely
 * take effect at runtime.
 *
 * No network or native modules are involved; jest-expo provides the RN runtime.
 * Style assertions flatten the (possibly array) style prop and read concrete
 * values rather than snapshotting, so they stay meaningful and stable.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Badge } from '@/components/ui/Badge';

// react-test-renderer ships no types and @types/react-test-renderer is not
// installed; derive the node type from a query's return value instead.
type ReactTestInstance = ReturnType<ReturnType<typeof render>['getByText']>;

// Wrap in the app ThemeContext so useTheme() resolves to the real dark theme.
function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

/** Flatten a possibly-nested/array RN style prop into a single object. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style as Record<string, unknown>) ?? {};
}

/** Walk up from a node to the nearest ancestor whose flattened style has `key`. */
function ancestorStyleWith(node: ReactTestInstance, key: string): Record<string, unknown> {
  let cur: ReactTestInstance | null = node;
  while (cur) {
    const s = flatten(cur.props?.style);
    if (key in s) return s;
    cur = cur.parent;
  }
  throw new Error(`No ancestor style with key "${key}"`);
}

describe('Badge', () => {
  test('renders the label text', () => {
    const { getByText } = renderWithTheme(<Badge label="Active" />);
    expect(getByText('Active')).toBeTruthy();
  });

  test('default variant uses secondary text color and tertiary background', () => {
    const colors = getThemeColors('dark');
    const { getByText } = renderWithTheme(<Badge label="Default" />);

    const label = getByText('Default');
    expect(flatten(label.props.style).color).toBe(colors.text.secondary);
    // The styled pill is the nearest ancestor carrying a backgroundColor.
    expect(ancestorStyleWith(label, 'backgroundColor').backgroundColor).toBe(colors.background.tertiary);
  });

  test('coral variant applies the coral accent text + tinted background', () => {
    const colors = getThemeColors('dark');
    const { getByText } = renderWithTheme(<Badge label="Hot" variant="coral" />);

    const label = getByText('Hot');
    expect(flatten(label.props.style).color).toBe(colors.accent.coral);
    expect(ancestorStyleWith(label, 'backgroundColor').backgroundColor).toBe('rgba(255,107,53,0.14)');
  });

  test('each color variant resolves to its own accent text color', () => {
    const colors = getThemeColors('dark');
    const expected: Record<string, string> = {
      cyan: colors.accent.cyan,
      purple: colors.accent.purple,
      red: colors.accent.red,
      amber: colors.accent.amber,
    };

    for (const [variant, color] of Object.entries(expected)) {
      const { getByText } = renderWithTheme(
        <Badge label={variant} variant={variant as 'cyan' | 'purple' | 'red' | 'amber'} />,
      );
      expect(flatten(getByText(variant).props.style).color).toBe(color);
    }
  });

  test('falls back to the default variant for an unknown variant value', () => {
    const colors = getThemeColors('dark');
    // @ts-expect-error — exercising the runtime `?? default` fallback branch.
    const { getByText } = renderWithTheme(<Badge label="Mystery" variant="chartreuse" />);
    expect(flatten(getByText('Mystery').props.style).color).toBe(colors.text.secondary);
  });

  test('size "md" uses a larger label font size than "sm"', () => {
    const sm = renderWithTheme(<Badge label="small" size="sm" />);
    const smSize = flatten(sm.getByText('small').props.style).fontSize as number;

    const md = renderWithTheme(<Badge label="medium" size="md" />);
    const mdSize = flatten(md.getByText('medium').props.style).fontSize as number;

    expect(smSize).toBe(11);
    expect(mdSize).toBe(13);
    expect(mdSize).toBeGreaterThan(smSize);
  });

  test('renders exactly one Text label inside at least one View', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<Badge label="Solo" />);
    expect(UNSAFE_getAllByType(Text)).toHaveLength(1);
    expect(UNSAFE_getAllByType(View).length).toBeGreaterThanOrEqual(1);
  });
});
