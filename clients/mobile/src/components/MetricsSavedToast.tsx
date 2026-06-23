/**
 * MetricsSavedToast — the in-card celebratory "ending" beat for a saved body
 * snapshot (Zeitra). Replaces the bare `Alert.alert('Success', …)` OS modal with
 * a designed peak-end moment that lives INSIDE the screen's surface.
 *
 * Two layers, both Reanimated (transform + opacity only, interruptible):
 *   1. An affirmation toast — a soft cyan/glass pill with a human one-liner
 *      ("Snapshot saved — you showed up today"). Springs up + fades in on
 *      mount, then auto-fades after `duration`. Cyan = the app's success accent
 *      (never lime, which is reserved for the single primary action).
 *   2. A one-time "Consistency unlocked" milestone badge — shown only when the
 *      caller passes `milestone`, i.e. the momentum ring just reached its
 *      LOG_TARGET. Full-lime is justified here as a key indicator / reward, and
 *      its label uses INK on lime per the brand rule (never white on lime).
 *
 * PURE PRESENTATION: owns no data and fires nothing except the optional
 * `onDone` callback when its self-timer elapses (so the parent can clear the
 * trigger state). Colours/typography come from `useTheme()` tokens — no raw hex.
 * Mounted conditionally by the parent (keyed) so each save re-runs the entrance.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface MetricsSavedToastProps {
  /** Human affirmation line. */
  message?: string;
  /** When true, also render the one-time "Consistency unlocked" lime badge. */
  milestone?: boolean;
  /** Copy for the milestone badge. */
  milestoneLabel?: string;
  /** Auto-dismiss delay (ms) before `onDone` fires. Default 2600. */
  duration?: number;
  /** Fired once the self-timer elapses so the parent can clear its trigger. */
  onDone?: () => void;
  style?: StyleProp<ViewStyle>;
}

function MetricsSavedToastComponent({
  message = 'Snapshot saved — you showed up today',
  milestone = false,
  milestoneLabel = 'Consistency unlocked',
  duration = 2600,
  onDone,
  style,
}: MetricsSavedToastProps) {
  const { colors, typography, borderRadius } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18).mass(0.7)}
      exiting={FadeOut.duration(220)}
      style={[styles.wrap, style]}
      pointerEvents="none"
    >
      {/* Milestone reward — full-lime, INK label, only on the LOG_TARGET beat. */}
      {milestone ? (
        <Animated.View
          entering={FadeIn.delay(120).duration(260)}
          accessibilityRole="text"
          accessibilityLabel={milestoneLabel}
          style={[
            styles.badge,
            { backgroundColor: colors.accent.coral, borderRadius: borderRadius.full },
          ]}
        >
          <Ionicons name="ribbon" size={15} color={colors.text.inverse} />
          <Text style={[typography.captionMedium, { color: colors.text.inverse, fontWeight: '800', marginLeft: 6 }]}>
            {milestoneLabel}
          </Text>
        </Animated.View>
      ) : null}

      {/* Affirmation toast — cyan-tinted glass, the human "ending". */}
      <Animated.View
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
        style={[
          styles.toast,
          {
            backgroundColor: withAlpha(colors.accent.cyan, 0.16),
            borderColor: withAlpha(colors.accent.cyan, 0.32),
            borderRadius: borderRadius.full,
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={17} color={colors.accent.cyan} />
        <Text style={[typography.captionMedium, { color: colors.text.primary, fontWeight: '700', marginLeft: 7 }]}>
          {message}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/** Memoized: all props are primitives / a stable callback. */
export const MetricsSavedToast = React.memo(MetricsSavedToastComponent);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  toast: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1 },
});
