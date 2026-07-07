/**
 * TodayCircadianTimeline — the "Today" composed circadian day-plan timeline.
 *
 * A read-only, presentational surface that COMPOSES the existing pure circadian
 * helpers into ONE chronological at-a-glance plan for the day around the user's
 * next upcoming / just-logged shift. Where the sibling cards each show a single
 * slice (ShiftTransitionCard, LightPlanCard, AnchorSleepCard), this one folds the
 * instants those same helpers already derive into a single sorted list:
 *
 *   - Seek bright light          → computeLightPlan(shift).seekLight      (window)
 *   - Caffeine cutoff            → computeShiftTransition(shift).caffeineCutoff (instant)
 *   - Avoid light / blue-blockers→ computeLightPlan(shift).avoidLight      (window)
 *   - Anchor (core) sleep        → computeAnchorSleep(shift).anchor        (4h window)
 *   - Full sleep window          → computeShiftTransition(shift).sleepWindow(window)
 *
 * It introduces NO new engine math: there is NO Date-offset arithmetic and NO
 * magic-hour constant in this file — the only Date operation is `getTime()` to
 * SORT the rows the helpers hand back (ascending by each row's start instant)
 * AND, when the parent injects a `now`, to CLASSIFY each already-derived row
 * (past / current / upcoming) against that SAME `getTime()` key. The helpers all
 * route through `computeShiftTransition`, so this timeline stays in lockstep with
 * the sibling cards AND the scheduled circadian reminders.
 *
 * Time-awareness is OPTIONAL and default-safe: the component NEVER reads
 * `Date.now()` itself — the clock is injected via the `now?: Date` prop. When
 * `now` is omitted the render is byte-identical to the time-blind version (no
 * countdown, no per-row de-emphasis). When provided, the surface adds a single
 * countdown line to the next upcoming instant ("Caffeine cutoff in 2h 10m", or
 * the terminal "Day plan complete") and tints each row by its position relative
 * to now — surfaced to assistive tech via accessibilityState + an extended
 * accessibilityLabel so the state is assertable without inspecting styling.
 *
 * This component owns ZERO data-fetching: the parent passes the shift plus
 * loading/error flags — an IDENTICAL prop contract to AnchorSleepCard /
 * LightPlanCard / ShiftTransitionCard — keeping it trivially reusable and
 * testable.
 *
 * States (mirroring AnchorSleepCard EXACTLY):
 *   - loading            → Skeleton blocks in a GlassCard
 *   - error              → inline message + Retry (via onRetry)
 *   - empty (no shift)   → EmptyState "Log a shift to see your day plan"
 *   - populated          → the sorted timeline rows
 *   - malformed ISO      → the three compute calls are guarded in ONE try/catch
 *                          and degrade to the same "times look off" message the
 *                          sibling cards use (the helpers throw on bad ISO).
 *
 * The header doubles as a deep-link affordance ("Open your circadian plan") into
 * the circadian screen, so the surface shows guidance AND a way to act on it.
 *
 * UI primitives / rules consulted under ~/.claude/skills/react-native-skills/rules/:
 *   - design-system-compound-components.md + imports-design-system-folder.md:
 *     the dark-glass surface comes from the GlassCard primitive imported from
 *     '@/components/ui' (NEVER an inline SafeBlurView — the check-no-inline-glass
 *     HARD guard); Retry uses the Button primitive from the same barrel. No coral
 *     CtaButton is manufactured (there is no primary action here).
 *   - js-hoist-intl.md: NO new Intl formatter is created — we reuse the SAME
 *     ~10-line `formatTime` helper (toLocaleTimeString with the Intl-less HH:MM
 *     fallback) the sibling cards use, copied verbatim, rather than instantiating
 *     an Intl.DateTimeFormat per render. The new `formatRelative` countdown
 *     helper is module-scope + pure integer math (no per-render allocation, no
 *     Intl.RelativeTimeFormat) for the same reason.
 *   - rendering-no-falsy-and.md + rendering-text-in-text-component.md: every
 *     conditional is an early return or a ternary-with-null (no `cond && <JSX>`
 *     that could leak a falsy value), and every string sits inside <Text>.
 *   - react-compiler-destructure-functions.md: `push` is destructured from
 *     useRouter() at the top of render (stable reference, no dotting), and the
 *     default export is wrapped in React.memo — `shift` is a small stable object,
 *     the flags are primitives, and `onRetry` is a stable parent callback
 *     (AnchorSleepCard's reasoning).
 *   - animation-gesture-detector-press.md: the tappable header is a plain
 *     navigation touch (no animated press state, matching the sibling cards), so
 *     it stays a TouchableOpacity carrying accessibilityRole="button" + a
 *     descriptive accessibilityLabel; each row carries its own accessibilityLabel
 *     (extended with its now-relative state when a clock is injected) plus an
 *     accessibilityState and a stable testID, while the decorative icon chips are
 *     left unannounced.
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
import { computeLightPlan } from '@/lib/lightPlan';
import { computeAnchorSleep } from '@/lib/circadian/anchorSleep';

export interface TodayCircadianTimelineProps {
  /** The user's next upcoming / logged shift, or null/undefined when none. */
  shift?: ShiftLike | null;
  /** Show the loading skeleton (e.g. while the shift query is in flight). */
  loading?: boolean;
  /** Truthy when the shift query failed; renders the error state + Retry. */
  error?: unknown;
  /** Invoked when the user taps Retry in the error state. */
  onRetry?: () => void;
  /**
   * The current instant, INJECTED by the parent (never read from `Date.now()`
   * inside this component — keeps the surface pure and snapshot-deterministic).
   *
   * Default-safe + additive: when OMITTED the timeline renders byte-identically
   * to before (no now-marker, no countdown), so existing callers and the
   * pre-existing test suite are unaffected. When PROVIDED, each already-derived
   * row is classified past / current / upcoming against the SAME `getTime()` key
   * the rows are sorted by, and a single countdown to the next instant is shown.
   */
  now?: Date;
}

