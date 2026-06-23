/**
 * NutritionCards — local presentational pieces for the Nutrition hub
 * (app/(tabs)/nutrition.tsx) Aurora / Zeitra redesign.
 *
 * Pure UI: every piece takes plain props + an optional onPress, owns no data, no
 * navigation and no query. The screen keeps all hooks/testIDs/queries; this file
 * just renders the Zeitra-styled grid / carousel / widget surfaces with tasteful
 * react-native-reanimated v4 entrance + pressed-scale motion.
 *
 * No new dependencies: only react-native-reanimated + react-native-svg (both
 * already installed) and the shared theme tokens via useTheme().
 *
 * ── A note on the hydration ring ────────────────────────────────────────────
 * It is drawn with plain `react-native-svg` Circles — DELIBERATELY NOT the
 * shared `@/components/ui/CircularProgress`. The nutrition macro-guard test reads
 * the LAST CircularProgress's `progress` prop (`latestRingFraction`) to assert the
 * calorie ring's clamp; introducing a second shared ring would change "the last
 * one" and break that assertion. A bespoke SVG ring keeps the calorie ring the
 * one-and-only CircularProgress in the tree. Likewise this file renders NO inner
 * View with `width:'<n>%'` + `height:'100%'` (the macro-bar probe's signature) —
 * only MacroTile's bar carries that, exactly as before.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');
/** Two-column grid card width (20px page padding both sides, 12px gutter). */
export const GRID_CARD_W = (width - 52) / 2;
/** Carousel recipe card width — peeks the next card a touch. */
export const RECIPE_CARD_W = 188;

const finite = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

/**
 * Small shared press-scale wrapper. Wraps a Pressable in an Animated.View so we
 * get a smooth scale on press without touching the child's layout. Forwards
 * accessibility + testID straight through to the Pressable.
 */
function PressableScale({
  children,
  onPress,
  scaleTo = 0.96,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  scaleTo?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[aStyle, style]}>
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(scaleTo, { duration: 90 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 120 });
        }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Macro tile (Protein / Carbs / Fat)                                  */
/* ------------------------------------------------------------------ */

export interface MacroTileProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
  index?: number;
}

/**
 * One macro stat tile: label + big mono value-of-target + a thin progress bar.
 * The bar fill keeps the EXACT `{ width: '<n>%', height: '100%' }` signature the
 * macro-guard test probes for (three of these render, one per macro), and the
 * current/target are funnelled through `finite` + clamped to 0..1 so a NaN log
 * can't yield a NaN width — mirroring the original inline MacroItem contract.
 */
export function MacroTile({ label, current, target, color, unit = 'g', index = 0 }: MacroTileProps) {
  const { colors, typography, borderRadius } = useTheme();
  const safeCurrent = finite(current);
  const safeTarget = finite(target);
  const progress = safeTarget > 0 ? Math.min(1, Math.max(0, safeCurrent / safeTarget)) : 0;

  return (
    <Animated.View
      entering={FadeInDown.delay(180 + index * 60).springify().damping(18)}
      style={[
        st.macroTile,
        { backgroundColor: withAlpha(colors.background.tertiary, 0.5), borderColor: colors.border.default, borderRadius: borderRadius.lg },
      ]}
    >
      {/* Group label + numeric so a screen reader announces one coherent
          statement ("Protein: 90 of 180 grams"); color is never the sole signal. */}
      <View
        accessible
        accessibilityLabel={`${label}: ${Math.round(safeCurrent)} of ${Math.round(safeTarget)} grams`}
        style={st.macroTileHead}
      >
        <View style={[st.macroDot, { backgroundColor: color }]} />
        <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold' }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      </View>
      <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 18 }]} maxFontSizeMultiplier={1.2}>
        {Math.round(safeCurrent)}
        <Text style={[typography.caption, { color: colors.text.tertiary }]}>{`/${Math.round(safeTarget)}${unit}`}</Text>
      </Text>
      <View style={[st.macroBarBg, { backgroundColor: colors.background.quaternary }]}>
        <View style={[st.macroBarFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Meal-slot GRID card                                                 */
/* ------------------------------------------------------------------ */

export interface MealSlotCardProps {
  /** Meal title (plan label / name). */
  title: string;
  /** Scheduled time chip, e.g. "08:00". */
  time?: string;
  description?: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  index?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** A 2-col grid card for one planned meal slot: time chip, icon, title, add cue. */
export function MealSlotCard({
  title,
  time,
  description,
  accent,
  icon,
  index = 0,
  onPress,
  accessibilityLabel,
}: MealSlotCardProps) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(140 + index * 70).springify().damping(18)}>
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? title}>
        <View
          style={[
            st.slotCard,
            { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl },
          ]}
        >
          <View style={st.slotTop}>
            <View style={[st.slotIcon, { backgroundColor: withAlpha(accent, 0.14), borderColor: withAlpha(accent, 0.3) }]}>
              <Ionicons name={icon} size={18} color={accent} />
            </View>
            {time ? (
              <View style={[st.slotTime, { backgroundColor: withAlpha(colors.background.tertiary, 0.6) }]}>
                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>{time}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '800', marginTop: 12 }]} numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 3 }]} numberOfLines={1}>
              {description}
            </Text>
          ) : null}
          <View style={st.slotFoot}>
            <Ionicons name="add-circle" size={20} color={accent} />
            <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6, fontWeight: '600' }]}>Log</Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Recipe CAROUSEL card                                                */
