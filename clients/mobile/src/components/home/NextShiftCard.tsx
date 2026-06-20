/**
 * NextShiftCard — the dashboard's "Next shift" countdown card.
 *
 * Today the SHIFT COUNTDOWN HERO only shows the user's CURRENT shift ("Rest
 * Mode" when none) — nothing tells a worker WHEN their next shift starts. This
 * card fills that gap: given the user's shifts (api/shifts.list()'s ±366d
 * window), it surfaces the soonest UPCOMING clock-in — its kind, a live
 * countdown, and the absolute start time.
 *
 * The selection + countdown math lives in the pure, unit-tested helpers in
 * src/lib/nextShift.ts (`getNextShift` / `formatStartsIn`). `formatStartsIn`
 * reuses the SAME absolute-instant `floor((start − now) / 60000)` math as the
 * dashboard's getCountdown, so the card and the hero speak the same countdown
 * language from one source (no duplicated math). This component owns ZERO
 * data-fetching: the parent passes the shifts plus loading/error flags — the
 * SAME prop contract as ShiftTransitionCard / LightPlanCard — keeping it
 * trivially reusable and testable.
 *
 * States (mirroring ShiftTransitionCard, ternary-null only):
 *   - loading                    → Skeleton blocks
 *   - error                      → inline message + Retry (via onRetry)
 *   - empty (no upcoming shift)  → EmptyState "No upcoming shift scheduled" with
 *                                  a "View shifts" link into the shifts stack
 *   - populated                  → shift.type + "starts in <countdown>" + the
 *                                  absolute start time
 *
 * Rendered on a real <GlassCard> (the Aurora dark-glass primitive) — no inline
 * SafeBlurView, no coral CTA.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useTheme, type ThemeColors } from '@/theme';
import { typography } from '@/theme/typography';
import { spacing, borderRadius as br, iconSizes } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { getNextShift, formatStartsIn, type ShiftLike } from '@/lib/nextShift';
import type { Shift } from '@/api/shifts';

/**
 * testID forwarded to the outer GlassCard wrapper in EVERY state. Inert in
 * production (testIDs aren't rendered), it lets the test suite assert this card
 * is a REAL <GlassCard> (the Aurora glass primitive) — never an inline
 * SafeBlurView — without coupling to expo-blur internals.
 */
export const NEXT_SHIFT_CARD_TEST_ID = 'next-shift-card';

export interface NextShiftCardProps {
  /** The user's shifts (e.g. api/shifts.list()), or null/undefined when none. */
  shifts?: Shift[] | null;
  /** Show the loading skeleton (e.g. while the shifts query is in flight). */
  loading?: boolean;
  /** Truthy when the shifts query failed; renders the error state + Retry. */
  error?: unknown;
  /** Invoked when the user taps Retry in the error state. */
  onRetry?: () => void;
}

/**
 * Format a start instant as a short device-local time, e.g. "11:30 PM".
 * Guarded per js-hoist-intl: `toLocaleTimeString` can throw on RN engines that
 * lack full Intl, so we fall back to a stable HH:MM — mirroring
 * ShiftTransitionCard.formatTime exactly.
 */
function formatTime(d: Date): string {
  try {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

/**
 * The card header. Hoisted to module scope (a stable top-level component
 * identity rather than a per-render closure, per
 * react-compiler-destructure-functions.md /
 * list-performance-function-references.md). The themed palette is threaded in
 * via `colors` rather than read from `useTheme` inside, so it stays a pure,
 * allocation-free subcomponent.
 */
const Header = React.memo(function Header({ colors }: { colors: ThemeColors }) {
  return (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.14) }]}>
        <Ionicons name="time" size={iconSizes.sm} color={colors.accent.cyan} />
      </View>
      <Text style={[typography.subtitle, { color: colors.text.primary }]}>Next shift</Text>
    </View>
  );
});

interface BodyProps {
  /** The shift kind, e.g. "night". */
  type: string;
  /** Countdown string from formatStartsIn, e.g. "7h 20m", or null. */
  countdown: string | null;
  /** Absolute start time, already formatted (formatTime). */
  startsAt: string;
  colors: ThemeColors;
}

