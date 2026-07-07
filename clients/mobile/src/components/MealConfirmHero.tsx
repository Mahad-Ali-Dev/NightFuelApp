/**
 * MealConfirmHero — the premium "confirm a planned meal" hero block for
 * app/(meals)/log-planned-meal.tsx (Aurora / Zeitra redesign).
 *
 * Pure presentation, no data / no navigation / no queries — it takes the live
 * derived plate totals + the planned macro target as plain numbers and renders:
 *   • an animated COUNT-UP hero calorie number (Barlow Condensed, statLarge) that
 *     tweens up to the current plate kcal whenever it changes,
 *   • a big calorie RING (plain react-native-svg + Reanimated sweep — bespoke so
 *     it never collides with the shared CircularProgress primitive), filled vs the
 *     planned calorie target,
 *   • three macro RINGS (protein = lime/coral, carbs = cyan, fat = amber) each with
 *     a tabular value-of-target and an animated sweep.
 *
 * Motion: Reanimated v4 (already installed) — withTiming sweeps (~700ms ease-out)
 * + a derived-value count-up; transform/opacity only. No new dependencies: only
 * react-native-reanimated + react-native-svg + the shared theme tokens.
 *
 * The component owns ZERO ground truth: the screen keeps every hook/mutation/
 * testID and feeds this primitives. Colour is never the only signal — every ring
 * carries a text label + tabular value and an accessibility label.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const finite = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

/* ------------------------------------------------------------------ */
/* Count-up number (Reanimated derived value → React state)            */
/* ------------------------------------------------------------------ */

/**
 * Animated integer that tweens from its previous value to `value` over
 * `duration` ms. We drive a shared value with withTiming and mirror the rounded
 * frame back to React state via runOnJS so the <Text> updates each frame — the
 * skill's "animated count-up for big calorie numbers" pattern, RN-native.
 */
function useCountUp(value: number, duration = 700): number {
  const sv = useSharedValue(finite(value));
  const [display, setDisplay] = React.useState(() => Math.round(finite(value)));

  useEffect(() => {
    sv.value = withTiming(finite(value), {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, sv]);

  useDerivedValue(() => {
    runOnJS(setDisplay)(Math.round(sv.value));
  }, [sv]);

  return display;
}

/* ------------------------------------------------------------------ */
/* One animated ring (bespoke SVG)                                     */
/* ------------------------------------------------------------------ */

interface RingProps {
  size: number;
  strokeWidth: number;
  /** 0..1 fraction. */
  fraction: number;
  color: string;
  trackColor: string;
  duration?: number;
  children?: React.ReactNode;
}

function Ring({ size, strokeWidth, fraction, color, trackColor, duration = 750, children }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const clamped = Math.min(1, Math.max(0, finite(fraction)));

  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withTiming(clamped, { duration, easing: Easing.out(Easing.cubic) });
  }, [clamped, duration, sweep]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - sweep.value * circumference,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
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
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Small macro ring (protein / carbs / fat)                            */
/* ------------------------------------------------------------------ */

interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

function MacroRing({ label, current, target, color, unit = 'g' }: MacroRingProps) {
  const { colors, typography } = useTheme();
  const cur = finite(current);
  const tgt = finite(target);
  const fraction = tgt > 0 ? cur / tgt : 0;
  const hasTarget = tgt > 0;

  return (
    <View
      style={macroStyles.col}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        hasTarget
          ? `${label}: ${Math.round(cur)} of ${Math.round(tgt)} ${unit === 'g' ? 'grams' : unit}`
          : `${label}: ${Math.round(cur)} ${unit === 'g' ? 'grams' : unit}`
      }
    >
      <Ring size={66} strokeWidth={6} fraction={fraction} color={color} trackColor={colors.background.quaternary}>
        <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 19, lineHeight: 22 }]} maxFontSizeMultiplier={1.2}>
          {Math.round(cur)}
        </Text>
        <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 9, lineHeight: 11 }]}>
          {hasTarget ? `/${Math.round(tgt)}${unit}` : unit}
        </Text>
      </Ring>
      <View style={macroStyles.legendRow}>
        <View style={[macroStyles.dot, { backgroundColor: color }]} />
        <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 10, letterSpacing: 1 }]}>{label}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Public hero                                                         */
/* ------------------------------------------------------------------ */

export interface MealConfirmHeroProps {
  /** Live plate totals (derived on the screen from the current plate). */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Planned macro target this slot shipped (null when it's an itemized-only slot). */
  target: { calories?: number; protein?: number; carbs?: number; fat?: number } | null;
  /** How many plate items are currently selected — drives the sub-line. */
  itemCount: number;
}

/**
 * The hero: a big animated calorie ring with a count-up kcal at its centre, a
 * "X of Y target" sub-line, and a row of three macro rings. Lives inside the
 * screen's GlassCard so it inherits the dark-glass surface.
 */
export function MealConfirmHero({ calories, protein, carbs, fat, target, itemCount }: MealConfirmHeroProps) {
  const { colors, typography } = useTheme();

  const liveCalories = finite(calories);
  const targetCalories = finite(target?.calories);
  const countUp = useCountUp(liveCalories);

  const calFraction = targetCalories > 0 ? liveCalories / targetCalories : 0;
  const calPct = Math.round(Math.min(1, Math.max(0, calFraction)) * 100);

  // Calorie ring stays lime (the brand accent) until the plate exceeds the
  // planned target, then shifts to amber as a gentle "over target" caution —
  // colour reinforces, but the value + sub-line are the real signal.
  const over = targetCalories > 0 && liveCalories > targetCalories;
  const calColor = over ? colors.accent.amber : colors.accent.coral;

  const subLine =
    targetCalories > 0
      ? `${Math.round(liveCalories)} of ${Math.round(targetCalories)} kcal • ${calPct}%`
      : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} on your plate`;

  return (
    <View style={heroStyles.wrap}>
      <View style={heroStyles.ringWrap}>
        <Ring size={150} strokeWidth={12} fraction={calFraction} color={calColor} trackColor={withAlpha(colors.text.primary, 0.07)}>
          <Text style={[typography.statLarge, { color: colors.text.primary, fontSize: 46, lineHeight: 50 }]} maxFontSizeMultiplier={1.15}>
            {countUp}
          </Text>
          <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 10, letterSpacing: 2, marginTop: 2 }]}>
            KCAL
          </Text>
        </Ring>
      </View>

      <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 14, textAlign: 'center' }]}>
        {subLine}
      </Text>

      <View style={heroStyles.macroRow}>
        <MacroRing label="PROTEIN" current={protein} target={finite(target?.protein)} color={colors.accent.coral} />
        <MacroRing label="CARBS" current={carbs} target={finite(target?.carbs)} color={colors.accent.cyan} />
        <MacroRing label="FAT" current={fat} target={finite(target?.fat)} color={colors.accent.amber} />
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 4 },
  ringWrap: { marginTop: 4 },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: 22,
  },
});

const macroStyles = StyleSheet.create({
  col: { alignItems: 'center', flex: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
});
