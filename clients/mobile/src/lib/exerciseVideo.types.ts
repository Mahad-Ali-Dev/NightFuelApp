/**
 * exerciseVideo.types.ts
 *
 * The pure-TypeScript contract shared by the gate-safe seam
 * (`src/lib/exerciseVideo.ts`) and the REAL native player wrapper
 * (`src/lib/exerciseVideoNative.tsx`). It imports NOTHING native, so it is safe
 * to load under the jest/`tsc` gate (mirrors `src/lib/voice.types.ts`).
 */
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** Props for the self-hosted MP4 exercise-demo player component. */
export interface ExerciseVideoProps {
  /** A self-hosted demo clip URL (an .mp4). The player loops it muted + autoplays. */
  uri: string;
  /**
   * Best-frame poster (still) URL shown as a cover image BEFORE the first video
   * frame renders, hidden once playback begins (expo-video's `VideoView` has no
   * poster prop; we overlay an <Image> and drop it on `onFirstFrameRender`). The
   * JPG may 404 transiently while the batch job is still generating it — the
   * cover hides on its own `onError` too, so a missing poster is seamless.
   */
  poster?: string | null;
  /** Optional style merged onto the player wrapper (e.g. a fixed demo height). */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label for the player surface. */
  accessibilityLabel?: string;
}

/** A React component type that renders {@link ExerciseVideoProps}. */
export type ExerciseVideoComponent = (props: ExerciseVideoProps) => ReactElement | null;
