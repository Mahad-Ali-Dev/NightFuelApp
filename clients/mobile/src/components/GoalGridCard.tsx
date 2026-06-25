/**
 * GoalGridCard — a bold, full-bleed onboarding selection tile (Aurora brand).
 *
 * Local-only helper used by the onboarding goal screen. Renders a single square
 * grid tile: a frosted GlassCard body with a large lime-accented icon medallion,
 * a bold title and a one-line description. When `selected` it lifts to a lime
 * (`accent.coral`) hairline ring + soft glow, swaps the medallion to a solid lime
 * fill with ink glyph, and reveals a checkmark badge — the premium "chosen" state.
 *
 * Pure presentation: it owns no data and forwards press + a11y to the caller so
 * the screen keeps every handler/testID. A pressed-scale (reanimated shared
 * value) gives the tactile Aurora press feedback.
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

export interface GoalGridCardProps {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Optional premium PNG tile rendered inside the icon medallion instead of the
   * Ionicon glyph. When provided it wins over `icon` (which stays required so
   * the tile keeps a guaranteed glyph fallback); `resizeMode="contain"` keeps
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

export function GoalGridCard({
  label,
  description,
  icon,
  image,
  selected,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: GoalGridCardProps) {
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
          radius={borderRadius['2xl']}
          glow={selected ? colors.accent.coral : undefined}
          style={[
            styles.tile,
            {
              // Keep the border width CONSTANT (always 1.5) and only swap the
              // colour on selection — growing the width on select nudged the
              // box by 0.5px and could jitter/reflow its grid-row neighbours.
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
                    size={26}
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
                  <Ionicons name="checkmark" size={15} color={colors.text.inverse} />
                </View>
              )}
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <Text
                style={[
                  typography.h3,
                  { color: colors.text.primary, marginBottom: spacing.xxs },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <Text
                style={[typography.bodySm, { color: colors.text.secondary }]}
                numberOfLines={2}
              >
                {description}
              </Text>
            </View>
          </View>
        </GlassCard>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 168,
  },
  body: {
    flex: 1,
    minHeight: 168,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconMedallion: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Roughly fills the 52pt medallion slot (with a little inset) so the premium
  // tile reads at the same visual weight the Ionicon glyph (size 26) did.
  iconImage: {
    width: 36,
    height: 36,
  },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
