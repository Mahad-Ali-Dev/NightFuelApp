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

export function Badge({ label, variant = 'default', size = 'sm', style }: BadgeProps) {
  const { colors } = useTheme();

  const colorMap: Record<string, { bg: string; text: string }> = {
    default: { bg: colors.background.tertiary, text: colors.text.secondary },
    coral: { bg: 'rgba(255,107,53,0.15)', text: colors.accent.coral },
    cyan: { bg: 'rgba(0,212,170,0.15)', text: colors.accent.cyan },
    purple: { bg: 'rgba(124,77,255,0.15)', text: colors.accent.purple },
    red: { bg: 'rgba(255,68,68,0.15)', text: colors.accent.red },
    amber: { bg: 'rgba(255,179,0,0.15)', text: colors.accent.amber },
  };

  const c = colorMap[variant] ?? colorMap['default']!;

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: c.bg },
        style,
      ]}
    >
      <Text style={[styles.text, size === 'sm' ? styles.textSm : styles.textMd, { color: c.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: br.full,
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
