/**
 * BuildPlateRings — the live "running totals" hero for the Build-a-Plate modal
 * (Zeitra). Three CONCENTRIC macro rings around one big condensed calorie value:
 *
 *   • outer ring  = protein → lime  (accent.coral)
 *   • middle ring = carbs   → cyan  (accent.cyan)
 *   • inner ring  = fat     → amber (accent.amber)
 *   • center      = total CALORIES as a big Barlow-Condensed count-up (value
 *                   dominates its "KCAL" label, per the brief).
 *
 * PURE PRESENTATION — owns no data, fires no mutation. The screen passes the
 * already-computed plate `totals`; this component animates them on the UI thread
 * (mirrors the app's existing MealMacroSummary / AnimatedRing idiom: a Reanimated
 * `strokeDashoffset` sweep + a TextInput count-up, no new dependency).
 *
 * All colors come from `useTheme()` tokens — never raw hex. The center number sits
 * on dark glass (not on a lime fill), so it uses lime as its accent color; the one
 * place ink-on-lime would apply (a lime fill) does not occur here.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// Animated count-up text: TextInput is the cross-platform-safe target whose
// `text` prop Reanimated can drive from the UI thread without a JS re-render.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface BuildPlateTotals {
  kcal: number;
  pro: number;
  carb: number;
  fat: number;
}

export interface BuildPlateRingsProps {
  /** Live plate totals (already guarded + summed by the screen). */
  totals: BuildPlateTotals;
  /** Whether the plate currently has any items (drives the dimmed empty look). */
  hasItems: boolean;
}

/** A finite, non-negative number. */
const clampNum = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/** Animated count-up number rendered as athletic condensed type. */
function CountUp({
  value,
  style,
  suffix = '',
  duration = 700,
}: {
  value: number;
  style: any;
  suffix?: string;
  duration?: number;
}) {
  const v = useSharedValue(0);
  const target = clampNum(value);

  useEffect(() => {
    v.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) });
  }, [target, duration, v]);

  const animatedProps = useAnimatedProps(() => {
    const n = Math.round(v.value);
    return { text: `${n}${suffix}`, defaultValue: `${n}${suffix}` } as any;
  });

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={style}
      accessible
      accessibilityElementsHidden
      importantForAccessibility="no"
      value={`0${suffix}`}
      animatedProps={animatedProps}
    />
  );
}

/**
 * One concentric ring. `cap` is the soft reference the sweep fills toward so the
 * ring reads as "more on the plate = fuller" even without a daily target (a plate
 * is a single meal, not a day). The track is always a full faint circle.
 */
function ConcentricRing({
  size,
  radius,
  strokeWidth,
  color,
  value,
  cap,
  delay = 0,
}: {
  size: number;
  radius: number;
  strokeWidth: number;
  color: string;
  value: number;
  cap: number;
  delay?: number;
}) {
  const { colors } = useTheme();
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const pct = cap > 0 ? Math.min(1, clampNum(value) / cap) : 0;
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withTiming(pct, {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, sweep]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - sweep.value * circumference,
  }));

  return (
    <>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={colors.border.default}
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
        animatedProps={animatedProps}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
    </>
  );
}

/** Small color-dot + value/label legend chip for one macro. */
function LegendItem({ color, value, label }: { color: string; value: number; label: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View>
        <Text style={[typography.statTiny, { color: colors.text.primary, lineHeight: 18 }]}>
          {Math.round(clampNum(value))}
          <Text style={[typography.caption, { color: colors.text.tertiary }]}>g</Text>
        </Text>
        <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9, letterSpacing: 1 }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const SIZE = 184;

export function BuildPlateRings({ totals, hasItems }: BuildPlateRingsProps) {
  const { colors, typography } = useTheme();

  // Soft per-ring reference caps. A plate is one meal, so these are generous
  // single-meal anchors (not daily goals) purely so the sweep has a sensible full
  // point; they never gate or label anything the user sees as a target.
  const PRO_CAP = 50;
  const CARB_CAP = 80;
  const FAT_CAP = 30;

  const center = SIZE / 2;

  return (
    <View style={styles.wrap}>
      <View style={{ width: SIZE, height: SIZE, opacity: hasItems ? 1 : 0.55 }}>
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFillObject}>
          {/* Outer → Protein (lime) */}
          <ConcentricRing size={SIZE} radius={center - 9} strokeWidth={11} color={colors.accent.coral} value={totals.pro} cap={PRO_CAP} />
          {/* Middle → Carbs (cyan) */}
          <ConcentricRing size={SIZE} radius={center - 28} strokeWidth={11} color={colors.accent.cyan} value={totals.carb} cap={CARB_CAP} />
          {/* Inner → Fat (amber) */}
          <ConcentricRing size={SIZE} radius={center - 47} strokeWidth={11} color={colors.accent.amber} value={totals.fat} cap={FAT_CAP} />
        </Svg>

        {/* Center calorie hero — the VALUE dominates its label. */}
        <View style={styles.center} pointerEvents="none">
          <CountUp
            value={totals.kcal}
            style={[typography.statLarge, styles.kcalValue, { color: colors.text.primary }]}
          />
          <Text style={[typography.overline, { color: colors.accent.coral, marginTop: -2, letterSpacing: 2 }]}>
            KCAL
          </Text>
        </View>
      </View>

      {/* Legend — protein / carbs / fat grams */}
      <View style={styles.legendRow}>
        <LegendItem color={colors.accent.coral} value={totals.pro} label="PROTEIN" />
        <LegendItem color={colors.accent.cyan} value={totals.carb} label="CARBS" />
        <LegendItem color={colors.accent.amber} value={totals.fat} label="FAT" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  kcalValue: {
    padding: 0,
    margin: 0,
    minWidth: 120,
    textAlign: 'center',
    includeFontPadding: false as any,
    fontSize: 52,
    lineHeight: 56,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 18,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
});
