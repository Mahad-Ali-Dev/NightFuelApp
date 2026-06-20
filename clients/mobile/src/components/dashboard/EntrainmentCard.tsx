/**
 * EntrainmentCard — a small presentational circadian-entrainment insight card.
 *
 * This is the FIRST consumer of the previously-dormant F3 helper
 * `src/lib/circadian/entrainment.ts`. It renders the entrainment-score advice
 * copy (the exact three strings `entrainmentAdvice` returns) inside the Aurora
 * dark-glass surface, so a single source of truth drives both the copy a future
 * circadian-screen wiring will use and what this card shows.
 *
 * Contract (pure / presentational — owns NO data fetching):
 *   - `score`  : the entrainment score (0–100), or `null` when not yet computed.
 *                `null` is the default-safe path — it NEVER throws and renders
 *                the "log more shifts" advice.
 *   - `shift?` : an optional shift window. When supplied, we OPTIONALLY derive a
 *                "biological windows" hint line via `deriveWindowsFromShift`,
 *                wrapped in try/catch so a malformed/partial shift can never
 *                throw — a bad shift just hides the extra line.
 *
 * Rules applied (see ~/.claude/skills/react-native-skills/rules/):
 *   - rendering-text-in-text-component.md  → every string lives inside <Text>.
 *   - rendering-no-falsy-and.md            → conditional rows use `? … : null`,
 *                                            never `value && <…>` on a falsy.
 *   - ui-styling.md                        → `borderCurve: 'continuous'` with
 *                                            every `borderRadius`; `gap` for
 *                                            spacing; ONE body font size with
 *                                            weight/color for hierarchy.
 *   - imports-design-system-folder.md      → surface via the `@/components/ui`
 *                                            `GlassCard` primitive; theme via
 *                                            `@/theme` tokens (never raw hex).
 *
 * The card renders THROUGH <GlassCard> (never an inline <SafeBlurView>) per the
 * brand rule — even though this file lives under src/ (outside the
 * check-no-inline-glass app/ walk), it honours the one-glass-card-home contract.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import {
  entrainmentAdvice,
  deriveWindowsFromShift,
  GOOD_ALIGNMENT_THRESHOLD,
  type ShiftWindowInput,
} from '@/lib/circadian/entrainment';

export interface EntrainmentCardProps {
  /** Entrainment score (0–100), or `null` when not yet computed. Default-safe. */
  score: number | null;
  /**
   * Optional shift window. When present we OPTIONALLY derive a melatonin-onset
   * hint via `deriveWindowsFromShift`. A malformed shift never throws — the hint
   * line is simply omitted (try/catch).
   */
  shift?: { startTime: string | Date; endTime: string | Date };
}

/** A finite score at/above the threshold counts as "good alignment". */
function isGoodAlignment(score: number | null): boolean {
  return score != null && Number.isFinite(score) && score >= GOOD_ALIGNMENT_THRESHOLD;
}

function EntrainmentCardComponent({ score, shift }: EntrainmentCardProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  // The advice copy is the single source of truth from the F3 helper.
  const advice = entrainmentAdvice(score);
  const good = isGoodAlignment(score);

  // TIMEZONE-NAIVE SCORE (intentional, surfaced honestly below).
  // The `score` we consume here is computed in a tz-NAIVE local-clock frame:
  // the model (src/api/circadian.ts → deriveEntrainmentScore) compares the
  // engine's melatoninOnset against the shift end as minutes-since-LOCAL-
  // midnight (shiftEndMinutes uses d.getHours()/getMinutes()), and no timezone
  // is ever carried through getModel(). So the alignment is only as honest as
  // the device clock matching the shift's tz. Carrying a real timezone through
  // getModel()/the score math is DEFERRED / out of scope for this card; until
  // then we render the subtle "approx." affordance next to the title (and an
  // accessibilityLabel) so the estimate is presented honestly rather than as a
  // precise, tz-correct number.

  // Accent: cyan (success/progress) when aligned, amber (caution) otherwise —
  // both pulled from theme tokens, never raw hex.
  const accent = good ? colors.accent.cyan : colors.accent.amber;

  // Optional biological-window hint, derived ONLY when a shift is supplied.
  // Wrapped in try/catch: deriveWindowsFromShift throws on a malformed/partial
  // shift, and a default-safe insight card must never crash on bad input.
  let windowHint: string | null = null;
  if (shift != null) {
    try {
      const windows = deriveWindowsFromShift(shift as ShiftWindowInput);
      windowHint = `Wind-down window opens around ${windows.melatoninStart}`;
    } catch {
      windowHint = null;
    }
  }

  return (
    <GlassCard radius={borderRadius['2xl'] ?? 24} style={styles.card}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {/* Header: icon chip + overline label */}
        <View style={styles.header}>
          <View
            style={[
              styles.iconChip,
              {
                backgroundColor: withAlpha(accent, 0.12),
                borderColor: withAlpha(accent, 0.28),
              },
            ]}
          >
            <Ionicons name="sunny-outline" size={18} color={accent} />
          </View>
          <Text
            maxFontSizeMultiplier={1.6}
            style={[typography.overline, { color: accent }]}
          >
            CIRCADIAN ENTRAINMENT
          </Text>
        </View>

        {/* Title row — hierarchy via weight/color, not a second font size. The
            "approx." caption sits beside the title, gap-spaced, and renders
            ONLY for a finite score (never on the null "Build your baseline"
            baseline state) to honestly flag the tz-naive local-clock estimate
            documented above. */}
        <View style={styles.titleRow}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.6}
            style={[typography.subhead, { color: colors.text.primary, fontWeight: '800' }]}
          >
            {good ? 'Well aligned' : score != null ? 'Room to improve' : 'Build your baseline'}
          </Text>
          {score != null ? (
            <Text
              maxFontSizeMultiplier={1.6}
              accessibilityLabel="Approximate alignment, estimated from your local clock"
              style={[typography.caption, { color: colors.text.tertiary }]}
            >
              approx.
            </Text>
          ) : null}
        </View>

        {/* Advice copy — the exact string from entrainmentAdvice(score) */}
        <Text
          maxFontSizeMultiplier={1.8}
          style={[typography.body, { color: colors.text.secondary }]}
        >
          {advice}
        </Text>

        {/* Optional derived window hint (omitted when no/invalid shift) */}
        {windowHint != null ? (
          <View style={styles.hintRow}>
            <Ionicons name="moon-outline" size={14} color={colors.text.tertiary} />
            <Text
              maxFontSizeMultiplier={1.8}
              style={[typography.caption, { color: colors.text.tertiary, flex: 1 }]}
            >
              {windowHint}
            </Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}

/**
 * Memoized: `score` is a primitive and `shift` is a small optional object —
 * when passed inline the shallow compare just won't skip, which is
 * behavior-identical. No internal state.
 */
export const EntrainmentCard = React.memo(EntrainmentCardComponent);

export default EntrainmentCard;

const styles = StyleSheet.create({
  // Outer wrapper spacing only — GlassCard owns the radius/hairline/clip/fill.
  card: { marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Title + the subtle "approx." caption, baseline-aligned and gap-spaced so
  // the caption reads as a quiet qualifier beside the bold title. `wrap` keeps
  // it graceful at large font scales.
  titleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
});
