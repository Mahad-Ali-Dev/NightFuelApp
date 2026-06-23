/**
 * AnimatedScoreRing — a circular progress ring whose arc FILLS over time
 * (Zeitra). Built for the Performance Hub hero so the ring's sweep lands in sync
 * with the <CountUpText> numeral, completing the PEAK moment that a static arc
 * left half-built.
 *
 * Why a local component (not the shared <CircularProgress>): that primitive
 * computes `strokeDashoffset` ONCE from a fixed prop — the arc snaps to full
 * while the number counts up, so the two desync. Editing the shared primitive is
 * off-limits, so this screen-local ring re-implements the same SVG with a
 * Reanimated `useSharedValue` driving `strokeDashoffset` via `withTiming` over
 * the same ~900ms window. Transform/opacity-free on the arc itself (only the
 * dash offset animates), interruptible, and runs on the UI thread.
 *
 * PEAK: when `progress` lands at/above `glowThreshold` (default 0.8 = score 80),
 * a soft halo behind the ring pulses up once — a proportional celebratory beat
 * for a genuinely great day, and nothing for an ordinary one.
 *
 * PURE PRESENTATION — owns no data. Colors/sizing come in as props (the caller
 * already reads `useTheme()` tokens), so this stays theme-agnostic.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface AnimatedScoreRingProps {
  /** 0–1 fraction (e.g. score/100). Clamped defensively. */
  progress: number;
  size: number;
  strokeWidth?: number;
  /** Arc color (the focal lime on the hero). */
  color: string;
  /** Unfilled track color. */
  trackColor: string;
  /** Tween duration in ms — match the count-up. Default 900. */
  duration?: number;
  /** At/above this fraction the halo pulses once. Default 0.8. */
  glowThreshold?: number;
  /** Centered content (the pulse glyph). */
  children?: React.ReactNode;
}

function AnimatedScoreRingComponent({
  progress,
  size,
  strokeWidth = 9,
  color,
  trackColor,
  duration = 900,
  glowThreshold = 0.8,
  children,
}: AnimatedScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Clamp to a finite [0,1] fraction (defensive against NaN / >1 / <0).
  const target = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
  const isPeak = target >= glowThreshold;

  // Animated dash offset: starts EMPTY (full circumference) and tweens to the
  // filled offset, so the arc sweeps in rather than snapping.
  const fill = useSharedValue(0);
  // Halo opacity + scale for the one-shot peak pulse.
  const glow = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) });
    if (isPeak) {
      // A single soft swell that lands just as the arc completes, then settles
      // to a faint resting halo — celebratory, not a strobing neon loop.
      glow.value = withDelay(
        duration * 0.55,
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0.4, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        ),
      );
    } else {
      glow.value = withTiming(0, { duration: 200 });
    }
  }, [target, duration, isPeak, fill, glow]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - fill.value * circumference,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.5,
    transform: [{ scale: 0.9 + glow.value * 0.18 }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Peak halo — sits behind the ring, pointer-transparent. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            shadowColor: color,
          },
          haloStyle,
        ]}
      />
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedCircleProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.content} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

/** Memoized — props are primitives plus optional inline children. */
export const AnimatedScoreRing = React.memo(AnimatedScoreRingComponent);

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  content: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 0,
  },
});
