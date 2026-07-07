/**
 * healthSync.types.ts
 *
 * The TYPE seam for wearable / platform health-data sync. This file defines
 * the contract that every health-sync adapter must satisfy — the real
 * HealthKit (iOS), Google-Fit / Health-Connect (Android), and generic-BLE
 * adapters all slot in behind this single `HealthSyncAdapter` interface in a
 * later dev build. The default export (`src/lib/healthSync.ts`) is an honest
 * no-op adapter so the app runs in Expo Go today with ZERO native modules.
 *
 * Nothing in this file imports React, react-native, expo, react-native-health,
 * react-native-health-connect, or any BLE library. It is pure type + const
 * declarations, so it is safe to import from anywhere (UI screens, tests, and
 * future native adapters alike) without pulling in a runtime dependency.
 *
 * ── Why a string-union const + type, NOT a TS `enum` ──────────────────────
 * We deliberately model the closed sets (`HealthSource`, `HealthDataKind`,
 * `HealthSyncStatus`) as `as const` arrays plus a derived literal union type,
 * rather than a TypeScript `enum`. This matches the existing codebase
 * convention (see `SUBSCRIPTION_PRODUCT_IDS` in `src/lib/iap.ts`) and avoids
 * the well-known `enum` footguns: `enum`s emit runtime code, don't tree-shake
 * cleanly, and behave surprisingly under `isolatedModules` / Babel-only
 * transpilation (which is exactly how Expo + jest-expo build this app — Babel
 * strips types without a full TS type-checker, and `const enum` in particular
 * is unsupported there). The `as const` array gives us BOTH a runtime-
 * enumerable list (for the UI to map over) AND a precise literal type (for the
 * type-checker), with no emitted enum object.
 */

// ─── Health sources ───────────────────────────────────────────────────────
//
// Where health data can come from. Each maps to a concrete native adapter in
// a later dev build:
//   - 'apple_health'  → HealthKit          (iOS only; react-native-health)
//   - 'google_fit'    → Health Connect     (Android; react-native-health-connect)
//   - 'generic_ble'   → a Bluetooth-LE wearable read over GATT (cross-platform)
//
// The no-op adapter advertises every source as supported-in-principle but
// returns 'unavailable' for all of them in Expo Go (no native module present).

/** Runtime-enumerable list of every supported health source. */
export const HEALTH_SOURCES = [
  'apple_health',
  'google_fit',
  'generic_ble',
] as const;

/** A health-data source. Derived from {@link HEALTH_SOURCES} — keep in lockstep. */
export type HealthSource = (typeof HEALTH_SOURCES)[number];

/** Human-readable labels for each source, for the UI to render. */
export const HEALTH_SOURCE_LABELS: Record<HealthSource, string> = {
  apple_health: 'Apple Health',
  google_fit: 'Google Fit',
  generic_ble: 'Bluetooth Device',
};

// ─── Health data kinds ─────────────────────────────────────────────────────
//
// The categories of data a sync can read. Kept intentionally small and stable
// — these are the metrics Zeitra's circadian / shift-work coaching actually
// consumes:
//   - 'steps'      → daily / hourly step counts (activity load)
//   - 'heartRate'  → heart-rate samples (strain, resting HR trend)
//   - 'sleep'      → sleep stages / sleep sessions (recovery, the core signal
//                    for a shift worker's sleep-debt model)
//   - 'workouts'   → discrete workout / exercise sessions

/** Runtime-enumerable list of every health-data kind we can sync. */
export const HEALTH_DATA_KINDS = [
  'steps',
  'heartRate',
  'sleep',
  'workouts',
] as const;

/** A category of health data. Derived from {@link HEALTH_DATA_KINDS}. */
export type HealthDataKind = (typeof HEALTH_DATA_KINDS)[number];

/** Human-readable labels for each data kind, for the UI to render. */
export const HEALTH_DATA_KIND_LABELS: Record<HealthDataKind, string> = {
  steps: 'Steps',
  heartRate: 'Heart Rate',
  sleep: 'Sleep',
  workouts: 'Workouts',
};

// ─── Sync status + result ───────────────────────────────────────────────────
//
// `getStatus()` is the GROUND TRUTH of the connection (see
// rules/state-ground-truth.md): the adapter owns the real connection state and
// the UI derives everything it shows from it, rather than the UI keeping its
// own duplicate copy that can drift.
//
//   - 'connected'    → the source is wired up and a sync can fetch data
//   - 'unavailable'  → the source cannot be used on this build/device (e.g.
//                      Expo Go with no native module, or Apple Health on
//                      Android). NOT an error — an honest, expected fallback.
//   - 'disconnected' → the source is supported but the user hasn't connected
//                      it (or has explicitly disconnected it)

/** Runtime-enumerable list of every connection status. */
export const HEALTH_SYNC_STATUSES = [
  'connected',
  'unavailable',
  'disconnected',
] as const;

/** The connection status of a health source. Derived from {@link HEALTH_SYNC_STATUSES}. */
export type HealthSyncStatus = (typeof HEALTH_SYNC_STATUSES)[number];

/**
 * The outcome of a `connect()` or `syncNow()` call.
 *
 * `reason` is an optional human-readable explanation — present whenever the
 * status is something the UI should explain to the user (e.g. why a source is
 * `'unavailable'`). It is intended to be shown verbatim, so keep it short and
 * plain-language, never a raw error message or stack trace.
 */
export interface HealthSyncResult {
  status: HealthSyncStatus;
  reason?: string;
}

/**
 * The contract every health-sync adapter implements. The no-op adapter in
 * `src/lib/healthSync.ts` satisfies it today; native HealthKit / Health-Connect
 * / BLE adapters satisfy it later behind a dev build.
 *
 * Discipline every implementation MUST follow (see
 * rules/react-state-fallback.md — async/never-throw + honest fallback):
 *   - `connect()` and `syncNow()` are async and MUST resolve, NEVER reject /
 *     throw. An adapter that can't do the work resolves to a result with a
 *     non-`'connected'` status and a human-readable `reason` — failure is
 *     modelled as DATA, not as a thrown exception the caller has to try/catch.
 *   - `getStatus()` is the synchronous ground truth of the current connection
 *     (see rules/state-ground-truth.md). The UI should DERIVE what it renders
 *     from this rather than storing its own copy that can go stale.
 *   - `lastSyncedAt()` returns an ISO-8601 timestamp string of the last
 *     successful sync, or `null` if no sync has ever succeeded.
 */
export interface HealthSyncAdapter {
  /** Connect to the source. Resolves (never throws) with the resulting status. */
  connect(): Promise<HealthSyncResult>;
  /** Disconnect from the source. Resolves (never throws); idempotent. */
  disconnect(): Promise<void>;
  /** The current connection status — synchronous ground truth. */
  getStatus(): HealthSyncStatus;
  /** Pull the latest data now. Resolves (never throws) with the resulting status. */
  syncNow(): Promise<HealthSyncResult>;
  /** ISO-8601 timestamp of the last successful sync, or `null` if never. */
  lastSyncedAt(): string | null;
}