/**
 * The populated body: the shift kind, a "starts in <countdown>" line, and the
 * absolute start time. Hoisted to module scope alongside Header for the same
 * stable-identity reason. Uses ternary-null (never `&&` on a possibly-empty
 * string, per rendering-no-falsy-and.md).
 */
const Body = React.memo(function Body({ type, countdown, startsAt, colors }: BodyProps) {
  return (
    <View style={styles.body}>
      <View style={styles.bodyText}>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>Upcoming shift</Text>
        <Text style={[typography.h3, { color: colors.text.primary }]} numberOfLines={1}>
          {type}
        </Text>
        {countdown ? (
          <Text style={[typography.body, styles.countdown, { color: colors.accent.cyan }]}>
            {`starts in ${countdown}`}
          </Text>
        ) : (
          <Text style={[typography.body, styles.countdown, { color: colors.text.secondary }]}>
            starting now
          </Text>
        )}
      </View>
      <View style={[styles.timeChip, { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.28) }]}>
        <Text style={[typography.subtitle, { color: colors.text.primary }]}>{startsAt}</Text>
      </View>
    </View>
  );
});

function NextShiftCardComponent({ shifts, loading, error, onRetry }: NextShiftCardProps) {
  const { colors } = useTheme();
  // Destructure `push` early so it's a stable reference (react-compiler-
  // destructure-functions). The optional chaining on the empty-state link keeps
  // the affordance harmless if the navigation context is absent (isolated test).
  const { push } = useRouter();

  // ---- Loading ------------------------------------------------------------
  if (loading) {
    return (
      <GlassCard testID={NEXT_SHIFT_CARD_TEST_ID} style={styles.card}>
        <View style={styles.inner}>
          <Header colors={colors} />
          <View style={styles.skeletonGroup}>
            <Skeleton width="55%" height={22} />
            <Skeleton width="40%" height={16} />
          </View>
        </View>
      </GlassCard>
    );
  }

  // ---- Error --------------------------------------------------------------
  if (error) {
    return (
      <GlassCard testID={NEXT_SHIFT_CARD_TEST_ID} style={styles.card}>
        <View style={styles.inner}>
          <Header colors={colors} />
          <View style={styles.message}>
            <Ionicons name="cloud-offline-outline" size={iconSizes.lg} color={colors.text.tertiary} />
            <Text style={[typography.body, styles.messageText, { color: colors.text.secondary }]}>
              Couldn’t load your next shift.
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
  // getNextShift is pure + total (it skips malformed rows and never throws), so
  // a bad startTime in the list degrades to "no upcoming shift" rather than
  // crashing — no separate malformed branch is needed here.
  const next: ShiftLike | null = getNextShift(shifts ?? [], new Date());
  if (!next) {
    return (
      <GlassCard testID={NEXT_SHIFT_CARD_TEST_ID} style={styles.card}>
        <View style={styles.inner}>
          <Header colors={colors} />
          <EmptyState
            icon="time-outline"
            title="No upcoming shift scheduled"
            subtitle="Log your next shift to see the countdown here"
            actionLabel="View shifts"
            onAction={() => push?.('/(shifts)' as any)}
            style={styles.empty}
          />
        </View>
      </GlassCard>
    );
  }

  // ---- Populated ----------------------------------------------------------
  const now = new Date();
  const start = new Date(next.startTime);
  const countdown = formatStartsIn(start, now);
  const startsAt = formatTime(start);

  return (
    <GlassCard testID={NEXT_SHIFT_CARD_TEST_ID} style={styles.card}>
      <View style={styles.inner}>
        <Header colors={colors} />
        <Body type={next.type} countdown={countdown} startsAt={startsAt} colors={colors} />
      </View>
    </GlassCard>
  );
}

/**
 * Memoized: `shifts` is a stable array reference from the query cache, the flags
 * are primitives, and `onRetry` is expected to be a stable callback from the
 * parent.
 */
const NextShiftCard = React.memo(NextShiftCardComponent);

export default NextShiftCard;

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  // GlassCard owns the radius/hairline/clip/fill; this inner View owns the
  // padding the card content needs (GlassCard adds none of its own).
  inner: {
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
  body: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bodyText: {
    flex: 1,
  },
  countdown: {
    marginTop: spacing.xs,
  },
  timeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: br.md,
    borderWidth: 1,
    marginLeft: spacing.md,
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
