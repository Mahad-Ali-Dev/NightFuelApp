/**
 * PpgCameraView.tsx — the ONE file that touches react-native-vision-camera.
 *
 * It runs the back camera with the torch ON and, per frame, averages the luma
 * (Y) channel over the frame — with a fingertip covering the lens the frame is
 * red-saturated and its brightness rises and falls with the blood-volume pulse.
 * That per-frame brightness is handed to the parent as a plain number stream; all
 * signal processing lives in the pure, tested src/lib/ppg/ppgSignal.ts.
 *
 * ── Why everything camera-specific is quarantined here ────────────────────────
 * VisionCamera V5 (Nitro) is a new, still-evolving API and is native-build-only.
 * By isolating ALL of it in this single component:
 *   - the rest of the feature (DSP, store, zones, screen shell, history, tests)
 *     is 100% independent of VisionCamera and runs green on the jest gate;
 *   - the screen only mounts this view when `isPpgSupported()` is true AND wraps
 *     it in an error boundary, so a V5 API mismatch or a missing native module
 *     degrades to the honest "camera measurement needs the app build" fallback
 *     rather than a crash; and
 *   - adapting to the exact installed V5 API is a small, localized edit.
 *
 * ┌─ DEV-BUILD VERIFY (do this in the EAS dev build, not on the gate) ──────────┐
 * │ This is written against the V5 frame-output API as documented:             │
 * │   useFrameOutput({ pixelFormat, onFrame(frame){'worklet' …} })             │
 * │   <Camera outputs={[frameOutput]} … />                                     │
 * │ Confirm against the INSTALLED version:                                     │
 * │  1. `useFrameOutput` import path (here: 'react-native-vision-camera-       │
 * │     worklets'). If the installed build exports it from the core package,   │
 * │     or still uses `useFrameProcessor((frame)=>{'worklet'…},[])` +          │
 * │     `<Camera frameProcessor={fp} />`, switch to that — the averaging body  │
 * │     and the shared-value bridge below are unchanged either way.            │
 * │  2. `frame.toArrayBuffer()` exists and returns the pixel bytes (Y plane    │
 * │     first for 8-bit YUV). If not, read planes via the V5 planar API.       │
 * │  3. Writing a reanimated shared value FROM the camera worklet runtime      │
 * │     propagates to JS (it does in the unified react-native-worklets world). │
 * │     If not, replace the shared-value writes with a runOnJS callback.       │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { SAMPLE_POLL_MS } from '@/lib/ppg/ppgCamera';

/** Why the camera couldn't run — the screen maps these to user-facing coaching. */
export type PpgCameraError = 'permission-denied' | 'no-camera';

export interface PpgCameraViewProps {
  /** When true, brightness samples are drained to `onSample` (~SAMPLE_POLL_MS). */
  collecting: boolean;
  /** Latest per-frame mean brightness (0–255). The parent timestamps + buffers it. */
  onSample: (brightness: number) => void;
  /** Non-fatal camera/permission problems (never thrown). */
  onError?: (error: PpgCameraError) => void;
  /** Preview window style (the screen renders a small round window). */
  style?: ViewStyle;
}

/** ~how many bytes to average per frame — enough to be stable, cheap to loop. */
const READS_PER_FRAME = 2000;

export default function PpgCameraView({ collecting, onSample, onError, style }: PpgCameraViewProps) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  // Cross-thread bridge: the frame worklet writes the latest brightness + a frame
  // counter into shared values; a JS interval drains them. This resamples the
  // signal at a steady ~25 Hz on the JS side, decoupled from the camera cadence,
  // and avoids depending on a specific runOnJS wiring across worklet runtimes.
  const latest = useSharedValue(0);
  const frameTick = useSharedValue(0);
  const lastTickRef = useRef(-1);

  // Request camera permission on mount if we don't already have it.
  useEffect(() => {
    let cancelled = false;
    if (!hasPermission) {
      requestPermission()
        .then((ok) => {
          if (!ok && !cancelled) onError?.('permission-denied');
        })
        .catch(() => {
          if (!cancelled) onError?.('permission-denied');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [hasPermission, requestPermission, onError]);

  // A missing back camera (rare) is handled by the render guard below + the
  // screen's "no frames delivered" watchdog, so there's no separate device
  // effect here (useCameraDevice can report `undefined` transiently on first
  // render, which would otherwise fire a false error).

  // Per-frame worklet: average the luma (Y) plane over a downsampled stride.
  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet';
      try {
        const w = frame.width;
        const h = frame.height;
        const ab = frame.getPixelBuffer();
        const data = new Uint8Array(ab);
        // Y (luma) plane = first w*h bytes for 8-bit YUV. With torch + fingertip
        // the whole frame IS the finger, so a whole-plane mean is a valid PPG.
        const yLen = Math.min(data.length, w * h) || data.length;
        const step = Math.max(1, Math.floor(yLen / READS_PER_FRAME));
        let sum = 0;
        let count = 0;
        for (let i = 0; i < yLen; i += step) {
          sum += data[i]!;
          count += 1;
        }
        if (count > 0) {
          latest.value = sum / count;
          frameTick.value = frameTick.value + 1;
        }
      } catch {
        // Never throw out of a frame processor — a bad frame is just skipped.
      } finally {
        // V5 in-memory frames are disposed explicitly (guarded for API drift).
        frame.dispose?.();
      }
    },
  });

  // Drain the latest brightness on a steady timer while collecting.
  useEffect(() => {
    if (!collecting) return;
    lastTickRef.current = -1;
    const id = setInterval(() => {
      const v = latest.value;
      const tick = frameTick.value;
      // Only forward when a NEW frame has arrived since the last tick (so a
      // stalled camera doesn't inject a flat run of duplicate samples).
      if (tick !== lastTickRef.current && Number.isFinite(v)) {
        lastTickRef.current = tick;
        onSample(v);
      }
    }, SAMPLE_POLL_MS);
    return () => clearInterval(id);
  }, [collecting, latest, frameTick, onSample]);

  // Until the device + permission are ready, render an empty window; the screen
  // overlays its own coaching/permission messaging on top.
  if (!device || !hasPermission) {
    return <View style={style} />;
  }

  return (
    <Camera
      style={style ?? StyleSheet.absoluteFill}
      device={device}
      isActive
      torchMode="on"
      outputs={[frameOutput]}
    />
  );
}
