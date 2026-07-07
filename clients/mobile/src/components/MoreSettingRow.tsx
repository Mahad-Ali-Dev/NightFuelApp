/**
 * MoreSettingRow — a single premium grouped-list row for the More tab.
 *
 * Local-only presentational helper (lives outside the shared `ui/` barrel) used
 * by app/(tabs)/more.tsx. It renders the icon-chip → label → (value? + chevron)
 * pattern with a springy pressed-scale 0.96 micro-interaction via Reanimated,
 * while preserving the screen's exact interaction contract:
 *   - the caller passes `onPress`, `disabled`, and every a11y prop verbatim;
 *   - a genuinely actionless row (no route / no url / not a switch) is rendered
 *     dimmed, chevron-suppressed and accessibilityState.disabled — identical to
 *     the prior inline behaviour;
 *   - switch rows render their control inline and never animate scale.
 *
 * Visual only — no data, no navigation. All hooks/handlers stay in the screen.
 */
import React from 'react';
import { View, Text, StyleSheet, Switch, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface MoreSettingRowProps {
  label: string;
  icon: string;
  /** Right-aligned trailing value text (e.g. "Pro Tier"). */
  valueText?: string;
  /** When true, render an inline Switch instead of a chevron. */
  isSwitch?: boolean;
  /** Current switch state (only consulted when isSwitch). */
  switchValue?: boolean;
  onSwitchChange?: (val: boolean) => void;
  /** Genuinely actionless row → dimmed, no chevron, disabled. */
  disabled?: boolean;
  /** Hairline divider under the row (false on the last item of a group). */
  showDivider?: boolean;
  /** Tint for the icon chip + glyph. Defaults to the brand lime. */
  tint?: string;
  onPress?: () => void;
  // a11y — forwarded verbatim from the screen.
  accessibilityRole?: 'button' | 'link';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function MoreSettingRow({
  label,
  icon,
  valueText,
  isSwitch,
  switchValue,
  onSwitchChange,
  disabled,
  showDivider,
  tint,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  style,
}: MoreSettingRowProps) {
  const { colors, typography, spacing } = useTheme();
  const chipTint = tint ?? colors.accent.coral;

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const rowBody = (
    <>
      <View style={styles.itemLeft}>
        <View style={[styles.itemIcon, { backgroundColor: withAlpha(chipTint, 0.12), borderColor: withAlpha(chipTint, 0.22) }]}>
          <Ionicons name={icon as any} size={19} color={chipTint} />
        </View>
        <Text
          style={[typography.bodyMedium, { color: colors.text.primary, marginLeft: spacing.md, flexShrink: 1 }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {label}
        </Text>
      </View>

      {isSwitch ? (
        <Switch
          accessibilityLabel={label}
          value={!!switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ true: colors.accent.purple, false: colors.border.light }}
          thumbColor={colors.text.primary}
          ios_backgroundColor={colors.border.default}
        />
      ) : (
        <View style={styles.itemRight}>
          {valueText ? (
            <View style={[styles.valuePill, { backgroundColor: withAlpha(chipTint, 0.12), borderColor: withAlpha(chipTint, 0.22) }]}>
              <Text style={[typography.captionMedium, { color: chipTint }]} maxFontSizeMultiplier={1.4}>{valueText}</Text>
            </View>
          ) : null}
          {/* Suppress the chevron on genuinely disabled rows so the UI never
              implies a tap target that does nothing. */}
          {disabled ? null : <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} style={{ marginLeft: spacing.sm }} />}
        </View>
      )}
    </>
  );

  const divider: StyleProp<ViewStyle> = showDivider
    ? { borderBottomColor: colors.border.default, borderBottomWidth: StyleSheet.hairlineWidth }
    : null;

  // Switch rows are not pressable as a whole (the Switch owns the gesture) — keep
  // them a plain View so the toggle stays the only interactive target, exactly
  // as before.
  if (isSwitch) {
    return (
      <View style={[styles.settingItem, divider, style]}>
        {rowBody}
      </View>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 320 }); }}
      hitSlop={6}
      style={[styles.settingItem, divider, disabled ? styles.disabled : null, animatedStyle, style]}
    >
      {rowBody}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, minHeight: 56 },
  disabled: { opacity: 0.45 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 },
  itemRight: { flexDirection: 'row', alignItems: 'center' },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  valuePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
});
