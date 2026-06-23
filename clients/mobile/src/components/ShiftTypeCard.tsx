import React from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { typography as themeTypography } from '@/theme/typography';
import { borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';

/**
 * ShiftTypeCard — a selectable, type-tinted card for the Log Shift modal's
 * shift-type picker. Each shift type carries its own accent `tint` + icon, so
 * the selection grid reads as a set of distinct, glanceable choices rather than
 * a row of identical chips.
 *
 * Selection language (Zeitra 60/30/10): unselected cards are quiet dark-glass
 * surfaces; the SELECTED card lifts to a ~14% tint fill with a tinted border,
 * a filled icon chip and a check, plus a soft same-tint glow. The lime brand
 * accent is reserved for the primary Save CTA — these cards use functional
 * accents (cyan / purple / blue / amber / orange) so no single hue dominates.
 *
 * Purely presentational: it forwards the caller's `onPress`, `selected`, and
 * accessibility contract unchanged.
 */
export interface ShiftTypeCardProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Functional accent hex for this shift type (e.g. colors.accent.cyan). */
  tint: string;
  selected: boolean;
  onPress: () => void;
  /** Optional one-word descriptor under the label, e.g. "Overnight". */
  hint?: string;
  accessibilityLabel?: string;
}

export function ShiftTypeCard({
  label,
  icon,
  tint,
  selected,
  onPress,
  hint,
  accessibilityLabel,
}: ShiftTypeCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? withAlpha(tint, 0.14) : colors.background.secondary,
          borderColor: selected ? withAlpha(tint, 0.85) : colors.border.default,
        },
        selected && shadows.glow(tint),
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      {/* Selected check — top-right, tinted */}
      {selected ? (
        <View style={[styles.check, { backgroundColor: tint }]}>
          <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
        </View>
      ) : null}

      {/* Icon chip */}
      <View
        style={[
          styles.iconChip,
          {
            backgroundColor: selected ? tint : withAlpha(tint, 0.14),
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={selected ? colors.text.inverse : tint}
        />
      </View>

      {/* Label — the value dominates its hint */}
      <Text
        numberOfLines={1}
        style={[
          themeTypography.subhead,
          styles.label,
          { color: selected ? colors.text.primary : colors.text.secondary },
        ]}
      >
        {label}
      </Text>
      {hint ? (
        <Text
          numberOfLines={1}
          style={[themeTypography.caption, { color: colors.text.tertiary }]}
        >
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 92,
    borderRadius: br.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'flex-start',
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 15,
  },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
