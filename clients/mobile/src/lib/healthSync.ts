/**
 * healthSync.ts
 *
 * The default health-sync adapter: an honest NO-OP. It implements every method
 * of `HealthSyncAdapter` (see `healthSync.types.ts`) but does no actual
 * syncing — `connect()` and `syncNow()` resolve to an `'unavailable'` result
 * explaining that real wearable sync requires a native dev build.
 *
 * Why a no-op default?  Real HealthKit / Google-Fit (Health Connect) / BLE
 * access needs native modules (react-native-health, react-native-health-connect,
 * a BLE library) that do NOT exist in Expo Go and pull in a custom dev-client
 * build. Rather than crash, gate the whole devices screen behind a platform
 * check, or add a native runtime dependency the app can't ship in Expo Go, we
 * ship this no-op as the default and let the UI render an honest "connect in a
 * dev build" state. The real adapters slot in behind this same interface later
 * (mirroring how `src/lib/iap.ts` degrades gracefully until the native IAP
 * module is wired up).
 *
 * This file is PURE TypeScript. It imports NOTHING from react-native, expo,
 * react-native-health, react-native-health-connect, or any BLE library, and
 * adds NO new runtime npm dependency. It is therefore safe to import and run in
 * Expo Go and in unit tests with no mocks.
 *
 * ── Applied react-native-skills ──────────────────────────────────────────
 *   - rules/react-state-fallback.md (async / never-throw + honest fallback):
 *     `connect()` and `syncNow()` are async and ALWAYS resolve, never reject.
 *     "Can't sync here" is modelled as DATA — a `HealthSyncResult` with status
 *     `'unavailable'` and a human-readable `reason` — not as a thrown error the
 *     caller must wrap in try/catch. The reason is the honest fallback the UI
 *     shows in place of a fabricated "connected" state.
 *   - rules/state-ground-truth.md (adapter as single source of truth):
 *     `getStatus()` is the synchronous ground truth of the connection. The UI
 *     derives what it renders from this adapter rather than keeping its own
 *     duplicate connection flag that could drift. For the no-op adapter that
 *     truth is constant (`'unavailable'`) and `lastSyncedAt()` is always `null`,
 *     because nothing here ever actually connects or syncs.
 */

import {
  HEALTH_DATA_KINDS,
  HEALTH_SOURCES,
  type HealthDataKind,
  type HealthSource,
  type HealthSyncAdapter,
  type HealthSyncResult,
  type HealthSyncStatus,
} from './healthSync.types';

/**
 * The single, documented reason string surfaced whenever the no-op adapter is
 * asked to do real work. Kept as a named const so the contract — "the reason
 * explains that a native dev build is required" — has one source of truth that
 * both the adapter and its tests reference, and so the exact phrasing can't
 * drift between `connect()` and `syncNow()`.
 *
 * MUST remain human-readable and MUST contain the phrase "requires a native
 * dev build" (the UI shows it verbatim, and the acceptance test asserts it).
 */
export const NOOP_UNAVAILABLE_REASON =
  'Health sync requires a native dev build — it is unavailable in Expo Go.';

/**
 * The no-op adapter. Every method honours the `HealthSyncAdapter` contract:
 * the async methods resolve (never throw) and report an honest `'unavailable'`
 * status; the synchronous accessors report the constant ground truth.
 *
 * Frozen so callers can treat it as a stable singleton and can't accidentally
 * mutate the shared instance.
 */
export const noopHealthSyncAdapter: HealthSyncAdapter = Object.freeze({
  async connect(): Promise<HealthSyncResult> {
    // Honest fallback (never throws): there is no native module to connect to.
    return { status: 'unavailable', reason: NOOP_UNAVAILABLE_REASON };
  },

  async disconnect(): Promise<void> {
    // Nothing was ever connected — nothing to tear down. Idempotent no-op.
    return undefined;
  },

  getStatus(): HealthSyncStatus {
    // Ground truth: the no-op adapter is never connected.
    return 'unavailable';
  },

  async syncNow(): Promise<HealthSyncResult> {
    // Honest fallback (never throws): there is nothing to sync from.
    return { status: 'unavailable', reason: NOOP_UNAVAILABLE_REASON };
  },

  lastSyncedAt(): string | null {
    // Ground truth: the no-op adapter has never completed a sync.
    return null;
  },
});

