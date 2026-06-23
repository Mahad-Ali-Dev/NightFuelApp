/**
 * CycleBasicsParts — local presentational pieces for the onboarding cycle-basics
 * screen (app/(onboarding)/cycle-basics.tsx). These are VISUAL-only building
 * blocks; all state, validation and persistence live in the screen. They exist
 * so the sensitive cycle step matches the FEMALE-flow siblings' premium language
 * (metrics-goals SexCard / shift-type GoalGridCard) without bloating the screen.
 *
 * NOTHING here owns data — every value/handler is passed in. The screen keeps the
 * exact hooks, accessibility labels and the F25 store contract.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';

// ── SectionLabel ─────────────────────────────────────────────────────────────
// A leading lime icon + uppercase overline, matching the metrics-goals section
// headers. Pure label; no interaction.
export function SectionLabel({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={styles.sectionLabelRow}>
      <Ionicons name={icon} size={15} color={colors.accent.coral} style={{ marginRight: spacing.sm }} />
      <Text style={[typography.overline, { color: colors.text.secondary }]}>{label}</Text>
    </View>
  );
}

// ── ToggleRow ────────────────────────────────────────────────────────────────
// Title + supporting caption on the left, a control slot (a Switch) on the
// right. Used for the opt-in and hormonal toggles. The Switch itself is passed
// in by the screen so its `accessibilityLabel` / `onValueChange` (the exact
// strings the tests pin) stay on the screen.
export function ToggleRow({
  title,
  caption,
  control,
}: {
  title: string;
  caption: string;
  control: React.ReactNode;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={[typography.subhead, { color: colors.text.primary }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.xxs }]}>
          {caption}
        </Text>
      </View>
      {control}
    </View>
  );
}

// ── CycleLengthField ─────────────────────────────────────────────────────────
// A big tabular-mono numeric entry (the brand's "large bold numerals" for
// stats). Visible label + a "days" unit affix, error rendered BELOW as the
// recovery path. The TextInput keeps keyboardType="numeric", the additive
// maxLength cap and the accessibilityLabel the screen/tests rely on — the
// validation contract is unchanged; only the presentation is upgraded.
export function CycleLengthField({
  label,
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
  maxLength,
  error,
}: {
  label: string;
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  maxLength: number;
  error?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={{ flex: 1 }}>
      <Text style={[typography.bodyMedium, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
        {label}
      </Text>
      <View
        style={[
          styles.numBox,
          {
            backgroundColor: colors.background.secondary,
            // Focus feedback is COLOR-ONLY (border colour, constant width) to
            // avoid the Android focus-loop flicker the shared Input documents.
            // Error wins over focus.
            borderColor: error ? colors.error : focused ? colors.accent.coral : colors.border.default,
          },
        ]}
      >
        <TextInput
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="numeric"
          inputMode="numeric"
          maxLength={maxLength}
          selectionColor={colors.accent.coral}
          style={[styles.numInput, { color: colors.text.primary }]}
          maxFontSizeMultiplier={1.3}
        />
        <Text style={[typography.caption, { color: colors.text.tertiary }]}>days</Text>
      </View>
      {error ? (
        <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>{error}</Text>
      ) : null}
    </View>
  );
}

// ── RegularityCard ───────────────────────────────────────────────────────────
// A premium selection row for the "how regular is your cycle?" question. Mirrors
// the metrics-goals SexCard "chosen" language: dark-glass at rest; on `selected`
// a lime hairline + minimal glow, a lime icon medallion with an ink glyph, a
// bolder title and a checkmark badge. Colour is never the only signal (medallion
// fill + check + weight all shift). Pressed-scale 0.97 for tactile feedback.
export function RegularityCard({
  label,
  description,
  icon,
  selected,
  onPress,
  style,
}: {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [pressed ? { transform: [{ scale: 0.97 }] } : null, style]}
    >
      <GlassCard
        radius={borderRadius.xl}
        glow={selected ? colors.accent.coral : undefined}
        style={{
          // Constant 1.5 border width — only the colour changes on select so a
          // neighbour never reflows.
          borderColor: selected ? colors.accent.coral : withAlpha(colors.text.primary, 0.1),
          borderWidth: 1.5,
        }}
      >
        <View style={[styles.regBody, { padding: spacing.lg }]}>
          <View
            style={[
              styles.regMedallion,
              {
                backgroundColor: selected ? colors.accent.coral : withAlpha(colors.accent.coral, 0.14),
                borderColor: selected ? 'transparent' : withAlpha(colors.accent.coral, 0.28),
              },
              selected ? shadows.glow(colors.accent.coral) : null,
            ]}
          >
            <Ionicons name={icon} size={20} color={selected ? colors.text.inverse : colors.accent.coral} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[typography.subhead, { color: selected ? colors.text.primary : colors.text.secondary }]}>
              {label}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.xxs }]}>
              {description}
            </Text>
          </View>
          {selected ? (
            <View style={[styles.regCheck, { backgroundColor: colors.accent.coral }]}>
              <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
            </View>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 60,
    gap: 8,
  },
  numInput: {
    // Big tabular figure — the brand's "large bold numerals" for stats/entry.
    flex: 1,
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 26,
    height: '100%',
    paddingVertical: 0,
  },
  regBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  regMedallion: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  regCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
