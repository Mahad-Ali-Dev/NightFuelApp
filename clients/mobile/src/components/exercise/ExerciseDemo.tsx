import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const HEIGHT = 320;
// How long each frame is held before cross-fading to the next. Slow enough that
// a 2-frame start↔end sequence reads as a deliberate movement, not a flicker.
const FRAME_MS = 900;
const FADE_MS = 320;

export interface ExerciseDemoProps {
  /**
   * Ordered HTTPS frame URLs (start → end of the rep). 2+ frames animate as an
   * in-app loop; a single frame renders as a still. Preferred over `gifUrl`.
   */
  frames?: readonly string[] | null;
  /** Single demo image URL. Used when `frames` is absent (treated as one frame). */
  gifUrl?: string | null;
  /** The exercise's own header image, shown when no demo frames are available. */
  imageUrl?: string | null;
  /** Bundled neutral placeholder (require(...)) — the last-resort, no-network image. */
  fallback: any;
  /** Curated full-tutorial link (e.g. YouTube). Shown as a secondary row only. */
  tutorialUrl?: string | null;
}

/**
 * Presentational, self-contained exercise demo "player".
 *
 * - With 2+ frames it cross-fades between them on a timer to animate the
 *   movement entirely in-app (no browser hand-off, no extra dependency — just
 *   expo-image). Tapping pauses on the current frame with a ▶ overlay.
 * - With one frame / `gifUrl` it shows that still.
 * - With neither it shows `imageUrl` (or the bundled `fallback`) plus an inline
 *   "Video demo coming soon" note, and a "Full tutorial" link if one exists.
 *
 * It NEVER renders an empty or broken player.
 */
