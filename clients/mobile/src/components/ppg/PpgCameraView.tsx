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
 * ── V5.0.7 API FACTS this file is written against (from the installed .d.ts) ──
 * These were verified against node_modules/react-native-vision-camera/lib — the
 * previous author guessed several and produced a session that opened then died
 * (GRAPH_STOPPED + dropped-buffer errors) with the torch forced OFF:
 *
 *  1. TORCH: the prop is `torchMode` and its type is `TorchMode = 'on' | 'off'`
 *     (specs/common-types/TorchMode). So `torchMode="on"` is correct — the log's
 *     `torch=0` was NOT a wrong value, it was the SIDE EFFECT of the session
 *     collapsing (a dead session forces the torch off). Fix the session and the
 *     torch stays lit. We additionally gate on `device.hasTorch`.
 *
 *  2. SESSION STABILITY: a heavy full-resolution frame-output buffer is a known
 *     cause of the buffer-error / GRAPH_STOPPED collapse. `FrameOutputOptions`
 *     (specs/outputs/CameraFrameOutput.nitro) exposes `targetResolution: Size`
 *     and `enablePreviewSizedOutputBuffers`, so we request a tiny YUV buffer.
 *     We also pick the single `wide-angle` physical device, which the docs note
 *     starts up faster / more reliably than a multi-lens logical device.
 *
 *  3. FRAME LIFECYCLE: `Frame` is a Nitro HybridObject whose `dispose()` is a
 *     REAL, REQUIRED method — the docs say an undisposed Frame stalls the
 *     pipeline (exactly the "A frame is dropped … buffer error" in the log).
 *     The old code treated dispose as an optional cast; we now call it
 *     unconditionally in `finally`.
 *
 *  4. PIXELS: for a planar YUV Frame the docs state `getPixelBuffer()` is
 *     UNDEFINED behaviour — you must read `getPlanes()[0]` (the full-res Y/luma
 *     plane) and call its `getPixelBuffer()`. The old code called the Frame-level
 *     `getPixelBuffer()` on a YUV frame, i.e. garbage/empty data. The Y plane is
 *     a single-channel luma buffer — ideal (and cheap) for a brightness mean —
 *     and we honour the plane's `bytesPerRow` to skip row padding.
 *
 *  5. `useFrameOutput` / `useCameraPermission` are exported from the CORE package
 *     `react-native-vision-camera` in V5.0.7 (not a separate worklets package on
 *     the JS side), and writing a reanimated shared value from the frame worklet
 *     propagates to JS in the unified react-native-worklets runtime.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, type CameraRef, useCameraDevices, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { SAMPLE_POLL_MS } from '@/lib/ppg/ppgCamera';

/** Why the camera couldn't run — the screen maps these to user-facing coaching. */
export type PpgCameraError = 'permission-denied' | 'no-camera' | 'session-error';

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

/**
 * Target frame-output resolution. Deliberately tiny: PPG only needs a whole-frame
 * brightness mean, and a small buffer is the single biggest lever against the
 * full-res session collapse (buffer error / GRAPH_STOPPED) seen on-device. The
 * session negotiates the closest supported size to this target (aspect ratio is
 * prioritised over exact pixel count), and 4:3 matches the sensor's native step.
 */
const PPG_TARGET_RESOLUTION = { width: 480, height: 640 } as const;

/**
 * Torch strength (0–1) requested from the CameraController. Deliberately just
 * under 1.0: VisionCamera computes the CameraX torch level as
 * `1 + strength * maxTorchStrengthLevel`, so an exact 1.0 overflows the device
 * maximum and setTorchStrengthLevel() throws (leaving the torch off). 0.98 maps
 * to the top valid level after truncation on every device (single-level chips
 * clamp to their only level; variable-strength chips reach maximum brightness).
 */
const TORCH_STRENGTH = 0.98;

