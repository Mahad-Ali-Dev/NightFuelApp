/**
 * SelectionChip — a premium Aurora/Zeitra onboarding selection pill.
 *
 * Local-only helper for the onboarding *Lifestyle* step (and any future
 * chip-group screen). Renders a single rounded pill: dark-glass surface +
 * 1px hairline at rest; on `selected` it lifts to a solid accent fill with
 * INK text, a hairless border in the accent colour and a MINIMAL accent glow
 * — the brand's "chosen" state. An optional leading checkmark reinforces the
 * selection beyond colour alone (a11y: colour is never the only signal).
 *
 * Pure presentation: owns no data and forwards `onPress` + accessibility to
 * the caller, so the screen keeps every handler exactly. A pressed-scale
 * (Reanimated shared value, transform-only) gives the tactile press feedback.
 * The pill's min-height clears the 44pt touch-target floor.
 *
 * `accent` lets a group opt into a non-primary hue (the Health-Conditions
 * group keeps its cyan multi-select identity); it defaults to the lime brand.
 * `tone` selects how the accent is applied: 'solid' (CTA-style ink-on-lime,
 * for single-choice groups) or 'soft' (translucent fill + accent text, for the
 * optional multi-select group) — preserving the original two visual languages.
 */
import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface SelectionChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Accent hue for the selected state. Defaults to the lime brand. */
  accent?: string;
  /** 'solid' = ink-on-accent fill; 'soft' = translucent fill + accent text. */
  tone?: 'solid' | 'soft';
  accessibilityLabel?: string;
  testID?: string;
}

export function SelectionChip({
  label,
  selected,
  onPress,
  accent,
  tone = 'solid',
  accessibilityLabel,
  testID,
}: SelectionChipProps) {
  const { colors, typography, borderRadius, shadows } = useTheme();
  const accentColor = accent ?? colors.accent.coral;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isSolid = tone === 'solid';

  // Resting vs selected surface/border/text per tone.
  const surface = selected
    ? isSolid
      ? accentColor
      : withAlpha(accentColor, 0.16)
    : colors.background.secondary;
  const borderColor = selected ? accentColor : colors.border.default;
  const textColor = selected
    ? isSolid
      ? colors.text.inverse // ink on lime — never white on the fill
      : accentColor
    : colors.text.secondary;
  const glyphColor = textColor;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 110 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 140 });
      }}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Animated.View
        style={[
          styles.chip,
          {
            backgroundColor: surface,
            borderColor,
            borderRadius: borderRadius.full,
          },
          // Minimal premium halo only on the solid (primary) selected state.
          selected && isSolid ? shadows.glow(accentColor) : null,
          animatedStyle,
        ]}
      >
        {selected ? (
          <Ionicons
            name="checkmark-circle"
            size={16}
            color={glyphColor}
            style={styles.check}
          />
        ) : null}
        <Text style={[typography.captionMedium, styles.label, { color: textColor }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    // Clears the 44pt minimum touch-target floor (was 10 + ~16 line ≈ 36).
    minHeight: 44,
    paddingVertical: 8,
  },
  check: {
    marginRight: 6,
  },
  label: {
    fontSize: 13,
  },
});
