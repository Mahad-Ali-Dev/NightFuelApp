import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';

interface CircularProgressProps {
  size: number;
  strokeWidth?: number;
  progress: number; // 0–100
  color?: string;
  trackColor?: string;
  label?: string;
  value?: string;
  unit?: string;
  children?: React.ReactNode;
}

export function CircularProgress({
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
  const clampedProgress = Math.min(100, Math.max(0, progress));
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
    fontSize: 24,
    fontWeight: '700',
  },
  unit: {
    fontSize: 12,
    marginTop: 2,
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
