/**
 * PrefSelectCard — a premium Zeitra 2-col selection tile for the Preferences screen.
 *
 * Local-only presentational helper (lives outside the shared `ui/` barrel) used
 * by app/(tabs)/profile/preferences.tsx for the dietary-preference grid. Renders a
 * half-width dark-glass tile with a lime-accented icon medallion + bold condensed
 * label. When `selected` it lifts to a lime (`accent.coral`) hairline ring + soft
 * glow, swaps the medallion to a solid lime fill with an INK glyph and reveals a
 * checkmark badge — selection is never signalled by colour alone (ring + glow +
 * medallion fill + checkmark). A springy pressed-scale (0.96) gives the tactile
 * Zeitra press feedback; the touch target is >= 44pt.
 *
 * Pure presentation: it owns no data and forwards press + a11y to the caller, so
 * the screen keeps every handler/testID exactly. Uses theme tokens only.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface PrefSelectCardProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  /** Outer wrapper style — the screen uses this to set the grid column width. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function PrefSelectCard({
  label,
  icon,
  selected,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: PrefSelectCardProps) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      style={style}
    >
      <Animated.View style={animatedStyle}>
        <GlassCard
          radius={borderRadius.xl}
          glow={selected ? colors.accent.coral : undefined}
          style={[
            styles.tile,
            {
              // Keep the border WIDTH constant (always 1.5) and only swap the
              // colour on selection so the box never nudges its grid neighbours.
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
                <Ionicons
                  name={icon}
                  size={20}
                  color={selected ? colors.text.inverse : colors.accent.coral}
                />
              </View>

              {selected && (
                <View style={[styles.checkBadge, { backgroundColor: colors.accent.coral }]}>
                  <Ionicons name="checkmark" size={13} color={colors.text.inverse} />
                </View>
              )}
            </View>

            <Text
              style={[
                typography.subhead,
                {
                  color: selected ? colors.text.primary : colors.text.secondary,
                  marginTop: spacing.sm,
                },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
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
    minHeight: 92,
  },
  body: {
    flex: 1,
    minHeight: 92,
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
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
