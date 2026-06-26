/**
 * ExerciseGridCard — a single 2-col tile in the Zeitra exercise-library grid.
 *
 * Pure presentation: thumbnail with a dark scrim, a LEVEL badge (beginner /
 * intermediate / advanced — colour-coded the same way the detail screen does),
 * a lime "has demo" play chip, the name, target muscle, and an optional
 * equipment pill. Owns its own pressed-scale (Reanimated) so the parent screen
 * stays a thin layout shell. Every interaction the library card carried is
 * preserved by the caller (onPress / accessibility / testID live on the
 * wrapping Pressable the caller passes through props).
 *
 * Lives under src/components so the library screen can compose it without
 * editing any shared primitive. Renders the sanctioned GlassCard surface (so the
 * no-inline-glass guard is satisfied) — never a raw SafeBlurView.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui';

// Level → colour, mirrors (exercises)/[id].tsx's DIFF_COLORS so a tile and the
// detail header agree on the wavelength for a difficulty. Catalog seeds either
// case ("Beginner"/"beginner"); we lower-case + trim before the lookup.
const LEVEL_COLORS: Record<string, string> = {
  beginner: '#2ECC71',
  intermediate: '#FFB300',
  advanced: '#FF4444',
  expert: '#FF4444',
};

export interface ExerciseGridCardProps {
  item: any;
  /**
   * Resolved thumbnail source (remote { uri } or a bundled require-number).
   * For catalog (video) exercises this is the best-frame poster JPG derived from
   * the clip's `videoUrl`; that JPG can 404 transiently while the batch job is
   * still generating it, so pass {@link fallbackSource} to recover seamlessly.
   */
  imageSource: any;
  /**
   * Source to swap in if {@link imageSource} fails to load (e.g. a poster JPG
   * that 404s before the batch finishes). Typically the exercise's own imageUrl
   * source or the bundled category placeholder. When omitted, a failed
   * `imageSource` simply renders expo-image's empty state (no crash).
   */
  fallbackSource?: any;
  /** True when the backend supplied a demo gif/video for this exercise. */
  hasDemo: boolean;
  onPress: () => void;
  /** Sizing wrapper style (width) — radius/clip/fill are owned by GlassCard. */
  style?: StyleProp<ViewStyle>;
  /** Staggered entrance delay (ms). */
  delay?: number;
}

export function ExerciseGridCard({
  item,
  imageSource,
  fallbackSource,
  hasDemo,
  onPress,
  style,
  delay = 0,
}: ExerciseGridCardProps) {
  const { colors, typography } = useTheme();

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Swap to the fallback once the primary thumbnail 404s/errors (a poster JPG
  // that the batch hasn't produced yet). `errored` latches so we don't ping-pong
  // if the fallback also misbehaves. No fallback supplied → keep the primary
  // source and let expo-image render its own empty state.
  const [errored, setErrored] = React.useState(false);
  const resolvedSource = errored && fallbackSource != null ? fallbackSource : imageSource;
  const onImageError = React.useCallback(() => {
    if (fallbackSource != null) setErrored(true);
  }, [fallbackSource]);

  const level = (item.difficulty ?? '').trim().toLowerCase();
  const levelColor = LEVEL_COLORS[level] ?? colors.accent.coral;
  const target = item.bodyPart || item.muscleGroup || '';
  const showEquip = item.equipment && item.equipment !== 'body weight';

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18).mass(0.7)} style={[style, animStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.name}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 320 }); }}
      >
        <GlassCard radius={20}>
          <View style={styles.imageWrap}>
            <Image
              source={resolvedSource}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={300}
              onError={onImageError}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Level badge — top-left, colour-coded by difficulty. */}
            {!!level && (
              <View
                style={[styles.levelBadge, { backgroundColor: withAlpha(levelColor, 0.18), borderColor: withAlpha(levelColor, 0.85) }]}
                accessibilityLabel={`Level ${level}`}
              >
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={[typography.caption, styles.levelText, { color: levelColor }]} numberOfLines={1}>
                  {level.toUpperCase()}
                </Text>
              </View>
            )}

            {/* Has-demo affordance — lime play chip, top-right. */}
            {hasDemo && (
              <View
                style={[styles.demoBadge, { backgroundColor: colors.accent.coral }]}
                accessibilityLabel="Has demo video"
              >
                <Ionicons name="play" size={11} color={colors.text.inverse} style={{ marginLeft: 1 }} />
              </View>
            )}
          </View>

          <View style={styles.info}>
            <Text
              style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', fontSize: 14, lineHeight: 18 }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>

            <View style={styles.metaRow}>
              {!!target && (
                <>
                  <View style={[styles.targetDot, { backgroundColor: colors.accent.coral }]} />
                  <Text
                    style={[typography.caption, { color: colors.text.secondary, fontSize: 11, flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {target}
                  </Text>
                </>
              )}
            </View>

            {showEquip && (
              <View style={[styles.equipPill, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.4) }]}>
                <Ionicons name="barbell-outline" size={9} color={colors.accent.cyan} />
                <Text style={[styles.equipText, { color: colors.accent.cyan }]} numberOfLines={1}>
                  {String(item.equipment).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  imageWrap: { position: 'relative', width: '100%', height: 138 },
  image: { width: '100%', height: 138 },
  levelBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelDot: { width: 5, height: 5, borderRadius: 3 },
  levelText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  demoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: 11, gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 14 },
  targetDot: { width: 5, height: 5, borderRadius: 3 },
  equipPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  equipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
});