export function ExerciseDemo({ frames, gifUrl, imageUrl, fallback, tutorialUrl }: ExerciseDemoProps) {
  const { colors, typography } = useTheme();

  // Normalise the demo source into an ordered, de-duped, non-empty frame list.
  const demoFrames = useMemo<string[]>(() => {
    const list = (frames && frames.length > 0 ? frames : gifUrl ? [gifUrl] : []).filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0,
    );
    // Drop accidental consecutive duplicates so a 1-real-frame source doesn't
    // "animate" between two identical images.
    return list.filter((u, i) => i === 0 || u !== list[i - 1]);
  }, [frames, gifUrl]);

  // Frame URLs that have 404'd / failed to load. Dropped from the live list so a
  // missing CDN slug silently disappears instead of flashing a broken image.
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // The frames we'll actually render: demoFrames minus any that have failed.
  const liveFrames = useMemo<string[]>(
    () => demoFrames.filter((u) => !failed.has(u)),
    [demoFrames, failed],
  );

  const hasDemo = liveFrames.length > 0;
  const animated = liveFrames.length > 1;

  const [frameIdx, setFrameIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  // Opacity of the "top" (incoming) frame; the previous frame sits underneath.
  const fade = useRef(new Animated.Value(1)).current;
  const prevIdxRef = useRef(0);
  // Playback direction for the boomerang/ping-pong loop: +1 advancing toward the
  // last frame, -1 returning toward the first. Flips at each end so the sequence
  // reads as an out-and-back movement (0→1→0… for a 2-frame pair) instead of a
  // hard A→B→A modulo snap.
  const dirRef = useRef(1);

  // Reset when the source changes (e.g. navigating between exercises that reuse
  // this mounted component).
  useEffect(() => {
    setFrameIdx(0);
    prevIdxRef.current = 0;
    dirRef.current = 1;
    fade.setValue(1);
    setPaused(false);
    // A genuinely new source gets a clean slate — past failures shouldn't carry
    // over and pre-hide a frame that exists for this exercise.
    setFailed(new Set());
  }, [demoFrames.join('|')]);

  // Drive the loop. Pure JS timer (no native driver needed for the index swap);
  // the cross-fade itself uses the native driver for smoothness. Frames advance
  // in a boomerang/ping-pong sweep (0→1→2→1→0…, i.e. 0→1→0→1… for a 2-frame
  // FEDB pair) so the start↔end pair reads as a continuous out-and-back rep
  // rather than a hard modulo A→B→A swap.
  useEffect(() => {
    if (!animated || paused) return;
    const last = liveFrames.length - 1;
    const t = setInterval(() => {
      setFrameIdx((cur) => {
        prevIdxRef.current = cur;
        // Single live frame (e.g. one survived a 404): hold on it.
        if (last <= 0) return 0;
        // Reverse at either end so we sweep out and back instead of wrapping.
        if (cur >= last) dirRef.current = -1;
        else if (cur <= 0) dirRef.current = 1;
        // Clamp defensively in case the live list shrank under us (a 404 drop).
        return Math.min(last, Math.max(0, cur + dirRef.current));
      });
    }, FRAME_MS);
    return () => clearInterval(t);
  }, [animated, paused, liveFrames.length]);

  // Cross-fade the incoming frame in over the outgoing one whenever the index
  // advances. Snap instantly when paused (no half-faded frame left on screen).
  useEffect(() => {
    if (!animated) return;
    if (paused) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: FADE_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [frameIdx, animated, paused]);

  const openTutorial = () => {
    if (tutorialUrl) Linking.openURL(tutorialUrl).catch(() => {});
  };

  // A frame failed to load (e.g. a 404'd CDN slug). Mark it so `liveFrames` drops
  // it on the next render — the loop continues with the survivors, or falls back
  // to the still/"coming soon" branch once every frame has failed. The `has`
  // guard skips a redundant state update when the same uri errors twice.
  const markFailed = (uri: string) =>
    setFailed((prev) => (prev.has(uri) ? prev : new Set(prev).add(uri)));

  // ── No demo media: static image + honest "coming soon" state ──────────────
  if (!hasDemo) {
    return (
      <View style={styles.wrap} accessibilityLabel="Exercise demo">
        <Image
          source={imageUrl ? { uri: imageUrl } : fallback}
          placeholder={fallback}
          style={styles.media}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={400}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)', colors.background.primary]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.comingSoonRow} pointerEvents="box-none">
          <View style={[styles.pill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Ionicons name="videocam-outline" size={14} color={colors.text.secondary} />
            <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: '700', fontSize: 11 }]}>
              Video demo coming soon
            </Text>
          </View>
          {tutorialUrl ? (
            <Pressable
              onPress={openTutorial}
              accessibilityRole="link"
              accessibilityLabel="Open full tutorial"
              style={({ pressed }) => [styles.pill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="open-outline" size={14} color={colors.accent.coral} />
              <Text style={[typography.caption, { color: '#FFF', fontWeight: '700', fontSize: 11 }]}>Full tutorial</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // ── Demo media: animated loop (or single still) ───────────────────────────
  // `hasDemo` guarantees a live frame at index 0; fall back to it if an index
  // ever drifts out of bounds (mid-source-swap, or a frame dropping out after a
  // 404 shrinks the list) so `uri` is always a string that exists on the CDN.
  const firstUri = liveFrames[0] as string;
  const topUri = liveFrames[frameIdx] ?? firstUri;
  const underUri = liveFrames[prevIdxRef.current] ?? topUri;

  return (
    <Pressable
      onPress={() => animated && setPaused((p) => !p)}
      // When the demo animates, this Pressable IS the play/pause control, so it
      // exposes the `button` role with a state-reflecting label/value/state.
      // A single still has no toggle (onPress is a no-op) — there it stays a
      // non-interactive `image` labelled "Exercise demo".
      accessibilityRole={animated ? 'button' : 'image'}
      accessibilityLabel={animated ? (paused ? 'Resume demo' : 'Pause demo') : 'Exercise demo'}
      accessibilityValue={animated ? { text: paused ? 'Paused' : 'Playing' } : undefined}
      accessibilityState={animated ? { selected: paused, busy: !paused } : undefined}
      accessibilityHint={animated ? 'Double tap to pause or resume the looping demo' : undefined}
      style={styles.wrap}
    >
      {/* Underlying (previous) frame — only meaningful while a cross-fade runs. */}
      {animated ? (
        <Image
          source={{ uri: underUri }}
          style={styles.media}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => markFailed(underUri)}
        />
      ) : null}
      {/* Top (current) frame, faded in over the previous one. */}
      <Animated.View style={[StyleSheet.absoluteFillObject, animated ? { opacity: fade } : null]}>
        <Image
          source={{ uri: topUri }}
          placeholder={fallback}
          style={styles.media}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={animated ? 0 : 400}
          onError={() => markFailed(topUri)}
        />
      </Animated.View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)', colors.background.primary]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Paused overlay: dim + ▶ so a stopped loop never looks broken. */}
      {animated && paused ? (
        <View style={[StyleSheet.absoluteFillObject, styles.pausedOverlay]} pointerEvents="none">
          <View style={[styles.playBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.92) }]}>
            <Ionicons name="play" size={26} color="#FFF" style={{ marginLeft: 3 }} />
          </View>
        </View>
      ) : null}

      {/* Bottom-left "Demo" status tag so the inline loop reads as intentional.
          The full-tutorial link lives on the screen's header button while a demo
          plays (it is surfaced in-player only in the no-demo fallback above). */}
      {animated ? (
        <View style={styles.comingSoonRow} pointerEvents="none">
          <View style={[styles.pill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Ionicons name={paused ? 'pause' : 'sync'} size={13} color={colors.accent.cyan} />
            <Text style={[typography.caption, { color: '#FFF', fontWeight: '700', fontSize: 11 }]}>
              {paused ? 'Paused' : 'Demo'}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default ExerciseDemo;

const styles = StyleSheet.create({
  wrap: { width: '100%', height: HEIGHT, backgroundColor: '#000' },
  media: { width: '100%', height: HEIGHT },
  pausedOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  playBadge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  comingSoonRow: {
    position: 'absolute',
    left: 16,
    bottom: 52,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});
