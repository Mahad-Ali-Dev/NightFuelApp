/**
 * SettingsRow — a single premium grouped-list row for the Settings home
 * (app/(settings)/index.tsx).
 *
 * Local-only presentational helper (kept outside the shared `ui/` barrel) that
 * renders the Zeitra icon-chip → label → (value-pill + chevron | inline Switch)
 * pattern with a springy pressed-scale 0.96 micro-interaction (Reanimated,
 * transform-only). It is a sibling to <MoreSettingRow> but adds the two things
 * the Settings home needs and that the More-tab row does not:
 *
 *   1. an optional two-line `subtitle` under the label (used by "Night Read"), and
 *   2. a lime switch track (`colors.accent.coral`) — preserving this screen's
 *      original Dark Mode / Night Read switch styling rather than the More tab's
 *      purple track.
 *
 * Every interaction + a11y prop is forwarded VERBATIM from the screen so the
 * caller keeps full control of semantics:
 *   - `onPress`, `disabled`, `accessibilityRole/Label` pass straight through;
 *   - a genuinely actionless row (no route / no url / not a switch) renders
 *     dimmed, chevron-suppressed and accessibilityState.disabled;
 *   - switch rows render their control inline, never animate scale, and the
 *     caller supplies both `switchValue` AND the matching `accessibilityState`
 *     `checked` flag so the visible state and the announced state can't diverge.
 *
 * Visual only — no data, no navigation, no business logic. All hooks/handlers
 * stay in the screen. The theme and shared primitives are never touched.
 */
import React from 'react';
import {
  View, Text, StyleSheet, Switch, Pressable,
  type StyleProp, type ViewStyle, type AccessibilityRole,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SettingsRowProps {
  label: string;
  icon: string;
  /** Optional secondary line under the label (e.g. the Night Read explainer). */
  subtitle?: string;
  /** Right-aligned trailing value text rendered as a tinted pill (e.g. "Pro"). */
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
  /** Tint for the icon chip + glyph + value pill. Defaults to the brand lime. */
  tint?: string;
  onPress?: () => void;
  // a11y — forwarded verbatim from the screen.
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  /**
   * Forwarded verbatim onto the row (non-switch) or the inline Switch. The
   * screen owns the source of truth for `checked` so the visible switch state
   * and the announced state are guaranteed identical.
   */
  accessibilityState?: { checked?: boolean; disabled?: boolean };
  style?: StyleProp<ViewStyle>;
}

export function SettingsRow({
  label,
  icon,
  subtitle,
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
  accessibilityState,
  style,
}: SettingsRowProps) {
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
        <View style={{ marginLeft: spacing.md, flexShrink: 1 }}>
          <Text
            style={[typography.bodyMedium, { color: colors.text.primary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {label}
          </Text>
          {subtitle ? (
            <Text
              style={[typography.caption, { color: colors.text.secondary, marginTop: 3 }]}
              maxFontSizeMultiplier={1.4}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {isSwitch ? (
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={accessibilityState}
          value={!!switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.border.default, true: colors.accent.coral }}
          thumbColor={colors.text.primary}
          ios_backgroundColor={colors.border.default}
        />
      ) : (
        <View style={styles.itemRight}>
          {valueText ? (
            <View style={[styles.valuePill, { backgroundColor: withAlpha(chipTint, 0.12), borderColor: withAlpha(chipTint, 0.22) }]}>
              <Text style={[typography.captionMedium, { color: chipTint }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>{valueText}</Text>
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
  // them a plain View so the toggle stays the only interactive target.
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
      accessibilityState={accessibilityState ?? { disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }); }}
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
  valuePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, maxWidth: 120 },
});