/**
 * Memoised resolved adapter. `undefined` until the first {@link getHealthSyncAdapter}
 * call probes for a native adapter; thereafter it's the chosen singleton (native
 * if available, else the no-op). Memoising means the dynamic require + probe run
 * at most once per app session. Mirrors the F30 voice seam (`src/lib/voice.ts`).
 */
let resolvedAdapter: HealthSyncAdapter | undefined;

/**
 * The seam the rest of the app imports against. Resolves the best available
 * adapter:
 *
 *   - Tries to LAZILY load the real native adapter (`./healthSyncNative`) via a
 *     dynamic `require` inside a try/catch — the SAME degrade-gracefully idiom as
 *     {@link getVoiceAdapter}. This keeps the gate GREEN with NO `npm install` of
 *     the native deps: `tsc` resolves the imports against the ambient shims in
 *     `src/types/health-native.d.ts`; jest maps the native packages to stubs that
 *     report unavailable so `createNativeHealthSyncAdapter()` returns null; the
 *     screen suites mock `@/lib/healthSync` outright.
 *   - In a real EAS dev/release build with the packages installed and the OS
 *     permissions granted, the require succeeds and the native adapter is adopted
 *     — no UI change needed (every screen imports `getHealthSyncAdapter`).
 *   - Otherwise (Expo Go, packages absent, native init failed) it falls back to
 *     the honest no-op (`'unavailable'`).
 *
 * NOTE: the file is named `healthSyncNative` (NOT `healthSync.native`) on purpose
 * — a `.native.ts` suffix is a React-Native platform extension that Metro /
 * jest-expo would resolve in place of `healthSync` itself.
 */
export function getHealthSyncAdapter(): HealthSyncAdapter {
  if (resolvedAdapter) return resolvedAdapter;

  try {
    // Lazy, runtime-only require — never reached at module-eval time of THIS
    // file; runs only when getHealthSyncAdapter() is first called. In Expo Go /
    // without the native packages it throws (caught below → no-op). Under the
    // jest gate the native packages are mapped to stubs that report unavailable,
    // so createNativeHealthSyncAdapter() returns null → no-op fallback. No
    // `npm install` of native deps is required to stay green.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./healthSyncNative') as {
      createNativeHealthSyncAdapter?: () => HealthSyncAdapter | null;
    };
    const native = mod?.createNativeHealthSyncAdapter?.() ?? null;
    if (native) {
      resolvedAdapter = native;
      return resolvedAdapter;
    }
  } catch {
    // Packages not installed (the jest gate / Expo Go) or native init failed —
    // degrade gracefully to the honest no-op. Never throws to the caller.
  }

  resolvedAdapter = noopHealthSyncAdapter;
  return resolvedAdapter;
}

/**
 * Test/seam hook: reset the memoised adapter so a suite can force re-resolution.
 * Not used in production code paths. Mirrors `__resetVoiceAdapterForTests`.
 */
export function __resetHealthSyncAdapterForTests(): void {
  resolvedAdapter = undefined;
}

/**
 * The list of sources the UI can offer. Re-exported here (from the types
 * module) so a screen can `import { getHealthSyncAdapter, SUPPORTED_HEALTH_SOURCES }`
 * from a single module. These are the sources supported in principle; the no-op
 * adapter still reports every one of them as `'unavailable'` in Expo Go.
 */
export const SUPPORTED_HEALTH_SOURCES: readonly HealthSource[] = HEALTH_SOURCES;

/**
 * The list of data kinds a sync can cover, re-exported for the UI to map over.
 */
export const SUPPORTED_HEALTH_DATA_KINDS: readonly HealthDataKind[] =
  HEALTH_DATA_KINDS;

// Default export: the no-op adapter, for ergonomic `import healthSync from ...`.
export default noopHealthSyncAdapter;
