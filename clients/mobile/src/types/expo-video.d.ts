/**
 * expo-video.d.ts
 *
 * Ambient module shim for `expo-video`, used ONLY by the lazy native player
 * wrapper (`src/lib/exerciseVideoNative.tsx`) for self-hosted MP4 exercise-demo
 * playback.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `expo-video` is DECLARED in package.json for the EAS build but is NOT installed
 * in the environment that runs the jest/`tsc` gate (we do not `npm install`
 * native deps there). Without a type for it, `tsc --noEmit` would error on
 * `src/lib/exerciseVideoNative.tsx`'s import ("Cannot find module 'expo-video'").
 * This minimal `declare module` shim gives the type-checker just enough surface
 * for that file to compile WITHOUT the package present. It exactly mirrors the
 * `expo-speech` / `expo-speech-recognition` shims in src/types/voice-native.d.ts.
 *
 * REMOVE-ME ONCE THE DEP IS INSTALLED
 * -----------------------------------
 * When `expo-video` is actually installed (for an EAS dev/release build), DELETE
 * the `declare module 'expo-video'` block below so the real, complete bundled
 * types take over. Keeping a shim for an installed package would shadow its real
 * types. This shim is intentionally a SUBSET of the real API — only what the
 * native wrapper uses (useVideoPlayer + a play/pause/loop/mute surface, and the
 * VideoView component).
 */

declare module 'expo-video' {
  import type * as React from 'react';

  /** A loadable video source — we only ever pass a remote `{ uri }` (an .mp4). */
  export type VideoSource = string | { uri: string } | null;

  /**
   * The imperative player handle returned by {@link useVideoPlayer}. Only the
   * members the demo wrapper touches are declared (play/pause, looping, muted).
   */
  export interface VideoPlayer {
    play(): void;
    pause(): void;
    loop: boolean;
    muted: boolean;
    playing?: boolean;
  }

  /**
   * Create/recreate a player for `source`. The optional `setup` callback runs
   * once on creation (we use it to set loop/muted and autoplay the demo).
   */
  export function useVideoPlayer(
    source: VideoSource,
    setup?: (player: VideoPlayer) => void,
  ): VideoPlayer;

  export interface VideoViewProps {
    player: VideoPlayer;
    style?: unknown;
    /** Hide the OS playback chrome — a looping muted demo needs no controls. */
    nativeControls?: boolean;
    contentFit?: 'contain' | 'cover' | 'fill';
    allowsFullscreen?: boolean;
    accessibilityLabel?: string;
    /**
     * Fires after the player renders its first frame into the view. We use it to
     * hide the best-frame poster cover once real playback begins.
     */
    onFirstFrameRender?: () => void;
    /**
     * Android: when false, suppresses the default ExoPlayer shutter that covers
     * the view before the first frame — so our own poster cover shows through
     * (matches iOS behaviour). No effect on iOS.
     */
    useExoShutter?: boolean;
    [key: string]: unknown;
  }

  export const VideoView: React.ComponentType<VideoViewProps>;
}
