/**
 * AnchorSleepCard — the "Anchor sleep" core-sleep coaching card.
 *
 * A read-only, presentational summary of the single fixed core-sleep block a
 * shift worker should hold steady across a rotation, derived (locally, no
 * backend) from the user's next upcoming / just-logged shift. The primary
 * "Anchor sleep (4h core)" window IS the fixed core block from the pure,
 * unit-tested `computeAnchorSleep` (src/lib/circadian/anchorSleep.ts) —
 * `sleepWindow.start … +ANCHOR_SLEEP_HOURS` (4h) — keeping this card in lockstep
 * with the scheduled `nf-anchor-sleep` reminder, whose body coaches the same 4h
 * core block. We REUSE that helper rather than re-deriving any instants: there
 * is no new circadian math here. A secondary "Full sleep window" line surfaces
 * the surrounding ~8h recovery `sleepWindow` from `computeShiftTransition` for
 * context (the anchor sits within it: anchor.start === sleepWindow.start,
 * anchor.end <= sleepWindow.end).
 *
 * This component owns ZERO data-fetching: the parent passes the shift plus
 * loading/error flags — an IDENTICAL prop contract to LightPlanCard /
 * ShiftTransitionCard — keeping it trivially reusable and testable.
 *
 * States (mirroring LightPlanCard):
 *   - loading            → Skeleton blocks
 *   - error              → inline message + Retry (via onRetry)
 *   - empty (no shift)   → EmptyState "Log a shift to see your anchor sleep"
 *   - populated          → the 4h anchor window (+ a Full sleep window context
 *                          line) + a short WHY
 *
 * The header doubles as a deep-link affordance ("Open your anchor sleep plan")
 * into the sleep optimizer screen, so the card surfaces guidance AND a way to
 * act on it.
 *
 * UI primitives / rules consulted under ~/.claude/skills/react-native-skills/rules/:
 *   - design-system-compound-components.md + imports-design-system-folder.md:
 *     the dark-glass surface comes from the GlassCard primitive imported from
 *     '@/components/ui' (NEVER an inline SafeBlurView — the check-no-inline-glass
 *     HARD guard); Retry uses the Button primitive from the same barrel.
 *   - rendering-no-falsy-and.md: every conditional is an early return or a
 *     ternary-with-null — no `cond && <JSX>` that could leak a falsy value into
 *     the tree.
 *   - react-compiler-destructure-functions.md: `push` is destructured from
 *     useRouter() at the top of render (stable reference, no dotting), and the
 *     default export is wrapped in React.memo — `shift` is a small stable
 *     object, the flags are primitives, and `onRetry` is a stable parent
 *     callback (LightPlanCard's reasoning).
 *   - animation-gesture-detector-press.md: the tappable header is a plain
 *     navigation touch (no animated press state, matching the sibling cards), so
 *     it stays a TouchableOpacity rather than a GestureDetector; it carries an
 *     accessibilityRole="button" + a descriptive accessibilityLabel, while the
 *     decorative icon chips are left unannounced and the window is plain Text.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard, Skeleton, EmptyState, Button } from '@/components/ui';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { spacing, borderRadius as br, iconSizes } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { computeShiftTransition, type ShiftLike } from '@/lib/shiftTransition';
import { computeAnchorSleep } from '@/lib/circadian/anchorSleep';

export interface AnchorSleepCardProps {
  /** The user's next upcoming / logged shift, or null/undefined when none. */
  shift?: ShiftLike | null;
  /** Show the loading skeleton (e.g. while the shift query is in flight). */
  loading?: boolean;
  /** Truthy when the shift query failed; renders the error state + Retry. */
  error?: unknown;
  /** Invoked when the user taps Retry in the error state. */
  onRetry?: () => void;
}

/** Short, honest rationale shown beneath the populated anchor window. */
const ANCHOR_SLEEP_WHY =
  'A fixed core-sleep block held steady across your rotation stabilizes your body clock.';

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