export default function PpgCameraView({ collecting, onSample, onError, style }: PpgCameraViewProps) {
  // Pick the back camera that ACTUALLY HAS THE FLASH LED. On multi-lens phones the
  // default back pick can resolve to an ultra-wide / telephoto lens with NO torch —
  // on-device adb showed this Sony Xperia opening "device 2" (a lens with no LED), so
  // torchMode='on' was accepted (value=1) but no light appeared. Enumerate the back
  // cameras and prefer one whose `hasTorch` is true (the main lens the flash sits on);
  // fall back to any back camera. Session stability comes from the tiny frame-output
  // resolution below, not the device pick.
  const devices = useCameraDevices();
  const device = useMemo(() => {
    const back = devices.filter((d) => d.position === 'back');
    return back.find((d) => d.hasTorch) ?? back[0];
  }, [devices]);
  const { hasPermission, requestPermission } = useCameraPermission();

  // Cross-thread bridge: the frame worklet writes the latest brightness + a frame
  // counter into shared values; a JS interval drains them. This resamples the
  // signal at a steady ~25 Hz on the JS side, decoupled from the camera cadence,
  // and avoids depending on a specific runOnJS wiring across worklet runtimes.
  const latest = useSharedValue(0);
  const frameTick = useSharedValue(0);
  const lastTickRef = useRef(-1);
  const cameraRef = useRef<CameraRef | null>(null);

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

  // Turn the torch ON at (near-)max strength through the CameraController.
  //
  // THE KEY BUG (found in VisionCamera's HybridCameraController.kt): setTorchMode
  // maps strength→level as `level = 1 + strength * maxTorchStrengthLevel`, then
  // calls CameraX setTorchStrengthLevel(level). At strength **1.0** that yields
  // `1 + max`, which EXCEEDS the device maximum, so setTorchStrengthLevel REJECTS
  // and the promise throws BEFORE enableTorch() is ever called. So every
  // `setTorchMode('on', 1.0)` we issued silently threw (we catch it) and did
  // nothing — which is exactly why on-device logs showed no torch change from our
  // calls, only the prop's plain enableTorch at the chip default (duty 6).
  //
  // Passing strength just under 1.0 keeps `1 + s*max` within range after toInt(),
  // so on a device with variable torch strength (max > 1) this actually drives the
  // LED to its top level; on a single-level chip it's a harmless no-worse default.
  const torchOn = useCallback((): boolean => {
    const controller = cameraRef.current?.controller;
    if (!controller) return false;
    try {
      // Fire-and-forget; rejections (transient reconfigure) are retried by callers.
      void controller.setTorchMode('on', TORCH_STRENGTH);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Re-trigger the torch by toggling OFF→ON once, a beat after frames start. On
  // this MediaTek chip the native FLASH_MODE_TORCH set at session-start doesn't
  // reliably latch until the repeating request is re-submitted; clearing then
  // re-setting forces that re-submit AND re-locks auto-exposure onto the torch-lit
  // fingertip → a stronger pulse. Fired INSIDE the discarded warm-up window, so its
  // brief dark blink never reaches the analysed signal. (Removing this regressed
  // readings from "works sometimes" to "never" on-device — it earns its keep.)
  const kickTorch = useCallback(() => {
    const controller = cameraRef.current?.controller;
    if (!controller) return;
    try {
      void controller.setTorchMode('off');
      setTimeout(() => {
        try {
          void controller.setTorchMode('on', TORCH_STRENGTH);
        } catch {
          // ignore — the re-assert below retries
        }
      }, 140);
    } catch {
      // ignore — the re-assert below retries
    }
  }, []);

  // The session has started → the controller is (about to be) available. Assert
  // torch, retrying briefly until the controller accepts it.
  const handleStarted = useCallback(() => {
    let tries = 0;
    const tick = () => {
      if (torchOn() || tries >= 6) return;
      tries += 1;
      setTimeout(tick, 200);
    };
    tick();
  }, [torchOn]);

  // A missing back camera (rare) is handled by the render guard below + the
  // screen's "no frames delivered" watchdog, so there's no separate device
  // effect here (useCameraDevice can report `undefined` transiently on first
  // render, which would otherwise fire a false error).

  // Per-frame worklet: average the luma (Y) plane over a downsampled stride.
  //
  // `targetResolution` + `enablePreviewSizedOutputBuffers` request the smallest
  // possible buffers so the session doesn't collapse under a full-res stream, and
  // `dropFramesWhileBusy` (the default, set explicitly) means a slow drain skips
  // frames instead of queuing them and exhausting the buffer pool.
  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: PPG_TARGET_RESOLUTION,
    enablePreviewSizedOutputBuffers: true,
    dropFramesWhileBusy: true,
    onFrame: (frame) => {
      'worklet';
      try {
        // A 'yuv' Frame is PLANAR, so its top-level getPixelBuffer() is undefined
        // behaviour — read the Y (luma) plane directly. getPlanes()[0] is the
        // full-resolution single-channel luma plane; with torch + fingertip the
        // whole frame IS the finger, so a whole-plane mean is a valid PPG signal.
        const planes = frame.getPlanes();
        const yPlane = planes[0];
        if (yPlane) {
          const data = new Uint8Array(yPlane.getPixelBuffer());
          const width = yPlane.width;
          const height = yPlane.height;
          // Rows can be padded (bytesPerRow >= width), so walk row-by-row and only
          // read the valid `width` luma bytes, skipping the trailing stride pad.
          const stride = yPlane.bytesPerRow > 0 ? yPlane.bytesPerRow : width;
          const validPixels = width * height;
          // Downsample to ~READS_PER_FRAME samples: keep the per-frame work light
          // so the drain thread never lags (which would drop frames / stall).
          const pixelStep = Math.max(1, Math.floor(validPixels / READS_PER_FRAME));
          let sum = 0;
          let count = 0;
          for (let row = 0; row < height; row += 1) {
            const rowStart = row * stride;
            for (let col = 0; col < width; col += pixelStep) {
              sum += data[rowStart + col]!;
              count += 1;
            }
          }
          if (count > 0) {
            latest.value = sum / count;
            frameTick.value = frameTick.value + 1;
          }
        }
      } catch {
        // Never throw out of a frame processor — a bad frame is just skipped.
      } finally {
        // REQUIRED: Frame is a Nitro HybridObject; an undisposed Frame stalls the
        // pipeline and causes the dropped-buffer errors seen on-device. Always
        // release it, even if reading the planes above threw.
        //
        // `dispose()` is declared on the nitro `HybridObject` base that `Frame`
        // extends, but VisionCamera is hoisted to the monorepo-root node_modules
        // where `react-native-nitro-modules` doesn't resolve for tsc — so the
        // inherited members (dispose/equals/name) don't appear on the `Frame`
        // type here. Assert the one method we need (the .d.ts guarantees it) and
        // call it unconditionally so a stalled pipeline can never happen.
        (frame as unknown as { dispose: () => void }).dispose();
      }
    },
  });

  // When a measurement starts: assert torch immediately, re-trigger it once with an
  // off→on kick at 700ms (forces the FLASH_MODE_TORCH repeating request to re-submit
  // + re-locks exposure on the lit fingertip), then a final assert at 1500ms — all
  // inside the 2s warm-up window that finalize() discards, so the kick's blink never
  // touches the analysed pulse. This is the sequence that produced real readings.
  useEffect(() => {
    if (!collecting) return;
    torchOn();
    const timers = [setTimeout(kickTorch, 700), setTimeout(torchOn, 1500)];
    return () => timers.forEach(clearTimeout);
  }, [collecting, torchOn, kickTorch]);

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
      ref={cameraRef}
      style={style ?? StyleSheet.absoluteFill}
      device={device}
      isActive={true}
      // `torchMode="on"` gets the torch on immediately at the HAL default level;
      // `onStarted` then bumps it to FULL strength via the controller (the prop
      // alone left the LED at ~10% — invisible + too weak for PPG on some phones).
      torchMode="on"
      outputs={[frameOutput]}
      onStarted={handleStarted}
      // Surface a session error to the screen (→ honest fallback) instead of
      // sitting on a silently-dead, torch-off camera like the current build did.
      onError={() => onError?.('session-error')}
    />
  );
}
