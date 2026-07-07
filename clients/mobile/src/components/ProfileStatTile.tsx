/**
 * ProfileStatTile — a premium read-only recap tile (Zeitra / Aurora brand).
 *
 * Local-only helper used by the onboarding profile-summary screen. Renders a
 * single frosted GlassCard "fact": a small lime-accented icon medallion, an
 * uppercase overline label and a bold value below it. Purely presentational —
 * it owns no data, exposes no press, and is laid out by the caller (the screen
 * sets the grid-column width via `style`).
 *
 * Visual language mirrors GoalGridCard's selected medallion (lime fill on a
 * faint lime wash) but tuned for compact stat display: the value uses a bold,
 * size-led treatment and falls back to a muted "Not set" so an empty field
 * still reads cleanly. `mono` switches the value to the design system's tabular
 * stat face for numeric facts (height / weight) so figures align.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface ProfileStatTileProps {
  /** Uppercase overline above the value (e.g. "HEIGHT"). */
  label: string;
  /** The fact. Falsy values render a muted "Not set" placeholder. */
  value: string | number | undefined | null;
  icon: keyof typeof Ionicons.glyphMap;
  /** Use the tabular mono stat face for numeric values. Default false. */
  mono?: boolean;
  /** Outer wrapper style — the screen uses this to set the grid column width. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function ProfileStatTile({
  label,
  value,
  icon,
  mono = false,
  style,
  accessibilityLabel,
  testID,
}: ProfileStatTileProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const hasValue = value !== undefined && value !== null && `${value}`.trim().length > 0;
  const display = hasValue ? `${value}` : 'Not set';

  return (
    <GlassCard
      testID={testID}
      radius={borderRadius.xl}
      style={[styles.tile, style]}
    >
      <View
        style={[styles.body, { padding: spacing.lg }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel ?? `${label}: ${display}`}
      >
        <View style={styles.topRow}>
          <View
            style={[
              styles.iconMedallion,
              {
                backgroundColor: withAlpha(colors.accent.coral, 0.14),
                borderColor: withAlpha(colors.accent.coral, 0.28),
              },
            ]}
          >
            <Ionicons name={icon} size={18} color={colors.accent.coral} />
          </View>
          <Text
            style={[
              typography.overline,
              { color: colors.text.tertiary, flex: 1, marginLeft: spacing.sm },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>

        <Text
          style={[
            mono ? typography.statSmall : typography.h3,
            {
              color: hasValue ? colors.text.primary : colors.text.tertiary,
              marginTop: spacing.md,
            },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {display}
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 104,
  },
  body: {
    flex: 1,
    minHeight: 104,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconMedallion: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
