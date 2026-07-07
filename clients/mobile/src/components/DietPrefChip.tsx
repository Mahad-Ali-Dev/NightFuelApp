/**
 * DietPrefChip — a compact onboarding multi-select grid card (Aurora brand).
 *
 * Local-only helper used by the onboarding dietary-needs screen for the dietary
 * preference options (No Restrictions, Vegetarian, Vegan, Keto, Halal, Gluten
 * Free). Renders a half-width frosted GlassCard tile with a lime-accented icon
 * medallion and a bold label. When `selected` it lifts to a lime (`accent.coral`)
 * hairline ring + soft glow, swaps the medallion to a solid lime fill with an ink
 * glyph and reveals a checkmark badge — the premium "chosen" state. Selection is
 * never signalled by colour alone (ring + glow + checkmark + medallion fill).
 *
 * Pure presentation: it owns no data and forwards press + a11y to the caller so
 * the screen keeps every handler/testID. A pressed-scale (reanimated shared
 * value) gives the tactile Aurora press feedback; the touch target is >= 44pt.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, StyleProp, Image, type ImageSourcePropType } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface DietPrefChipProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Optional premium PNG tile rendered inside the icon medallion instead of the
   * Ionicon glyph. When provided it wins over `icon` (which stays required so
   * the chip keeps a guaranteed glyph fallback); `resizeMode="contain"` keeps
   * the transparent tile crisp within the medallion.
   */
  image?: ImageSourcePropType;
  selected: boolean;
  onPress: () => void;
  /** Outer wrapper style — the screen uses this to set the grid column width. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function DietPrefChip({
  label,
  icon,
  image,
  selected,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: DietPrefChipProps) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
      style={style}
    >
      <Animated.View style={animatedStyle}>
        <GlassCard
          radius={borderRadius.xl}
          glow={selected ? colors.accent.coral : undefined}
          style={[
            styles.tile,
            {
              // Keep the border width CONSTANT (always 1.5) and only swap the
              // colour on selection — growing the width on select would nudge the
              // box and could jitter its grid-row neighbours.
              borderColor: selected
                ? colors.accent.coral
                : withAlpha(colors.text.primary, 0.1),
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={[styles.body, { padding: spacing.lg }]}>
            <View style={styles.topRow}>
              <View
                style={[
                  styles.iconMedallion,
                  {
                    backgroundColor: selected
                      ? colors.accent.coral
                      : withAlpha(colors.accent.coral, 0.14),
                    borderColor: selected
                      ? 'transparent'
                      : withAlpha(colors.accent.coral, 0.28),
                  },
                  selected ? shadows.glow(colors.accent.coral) : null,
                ]}
              >
                {image ? (
                  <Image source={image} style={styles.iconImage} resizeMode="contain" />
                ) : (
                  <Ionicons
                    name={icon}
                    size={22}
                    color={selected ? colors.text.inverse : colors.accent.coral}
                  />
                )}
              </View>

              {selected && (
                <View
                  style={[
                    styles.checkBadge,
                    { backgroundColor: colors.accent.coral },
                  ]}
                >
                  <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                </View>
              )}
            </View>

            <Text
              style={[
                typography.subhead,
                {
                  color: selected ? colors.text.primary : colors.text.secondary,
                  marginTop: spacing.md,
                },
              ]}
              numberOfLines={2}
            >
              {label}
            </Text>
          </View>
        </GlassCard>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 116,
  },
  body: {
    flex: 1,
    minHeight: 116,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconMedallion: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Roughly fills the 44pt medallion slot (with a little inset) so the premium
  // tile reads at the same visual weight the Ionicon glyph (size 22) did.
  iconImage: {
    width: 30,
    height: 30,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
