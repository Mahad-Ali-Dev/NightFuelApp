/**
 * MealMacroSummary — the "running totals" hero for the Log Meal screen (Zeitra).
 *
 * A premium, motion-forward summary of the plate's live macros that the screen
 * recomputes as items are added / quantities change. It is PURE PRESENTATION —
 * it owns no data and fires no mutations; the screen passes the already-computed
 * `totals` (and optional macro targets) down, and this component animates them.
 *
 * Nutrition patterns (per the Zeitra brief, translated to native RN):
 *   • A big condensed COUNT-UP hero number for total calories — Reanimated
 *     `useSharedValue` + `withTiming`, rendered through an animated TextInput
 *     (the standard RN count-up idiom; no new dep, works on iOS/Android).
 *   • Three circular macro RINGS via react-native-svg — protein=lime,
 *     carbs=cyan, fat=amber — each sweeping its `strokeDashoffset` on the UI
 *     thread (mirrors the app's existing AnimatedRing/ProfileRing pattern), with
 *     a count-up gram value at its center.
 *   • Animated "X of Y" progress BARS under each macro when a target is known,
 *     growing their width from 0 (mirrors the app's AnimatedBarFill).
 *
 * All colors come from `useTheme()` tokens (never raw hex). On-lime text always
 * uses `text.inverse` (ink) — never white — but note the hero number here sits
 * on the dark glass card, not on lime, so it uses the lime accent as its color.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// Animated count-up text: TextInput is the cross-platform-safe target whose
// `text` prop Reanimated can drive from the UI thread without a JS re-render.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface MealMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealMacroSummaryProps {
  /** Live plate totals (already qty-multiplied + guarded by the screen). */
  totals: MealMacros;
  /** Optional daily targets — when > 0 a macro shows an "X of Y" progress bar. */
  targets?: Partial<MealMacros>;
  /** Sweep duration in ms for rings, bars and the count-up. */
  duration?: number;
}

/** A finite, non-negative number (defensive: totals are already guarded). */
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
      // pointerEvents none + not focusable: this is a display number, not a field.
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={style}
      // a11y: announce the resolved value, not an editable field.
      accessible
      accessibilityElementsHidden
      importantForAccessibility="no"
      // Seed value so first paint isn't blank before the animation frame lands.
      value={`0${suffix}`}
      animatedProps={animatedProps}
    />
  );
}

/** One SVG macro ring with a count-up gram value at its center. */
function MacroRing({
  label,
  value,
  target,
  color,
  size = 78,
  strokeWidth = 7,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const { colors, typography } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const pct = target > 0 ? Math.min(1, clampNum(value) / target) : 0;
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withTiming(pct * 100, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [pct, sweep]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (sweep.value / 100) * circumference,
  }));

  return (
    <View style={styles.ringItem}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
          <Circle cx={center} cy={center} r={radius} stroke={colors.border.default} strokeWidth={strokeWidth} fill="none" />
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
        </Svg>
        <CountUp value={value} suffix="g" style={[typography.statSmall, styles.ringValue, { color: colors.text.primary }]} />
      </View>
      <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 10, letterSpacing: 1.2 }]}>{label}</Text>
    </View>
  );
}

export function MealMacroSummary({ totals, targets, duration = 700 }: MealMacroSummaryProps) {
  const { colors, typography } = useTheme();

  const calTarget = clampNum(targets?.calories ?? 0);
  const calPct = calTarget > 0 ? Math.min(100, (clampNum(totals.calories) / calTarget) * 100) : 0;

  return (
    <View>
      {/* Hero calorie count-up */}
      <View style={styles.heroRow}>
        <View style={styles.heroNumberWrap}>
          <CountUp value={totals.calories} duration={duration} style={[typography.statLarge, styles.heroNumber, { color: colors.accent.coral }]} />
          <Text style={[typography.statTiny, { color: colors.text.tertiary, marginBottom: 8, marginLeft: 4 }]}>kcal</Text>
        </View>
        {calTarget > 0 ? (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>of {Math.round(calTarget)} kcal goal</Text>
        ) : (
          <Text style={[typography.caption, { color: colors.text.tertiary }]}>total on your plate</Text>
        )}
      </View>

      {/* Optional calorie progress bar (X of Y) */}
      {calTarget > 0 ? (
        <View style={[styles.calTrack, { backgroundColor: colors.background.tertiary }]}>
          <BarFill percent={calPct} color={colors.accent.coral} radius={4} />
        </View>
      ) : null}

      {/* Macro rings — protein=lime, carbs=cyan, fat=amber */}
      <View style={styles.ringsRow}>
        <MacroRing label="Protein" value={totals.protein} target={clampNum(targets?.protein ?? 0)} color={colors.accent.coral} />
        <MacroRing label="Carbs" value={totals.carbs} target={clampNum(targets?.carbs ?? 0)} color={colors.accent.cyan} />
        <MacroRing label="Fat" value={totals.fat} target={clampNum(targets?.fat ?? 0)} color={colors.accent.amber} />
      </View>
    </View>
  );
}

/** Local width-growing bar (mirrors AnimatedBarFill; kept inline to stay self-contained). */
function BarFill({ percent, color, radius = 3 }: { percent: number; color: string; radius?: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(clamped, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [clamped, p]);
  const widthStyle = useAnimatedStyle(() => ({ width: `${p.value}%` }));
  return <Animated.View style={[{ height: '100%', borderRadius: radius, backgroundColor: color }, widthStyle]} />;
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  heroNumberWrap: { flexDirection: 'row', alignItems: 'flex-end' },
  heroNumber: { padding: 0, margin: 0, includeFontPadding: false as any, textAlignVertical: 'bottom' as any },
  calTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 20 },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  ringItem: { alignItems: 'center', gap: 8, flex: 1 },
  ringValue: { position: 'absolute', padding: 0, margin: 0, textAlign: 'center', minWidth: 60, includeFontPadding: false as any },
});
