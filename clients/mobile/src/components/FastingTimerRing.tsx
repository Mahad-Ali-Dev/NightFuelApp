/**
 * FastingTimerRing — the hero fasting-timer ring (Zeitra).
 *
 * A LOCAL, fasting-specific circular timer built for the fasting screen's hero
 * moment. It draws a react-native-svg track + a lime gradient progress arc plus
 * a ring of subtle minute/hour tick marks, and renders arbitrary `children`
 * (the big condensed HH:MM:SS) in its centre.
 *
 * Why a bespoke ring (and not the shared <CircularProgress> / <AnimatedRing>):
 *   • The arc uses a LinearGradient stroke (lime → deeper lime) — the brand hero
 *     look — which the shared primitives' single flat `color` can't express.
 *   • On a LIVE fast the `progress` prop ticks every second. AnimatedRing tweens
 *     every change over ~800ms, which would visibly lag a per-second timer. This
 *     ring instead does ONE entrance sweep (0 → current) on mount, then tracks
 *     the live value directly each second with a short 950ms catch-up tween — so
 *     the sweep feels alive on open without ever falling behind the clock.
 *
 * PURE PRESENTATION — owns no data and fires nothing. `progress` accepts a 0–1
 * fraction or a 0–100 percent (same contract as CircularProgress). Colors are
 * passed in by the caller (which reads `useTheme()` tokens) so the component
 * stays theme-agnostic; only sensible fallbacks are hard-coded.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Line, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface FastingTimerRingProps {
  size: number;
  strokeWidth?: number;
  /** 0–1 fraction or 0–100 percent of the target elapsed. */
  progress: number;
  /** Gradient start colour for the progress arc. */
  color?: string;
  /** Gradient end colour for the progress arc. */
  colorEnd?: string;
  /** Unfilled track colour. */
  trackColor?: string;
  /** Tick-mark colour (subtle). */
  tickColor?: string;
  /** Number of tick marks around the dial. Default 24 (one per hour-of-day). */
  ticks?: number;
  /** Whether a fast is active — drives the live-tracking behaviour. */
  active?: boolean;
  children?: React.ReactNode;
}

/** A finite 0–100 percent from either a fraction or a percent input. */
const toPct = (p: number): number => {
  const pct = p <= 1 ? p * 100 : p;
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
};

function FastingTimerRingComponent({
  size,
  strokeWidth = 18,
  progress,
  color = '#A8CC3C',
  colorEnd = '#93B82E',
  trackColor = '#1B2030',
  tickColor = '#222838',
  ticks = 24,
  active = false,
  children,
}: FastingTimerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const pct = toPct(progress);

  // Shared value drives the dash offset. First commit does an entrance sweep
  // (0 → current) with a longer ease; thereafter we catch up to the live value
  // with a short tween so a per-second timer never lags behind the clock.
  const animated = useSharedValue(0);
  const mounted = useRef(false);

  useEffect(() => {
    const duration = mounted.current ? 950 : 1100;
    animated.value = withTiming(pct, {
      duration,
      easing: mounted.current ? Easing.linear : Easing.out(Easing.cubic),
    });
    mounted.current = true;
  }, [pct, animated]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (animated.value / 100) * circumference,
  }));

  // Subtle tick marks just inside the track. The arc/track sit on radius `r`;
  // ticks span a few px around that band so they read as dial graduations.
  const tickInner = radius - strokeWidth / 2 - 6;
  const tickOuter = radius - strokeWidth / 2 - 1;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <LinearGradient id="fastArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} />
            <Stop offset="1" stopColor={colorEnd} />
          </LinearGradient>
        </Defs>

        {/* Tick graduations */}
        <G>
          {Array.from({ length: ticks }).map((_, i) => {
            const angle = (i / ticks) * 2 * Math.PI - Math.PI / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const major = i % 6 === 0; // quarter marks read slightly stronger
            return (
              <Line
                key={i}
                x1={center + cos * tickInner}
                y1={center + sin * tickInner}
                x2={center + cos * tickOuter}
                y2={center + sin * tickOuter}
                stroke={tickColor}
                strokeWidth={major ? 2 : 1}
                strokeLinecap="round"
                opacity={major ? 0.9 : 0.5}
              />
            );
          })}
        </G>

        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress (animated, gradient stroke) */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#fastArc)"
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

/** Memoized: props are primitives plus optional `children`. */
export const FastingTimerRing = React.memo(FastingTimerRingComponent);

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
