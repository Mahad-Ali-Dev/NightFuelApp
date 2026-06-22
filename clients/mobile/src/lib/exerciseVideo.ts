/**
 * exerciseVideo.ts
 *
 * The gate-safe seam the exercise-demo UI imports against for self-hosted MP4
 * playback — exactly mirroring the voice seam (`src/lib/voice.ts`) and the
 * health-sync seam. The whole point is to keep the jest / `tsc` gate GREEN with
 * NO `npm install` of the native `expo-video` package:
 *
 *   - `isExerciseVideoAvailable()` LAZILY `require`s the real player wrapper
 *     (`src/lib/exerciseVideoNative.tsx`, which imports expo-video) inside a
 *     try/catch and runs its engine probe. So:
 *       • static TypeScript (`tsc --noEmit`) never resolves expo-video (it's
 *         behind a runtime `require`, and the ambient shim in
 *         `src/types/expo-video.d.ts` keeps the native module importable to the
 *         type-checker WITHOUT the package installed); and
 *       • jest never loads native code (the require sits behind the probe, and
 *         the screen/component tests mock `@/lib/exerciseVideo` outright). When a
 *         test DOES let the require run, expo-video resolves to the jest STUB
 *         (whose `useVideoPlayer` is not a function) → the probe returns false.
 *     On ANY failure (package not installed / Expo Go / init error) it returns
 *     false — it NEVER throws into the caller.
 *
 *   - `getExerciseVideoComponent()` returns the real player component when (and
 *     only when) the engine is available, else `null`. The UI renders the player
 *     when it gets a component AND has a `videoUrl`; otherwise it keeps the
 *     EXISTING behaviour (animated image frames / fallback / tutorial link).
 *
 * Why this shape (vs. importing expo-video at the top)? A static `import` of
 * expo-video would make `tsc` and Metro/jest try to resolve a package that isn't
 * installed for the gate, breaking the build. The lazy require behind the probe
 * is the same degrade-gracefully idiom as `src/lib/voice.ts` / `src/lib/iap.ts`.
 *
 * ── How the native player is wired in for EAS ─────────────────────────────────
 * Once `expo-video` is installed (declared in package.json) and the app runs in a
 * dev/release build, the require resolves the real wrapper and the probe returns
 * true — no UI change needed (ExerciseDemo always calls the seam). In Expo Go /
 * the jest gate the require throws or the probe returns false, and the UI falls
 * back to the image-frame path. The result is memoised so the probe runs once.
 */
import type {
  ExerciseVideoComponent,
  ExerciseVideoProps,
} from './exerciseVideo.types';

export type { ExerciseVideoComponent, ExerciseVideoProps };

/**
 * Memoised resolved player component. `undefined` until the first
 * {@link getExerciseVideoComponent} / {@link isExerciseVideoAvailable} call
 * probes for the native engine; thereafter it is the real component (engine
 * available) or `null` (unavailable). Memoising means the dynamic require + probe
 * run at most once per app session.
 */
let resolved: ExerciseVideoComponent | null | undefined;

/**
 * Resolve (once) the real player component, or `null` when the native engine is
 * unusable. The lazy require is wrapped in try/catch so a missing package / Expo
 * Go / init failure degrades to `null` — NEVER throws into the caller.
 */
function resolveComponent(): ExerciseVideoComponent | null {
  if (resolved !== undefined) return resolved;

  try {
    // Lazy, runtime-only require — Metro needs a STRING LITERAL here so it can
    // bundle the native wrapper for the EAS build. This line is NEVER reached at
    // module-eval time of THIS file; it runs only when the seam is first called.
    // In Expo Go / a real device WITHOUT expo-video it throws (caught below →
    // null). Under the jest gate: component suites that keep the image path mock
    // `@/lib/exerciseVideo` outright, and the seam suite lets this require run
    // against the expo-video STUB mapped in jest.config.js (whose useVideoPlayer
    // is not a function) → the engine probe returns false → null. So the real
    // native package graph is never resolved by the gate and NO `npm install` is
    // required to stay green.
    //
    // NOTE: the file is named `exerciseVideoNative` (NOT `exerciseVideo.native`)
    // on purpose — a `.native.tsx` suffix is a React-Native platform extension
    // that Metro / jest-expo would resolve in place of `exerciseVideo` itself.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./exerciseVideoNative') as {
      isExerciseVideoEngineAvailable?: () => boolean;
      ExerciseVideoPlayer?: ExerciseVideoComponent;
    };
    if (
      typeof mod?.isExerciseVideoEngineAvailable === 'function' &&
      mod.isExerciseVideoEngineAvailable() &&
      typeof mod.ExerciseVideoPlayer === 'function'
    ) {
      resolved = mod.ExerciseVideoPlayer;
      return resolved;
    }
  } catch {
    // Package not installed (the jest gate / Expo Go) or native init failed —
    // degrade gracefully. Never throws to the caller.
  }

  resolved = null;
  return resolved;
}

/**
 * True when a self-hosted MP4 demo can actually be played on this device (the
 * native expo-video engine is present and usable). False under the jest gate /
 * Expo Go / when the package isn't installed. Never throws.
 */
export function isExerciseVideoAvailable(): boolean {
  return resolveComponent() !== null;
}

/**
 * The real MP4 player component when the engine is available, else `null`. The UI
 * renders it (passing a `videoUrl`) only when this is non-null; otherwise it
 * keeps the existing animated image-frame / fallback path.
 */
export function getExerciseVideoComponent(): ExerciseVideoComponent | null {
  return resolveComponent();
}

/**
 * Test/seam hook: reset the memoised resolution so a suite can force a re-probe.
 * Not used in production code paths.
 */
export function __resetExerciseVideoForTests(): void {
  resolved = undefined;
}
