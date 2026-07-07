import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

interface GeneratingStepsProps {
  /** While true, the status lines cycle. Drive this from `mutation.isPending`. */
  active: boolean;
  /** Ordered status lines, shown one at a time (e.g. "Reading your circadian profile…"). */
  steps: string[];
  /** Accent color for the spinner / progress dots. Defaults to the coral brand accent. */
  color?: string;
  /** Tint for the status text. Defaults to primary text. */
  textColor?: string;
  /** Advance cadence in ms. Defaults to 2500. */
  intervalMs?: number;
  /** Layout direction of the spinner + label. Defaults to 'row'. */
  layout?: 'row' | 'column';
  /** Show the small step-progress dots. Defaults to true. */
  showDots?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Staged progress indicator for long-running AI generation (10–30s).
 *
 * Instead of a bare spinner, this advances through a short sequence of status
 * lines every `intervalMs`, holding on the final line until generation settles.
 * Pure presentational state: a local `useState` index driven by a `setInterval`
 * that is cleared on unmount and whenever `active` turns false.
 */
export function GeneratingSteps({
  active,
  steps,
  color,
  textColor,
  intervalMs = 2500,
  layout = 'row',
  showDots = true,
  style,
}: GeneratingStepsProps) {
  const { colors, typography, spacing } = useTheme();
  const accent = color ?? colors.accent.coral;
  const labelColor = textColor ?? colors.text.primary;

  const [stepIndex, setStepIndex] = useState(0);
  // Keep the latest step count without re-arming the interval each render.
  const stepCountRef = useRef(steps.length);
  stepCountRef.current = steps.length;

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      return;
    }

    // Restart the sequence each time generation begins.
    setStepIndex(0);
    const id = setInterval(() => {
      // Advance, then hold on the final line until the mutation settles.
      setStepIndex((prev) => Math.min(prev + 1, Math.max(stepCountRef.current - 1, 0)));
    }, intervalMs);

    return () => clearInterval(id);
  }, [active, intervalMs]);

  if (!active || steps.length === 0) return null;

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const isColumn = layout === 'column';

  return (
    <View
      style={[
        isColumn ? styles.containerColumn : styles.containerRow,
        style as ViewStyle,
      ]}
    >
      <View style={isColumn ? styles.rowCentered : styles.rowInline}>
        <ActivityIndicator color={accent} size="small" />
        <Text
          numberOfLines={1}
          style={[
            typography.subhead,
            {
              color: labelColor,
              marginLeft: spacing.sm + 2,
              ...(isColumn ? { marginTop: 0 } : null),
            },
          ]}
        >
          {steps[safeIndex]}
        </Text>
      </View>

      {showDots && steps.length > 1 && (
        <View style={[styles.dots, { marginTop: isColumn ? spacing.md : spacing.sm }]}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= safeIndex ? accent : withAlpha(labelColor, 0.18),
                  width: i === safeIndex ? 18 : 6,
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  containerRow: {
    alignItems: 'center',
  },
  containerColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
