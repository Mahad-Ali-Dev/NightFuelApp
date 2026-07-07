import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { borderRadius as br, spacing } from '@/theme/spacing';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'coral' | 'cyan' | 'purple' | 'red' | 'amber';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

function BadgeComponent({ label, variant = 'default', size = 'sm', style }: BadgeProps) {
  const { colors } = useTheme();

  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    default: {
      bg: colors.background.tertiary,
      text: colors.text.secondary,
      border: colors.border.default,
    },
    coral: { bg: 'rgba(255,107,53,0.14)', text: colors.accent.coral, border: 'rgba(255,107,53,0.28)' },
    cyan: { bg: 'rgba(0,212,170,0.14)', text: colors.accent.cyan, border: 'rgba(0,212,170,0.28)' },
    purple: { bg: 'rgba(124,77,255,0.14)', text: colors.accent.purple, border: 'rgba(124,77,255,0.28)' },
    red: { bg: 'rgba(255,68,68,0.14)', text: colors.accent.red, border: 'rgba(255,68,68,0.28)' },
    amber: { bg: 'rgba(255,179,0,0.14)', text: colors.accent.amber, border: 'rgba(255,179,0,0.28)' },
  };

  const c = colorMap[variant] ?? colorMap['default']!;

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: c.bg, borderColor: c.border },
        style,
      ]}
    >
      <Text style={[styles.text, size === 'sm' ? styles.textSm : styles.textMd, { color: c.text }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Memoized: `label`/`variant`/`size` are primitives. `style` is usually a
 * stable StyleSheet ref; when a caller passes an inline object the shallow
 * compare simply doesn't skip — identical behavior, just no perf win there.
 */
export const Badge = React.memo(BadgeComponent);

const styles = StyleSheet.create({
  badge: {
    borderRadius: br.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  sm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  md: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontWeight: '600',
  },
  textSm: {
    fontSize: 11,
  },
  textMd: {
    fontSize: 13,
  },
});
