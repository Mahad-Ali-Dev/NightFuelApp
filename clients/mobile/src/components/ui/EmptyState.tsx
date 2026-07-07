import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { borderRadius as br, spacing, iconSizes } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Aurora-styled empty / zero-data state.
 * Centered icon inside a soft accent-tinted circle, h3 title, secondary
 * subtitle, and an optional coral CTA button.
 */
function EmptyStateComponent({
  icon = 'sparkles-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: withAlpha(colors.accent.coral, 0.12),
            borderColor: withAlpha(colors.accent.coral, 0.24),
          },
        ]}
      >
        <Ionicons name={icon} size={iconSizes['2xl']} color={colors.accent.coral} />
      </View>

      <Text style={[styles.title, typography.h3, { color: colors.text.primary }]}>{title}</Text>

      {subtitle ? (
        <Text style={[styles.subtitle, typography.body, { color: colors.text.secondary }]}>
          {subtitle}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="primary" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

/**
 * Memoized: `icon`/`title`/`subtitle`/`actionLabel` are primitives and
 * `onAction` is stable. `style` is usually a StyleSheet ref.
 */
export const EmptyState = React.memo(EmptyStateComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing['2xl'],
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: br.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  action: {
    marginTop: spacing['2xl'],
  },
});