/** One chronological row of the composed plan. `end` absent ⇒ a single instant. */
interface TimelineRow {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  start: Date;
  end?: Date;
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

/**
 * Render a row's time(s): a window renders as a "start – end" range, while a
 * single-instant deadline (e.g. the caffeine cutoff) renders as "by HH:MM" — the
 * "by " qualifier reads naturally for a cutoff AND keeps the instant rows
 * textually distinct from the sibling cards' bare time strings (e.g.
 * ShiftTransitionCard prints `formatTime(caffeineCutoff)` with no prefix), so the
 * same instant surfacing on both the timeline and a sibling card never collapses
 * two surfaces into one ambiguous bare-time node. The displayed time is still the
 * EXACT helper instant — only the surrounding qualifier differs.
 */
function formatRowTime(row: TimelineRow): string {
  return row.end ? `${formatTime(row.start)} – ${formatTime(row.end)}` : `by ${formatTime(row.start)}`;
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/**
 * Format a positive forward duration (in ms) as a compact "Xh Ym" / "Ym" label,
 * e.g. 7_800_000 → "2h 10m", 600_000 → "10m". Pure integer math — NO Intl
 * formatter is instantiated (per js-hoist-intl: no per-render Intl allocation),
 * so it is cheap to call and timezone-independent. A negative or zero input
 * floors to "0m" (a deadline that has just passed reads as "0m", never a
 * negative or NaN string); a non-finite input also degrades to "0m" so the
 * caller can never surface "NaN" / "Invalid Date".
 */
function formatRelative(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Time-position of a row relative to the injected `now`. */
type RowState = 'past' | 'current' | 'upcoming';

/**
 * Classify an ALREADY-derived row against `now` using the SAME `getTime()` key
 * the rows are sorted by — recomputing NO circadian math:
 *   - a window (has `end`):  past once `end <= now`; current while
 *     `start <= now < end`; otherwise upcoming.
 *   - a single instant (no `end`, e.g. the caffeine cutoff): upcoming until
 *     `now >= start`, then past (an instant is never "current").
 */
function classifyRow(row: TimelineRow, nowMs: number): RowState {
  const startMs = row.start.getTime();
  if (row.end) {
    const endMs = row.end.getTime();
    if (endMs <= nowMs) return 'past';
    if (startMs <= nowMs) return 'current';
    return 'upcoming';
  }
  return startMs <= nowMs ? 'past' : 'upcoming';
}

/**
 * The next FUTURE instant across the rows, strictly after `now`: the smallest
 * upcoming `start`, OR — when a window is in progress — its `end` (the moment
 * that window closes). Returns the instant (ms) + the label of the row it
 * belongs to, or null when nothing remains (the whole plan is in the past).
 * Reuses the rows' own `getTime()` keys; introduces no new circadian math.
 */
function nextEvent(rows: TimelineRow[], nowMs: number): { atMs: number; label: string } | null {
  let best: { atMs: number; label: string } | null = null;
  const consider = (atMs: number, label: string) => {
    if (atMs > nowMs && (best === null || atMs < best.atMs)) {
      best = { atMs, label };
    }
  };
  for (const row of rows) {
    consider(row.start.getTime(), row.label);
    if (row.end) consider(row.end.getTime(), row.label);
  }
  return best;
}

function TodayCircadianTimelineComponent({ shift, loading, error, onRetry, now }: TodayCircadianTimelineProps) {
  const { colors } = useTheme();
  // Destructure `push` from the router up front (React Compiler: a stable
  // reference, no dotting). The optional chaining on `onPress` keeps the
  // affordance harmless if the navigation context is absent (e.g. an isolated
  // unit-test render).
  const { push } = useRouter() ?? {};

  // Header doubles as the "Open your circadian plan" deep-link affordance.
  const Header = () => (
    <TouchableOpacity
      style={styles.header}
      onPress={() => push?.('/(tabs)/circadian' as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open your circadian plan"
    >
      <View style={[styles.headerIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.14) }]}>
        <Ionicons name="time" size={iconSizes.sm} color={colors.accent.cyan} />
      </View>
      <Text style={[typography.subtitle, styles.headerLabel, { color: colors.text.primary }]}>Today</Text>
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
            <Skeleton width="76%" height={16} />
            <Skeleton width="64%" height={16} />
            <Skeleton width="70%" height={16} />
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
              Couldn’t load your day plan.
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
            icon="time-outline"
            title="No shift scheduled"
            subtitle="Log a shift to see your day plan"
            style={styles.empty}
          />
        </View>
      </GlassCard>
    );
  }

  // ---- Populated ----------------------------------------------------------
  // Guard the pure compute calls in ONE try/catch: a malformed shift (bad ISO)
  // throws (each helper routes through computeShiftTransition's reject-malformed
  // contract) rather than returning NaN instants — degrade to the same inline
  // message as the sibling cards' malformed branch instead of crashing the tree.
  let rows: TimelineRow[];
  try {
    const transition = computeShiftTransition(shift);
    const light = computeLightPlan(shift);
    const { anchor } = computeAnchorSleep(shift);

    // Build rows straight from the helpers' instants — NO offset arithmetic and
    // NO magic-hour constants here; the only Date op below is getTime() to sort.
    const unsorted: TimelineRow[] = [
      {
        key: 'seek-light',
        icon: 'sunny',
        tint: colors.accent.amber,
        label: 'Seek bright light',
        start: light.seekLight.start,
        end: light.seekLight.end,
      },
      {
        key: 'caffeine-cutoff',
        icon: 'cafe',
        tint: colors.accent.coral,
        label: 'Caffeine cutoff',
        start: transition.caffeineCutoff,
      },
      {
        key: 'avoid-light',
        icon: 'glasses-outline',
        tint: colors.accent.purple,
        label: 'Avoid light / blue-blockers',
        start: light.avoidLight.start,
        end: light.avoidLight.end,
      },
      {
        key: 'anchor-sleep',
        icon: 'moon',
        tint: colors.accent.purple,
        label: 'Anchor (core) sleep',
        start: anchor.start,
        end: anchor.end,
      },
      {
        key: 'full-sleep',
        icon: 'bed-outline',
        tint: colors.accent.blue,
        label: 'Full sleep window',
        start: transition.sleepWindow.start,
        end: transition.sleepWindow.end,
      },
    ];

    // Sort ascending by each row's start instant. getTime() is the ONLY Date
    // arithmetic in this file (a comparison key, not new circadian math).
    rows = unsorted.sort((a, b) => a.start.getTime() - b.start.getTime());
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

  // ---- Now-awareness (only when the parent injected a clock) --------------
  // Everything below derives PURELY from the rows' existing getTime() keys and
  // the injected `now`; no new circadian math, no Date.now(). When `now` is
  // absent we skip it entirely so the render is byte-identical to before.
  const nowMs = now ? now.getTime() : null;
  // The single countdown line: time to the next future instant, or terminal
  // copy when the whole plan is already in the past. Never NaN / Invalid Date —
  // formatRelative floors non-positive/non-finite input to "0m".
  let countdown: string | null = null;
  if (nowMs !== null) {
    const next = nextEvent(rows, nowMs);
    countdown = next ? `${next.label} in ${formatRelative(next.atMs - nowMs)}` : 'Day plan complete';
  }

  return (
    <GlassCard style={styles.card}>
      <View style={styles.body}>
        <Header />
        {countdown !== null ? (
          <View
            style={[styles.countdown, { backgroundColor: withAlpha(colors.accent.cyan, 0.1) }]}
            accessibilityRole="text"
            accessibilityLabel={`Next: ${countdown}`}
            testID="today-timeline-countdown"
          >
            <Ionicons name="hourglass-outline" size={iconSizes.sm} color={colors.accent.cyan} />
            <Text style={[typography.captionMedium, { color: colors.text.primary }]}>{countdown}</Text>
          </View>
        ) : null}
        <View style={styles.timeline}>
          {rows.map((row) => {
            const time = formatRowTime(row);
            const state: RowState | null = nowMs !== null ? classifyRow(row, nowMs) : null;
            // Visual state via @/theme tokens + withAlpha ONLY (no new colors):
            //   past     → de-emphasized (tertiary text, dimmer chip)
            //   current  → accented (row tint promoted onto the label, brighter chip)
            //   upcoming → normal (the pre-existing styling)
            const isPast = state === 'past';
            const isCurrent = state === 'current';
            const labelColor = isCurrent ? row.tint : isPast ? colors.text.tertiary : colors.text.secondary;
            const timeColor = isPast ? colors.text.tertiary : colors.text.primary;
            const chipBgAlpha = isCurrent ? 0.22 : isPast ? 0.08 : 0.14;
            const chipBorderAlpha = isCurrent ? 0.45 : isPast ? 0.16 : 0.28;
            const iconColor = isPast ? withAlpha(row.tint, 0.55) : row.tint;
            // Extend (never replace) the existing "<label>, <time>" label with the
            // state word so tests assert classification via a11y, not styling.
            const a11yLabel = state ? `${row.label}, ${time}, ${state}` : `${row.label}, ${time}`;
            return (
              <View
                key={row.key}
                style={styles.row}
                accessibilityRole="text"
                accessibilityLabel={a11yLabel}
                accessibilityState={state ? { selected: isCurrent, disabled: isPast } : undefined}
                testID={`today-timeline-row-${row.key}`}
              >
                <View
                  style={[
                    styles.iconChip,
                    {
                      backgroundColor: withAlpha(row.tint, chipBgAlpha),
                      borderColor: withAlpha(row.tint, chipBorderAlpha),
                    },
                  ]}
                >
                  <Ionicons name={row.icon} size={iconSizes.sm} color={iconColor} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[typography.caption, { color: labelColor }]}>{row.label}</Text>
                  <Text style={[typography.subtitle, { color: timeColor }]}>{time}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </GlassCard>
  );
}

/**
 * Memoized: `shift` is a small stable object, the flags are primitives, and
 * `onRetry` is expected to be a stable callback from the parent (AnchorSleepCard's
 * reasoning — see react-compiler-destructure-functions.md).
 */
const TodayCircadianTimeline = React.memo(TodayCircadianTimelineComponent);

export default TodayCircadianTimeline;

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
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: br.sm,
    borderCurve: 'continuous',
    marginBottom: spacing.lg,
  },
  timeline: {
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
