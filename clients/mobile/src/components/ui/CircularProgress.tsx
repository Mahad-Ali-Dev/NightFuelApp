import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';

interface CircularProgressProps {
  size: number;
  strokeWidth?: number;
  progress: number; // accepts a 0–1 fraction or a 0–100 percent
  color?: string;
  trackColor?: string;
  label?: string;
  value?: string;
  unit?: string;
  children?: React.ReactNode;
}

function CircularProgressComponent({
  size,
  strokeWidth = 8,
  progress,
  color,
  trackColor,
  label,
  value,
  unit,
  children,
}: CircularProgressProps) {
  const { colors } = useTheme();

  const stroke = color ?? colors.accent.coral;
  const track = trackColor ?? colors.border.default;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Callers pass either a 0–1 fraction (e.g. consumed/target) or a 0–100
  // percent. Normalize both: a value at or below 1 is treated as a fraction.
  const pct = progress <= 1 ? progress * 100 : progress;
  const clampedProgress = Math.min(100, Math.max(0, pct));
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.content}>
        {children ?? (
          <>
            {value && (
              <Text style={[styles.value, { color: colors.text.primary }]}>{value}</Text>
            )}
            {unit && (
              <Text style={[styles.unit, { color: colors.text.secondary }]}>{unit}</Text>
            )}
            {label && (
              <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Memoized: all props are primitives except optional `children`. When no
 * children are passed (the common case) re-renders are skipped on equal props;
 * inline children simply don't skip — behavior is unchanged either way.
 */
export const CircularProgress = React.memo(CircularProgressComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: typography.statSmall.fontFamily,
    fontSize: 24,
    fontWeight: '700',
  },
  unit: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    marginTop: 2,
  },
  label: {
    fontFamily: typography.overline.fontFamily,
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
