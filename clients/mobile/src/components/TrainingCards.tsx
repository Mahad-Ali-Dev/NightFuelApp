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
import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path,
  Defs,
  ClipPath,
  Image as SvgImage,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { CtaButton } from '@/components/ui';

const { width } = Dimensions.get('window');
/** Two-column grid card width (20px page padding both sides, 12px gutter). */
export const GRID_CARD_W = (width - 52) / 2;
/** Carousel routine card width — peeks the next card a touch. */
export const CAROUSEL_CARD_W = 200;
/** Muscle-group carousel card width — wide rounded photo cards. */
export const MUSCLE_CARD_W = 128;
/** Page padding the Train + Meals hubs use on the left + right (16px gutter,
 *  matching the mockup's `padding:0 16px` content column). */
const PAGE_PAD = 16;

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
  /** Exercise count shown in lime under the label (mockup's "N exercises"). */
  count?: number;
}

/**
 * A muscle-group card matching the "Target a muscle group" mockup: a centred,
 * spotlit `muscle-<group>-male` figure (a soft lime radial glow behind it), and
 * a bottom gradient footer carrying the muscle label + a lime "N exercises"
 * count. The figure is contain-fit (not cropped) so the full body model reads.
 */
export function MuscleCard({ label, img, onPress, index = 0, accessibilityLabel, count }: MuscleCardProps) {
  const { colors, typography, borderRadius } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 50).springify().damping(18)}>
      <PressableScale
        onPress={onPress}
        accessibilityLabel={accessibilityLabel ?? `${label} exercises`}
      >
        <View
          style={[
            st.muscleCard,
            { borderRadius: 18, borderColor: colors.border.default, backgroundColor: colors.background.secondary },
          ]}
        >
          {/* Lime spotlight behind the figure */}
          <View style={st.muscleSpot} pointerEvents="none">
            <LinearGradient
              colors={[withAlpha(colors.accent.lime, 0.22), 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={st.muscleSpotFill}
            />
          </View>
          <Image source={img} style={st.muscleFigure} contentFit="contain" cachePolicy="memory-disk" transition={200} />
          {/* Bottom footer: label + lime count */}
          <LinearGradient
            colors={['transparent', withAlpha(colors.background.primary, 0.96)]}
            style={st.muscleFooter}
          >
            <Text style={[typography.subhead, st.muscleLabel]} numberOfLines={1}>{label}</Text>
            {typeof count === 'number' ? (
              <Text style={[typography.caption, { color: colors.accent.lime, fontWeight: '500', marginTop: 1 }]} numberOfLines={1}>
                {count} exercises
              </Text>
            ) : null}
          </LinearGradient>
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

/* ------------------------------------------------------------------ */
/* WOD swipeable CAROUSEL (pager + dots + Start-workout CtaButton)     */
/* ------------------------------------------------------------------ */

export interface WodItem {
  id: string;
  title: string;
  /** e.g. "45 min · 8 exercises" */
  meta: string;
  /** Full-bleed figure art (a muscle-<group>-male tile reads best). */
  img: any;
}

export interface WodCarouselProps {
  items: WodItem[];
  /** Fired by the lime "Start workout" pill (and the card body). Same handler. */
  onStart: () => void;
}

/** Width of one WOD page = the full content column (page-padded both sides). */
const WOD_PAGE_W = width - PAGE_PAD * 2;

/**
 * A horizontally-paging WOD hero carousel. Each page is a full-bleed graphite
 * card (the figure bleeds off the right, a left→right scrim keeps the copy
 * legible) carrying a lime "WORKOUT OF THE DAY" eyebrow, the workout title, a
 * "45 min · 8 exercises" meta line and a lime `CtaButton` "Start workout" pill
 * (play icon). Pagination dots beneath track the active page; the active dot is
 * an elongated lime pill. The pager snaps page-to-page. `onStart` is the SAME
 * handler for every card body + pill, so the screen's start flow is preserved.
 */
export function WodCarousel({ items, onStart }: WodCarouselProps) {
  const { colors, typography } = useTheme();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList>(null);
  const pausedRef = useRef(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / WOD_PAGE_W);
    setPage((prev) => (prev === i ? prev : i));
  }, []);

  // Gentle auto-advance (~4.5s). Pauses while the user is dragging and resumes
  // after the swipe settles, so it never fights a manual swipe. The dots follow
  // `page` for free. Guarded to multi-item lists.
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setPage((prev) => {
        const next = (prev + 1) % items.length;
        listRef.current?.scrollToOffset({ offset: next * WOD_PAGE_W, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [items.length]);

  return (
    <View>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScroll={onScroll}
        onScrollBeginDrag={() => { pausedRef.current = true; }}
        onMomentumScrollEnd={(e) => { onScroll(e); pausedRef.current = false; }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: PAGE_PAD }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(80 + index * 40).springify().damping(18)} style={{ width: WOD_PAGE_W }}>
            <PressableScale onPress={onStart} accessibilityLabel={`${item.title}, ${item.meta}. Start workout`} scaleTo={0.985}>
              <View style={[st.wodCard, { borderRadius: 18, backgroundColor: '#14171E' }]}>
                {/* 150° graphite gradient base (mockup: #2b303a → #14171e), no glow. */}
                <LinearGradient
                  colors={['#2B303A', '#14171E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Image source={item.img} style={st.wodFigure} contentFit="contain" cachePolicy="memory-disk" transition={200} />
                {/* Left→right scrim (#1b1e25 34% → transparent 84%) keeps the copy legible. */}
                <LinearGradient
                  colors={['#1B1E25', '#1B1E25', 'transparent']}
                  locations={[0, 0.34, 0.84]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0.06 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={st.wodInner}>
                  <View style={[st.wodEyebrow, { backgroundColor: colors.accent.lime }]}>
                    <Text style={[st.wodEyebrowTxt, { color: colors.text.inverse }]} maxFontSizeMultiplier={1.2}>WORKOUT OF THE DAY</Text>
                  </View>
                  <Text style={[typography.h2, { color: '#FFF', fontSize: 22, fontWeight: '600', letterSpacing: -0.4, marginTop: 8 }]} numberOfLines={1}>{item.title}</Text>
                  <View style={st.wodMetaRow}>
                    <Ionicons name="time-outline" size={13} color={colors.accent.lime} />
                    <Text style={[typography.caption, { color: '#CFD4DD', fontSize: 12.5, marginLeft: 5 }]} numberOfLines={1}>{item.meta}</Text>
                  </View>
                  <CtaButton
                    label="Start workout"
                    icon="play"
                    size="sm"
                    onPress={onStart}
                    accessibilityLabel={`Start ${item.title}`}
                    style={st.wodCta}
                  />
                </View>
              </View>
            </PressableScale>
          </Animated.View>
        )}
      />
      {/* Pagination dots */}
      <View style={st.dotsRow}>
        {items.map((it, i) => (
          <View
            key={it.id}
            style={i === page
              ? [st.dotActive, { backgroundColor: colors.accent.lime }]
              : [st.dot, { backgroundColor: '#3A3F49' }]}
          />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Interlocking L-shape BENTO ("Browse by style")                      */
/* ------------------------------------------------------------------ */

export interface BentoItem {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  img: any;
  onPress: () => void;
  /** Optional small subtitle under the title (Meals "Explore meals" cards). */
  subtitle?: string;
  /** When true the L-card fills with a COVER photo (slice) instead of Train's
   *  contained figure (meet). Used by the Meals bento; Train omits it. */
  cover?: boolean;
}

export interface BentoBrowseProps {
  /**
   * Exactly six style tiles, in the mockup's z-order:
   *   [0] HIIT (tall, top-left), [1] Strength (L-shape), [2] Cardio (nests in
   *   the notch), [3] Yoga (wide), [4] Mobility, [5] Pilates.
   * Each keeps its own onPress (preserved nav).
   */
  items: BentoItem[];
}

// ── Bento geometry ──────────────────────────────────────────────────────────
// The mockup lays the bento out in a 308-wide content column; we scale every
// fixed coordinate by (our content width / 308) so the interlock holds at any
// device width. Derived ONCE at module scope.
const BENTO_REF_W = 308; // mockup content column width
const BENTO_SCALE = WOD_PAGE_W / BENTO_REF_W;
const bs = (n: number) => Math.round(n * BENTO_SCALE);
// Reference (mockup px) → scaled device px for each tile + the L-shape notch.
const BENTO = {
  totalH: bs(401),
  // HIIT — tall, top-left
  hiit: { left: bs(0), top: bs(0), w: bs(96), h: bs(173) },
  // Strength — the L-shaped SVG card (occupies the top-right block minus the notch)
  strength: { left: bs(105), top: bs(0), w: bs(203), h: bs(173) },
  // Cardio — nests cleanly in Strength's bottom-right notch (zero overlap)
  cardio: { left: bs(210), top: bs(113), w: bs(98), h: bs(195) },
  // Yoga — wide (2/3) below HIIT
  yoga: { left: bs(0), top: bs(182), w: bs(203), h: bs(126) },
  // Mobility + Pilates — equal pair at the bottom
  mobility: { left: bs(0), top: bs(317), w: bs(149), h: bs(84) },
  pilates: { left: bs(159), top: bs(317), w: bs(149), h: bs(84) },
};
const BENTO_R = 18; // corner + notch radius
// The Strength L-shape outline (rounded outer corners + a rounded inner notch at
// the bottom-right, into which Cardio nests). Coordinates are in the strength
// tile's own w×h space, scaled from the mockup's exact path.
function strengthPath(w: number, h: number): string {
  const r = BENTO_R;
  // The bottom-right notch (where Cardio nests), proportioned EXACTLY from the
  // mockup's 203×173 clipPath: the inner vertical WALL sits at x=95/203≈0.468·w
  // and the right side cuts in at the SHELF y=106/173≈0.613·h. The shelf's top
  // corner is one radius (r) to the right of the wall (mockup 113−95 = 18 = r),
  // joined by a concave quarter-round — so Cardio (placed just right of the wall
  // and just below the shelf) sits cleanly inside with zero overlap.
  const notchX = Math.round(w * 0.468); // inner vertical wall x
  const notchY = Math.round(h * 0.613); // shelf y (notch depth from the top)
  return [
    `M 0,${r}`,
    `A ${r},${r} 0 0 1 ${r},0`,
    `L ${w - r},0`,
    `A ${r},${r} 0 0 1 ${w},${r}`,
    `L ${w},${notchY - r}`,
    `A ${r},${r} 0 0 1 ${w - r},${notchY}`,
    `L ${notchX + r},${notchY}`,
    `A ${r},${r} 0 0 0 ${notchX},${notchY + r}`,
    `L ${notchX},${h - r}`,
    `A ${r},${r} 0 0 1 ${notchX - r},${h}`,
    `L ${r},${h}`,
    `A ${r},${r} 0 0 1 0,${h - r}`,
    `Z`,
  ].join(' ');
}

/** A simple lime icon chip (bottom-left of a bento tile). */
function BentoIcon({ icon, color, ink, border }: { icon: keyof typeof Ionicons.glyphMap; color: string; ink: string; border: string }) {
  return (
    <View style={[st.bentoIco, { backgroundColor: ink, borderColor: border }]}>
      <Ionicons name={icon} size={17} color={color} />
    </View>
  );
}

/**
 * A rectangular bento tile. Two looks, chosen by `item.cover`:
 *  - TRAIN (`cover` falsy, the mockup `.cat`): a graphite 150° gradient card with
 *    the figure CONTAINED (whole body visible, dimmed), anchored center (HIIT /
 *    Cardio) or right (Yoga / Mobility / Pilates) — never cover-cropped.
 *  - MEALS (`cover: true`): a full-bleed cover food photo.
 * Both carry the lime hairline + glow, a top-left title (+ optional subtitle) and
 * a bottom-left lime icon chip.
 */
function BentoRect({
  item,
  w,
  h,
  left,
  top,
  big = true,
  anchor = 'center',
}: {
  item: BentoItem;
  w: number;
  h: number;
  left: number;
  top: number;
  big?: boolean;
  anchor?: 'center' | 'right';
}) {
  const { colors, typography, shadows } = useTheme();
  const iconInk = withAlpha(colors.accent.limeDark, 0.18);
  const iconBorder = withAlpha(colors.accent.lime, 0.32);
  return (
    <View style={[st.bentoAbs, { left, top, width: w, height: h }]}>
      <PressableScale onPress={item.onPress} accessibilityLabel={`${item.title} workouts`} style={StyleSheet.absoluteFill}>
        <View style={[st.bentoRect, { width: w, height: h, borderColor: item.cover ? colors.border.default : colors.accent.lime }, item.cover ? null : shadows.glow(colors.accent.lime)]}>
          {item.cover ? (
            // Meals: full-bleed cover food photo.
            <Image source={item.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          ) : (
            // Train: graphite gradient base + contained, dimmed figure.
            <>
              <LinearGradient
                colors={['#2B303A', '#14171E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Image
                source={item.img}
                style={anchor === 'right'
                  ? { position: 'absolute', right: 6, top: 0, bottom: 0, width: '62%', opacity: 0.85 }
                  : { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.85 }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={200}
              />
            </>
          )}
          <LinearGradient
            colors={item.cover
              ? [withAlpha(colors.background.primary, 0.8), withAlpha(colors.background.primary, 0.18), 'transparent']
              : [withAlpha(colors.background.primary, 0.85), withAlpha(colors.background.primary, 0.28), 'transparent']}
            start={item.cover ? { x: 0.15, y: 0.9 } : { x: 0, y: 0 }}
            end={item.cover ? { x: 0.85, y: 0.1 } : { x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={[typography.heading, st.bentoTitle, { fontSize: big ? 16 : 15 }]} numberOfLines={1}>{item.title}</Text>
          {item.subtitle ? <Text style={st.bentoSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
          <View style={st.bentoIconWrap}>
            <BentoIcon icon={item.icon} color={colors.accent.lime} ink={iconInk} border={iconBorder} />
          </View>
        </View>
      </PressableScale>
    </View>
  );
}

/**
 * The interlocking "Browse by style" bento. Renders six grayscale-photo cards in
 * the mockup's locking layout — HIIT tall top-left, a TRUE L-shaped Strength card
 * (rounded outer corners + a rounded inner notch drawn with react-native-svg),
 * Cardio nesting cleanly inside that notch with zero overlap, a wide Yoga card,
 * and an equal Mobility/Pilates pair at the bottom. Each tile keeps its own
 * onPress (nav preserved). The whole thing is an absolutely-positioned canvas of
 * fixed (scaled) coordinates so the interlock geometry is exact.
 */
export function BentoBrowse({ items }: BentoBrowseProps) {
  const [hiit, strength, cardio, yoga, mobility, pilates] = items;

  return (
    <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={[st.bentoCanvas, { height: BENTO.totalH }]}>
      {hiit ? <BentoRect item={hiit} {...BENTO.hiit} anchor="center" /> : null}
      {strength ? <StrengthCard item={strength} {...BENTO.strength} /> : null}
      {cardio ? <BentoRect item={cardio} {...BENTO.cardio} anchor="center" /> : null}
      {yoga ? <BentoRect item={yoga} {...BENTO.yoga} anchor="right" /> : null}
      {mobility ? <BentoRect item={mobility} {...BENTO.mobility} big={false} anchor="right" /> : null}
      {pilates ? <BentoRect item={pilates} {...BENTO.pilates} big={false} anchor="right" /> : null}
    </Animated.View>
  );
}

/**
 * The Strength tile — a TRUE L-shaped card. The whole surface (background fill,
 * the figure, the scrim and the lime outline) is drawn in ONE react-native-svg
 * canvas so the concave notch is exact: the figure is an SVG <Image> CLIPPED to
 * the L path (so it never spills into the notch where Cardio nests), the scrim
 * is the same path filled with a gradient, and the outline strokes the path on
 * top. The title + lime icon chip are RN overlays (crisp text, outside the clip).
 * Preserves `item.onPress` (nav). The `muscle-<group>-male` figures are already
 * near-monochrome lime renders on transparent backgrounds, so no grayscale CSS
 * filter is needed (react-native-svg has none).
 */
function StrengthCard({
  item,
  w,
  h,
  left,
  top,
}: {
  item: BentoItem;
  w: number;
  h: number;
  left: number;
  top: number;
}) {
  const { colors, typography, shadows } = useTheme();
  const d = strengthPath(w, h);
  const iconInk = withAlpha(colors.accent.limeDark, 0.18);
  const iconBorder = withAlpha(colors.accent.lime, 0.32);
  // Figure box: right-anchored, full height, ~74% wide (mirrors the mockup's
  // x=72 / width=150 in a 203-wide tile). Clipped to the L so the notch stays empty.
  const figW = Math.round(w * 0.74);
  const figX = w - figW;
  return (
    <View style={[st.bentoAbs, { left, top, width: w, height: h }]}>
      <PressableScale onPress={item.onPress} accessibilityLabel={`${item.title} workouts`} style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, item.cover ? null : shadows.glow(colors.accent.lime)]}>
          <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
            <Defs>
              <ClipPath id="strengthClip">
                <Path d={d} />
              </ClipPath>
              <SvgLinearGradient id="strengthScrim" x1="0.15" y1="0.9" x2="0.85" y2="0.1">
                <Stop offset="0" stopColor={colors.background.primary} stopOpacity={0.8} />
                <Stop offset="0.55" stopColor={colors.background.primary} stopOpacity={0.12} />
                <Stop offset="1" stopColor={colors.background.primary} stopOpacity={0} />
              </SvgLinearGradient>
              {/* Graphite 150° base — matches the mockup's sgA + every other Train tile. */}
              <SvgLinearGradient id="strengthBase" x1="0" y1="0" x2="0.8" y2="1">
                <Stop offset="0" stopColor="#2B303A" />
                <Stop offset="1" stopColor="#14171E" />
              </SvgLinearGradient>
            </Defs>
            {/* Everything below is clipped to the L silhouette. Train uses the
                graphite gradient; Meals (cover) hides it under the food slice. */}
            <Path d={d} fill={item.cover ? colors.background.tertiary : 'url(#strengthBase)'} />
            <SvgImage
              href={item.img}
              x={item.cover ? 0 : figX}
              y={0}
              width={item.cover ? w : figW}
              height={h}
              preserveAspectRatio={item.cover ? 'xMidYMid slice' : 'xMidYMax meet'}
              opacity={item.cover ? 1 : 0.85}
              clipPath="url(#strengthClip)"
            />
            <Path d={d} fill="url(#strengthScrim)" />
            {/* Lime outline tracing the L (Train only; Meals cover uses a neutral hairline). */}
            <Path d={d} fill="none" stroke={item.cover ? colors.border.default : colors.accent.lime} strokeWidth={1.5} />
          </Svg>
          {/* Title + icon overlays (crisp, outside the SVG clip) */}
          <Text style={[typography.heading, st.strengthTitle]} numberOfLines={1}>{item.title}</Text>
          {item.subtitle ? <Text style={st.strengthSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
          <View style={st.strengthIcon}>
            <BentoIcon icon={item.icon} color={colors.accent.lime} ink={iconInk} border={iconBorder} />
          </View>
        </View>
      </PressableScale>
    </View>
  );
}

const st = StyleSheet.create({
  // ── WOD carousel ──────────────────────────────────────────────────────────
  wodCard: {
    height: 150,
    overflow: 'hidden',
  },
  wodFigure: { position: 'absolute', right: -bs(24), top: -7, bottom: -7, width: '58%', opacity: 0.82 },
  wodInner: { flex: 1, padding: 15, alignItems: 'flex-start' },
  wodEyebrow: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  wodEyebrowTxt: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  wodMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  wodCta: { marginTop: 'auto', alignSelf: 'flex-start', borderRadius: 22, paddingHorizontal: 20 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 11 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18, height: 6, borderRadius: 3 },
  // ── Bento ("Browse by style") ─────────────────────────────────────────────
  bentoCanvas: { position: 'relative', width: WOD_PAGE_W, alignSelf: 'center' },
  bentoAbs: { position: 'absolute' },
  bentoRect: {
    // Explicit size (set inline to w×h) — NOT absoluteFill: PressableScale's inner
    // Pressable collapses to 0 height with an absolute-only child, which clipped
    // every tile to a thin line. A sized, normal-flow child makes the Pressable
    // wrap it correctly so the gradient/photo/figure fill the tile.
    borderRadius: BENTO_R,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  bentoTitle: {
    position: 'absolute',
    top: 11,
    left: 13,
    right: 13,
    color: '#FFF',
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
    zIndex: 1,
  },
  bentoIconWrap: { position: 'absolute', bottom: 10, left: 12, zIndex: 1 },
  bentoIco: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthTitle: {
    position: 'absolute',
    top: 11,
    left: 14,
    right: 14,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  strengthIcon: { position: 'absolute', bottom: 12, left: 12 },
  // Optional bento subtitles (Meals "Explore meals"). Sit just under the title.
  bentoSubtitle: { position: 'absolute', top: 30, left: 13, right: 13, color: '#CFD4DD', fontSize: 10.5, fontWeight: '500', zIndex: 1 },
  strengthSubtitle: { position: 'absolute', top: 30, left: 14, right: 14, color: '#CFD4DD', fontSize: 10.5, fontWeight: '500', zIndex: 2 },
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
  // Muscle-group carousel card — spotlit centred figure + footer (mockup).
  muscleCard: {
    width: MUSCLE_CARD_W,
    height: 164,
    overflow: 'hidden',
    borderWidth: 1,
  },
  muscleSpot: { position: 'absolute', top: 18, left: 0, right: 0, height: 116, alignItems: 'center' },
  muscleSpotFill: { width: 116, height: 116, borderRadius: 58 },
  muscleFigure: { position: 'absolute', top: 8, left: 0, right: 0, height: 124 },
  muscleFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 13,
    paddingTop: 18,
    paddingBottom: 11,
  },
  muscleLabel: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
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