function AnchorSleepCardComponent({ shift, loading, error, onRetry }: AnchorSleepCardProps) {
  const { colors } = useTheme();
  // Destructure `push` from the router up front (React Compiler: a stable
  // reference, no dotting). The optional chaining on `onPress` keeps the
  // affordance harmless if the navigation context is absent (e.g. an isolated
  // unit-test render).
  const { push } = useRouter() ?? {};

  // Header doubles as the "Open your anchor sleep plan" deep-link affordance.
  const Header = () => (
    <TouchableOpacity
      style={styles.header}
      onPress={() => push?.('/(shifts)/sleep-optimizer' as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open your anchor sleep plan"
    >
      <View style={[styles.headerIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.14) }]}>
        <Ionicons name="moon" size={iconSizes.sm} color={colors.accent.purple} />
      </View>
      <Text style={[typography.subtitle, styles.headerLabel, { color: colors.text.primary }]}>Anchor sleep</Text>
      <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.text.tertiary} />
    </TouchableOpacity>
  );

  // ---- Loading ------------------------------------------------------------
  if (loading) {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.body}>
          <Header />
          <View style={styles.skeletonGroup}>
            <Skeleton width="70%" height={18} />
            <Skeleton width="84%" height={14} />
          </View>
        </View>
      </GlassCard>
    );
  }

  // ---- Error --------------------------------------------------------------
  if (error) {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.body}>
          <Header />
          <View style={styles.message}>
            <Ionicons name="cloud-offline-outline" size={iconSizes.lg} color={colors.text.tertiary} />
            <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
              Couldn’t load your anchor sleep.
            </Text>
            {onRetry ? (
              <Button title="Retry" variant="secondary" size="sm" onPress={onRetry} style={styles.retry} />
            ) : null}
          </View>
        </View>
      </GlassCard>
    );
  }

  // ---- Empty (no upcoming shift) -----------------------------------------
  if (!shift || !shift.startTime || !shift.endTime) {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.body}>
          <Header />
          <EmptyState
            icon="moon-outline"
            title="No shift scheduled"
            subtitle="Log a shift to see your anchor sleep"
            style={styles.empty}
          />
        </View>
      </GlassCard>
    );
  }

  // ---- Populated ----------------------------------------------------------
  // Guard the pure compute: a malformed shift (bad ISO) throws rather than
  // returning NaN instants — degrade to the same inline message as
  // LightPlanCard's malformed branch instead of crashing the render tree.
  let plan: ReturnType<typeof computeAnchorSleep>;
  try {
    plan = computeAnchorSleep(shift);
  } catch {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.body}>
          <Header />
          <View style={styles.message}>
            <Ionicons name="alert-circle-outline" size={iconSizes.lg} color={colors.text.tertiary} />
            <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
              This shift’s times look off — re-log it to see your plan.
            </Text>
          </View>
        </View>
      </GlassCard>
    );
  }

  const { anchor } = plan;
  // The surrounding ~8h recovery window for the secondary context line. Do NOT
  // recompute offsets — read it straight off the shared engine (the same source
  // computeAnchorSleep routes through), so the anchor provably sits within it
  // (anchor.start === sw.start, anchor.end <= sw.end).
  const sw = computeShiftTransition(shift).sleepWindow;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.body}>
        <Header />
        <View style={styles.anchor}>
          <View style={[styles.iconChip, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.28) }]}>
            <Ionicons name="moon" size={iconSizes.sm} color={colors.accent.purple} />
          </View>
          <View style={styles.anchorText}>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>Anchor sleep (4h core)</Text>
            <Text style={[typography.subtitle, { color: colors.text.primary }]}>
              {`${formatTime(anchor.start)} – ${formatTime(anchor.end)}`}
            </Text>
            <Text style={[typography.caption, styles.fullWindow, { color: colors.text.tertiary }]}>
              {`Full sleep window  ${formatTime(sw.start)} – ${formatTime(sw.end)}`}
            </Text>
          </View>
        </View>
        <Text style={[typography.bodySm, styles.why, { color: colors.text.secondary }]}>{ANCHOR_SLEEP_WHY}</Text>
      </View>
    </GlassCard>
  );
}

/**
 * Memoized: `shift` is a small stable object, the flags are primitives, and
 * `onRetry` is expected to be a stable callback from the parent (LightPlanCard's
 * reasoning — see react-compiler-destructure-functions.md).
 */
const AnchorSleepCard = React.memo(AnchorSleepCardComponent);

export default AnchorSleepCard;

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  // GlassCard owns no internal padding (unlike Card), so the body supplies it —
  // matching the lg padding the sibling Card-based cards render with.
  body: {
    padding: spacing.lg,
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
  anchor: {
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
  anchorText: {
    flex: 1,
  },
  fullWindow: {
    marginTop: spacing.xs,
  },
  why: {
    marginTop: spacing.md,
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
