/**
 * vision-camera.d.ts
 *
 * Ambient module shims for the camera-PPG native packages used ONLY by the
 * isolated camera view (`src/components/ppg/PpgCameraView.tsx`):
 *
 *   - `react-native-vision-camera`          → the V5 (Nitro) camera + frame API.
 *   - `react-native-vision-camera-worklets` → the frame-output worklets binding.
 *
 * WHY THIS FILE EXISTS (mirrors src/types/health-native.d.ts)
 * ----------------------------------------------------------
 * These packages are DECLARED in package.json for the EAS build but are NOT
 * installed in the environment that runs the jest/`tsc` gate. Without a type for
 * them, `tsc --noEmit` would error on PpgCameraView's imports. These minimal
 * `declare module` shims give the type-checker just enough surface for that one
 * file to compile WITHOUT the packages present. They are a deliberate SUBSET of
 * the real APIs — only what PpgCameraView touches.
 *
 * REMOVE-ME ONCE DEPS ARE INSTALLED
 * ---------------------------------
 * When the packages are actually installed (for an EAS dev/release build), DELETE
 * these `declare module` blocks so the real, complete bundled types take over —
 * and reconcile PpgCameraView against the exact installed V5 API (the frame API
 * evolved from `useFrameProcessor` → `useFrameOutput`; see the notes in that file).
 */

declare module 'react-native-vision-camera' {
  import type { ComponentType } from 'react';
  import type { ViewProps } from 'react-native';

  /** A single camera frame (GPU-backed buffer). PPG reads its pixel bytes. */
  export interface Frame {
    width: number;
    height: number;
    bytesPerRow: number;
    /** e.g. 'yuv-420-8-bit-full' | 'rgb' — see VisionCamera pixel formats. */
    pixelFormat: string;
    isValid: boolean;
    /** Copy the frame's pixel data to an ArrayBuffer (GPU→CPU copy). */
    toArrayBuffer(): ArrayBuffer;
    /** Release the frame buffer when done (V5 in-memory frame lifecycle). */
    dispose?(): void;
  }

  export interface CameraDevice {
    id: string;
    position: 'back' | 'front' | 'external';
    hasFlash: boolean;
    [key: string]: unknown;
  }

  export interface CameraProps extends ViewProps {
    device: CameraDevice | undefined;
    isActive: boolean;
    /** Torch/flashlight during preview — the light source for finger PPG. */
    torch?: 'on' | 'off';
    /** V5 frame outputs (from useFrameOutput). */
    outputs?: unknown[];
    /** Legacy/compat single frame processor (pre-V5 API). */
    frameProcessor?: unknown;
    pixelFormat?: 'yuv' | 'rgb' | 'native';
    [key: string]: unknown;
  }

  export const Camera: ComponentType<CameraProps>;

  export function useCameraDevice(
    position: 'back' | 'front' | 'external',
  ): CameraDevice | undefined;

  export function useCameraPermission(): {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  };
}

declare module 'react-native-vision-camera-worklets' {
  import type { Frame } from 'react-native-vision-camera';

  export interface FrameOutputConfig {
    pixelFormat?: 'yuv' | 'rgb' | 'native';
    /** Worklet run synchronously on each frame on the camera thread. */
    onFrame: (frame: Frame) => void;
  }

  /** Opaque handle passed to <Camera outputs={[...]} />. */
  export type FrameOutput = unknown;

  export function useFrameOutput(config: FrameOutputConfig): FrameOutput;
}
