/**
 * WorkoutLiveBeacon + SetDots — small, screen-local presentation pieces for the
 * active-workout screen (Zeitra). PURE PRESENTATION: they own no data, fire no
 * callbacks, and read no theme — every color is passed in by the caller (which
 * already resolves `useTheme()` tokens), so these stay theme-agnostic and
 * test-friendly.
 *
 * WorkoutLiveBeacon — a softly pulsing "in motion" dot (the functional cyan
 * "recording / live" indicator, NOT lime — lime stays reserved for the one
 * primary action + key indicators). The pulse runs entirely on the UI thread via
 * Reanimated `withRepeat`, so it adds zero per-frame JS work to the screen's
 * 1-second timer tick.
 *
 * SetDots — a compact segmented rail summarising whole-session set completion:
 * one pip per planned set, filled in the accent for completed sets and outlined
 * for the rest, with the single "next" pip emphasised. Gives the lifter a glance-
 * able sense of progress that pairs with the numeric `n/m` (color is never the
 * only signal — the count carries it too). Caps the rendered pips so a very long
 * session can't blow out the row.
 */
import React from 'react';
import { View, StyleSheet, type ColorValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// ─── Live beacon ──────────────────────────────────────────────────────────────

export interface WorkoutLiveBeaconProps {
  /** Dot + halo color (caller passes a theme token, e.g. accent.cyan). */
  color: string;
  /** Core dot diameter. The halo ring is sized off this. Default 8. */
  size?: number;
}

function WorkoutLiveBeaconComponent({ color, size = 8 }: WorkoutLiveBeaconProps) {
  const t = useSharedValue(0);

  React.useEffect(() => {
    // 0 → 1 → 0 forever; an easing breath rather than a hard blink.
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [t]);

  // Expanding, fading halo behind the solid core dot.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 1.6 }],
  }));

  return (
    <View
      // Decorative: the live state is also spelled out by the "ACTIVE WORKOUT"
      // overline beside it, so the beacon itself is hidden from screen readers.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.beaconWrap, { width: size * 3, height: size * 3 }]}
    >
      <Animated.View
        style={[
          styles.halo,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          haloStyle,
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

export const WorkoutLiveBeacon = React.memo(WorkoutLiveBeaconComponent);

// ─── Segmented set dots ───────────────────────────────────────────────────────

export interface SetDotsProps {
  /** Total planned sets across the session. */
  total: number;
  /** How many of those are completed. */
  completed: number;
  /** Fill color for completed pips (e.g. accent.coral / lime — a key indicator). */
  activeColor: string;
  /** Outline color for not-yet-completed pips (e.g. border.light). */
  trackColor: string;
  /** Color the single "next" pip is tinted with (e.g. accent.coral at full). */
  nextColor: string;
  /** Hard cap on rendered pips so a long session stays one tidy row. Default 16. */
  max?: number;
}

function SetDotsComponent({
  total,
  completed,
  activeColor,
  trackColor,
  nextColor,
  max = 16,
}: SetDotsProps) {
  if (total <= 0) return null;
  const count = Math.min(total, max);
  // When capped, scale the filled count into the visible range so the rail still
  // reads as "mostly done" rather than implying only `max` sets exist.
  const filled = total <= max ? completed : Math.round((completed / total) * count);
  const nextIndex = filled < count ? filled : -1; // first not-yet-filled pip

  return (
    <View style={styles.dotsRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }).map((_, i) => {
        const isDone = i < filled;
        const isNext = i === nextIndex;
        const bg: ColorValue = isDone ? activeColor : 'transparent';
        const borderColor: ColorValue = isDone ? activeColor : isNext ? nextColor : trackColor;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: bg,
                borderColor,
                // The next pip reads slightly bigger so the eye lands on it.
                width: isNext ? 12 : 9,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export const SetDots = React.memo(SetDotsComponent);

const styles = StyleSheet.create({
  beaconWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  dot: { height: 9, borderRadius: 5, borderWidth: 1.5 },
});
