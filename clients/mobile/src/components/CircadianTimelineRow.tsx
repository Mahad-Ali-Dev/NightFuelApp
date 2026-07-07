/**
 * CircadianTimelineRow — a single node on the Sleep Optimizer's calm circadian
 * timeline.
 *
 * Renders one step of the "your night, in order" rail: a connecting spine + a
 * tinted dot on the left, then a stacked block on the right whose dominant line
 * is the TIME VALUE (Barlow Condensed stat) with a subordinate label/overline
 * above and an optional "why" caption below. This is purely presentational — it
 * owns no data, no hooks, and no navigation; the screen passes already-formatted
 * strings and a tint color. Kept local to the Sleep Optimizer per the redesign
 * brief (a NEW component under src/components is allowed; shared primitives and
 * the theme are not touched).
 *
 * Visual-timeline framing (a11y): the screen composes these top-to-bottom so a
 * circadian shift reads as an ordered timeline rather than a flat list of dates.
 * `isLast` drops the connecting spine on the final node so the rail terminates
 * cleanly.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';

interface CircadianTimelineRowProps {
  /** Tint for the dot/spine/value — a functional accent (purple, amber, blue…). */
  tint: string;
  /** Ionicon shown inside the dot. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Small overline tag above the title (e.g. "AFTER YOUR SHIFT"). */
  overline: string;
  /** The step's short title (e.g. "Recovery sleep"). */
  title: string;
  /** The dominant value — a formatted time or window (e.g. "11:30 PM – 3:30 AM"). */
  value: string;
  /** Optional one-line rationale shown under the title. */
  why?: string;
  /** Drop the connecting spine below the dot — true on the last node. */
  isLast?: boolean;
}

function CircadianTimelineRowComponent({
  tint,
  icon,
  overline,
  title,
  value,
  why,
  isLast,
}: CircadianTimelineRowProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {/* Left rail: dot + connecting spine. */}
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: withAlpha(tint, 0.16),
              borderColor: withAlpha(tint, 0.45),
            },
          ]}
        >
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        {!isLast ? (
          <View style={[styles.spine, { backgroundColor: colors.border.light }]} />
        ) : null}
      </View>

      {/* Right block: overline → title + value → why. Value dominates. */}
      <View style={styles.block}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[typography.overline, { color: withAlpha(tint, 0.92) }]}>{overline}</Text>
            <Text style={[typography.subhead, styles.title, { color: colors.text.primary }]}>
              {title}
            </Text>
          </View>
          <Text style={[typography.statSmall, styles.value, { color: colors.text.primary }]}>
            {value}
          </Text>
        </View>
        {why ? (
          <Text style={[typography.bodySm, styles.why, { color: colors.text.secondary }]}>{why}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Memoized: every prop is a primitive string/bool, so equal props skip
 * re-render — the rows are static once their windows are computed.
 */
export const CircadianTimelineRow = React.memo(CircadianTimelineRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rail: {
    alignItems: 'center',
    width: 32,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spine: {
    width: StyleSheet.hairlineWidth + 1,
    flex: 1,
    marginTop: spacing.xs,
    borderRadius: borderRadius.full,
  },
  block: {
    flex: 1,
    marginLeft: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    marginTop: spacing.xxs,
  },
  // The dominant value sits visually with the title's cap-line; nudge it down a
  // hair so the tall Barlow Condensed numerals align with the overline+title pair.
  value: {
    marginTop: spacing.md,
  },
  why: {
    marginTop: spacing.sm,
  },
});
