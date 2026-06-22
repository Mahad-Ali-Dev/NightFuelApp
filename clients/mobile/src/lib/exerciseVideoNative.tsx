/**
 * exerciseVideoNative.tsx
 *
 * The REAL self-hosted MP4 exercise-demo player, built on `expo-video`
 * (useVideoPlayer + VideoView). It is loaded LAZILY from
 * `src/lib/exerciseVideo.ts`'s seam via a dynamic `require` inside a try/catch,
 * behind an availability probe. That seam is what keeps the jest / `tsc` gate
 * green WITHOUT the native package installed:
 *
 *   - At RUNTIME in a native (EAS dev/release) build, `require('./exerciseVideoNative')`
 *     succeeds, `expo-video` resolves, and the component renders a real player.
 *   - During the GATE, this file is never module-evaluated by the component tests
 *     that keep the existing image path (they mock `@/lib/exerciseVideo`), and the
 *     seam's lazy require resolves `expo-video` to the jest STUB (whose
 *     `useVideoPlayer` is not a function) → the probe reports unavailable → the
 *     player is never reached.
 *   - For `tsc --noEmit`, the `import` below resolves against the ambient shim in
 *     `src/types/expo-video.d.ts` (declared because the package isn't installed
 *     for the gate). Delete that shim once the dep is installed.
 *
 * Honest-fallback discipline (mirrors voiceNative): nothing here throws into the
 * caller — the seam wraps the require in try/catch, and `getExerciseVideoComponent`
 * only returns this component when the probe says the engine is usable.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { ExerciseVideoProps } from './exerciseVideo.types';

/**
 * Probe: is the expo-video engine actually usable on this device? Synchronous
 * ground truth — `useVideoPlayer` is a function only when the real native module
 * is present (the jest stub deliberately exports it as `null`). Never throws.
 */
export function isExerciseVideoEngineAvailable(): boolean {
  try {
    return typeof useVideoPlayer === 'function';
  } catch {
    return false;
  }
}

/**
 * Render a looping, muted, autoplaying MP4 demo for `uri`. Tapping toggles
 * play/pause — a demo that never looks broken/empty, matching the image-frame
 * player's affordance. `nativeControls` is off (a silent looping demo needs no
 * scrubber); the surrounding ExerciseDemo provides the gradient + "Demo" pill.
 */
export function ExerciseVideoPlayer({ uri, style, accessibilityLabel }: ExerciseVideoProps) {
  const player = useVideoPlayer({ uri }, (p) => {
    // Loop muted autoplay — a soundless, self-restarting demo clip.
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const [paused, setPaused] = React.useState(false);

  const toggle = React.useCallback(() => {
    setPaused((wasPaused) => {
      try {
        if (wasPaused) player.play();
        else player.pause();
      } catch {
        /* never throw into the tap handler */
      }
      return !wasPaused;
    });
  }, [player]);

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (paused ? 'Resume demo' : 'Pause demo')}
      accessibilityValue={{ text: paused ? 'Paused' : 'Playing' }}
      accessibilityState={{ selected: paused, busy: !paused }}
      style={[styles.wrap, style]}
    >
      <View style={StyleSheet.absoluteFillObject}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFillObject}
          nativeControls={false}
          contentFit="cover"
          allowsFullscreen={false}
          accessibilityLabel={accessibilityLabel ?? 'Exercise demo video'}
        />
      </View>
    </Pressable>
  );
}

export default ExerciseVideoPlayer;

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%', backgroundColor: '#000' },
});
