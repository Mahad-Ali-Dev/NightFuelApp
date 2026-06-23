/**
 * PermissionCard — a premium per-permission row for the onboarding Permissions
 * screen.
 *
 * Each card states ONE access request: a tinted icon tile, the permission title,
 * a one-line rationale, an optional "Recommended" overline chip, and a native
 * Switch wired to the caller's state. When the permission is granted the card
 * lifts to a lime-tinted "Enabled" affordance with a check glyph — so the
 * granted state is conveyed by icon + text, never colour alone
 * (color-not-only). The Switch is the sole tap target, so it carries an
 * explicit hitSlop that restores a ≥44pt touch area on top of the slightly
 * downsized track.
 *
 * Purely presentational: it owns no permission logic. `value`/`onValueChange`
 * are forwarded verbatim to the Switch, and the optional `notice` slot renders
 * an honest, screen-reader-announced reason below the row (e.g. "needs a dev
 * build") without ever implying a connection. The screen keeps every hook and
 * the health-sync seam; this component only restyles.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  AccessibilityState,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface PermissionCardProps {
  /** Leading Ionicons glyph for the permission. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Accent the icon tile + enabled state borrow (a theme token, never raw hex). */
  accent: string;
  /** Permission title, e.g. "Push Notifications". */
  title: string;
  /** One-line rationale describing what the access unlocks. */
  rationale: string;
  /** Current grant state, forwarded to the Switch. */
  value: boolean;
  /** State setter / async handler, forwarded to the Switch verbatim. */
  onValueChange: (next: boolean) => void;
  /** accessibilityLabel for the Switch (kept identical to the original). */
  switchAccessibilityLabel: string;
  /** Shows a "Recommended" chip in the overline row when true. */
  recommended?: boolean;
  /** Optional honest notice (e.g. an unavailable reason) rendered below the row. */
  notice?: string | null;
}

export function PermissionCard({
  icon,
  accent,
  title,
  rationale,
  value,
  onValueChange,
  switchAccessibilityLabel,
  recommended = false,
  notice = null,
}: PermissionCardProps) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();

  // Granted = lime-tinted surface + brighter border + a check chip. The card
  // announces this with accessibilityState.selected so it isn't colour-only.
  const a11yState: AccessibilityState = { selected: value };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${title}. ${rationale}.`}
        accessibilityState={a11yState}
        style={[
          styles.card,
          {
            borderRadius: borderRadius.xl,
            padding: spacing.lg,
            backgroundColor: value
              ? withAlpha(accent, 0.08)
              : colors.background.secondary,
            borderColor: value ? withAlpha(accent, 0.45) : colors.border.default,
          },
          value ? shadows.glow(accent) : null,
        ]}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconTile,
              {
                borderRadius: borderRadius.lg,
                backgroundColor: withAlpha(accent, value ? 0.2 : 0.12),
                borderColor: withAlpha(accent, value ? 0.5 : 0.2),
              },
            ]}
          >
            <Ionicons name={icon} size={24} color={accent} />
          </View>

          <View style={styles.textStack}>
            {/* Overline row: required/recommended status, plus a live granted chip */}
            <View style={[styles.overlineRow, { marginBottom: spacing.xxs }]}>
              {recommended ? (
                <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                  Recommended
                </Text>
              ) : null}
              {value ? (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  style={[
                    styles.grantedChip,
                    {
                      borderRadius: borderRadius.full,
                      backgroundColor: withAlpha(accent, 0.16),
                      paddingHorizontal: spacing.sm,
                    },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={12} color={accent} />
                  <Text style={[typography.overline, { color: accent }]}>Enabled</Text>
                </Animated.View>
              ) : null}
            </View>

            <Text
              style={[typography.subhead, { color: colors.text.primary }]}
              maxFontSizeMultiplier={1.4}
            >
              {title}
            </Text>
            <Text
              style={[
                typography.bodySm,
                { color: colors.text.secondary, marginTop: spacing.xxs },
              ]}
              maxFontSizeMultiplier={1.5}
            >
              {rationale}
            </Text>
          </View>

          {/* The Switch is the sole tap target on the card. Its track is
              scaled to ~46×28pt, so an explicit hitSlop restores a ≥44pt
              touch area on every edge. accessibilityLabel + onValueChange are
              forwarded unchanged. */}
          <Switch
            value={value}
            onValueChange={onValueChange}
            accessibilityLabel={switchAccessibilityLabel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            trackColor={{ false: colors.border.light, true: accent }}
            thumbColor={colors.text.primary}
            ios_backgroundColor={colors.border.light}
            style={styles.switch}
          />
        </View>

        {/* Honest unavailable reason — explicit ternary-null (never falsy-&&),
            announced politely to screen readers, never implies a connection. */}
        {notice ? (
          <View
            style={[
              styles.noticeRow,
              {
                marginTop: spacing.md,
                paddingTop: spacing.md,
                borderTopColor: colors.border.default,
              },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={colors.text.tertiary}
              style={{ marginTop: 1 }}
            />
            <Text
              style={[styles.noticeText, typography.caption, { color: colors.text.tertiary }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {notice}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconTile: {
    width: 48,
    height: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textStack: {
    flex: 1,
    marginHorizontal: 14,
  },
  overlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grantedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  switch: {
    // Slightly downsized track keeps a tidy row while remaining ≥44pt tappable.
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderTopWidth: 1,
  },
  noticeText: {
    flex: 1,
  },
});