/* ------------------------------------------------------------------ */

export interface RecipeCardProps {
  title: string;
  calories?: number;
  protein?: number;
  minutes?: number;
  img: any;
  accent: string;
  index?: number;
  onPress?: () => void;
}

/** A horizontally-snapping recipe card: art + scrim + macro meta footer. */
export function RecipeCard({ title, calories, protein, minutes, img, accent, index = 0, onPress }: RecipeCardProps) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={title} accessibilityHint="Opens recipe">
      <View style={[st.recipeCard, { width: RECIPE_CARD_W, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
        <Image source={img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        <LinearGradient colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.86)']} style={StyleSheet.absoluteFillObject} />
        {typeof minutes === 'number' && minutes > 0 ? (
          <View style={[st.recipeTime, { backgroundColor: 'rgba(10,12,18,0.6)', borderColor: withAlpha(accent, 0.6) }]}>
            <Ionicons name="time-outline" size={11} color={accent} />
            <Text style={[typography.caption, { color: '#FFF', marginLeft: 4, fontSize: 11, fontWeight: '700' }]}>{minutes}m</Text>
          </View>
        ) : null}
        <View style={st.recipeContent}>
          <Text style={[typography.subhead, st.recipeTitle]} numberOfLines={2}>
            {title}
          </Text>
          <View style={st.recipeMetaRow}>
            {typeof calories === 'number' && calories > 0 ? (
              <View style={[st.recipeChip, { backgroundColor: withAlpha(accent, 0.22) }]}>
                <Text style={[typography.caption, { color: accent, fontWeight: '800', fontSize: 10 }]}>{Math.round(calories)} KCAL</Text>
              </View>
            ) : null}
            {typeof protein === 'number' && protein > 0 ? (
              <Text style={[typography.caption, { color: 'rgba(255,255,255,0.75)', fontSize: 11 }]}>{Math.round(protein)}g protein</Text>
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

/**
 * "Discover recipes" terminal card for the carousel — the graceful fallback when
 * the recipes read is empty (or still resolving). Tappable; routes via the
 * screen's existing recipes navigation.
 */
export function RecipeDiscoverCard({ onPress }: { onPress?: () => void }) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel="Browse all recipes">
      <View
        style={[
          st.recipeCard,
          st.recipeDiscover,
          { width: RECIPE_CARD_W, borderRadius: borderRadius.xl, backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.coral, 0.3) },
        ]}
      >
        <View style={[st.discoverIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.28) }]}>
          <Ionicons name="restaurant" size={24} color={colors.accent.coral} />
        </View>
        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '800', marginTop: 12, textAlign: 'center' }]}>
          Discover Recipes
        </Text>
        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4, textAlign: 'center' }]}>
          High-protein, protocol-ready
        </Text>
      </View>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */
/* Hydration ring widget                                               */
/* ------------------------------------------------------------------ */

export interface HydrationRingProps {
  /** Consumed millilitres. */
  current: number;
  /** Target millilitres. */
  target: number;
  size?: number;
}

/**
 * Bespoke SVG hydration ring (see file header for why this is NOT the shared
 * CircularProgress). Renders a track + a blue progress arc with the consumed
 * litres in the middle. Pure UI; the screen owns the data read.
 */
export function HydrationRing({ current, target, size = 72 }: HydrationRingProps) {
  const { colors, typography } = useTheme();
  const safeCurrent = finite(current);
  const safeTarget = finite(target) > 0 ? finite(target) : 1;
  const frac = Math.min(1, Math.max(0, safeCurrent / safeTarget));
  const strokeWidth = 7;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  const litres = (safeCurrent / 1000).toFixed(1);
  const stroke = colors.accent.blue;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Hydration ${Math.round(safeCurrent)} of ${Math.round(safeTarget)} millilitres`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={r} stroke={colors.background.quaternary} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - frac * c}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <Text style={[typography.statTiny, { color: colors.text.primary, fontSize: 15 }]} maxFontSizeMultiplier={1.2}>
        {litres}
      </Text>
      <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 9 }]}>L</Text>
    </View>
  );
}

const st = StyleSheet.create({
  macroTile: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  macroTileHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  macroDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  macroBarBg: { height: 5, width: '100%', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  // The fill keeps the exact { width:'<n>%', height:'100%' } signature the macro
  // guard test probes for — do not change `height` to a number here.
  macroBarFill: { height: '100%', borderRadius: 3 },
  slotCard: {
    width: GRID_CARD_W,
    borderWidth: 1,
    padding: 14,
    minHeight: 132,
    justifyContent: 'space-between',
  },
  slotTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  slotTime: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  slotFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  recipeCard: {
    height: 168,
    overflow: 'hidden',
    borderWidth: 1,
  },
  recipeContent: { flex: 1, padding: 12, justifyContent: 'flex-end' },
  recipeTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  recipeMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 8, flexWrap: 'wrap' },
  recipeChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  recipeTime: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    zIndex: 2,
  },
  recipeDiscover: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  discoverIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
