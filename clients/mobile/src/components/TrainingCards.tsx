/**
 * TrainingCards — local presentational pieces for the Training hub
 * (app/(tabs)/training.tsx) Zeitra "Workouts grid" redesign.
 *
 * Pure UI: every piece takes plain props + an onPress, owns no data, no
 * navigation and no query. The screen keeps all hooks/testIDs; this file just
 * renders the Zeitra-styled bento grid / muscle carousel / routine carousel /
 * stat-row surfaces with tasteful react-native-reanimated v4 entrance +
 * pressed-scale motion.
 *
 * This is a SCREEN-LOCAL presentational helper (not a shared `ui/*` primitive):
 * it composes the sanctioned tokens from useTheme() and renders plain Views +
 * expo-image + a NON-card scrim LinearGradient. It never renders a card-shaped
 * <SafeBlurView> (that is GlassCard's job) nor a labeled coral-CTA gradient
 * (that is CtaButton's job), so the inline-glass / inline-cta guards stay green.
 *
 * No new dependencies: only react-native-reanimated (already installed) and the
 * shared theme tokens via useTheme().
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
/** Carousel routine card width — peeks the next card a touch. */
export const CAROUSEL_CARD_W = 200;
/** Muscle-group carousel card width — wide rounded photo cards. */
export const MUSCLE_CARD_W = 152;

/**
 * Small shared press-scale wrapper. Wraps a Pressable in an Animated.View so we
 * get a smooth spring-less scale on press without touching the child's layout.
 * Forwards accessibility + testID straight through to the Pressable.
 */
function PressableScale({
  children,
  onPress,
  scaleTo = 0.96,
  accessibilityLabel,
  testID,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  scaleTo?: number;
  accessibilityLabel?: string;
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
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Weekly-volume stat card                                             */
/* ------------------------------------------------------------------ */

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  /** Stagger index for the entrance animation. */
  index?: number;
}

/** A single dark-glass stat tile: big mono numeral + accent icon + label. */
export function StatCard({ label, value, icon, accent, index = 0 }: StatCardProps) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(120 + index * 60).springify().damping(18)}
      style={[
        st.statCard,
        {
          backgroundColor: colors.background.secondary,
          borderColor: colors.border.default,
          borderRadius: borderRadius.xl,
        },
      ]}
    >
      <View style={[st.statIcon, { backgroundColor: withAlpha(accent, 0.14), borderColor: withAlpha(accent, 0.28) }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 22 }]} maxFontSizeMultiplier={1.2}>
        {value}
      </Text>
      <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Workout-category BENTO card (lime-glow border)                      */
/* ------------------------------------------------------------------ */

export interface CategoryCardProps {
  title: string;
  img: any;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  index?: number;
  accessibilityLabel?: string;
  /** Tile width — defaults to the 2-col grid width. */
  cardWidth?: number;
  /** Tile height — bento tiles vary; defaults to 132. */
  height?: number;
}

/**
 * A bento workout-category card: full-bleed art, dark scrim, a glowing
 * lime-accent hairline border (the mockup's signature look), an accent icon
 * glyph bottom-left and the category label top-left. Used in the bento grid.
 */
export function CategoryCard({
  title,
  img,
  accent,
  icon,
  onPress,
  index = 0,
  accessibilityLabel,
  cardWidth,
  height = 132,
}: CategoryCardProps) {
  const { typography, borderRadius, shadows } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(160 + index * 60).springify().damping(18)}>
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? `${title} workouts`}>
        <View
          style={[
            st.catCard,
            shadows.glow(accent),
            {
              width: cardWidth ?? GRID_CARD_W,
              height,
              borderRadius: borderRadius.lg,
              borderColor: accent,
            },
          ]}
        >
          <Image source={img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          <LinearGradient
            colors={[withAlpha(accent, 0.06), 'rgba(8,10,16,0.55)', 'rgba(8,10,16,0.88)']}
            style={[StyleSheet.absoluteFillObject, { borderRadius: borderRadius.lg }]}
          />
          <Text style={[typography.heading, st.catTitle]} numberOfLines={1}>{title}</Text>
          <View style={st.catIcon}>
            <Ionicons name={icon} size={21} color={accent} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Muscle-group CAROUSEL card                                          */
/* ------------------------------------------------------------------ */

export interface MuscleCardProps {
  label: string;
  img: any;
  onPress: () => void;
  index?: number;
  accessibilityLabel?: string;
}

/** A wide rounded muscle-group card: full-bleed muscle art + scrim + label. */
export function MuscleCard({ label, img, onPress, index = 0, accessibilityLabel }: MuscleCardProps) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 50).springify().damping(18)}>
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? `${label} exercises`}>
        <View style={[st.muscleCard, { borderRadius: borderRadius.lg, borderColor: colors.border.default }]}>
          <Image source={img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          <LinearGradient colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFillObject} />
          <Text style={[typography.subhead, st.muscleLabel]} numberOfLines={1}>{label}</Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Routine CAROUSEL card                                               */
/* ------------------------------------------------------------------ */

export interface RoutineCardProps {
  title: string;
  tag: string;
  exerciseCount: number;
  img: any;
  accent: string;
  index: number;
  onPress: () => void;
}

/** A horizontally-snapping routine card: art + scrim + ordinal ring + meta. */
export function RoutineCard({ title, tag, exerciseCount, img, accent, index, onPress }: RoutineCardProps) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={title}>
      <View style={[st.routCard, { width: CAROUSEL_CARD_W, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
        <Image source={img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        <LinearGradient colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFillObject} />
        {/* ordinal ring, top-right */}
        <View style={[st.ordinal, { borderColor: withAlpha(accent, 0.7), backgroundColor: 'rgba(10,12,18,0.55)' }]}>
          <Text style={[typography.caption, { color: accent, fontWeight: '900', fontSize: 12 }]}>{index + 1}</Text>
        </View>
        <View style={st.routContent}>
          <View style={[st.routTag, { backgroundColor: accent }]}>
            <Text style={st.tagTxt}>{tag}</Text>
          </View>
          <Text style={[typography.heading, st.routTitle]} numberOfLines={2}>
            {title}
          </Text>
          <View style={st.routMetaRow}>
            <Ionicons name="barbell-outline" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={[typography.caption, { color: 'rgba(255,255,255,0.7)', marginLeft: 5 }]}>
              {exerciseCount} exercises
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const st = StyleSheet.create({
  statCard: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  // Bento category card — glowing lime hairline border around full-bleed art.
  catCard: {
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  catTitle: {
    position: 'absolute',
    top: 11,
    left: 13,
    right: 13,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
    zIndex: 1,
  },
  catIcon: { position: 'absolute', bottom: 11, left: 13, zIndex: 1 },
  // Muscle-group carousel card.
  muscleCard: {
    width: MUSCLE_CARD_W,
    height: 132,
    overflow: 'hidden',
    borderWidth: 1,
  },
  muscleLabel: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  routCard: {
    height: 168,
    overflow: 'hidden',
    borderWidth: 1,
  },
  ordinal: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  routContent: { flex: 1, padding: 14, justifyContent: 'flex-end' },
  routTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    marginBottom: 7,
  },
  tagTxt: { color: '#0A0C12', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  routTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  routMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
});
