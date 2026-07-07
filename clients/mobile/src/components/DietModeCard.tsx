/**
 * DietModeCard — a wide onboarding selection row card (Aurora brand).
 *
 * Local-only helper used by the onboarding dietary-needs screen for the diet
 * mode options (Balanced, Mass Gain, Cutting, Budget, Acne Safe, Ramadan). A
 * full-width frosted GlassCard row: a lime-accented icon medallion on the left,
 * a bold title + one-line description in the middle, and a trailing selection
 * indicator. When `selected` it lifts to a lime (`accent.coral`) hairline ring +
 * soft glow, fills the medallion solid lime with an ink glyph, and swaps the
 * trailing dot for a lime checkmark — selection is never colour-only.
 *
 * Pure presentation: owns no data, forwards press + a11y so the screen keeps
 * every handler/testID. Pressed-scale via a reanimated shared value; the row is
 * comfortably above the 44pt minimum touch target.
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

export interface DietModeCardProps {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Optional premium PNG tile rendered inside the icon medallion instead of the
   * Ionicon glyph. When provided it wins over `icon` (which stays required so
   * the row keeps a guaranteed glyph fallback); `resizeMode="contain"` keeps the
   * transparent tile crisp within the medallion.
   */
  image?: ImageSourcePropType;
  selected: boolean;
  onPress: () => void;
  /** Outer wrapper style — the screen uses this for row spacing. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function DietModeCard({
  label,
  description,
  icon,
  image,
  selected,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: DietModeCardProps) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: 110 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 140 });
      }}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? `${label}. ${description}`}
      style={style}
    >
      <Animated.View style={animatedStyle}>
        <GlassCard
          radius={borderRadius.xl}
          glow={selected ? colors.accent.coral : undefined}
          style={{
            borderColor: selected
              ? colors.accent.coral
              : withAlpha(colors.text.primary, 0.1),
            borderWidth: 1.5,
          }}
        >
          <View style={[styles.row, { padding: spacing.lg }]}>
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

            <View style={[styles.textBlock, { marginLeft: spacing.lg }]}>
              <Text
                style={[
                  typography.subhead,
                  { color: selected ? colors.text.primary : colors.text.secondary },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <Text
                style={[typography.bodySm, { color: colors.text.tertiary, marginTop: spacing.xxs }]}
                numberOfLines={1}
              >
                {description}
              </Text>
            </View>

            {selected ? (
              <View style={[styles.checkBadge, { backgroundColor: colors.accent.coral }]}>
                <Ionicons name="checkmark" size={16} color={colors.text.inverse} />
              </View>
            ) : (
              <View
                style={[
                  styles.emptyDot,
                  { borderColor: withAlpha(colors.text.primary, 0.18) },
                ]}
              />
            )}
          </View>
        </GlassCard>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
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
  textBlock: {
    flex: 1,
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
