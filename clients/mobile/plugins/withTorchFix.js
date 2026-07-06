/**
 * withTorchFix — force the camera flash ON via Camera2 interop.
 *
 * WHY: On some Android devices (confirmed on a Samsung Galaxy A22 / MediaTek),
 * VisionCamera's torch — which goes through CameraX `cameraControl.enableTorch()`
 * — is silently capped/overridden by the frame-output (ImageAnalysis) stream, so
 * the LED sits at the chip's minimum duty and never visibly lights during a
 * heart-rate measurement (mrousavy/react-native-vision-camera#1687). On-device
 * logs showed the torch commanded but stuck at `duty(6)` regardless of strength.
 *
 * FIX: patch HybridCameraController.setTorchMode so that, in addition to
 * enableTorch(), it forces `FLASH_MODE_TORCH` + `CONTROL_AE_MODE_ON` directly
 * onto the camera's repeating capture request through the Camera2 interop layer
 * (`androidx.camera.camera2.interop.Camera2CameraControl`) — the same interop
 * package VisionCamera already uses for Camera2CameraInfo, so it is guaranteed to
 * be on the classpath. Setting the flash mode on the repeating request is the
 * documented way to make the torch survive alongside a streaming use-case.
 *
 * This is a node_modules source patch applied at prebuild via a dangerous mod
 * (keeps VisionCamera itself unforked). It is idempotent and fails LOUDLY at
 * prebuild if the upstream code it targets has changed (so we never ship a
 * silently-unpatched build).
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Path to the target file INSIDE the react-native-vision-camera package. The
// package itself is resolved with require.resolve so this works whether deps are
// installed app-locally or hoisted to the monorepo root (this repo hoists).
const REL_IN_PKG =
  'android/src/main/java/com/margelo/nitro/camera/hybrids/HybridCameraController.kt';

// The exact upstream setTorchMode body we replace (VisionCamera 5.x).
const ANCHOR_ON = `        TorchMode.ON -> {
          if (strength != null) {
            require(strength in 0.0..1.0) {
              "Torch \`strength\` is not within 0.0 to 1.0 range! (Received: $strength)"
            }
            val normalizedStrength = 1 + (strength * camera.cameraInfo.maxTorchStrengthLevel)
            camera.cameraControl
              .setTorchStrengthLevel(normalizedStrength.toInt())
              .await()
            camera.cameraControl
              .enableTorch(true)
              .await()
          } else {
            camera.cameraControl
              .enableTorch(true)
              .await()
          }
        }`;

const REPLACE_ON = `        TorchMode.ON -> {
          // ZeitraTorchFix: enable torch, then FORCE flash on the repeating
          // request via Camera2 interop (enableTorch alone is overridden by the
          // frame stream on some MediaTek chips — see withTorchFix.js).
          if (strength != null) {
            try {
              val __maxLvl = camera.cameraInfo.maxTorchStrengthLevel
              if (__maxLvl > 1) {
                val __lvl = (1 + (strength * (__maxLvl - 1))).toInt().coerceIn(1, __maxLvl)
                camera.cameraControl.setTorchStrengthLevel(__lvl).await()
              }
            } catch (e: Throwable) {
              android.util.Log.w("VisionCamera", "ZeitraTorchFix: setTorchStrengthLevel skipped", e)
            }
          }
          camera.cameraControl.enableTorch(true).await()
          try {
            val __c2 = androidx.camera.camera2.interop.Camera2CameraControl.from(camera.cameraControl)
            __c2.setCaptureRequestOptions(
              androidx.camera.camera2.interop.CaptureRequestOptions.Builder()
                .setCaptureRequestOption(
                  android.hardware.camera2.CaptureRequest.CONTROL_AE_MODE,
                  android.hardware.camera2.CaptureRequest.CONTROL_AE_MODE_ON,
                )
                .setCaptureRequestOption(
                  android.hardware.camera2.CaptureRequest.FLASH_MODE,
                  android.hardware.camera2.CaptureRequest.FLASH_MODE_TORCH,
                )
                .build(),
            )
          } catch (e: Throwable) {
            android.util.Log.w("VisionCamera", "ZeitraTorchFix: Camera2 torch interop failed", e)
          }
        }`;

const ANCHOR_OFF = `        TorchMode.OFF -> {
          camera.cameraControl
            .enableTorch(false)
            .await()
        }`;

const REPLACE_OFF = `        TorchMode.OFF -> {
          // ZeitraTorchFix: clear the forced Camera2 flash option before disabling.
          try {
            androidx.camera.camera2.interop.Camera2CameraControl
              .from(camera.cameraControl)
              .clearCaptureRequestOptions()
          } catch (e: Throwable) {
            android.util.Log.w("VisionCamera", "ZeitraTorchFix: clear torch interop failed", e)
          }
          camera.cameraControl
            .enableTorch(false)
            .await()
        }`;

// The setTorchMode override must opt in to the experimental Camera2 interop.
const ANCHOR_FN = `  override fun setTorchMode(
    mode: TorchMode,
    strength: Double?,
  ): Promise<Unit> {`;

const REPLACE_FN = `  @androidx.annotation.OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class)
  override fun setTorchMode(
    mode: TorchMode,
    strength: Double?,
  ): Promise<Unit> {`;

module.exports = function withTorchFix(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      let file;
      try {
        const pkgJson = require.resolve('react-native-vision-camera/package.json', {
          paths: [cfg.modRequest.projectRoot],
        });
        file = path.join(path.dirname(pkgJson), ...REL_IN_PKG.split('/'));
      } catch (e) {
        throw new Error('[withTorchFix] Cannot resolve react-native-vision-camera — is it installed?');
      }
      if (!fs.existsSync(file)) {
        throw new Error(`[withTorchFix] Cannot find ${file} — VisionCamera layout changed.`);
      }
      let src = fs.readFileSync(file, 'utf8');

      if (src.includes('ZeitraTorchFix')) {
        // Already patched (e.g. a re-run of prebuild) — leave it.
        return cfg;
      }

      for (const [anchor, replacement, label] of [
        [ANCHOR_FN, REPLACE_FN, 'setTorchMode @OptIn'],
        [ANCHOR_ON, REPLACE_ON, 'TorchMode.ON branch'],
        [ANCHOR_OFF, REPLACE_OFF, 'TorchMode.OFF branch'],
      ]) {
        if (!src.includes(anchor)) {
          throw new Error(
            `[withTorchFix] Could not find the ${label} to patch in HybridCameraController.kt — ` +
              `VisionCamera source changed; update withTorchFix.js.`,
          );
        }
        src = src.replace(anchor, replacement);
      }

      fs.writeFileSync(file, src, 'utf8');
      // eslint-disable-next-line no-console
      console.log('[withTorchFix] Patched VisionCamera setTorchMode to force Camera2 FLASH_MODE_TORCH.');
      return cfg;
    },
  ]);
};
