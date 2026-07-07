/**
 * ShiftTransitionCard — the "Next shift transition" circadian readiness card.
 *
 * A read-only, presentational summary of the three transition anchors derived
 * (locally, no backend) from the user's next upcoming / just-logged shift:
 *   - recommended sleep window
 *   - caffeine cutoff
 *   - bright-light timing
 *
 * The anchor math lives in the pure, unit-tested `computeShiftTransition`
 * (src/lib/shiftTransition.ts), which mirrors the offsets used by the local
 * circadian reminders (buildShiftReminders) — so this card and the scheduled
 * notifications tell the same story. This component owns ZERO data-fetching: the
 * parent passes the shift plus loading/error flags, keeping it trivially
 * reusable and testable.
 *
 * States:
 *   - loading            → Skeleton blocks
 *   - error              → inline message + Retry (via onRetry)
 *   - empty (no shift)   → EmptyState "Log a shift to see your transition plan"
 *   - populated          → the three anchors
 *
 * INTEGRATION NOTE (follow-up, intentionally NOT done here): wire this into a
 * home/dashboard screen by querying the current shift (api/shifts.getCurrent)
 * and passing `{ shift, loading, error, onRetry }`. That edit touches a
 * foundational screen owned elsewhere, so it is deliberately left out to keep
 * this change purely additive and collision-free.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useTheme, type ThemeColors } from '@/theme';
import { typography } from '@/theme/typography';
import { spacing, borderRadius as br, iconSizes } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { computeShiftTransition, type ShiftLike } from '@/lib/shiftTransition';

export interface ShiftTransitionCardProps {
  /** The user's next upcoming / logged shift, or null/undefined when none. */
  shift?: ShiftLike | null;
  /** Show the loading skeleton (e.g. while the shift query is in flight). */
  loading?: boolean;
  /** Truthy when the shift query failed; renders the error state + Retry. */
  error?: unknown;
  /** Invoked when the user taps Retry in the error state. */
  onRetry?: () => void;
}

/** Format an anchor instant as a short device-local time, e.g. "11:30 PM". */
function formatTime(d: Date): string {
  try {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    // Some RN engines lack full Intl; fall back to a stable HH:MM.
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

interface AnchorRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: string;
  /**
   * Themed palette threaded in as a prop (rather than read from `useTheme`
   * inside the row) so this stays a pure, allocation-free module-scope
   * component — a stable top-level identity React never treats as a "new"
   * component type, per react-native-skills
   * list-performance-function-references.md /
   * react-compiler-destructure-functions.md.
   */
  colors: ThemeColors;
}

/**
 * An anchor row: tinted icon chip, label, and the computed time(s). Hoisted to
 * module scope (was a closure inside the render body) so its identity is stable
 * across renders — using it as `<AnchorRow … />` no longer remounts a fresh
 * subtree every render of the memoized card.
 */
const AnchorRow = React.memo(function AnchorRow({ icon, tint, label, value, colors }: AnchorRowProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconChip, { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.28) }]}>
        <Ionicons name={icon} size={iconSizes.sm} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{label}</Text>
        <Text style={[typography.subtitle, { color: colors.text.primary }]}>{value}</Text>
      </View>
    </View>
  );
});

/**
 * The card header. Hoisted to module scope alongside AnchorRow for the same
 * reason: a stable top-level component identity rather than a per-render
 * closure. The themed palette is passed in via `colors`.
 */
function Header({ colors }: { colors: ThemeColors }) {
  return (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.14) }]}>
        <Ionicons name="moon" size={iconSizes.sm} color={colors.accent.purple} />
      </View>
      <Text style={[typography.subtitle, { color: colors.text.primary }]}>Next shift transition</Text>
    </View>
  );
}

function ShiftTransitionCardComponent({ shift, loading, error, onRetry }: ShiftTransitionCardProps) {
  const { colors } = useTheme();

  // ---- Loading ------------------------------------------------------------
  if (loading) {
    return (
      <Card style={styles.card}>
        <Header colors={colors} />
        <View style={styles.skeletonGroup}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="55%" height={18} />
          <Skeleton width="62%" height={18} />
        </View>
      </Card>
    );
  }

  // ---- Error --------------------------------------------------------------
  if (error) {
    return (
      <Card style={styles.card}>
        <Header colors={colors} />
        <View style={styles.message}>
          <Ionicons name="cloud-offline-outline" size={iconSizes.lg} color={colors.text.tertiary} />
          <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
            Couldn’t load your transition plan.
          </Text>
          {onRetry ? (
            <Button title="Retry" variant="secondary" size="sm" onPress={onRetry} style={styles.retry} />
          ) : null}
        </View>
      </Card>
    );
  }

  // ---- Empty (no upcoming shift) -----------------------------------------
  if (!shift || !shift.startTime || !shift.endTime) {
    return (
      <Card style={styles.card}>
        <Header colors={colors} />
        <EmptyState
          icon="moon-outline"
          title="No shift scheduled"
          subtitle="Log a shift to see your transition plan"
          style={styles.empty}
        />
      </Card>
    );
  }

  // ---- Populated ----------------------------------------------------------
  // Guard the pure compute: a malformed shift (bad ISO) throws rather than
  // returning NaN anchors — degrade to the same error treatment instead of
  // crashing the render tree.
  let transition;
  try {
    transition = computeShiftTransition(shift);
  } catch {
    return (
      <Card style={styles.card}>
        <Header colors={colors} />
        <View style={styles.message}>
          <Ionicons name="alert-circle-outline" size={iconSizes.lg} color={colors.text.tertiary} />
          <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
            This shift’s times look off — re-log it to see your plan.
          </Text>
        </View>
      </Card>
    );
  }

  const { sleepWindow, caffeineCutoff, brightLightWindow } = transition;

  return (
    <Card style={styles.card}>
      <Header colors={colors} />
      <View style={styles.anchors}>
        <AnchorRow
          icon="moon"
          tint={colors.accent.purple}
          label="Recommended sleep"
          value={`${formatTime(sleepWindow.start)} – ${formatTime(sleepWindow.end)}`}
          colors={colors}
        />
        <AnchorRow
          icon="cafe"
          tint={colors.accent.amber}
          label="Caffeine cutoff"
          value={formatTime(caffeineCutoff)}
          colors={colors}
        />
        <AnchorRow
          icon="sunny"
          tint={colors.accent.cyan}
          label="Bright light"
          value={`${formatTime(brightLightWindow.start)} – ${formatTime(brightLightWindow.end)}`}
          colors={colors}
        />
      </View>
    </Card>
  );
}

/**
 * Memoized: `shift` is a small stable object, the flags are primitives, and
 * `onRetry` is expected to be a stable callback from the parent.
 */
const ShiftTransitionCard = React.memo(ShiftTransitionCardComponent);

export default ShiftTransitionCard;

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: br.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  anchors: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: br.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  skeletonGroup: {
    gap: spacing.md,
  },
  message: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  messageText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 260,
  },
  retry: {
    marginTop: spacing.lg,
  },
  empty: {
    paddingVertical: spacing.xl,
  },
});
