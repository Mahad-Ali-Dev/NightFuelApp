/**
 * CaffeineTimerTile — small Aurora-style dashboard mini-card that surfaces the
 * user's remaining caffeine "OK" window relative to their next shift transition.
 *
 * Sits in the dashboard's mini-card row next to Sleep + Hydration. Owns ZERO
 * data-fetching: the parent passes in the current shift (or null) and we derive
 * everything from the pure `computeShiftTransition` helper, mirroring the same
 * caffeineCutoff anchor used by `ShiftTransitionCard` and the local circadian
 * reminders. Three states:
 *
 *   - shift && now <  caffeineCutoff  →  "Caffeine OK for Xh Ym"
 *   - shift && now >= caffeineCutoff  →  "No more caffeine (sleep window starts at HH:MM)"
 *   - !shift                          →  EmptyState "Log a shift to track your caffeine window"
 *
 * Pure presentational, no network call, no native deps beyond the theme + icons.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { spacing, borderRadius as br, iconSizes } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { computeShiftTransition, type ShiftLike } from '@/lib/shiftTransition';

export interface CaffeineTimerTileProps {
  /** The user's current / next shift, or null/undefined when none. */
  shift?: ShiftLike | null;
}

/** Format an instant as a short device-local time, e.g. "11:30 PM". */
function formatTime(d: Date): string {
  try {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

/** Format a positive millisecond delta as "Xh Ym". */
function formatHM(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function CaffeineTimerTileComponent({ shift }: CaffeineTimerTileProps) {
  const { colors } = useTheme();

  // ---- No shift: gentle empty state -------------------------------------
  if (!shift || !shift.startTime || !shift.endTime) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.default,
          },
        ]}
      >
        <EmptyState
          icon="cafe-outline"
          title="Caffeine"
          subtitle="Log a shift to track your caffeine window"
          style={styles.empty}
        />
      </View>
    );
  }

  // Defensive: shiftTransition throws on malformed ISO. Fall back to empty.
  let caffeineCutoff: Date;
  let sleepStart: Date;
  try {
    const t = computeShiftTransition(shift);
    caffeineCutoff = t.caffeineCutoff;
    sleepStart = t.sleepWindow.start;
  } catch {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.default,
          },
        ]}
      >
        <EmptyState
          icon="cafe-outline"
          title="Caffeine"
          subtitle="Log a shift to track your caffeine window"
          style={styles.empty}
        />
      </View>
    );
  }

  const now = new Date();
  const beforeCutoff = now.getTime() < caffeineCutoff.getTime();
  const tint = beforeCutoff ? colors.accent.amber : colors.accent.purple;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background.secondary,
          borderColor: colors.border.default,
        },
      ]}
    >
      <View style={[styles.iconChip, { backgroundColor: withAlpha(tint, 0.14) }]}>
        <Ionicons name="cafe" size={iconSizes.sm} color={tint} />
      </View>
      <Text style={[typography.overline, styles.label, { color: colors.text.secondary }]}>Caffeine</Text>
      {beforeCutoff ? (
        <Text style={[typography.subtitle, styles.value, { color: colors.text.primary }]}>
          {`Caffeine OK for ${formatHM(caffeineCutoff.getTime() - now.getTime())}`}
        </Text>
      ) : (
        <Text style={[typography.bodySm, styles.value, { color: colors.text.primary }]}>
          {`No more caffeine (sleep window starts at ${formatTime(sleepStart)})`}
        </Text>
      )}
    </View>
  );
}

/**
 * Memoized: `shift` is a small stable object. Re-renders are driven by the
 * parent (which holds the shift query); pure props in, pure JSX out.
 */
export const CaffeineTimerTile = React.memo(CaffeineTimerTileComponent);

export default CaffeineTimerTile;

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: br.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: br.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.xs,
  },
  value: {
    marginBottom: 0,
  },
  empty: {
    paddingVertical: spacing.lg,
    paddingHorizontal: 0,
  },
});
