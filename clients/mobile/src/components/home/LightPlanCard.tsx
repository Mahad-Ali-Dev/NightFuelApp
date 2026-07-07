/**
 * LightPlanCard — the "Light plan" light-exposure coaching card.
 *
 * A read-only, presentational summary of the two light windows that matter when
 * a shift worker transitions around a shift, derived (locally, no backend) from
 * the user's next upcoming / just-logged shift:
 *   - seek bright light          (== the shift's brightLightWindow)
 *   - avoid light / blue-blockers (the ~2h dim-down lead before sleep)
 *
 * The window math lives in the pure, unit-tested `computeLightPlan`
 * (src/lib/lightPlan.ts), which routes through `computeShiftTransition` so this
 * card stays in lockstep with `ShiftTransitionCard` and the scheduled circadian
 * reminders. This component owns ZERO data-fetching: the parent passes the shift
 * plus loading/error flags — an IDENTICAL prop contract to ShiftTransitionCard —
 * keeping it trivially reusable and testable.
 *
 * States (mirroring ShiftTransitionCard):
 *   - loading            → Skeleton blocks
 *   - error              → inline message + Retry (via onRetry)
 *   - empty (no shift)   → EmptyState "Log a shift to see your light plan"
 *   - populated          → the two light windows
 *
 * The header doubles as a deep-link affordance ("Open your light plan") into the
 * sleep optimizer screen, so the card surfaces guidance AND a way to act on it.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { spacing, borderRadius as br, iconSizes } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { computeLightPlan } from '@/lib/lightPlan';
import { type ShiftLike } from '@/lib/shiftTransition';

export interface LightPlanCardProps {
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

interface LightRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: string;
}

function LightPlanCardComponent({ shift, loading, error, onRetry }: LightPlanCardProps) {
  const { colors } = useTheme();
  // `useRouter` is a hook and always returns the router inside the app tree; the
  // optional chaining on `onPress` below keeps the affordance harmless if the
  // navigation context is absent (e.g. an isolated unit test render).
  const router = useRouter();

  // A light-window row: tinted icon chip, label, and the computed window.
  const LightRow = ({ icon, tint, label, value }: LightRowProps) => (
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

  // Header doubles as the "Open your light plan" deep-link affordance.
  const Header = () => (
    <TouchableOpacity
      style={styles.header}
      onPress={() => router?.push('/(shifts)/sleep-optimizer' as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open your light plan"
    >
      <View style={[styles.headerIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.14) }]}>
        <Ionicons name="sunny" size={iconSizes.sm} color={colors.accent.amber} />
      </View>
      <Text style={[typography.subtitle, styles.headerLabel, { color: colors.text.primary }]}>Light plan</Text>
      <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.text.tertiary} />
    </TouchableOpacity>
  );

  // ---- Loading ------------------------------------------------------------
  if (loading) {
    return (
      <Card style={styles.card}>
        <Header />
        <View style={styles.skeletonGroup}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="58%" height={18} />
        </View>
      </Card>
    );
  }

  // ---- Error --------------------------------------------------------------
  if (error) {
    return (
      <Card style={styles.card}>
        <Header />
        <View style={styles.message}>
          <Ionicons name="cloud-offline-outline" size={iconSizes.lg} color={colors.text.tertiary} />
          <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
            Couldn’t load your light plan.
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
        <Header />
        <EmptyState
          icon="sunny-outline"
          title="No shift scheduled"
          subtitle="Log a shift to see your light plan"
          style={styles.empty}
        />
      </Card>
    );
  }

  // ---- Populated ----------------------------------------------------------
  // Guard the pure compute: a malformed shift (bad ISO) throws rather than
  // returning NaN windows — degrade to the same inline message as
  // ShiftTransitionCard's malformed branch instead of crashing the render tree.
  let plan;
  try {
    plan = computeLightPlan(shift);
  } catch {
    return (
      <Card style={styles.card}>
        <Header />
        <View style={styles.message}>
          <Ionicons name="alert-circle-outline" size={iconSizes.lg} color={colors.text.tertiary} />
          <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
            This shift’s times look off — re-log it to see your plan.
          </Text>
        </View>
      </Card>
    );
  }

  const { seekLight, avoidLight } = plan;

  return (
    <Card style={styles.card}>
      <Header />
      <View style={styles.anchors}>
        <LightRow
          icon="sunny"
          tint={colors.accent.amber}
          label="Seek bright light"
          value={`${formatTime(seekLight.start)} – ${formatTime(seekLight.end)}`}
        />
        <LightRow
          icon="glasses-outline"
          tint={colors.accent.purple}
          label="Avoid light / blue-blockers"
          value={`${formatTime(avoidLight.start)} – ${formatTime(avoidLight.end)}`}
        />
      </View>
    </Card>
  );
}

/**
 * Memoized: `shift` is a small stable object, the flags are primitives, and
 * `onRetry` is expected to be a stable callback from the parent.
 */
const LightPlanCard = React.memo(LightPlanCardComponent);

export default LightPlanCard;

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
  headerLabel: {
    flex: 1,
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
