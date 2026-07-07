/**
 * AnimatedRing — a Reanimated circular-progress ring (Aurora/Zeitra).
 *
 * A local, drop-in replacement for the static <CircularProgress> primitive on
 * screens that want the gamified sweep the skill calls for. It draws the same
 * react-native-svg track + progress arc, but animates `strokeDashoffset` with
 * Reanimated (AnimatedCircle + useAnimatedProps + withTiming, ~800ms ease-out)
 * so the ring sweeps up to its value on mount and re-animates whenever the
 * value changes — instead of snapping instantly (the "static, avoid" case).
 *
 * Pure presentation, API-compatible with the shared primitive's common props
 * (size / strokeWidth / progress / color / trackColor / children) so callers
 * can swap it in without touching layout or content. `progress` accepts either
 * a 0–1 fraction or a 0–100 percent, matching CircularProgress.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface AnimatedRingProps {
  size: number;
  strokeWidth?: number;
  progress: number; // accepts a 0–1 fraction or a 0–100 percent
  color?: string;
  trackColor?: string;
  /** Sweep duration in ms. */
  duration?: number;
  children?: React.ReactNode;
}

export function AnimatedRing({
  size,
  strokeWidth = 8,
  progress,
  color,
  trackColor,
  duration = 800,
  children,
}: AnimatedRingProps) {
  const { colors } = useTheme();

  const stroke = color ?? colors.accent.coral;
  const track = trackColor ?? colors.border.default;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Normalize like CircularProgress: <=1 is a fraction, else a percent.
  const pct = progress <= 1 ? progress * 100 : progress;
  const clampedProgress = Math.min(100, Math.max(0, pct));

  // Shared value drives the dash offset; animates on mount + on value change.
  const animated = useSharedValue(0);

  useEffect(() => {
    animated.value = withTiming(clampedProgress, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedProgress, duration, animated]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (animated.value / 100) * circumference,
  }));

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
        {/* Progress (animated) */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.content}>{children}</View>
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
});
