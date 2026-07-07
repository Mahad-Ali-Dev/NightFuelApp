/**
 * EncyclopediaCards — local presentation pieces for the Food Encyclopedia
 * screen (Zeitra). PURE PRESENTATION: no data hooks, no mutations, no
 * navigation. The screen owns all of that and passes already-computed numbers
 * + callbacks down. Kept screen-local (not a shared primitive) per the redesign
 * rules — it exists only to give the encyclopedia the nutrition patterns from
 * the brief without bloating the screen file.
 *
 * Nutrition patterns (translated to native RN — no new deps):
 *   • CountUp — a big condensed COUNT-UP number (Reanimated useSharedValue +
 *     withTiming driving an editable=false TextInput; the app's standard
 *     count-up idiom, mirrors MealMacroSummary). Used for the modal's hero
 *     calories.
 *   • MacroRing — a circular macro RING via react-native-svg (protein=lime,
 *     carbs=cyan, fat=amber) with a count-up gram value at its centre. Mirrors
 *     the app's AnimatedRing / MealMacroSummary rings.
 *   • StatPill — a rounded row: tinted icon chip + label + big tabular value +
 *     unit. Used for the modal's primary macro breakdown.
 *   • FoodCard — the searchable list row: name + group/serving, a compact
 *     protein/carb/fat dot strip, and a BIG condensed kcal number on the right.
 *
 * All colors come from useTheme() tokens (never raw hex). Nothing here ever
 * paints text on a lime fill, so no text.inverse is needed.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import type { FoodItem } from '@/api/meals';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// Animated count-up text: TextInput is the cross-platform-safe target whose
// `text` prop Reanimated can drive from the UI thread without a JS re-render.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** A finite, non-negative number (defensive — inputs are usually pre-guarded). */
const clampNum = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/** Animated count-up number rendered as athletic condensed type. */
export function CountUp({
  value,
  style,
  suffix = '',
  duration = 650,
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

/** One SVG macro ring with a count-up gram value at its center. */
export function MacroRing({
  label,
  value,
  color,
  size = 76,
  strokeWidth = 7,
  cap = 60,
}: {
  label: string;
  value: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  /** Reference max used to size the sweep (macros have no fixed target here). */
  cap?: number;
}) {
  const { colors, typography } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const pct = cap > 0 ? Math.min(1, clampNum(value) / cap) : 0;
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

/**
 * StatPill — tinted icon chip + label on the left, big condensed tabular value
 * + unit on the right. The macro breakdown unit of the modal.
 */
export function StatPill({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}>
      <View style={[styles.pillIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[typography.bodyMedium, { color: colors.text.secondary, flex: 1 }]}>{label}</Text>
      <CountUp value={value} style={[typography.statSmall, { color: colors.text.primary, fontSize: 22, lineHeight: 26, padding: 0 }]} />
      {/* Condensed unit (statSmall sized down) so the unit shares the athletic
          condensed family of the tabular value beside it — tightens the
          nutrition lockup vs. the previous Barlow `caption`. */}
      <Text style={[typography.statSmall, { fontSize: 13, lineHeight: 16, color: colors.text.tertiary, marginLeft: 3, marginBottom: 2 }]}>{unit}</Text>
    </View>
  );
}

const MACRO_DOTS = (item: FoodItem, c: { coral: string; cyan: string; amber: string }) => [
  { l: 'P', v: item.protein, c: c.coral },
  { l: 'C', v: item.carbs, c: c.cyan },
  { l: 'F', v: item.fat, c: c.amber },
];

/**
 * FoodCard — one searchable list row. Preserves the original tap target
 * (accessibilityRole/Label + onPress) but restyles to dark-glass with a tinted
 * leading chip, a compact P/C/F dot strip, and a BIG condensed kcal number with
 * pressed-scale feedback.
 */
export function FoodCard({ item, onPress }: { item: FoodItem; onPress: () => void }) {
  const { colors, typography } = useTheme();
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dots = MACRO_DOTS(item, { coral: colors.accent.coral, cyan: colors.accent.cyan, amber: colors.accent.amber });

  return (
    <Animated.View style={aStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.name}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 18, mass: 0.6 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 18, mass: 0.6 }); }}
        style={[styles.foodCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
      >
        <View style={[styles.foodChip, { backgroundColor: colors.accent.coral + '1A', borderColor: colors.accent.coral + '33' }]}>
          <Ionicons name="restaurant-outline" size={18} color={colors.accent.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1}>{item.foodGroup || 'General'} • {item.servingSize}</Text>
          <View style={styles.dotRow}>
            {dots.map((m) => (
              <View key={m.l} style={styles.dotItem}>
                <View style={[styles.dot, { backgroundColor: m.c }]} />
                <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>{m.l} {Math.round(m.v)}g</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.kcalCol}>
          <Text style={[typography.statSmall, { color: colors.accent.coral, fontSize: 24, lineHeight: 28 }]}>{Math.round(item.calories)}</Text>
          <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9, letterSpacing: 1 }]}>KCAL</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ringItem: { alignItems: 'center', gap: 8, flex: 1 },
  ringValue: { position: 'absolute', padding: 0, margin: 0, textAlign: 'center', minWidth: 60, includeFontPadding: false as any },
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 52, gap: 10 },
  pillIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  foodCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 14 },
  foodChip: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dotRow: { flexDirection: 'row', gap: 12, marginTop: 7 },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  kcalCol: { alignItems: 'flex-end', minWidth: 52 },
});
