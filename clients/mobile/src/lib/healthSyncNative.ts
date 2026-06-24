/**
 * healthSyncNative.ts
 *
 * The REAL on-device health-sync adapter — Apple HealthKit on iOS (via
 * @kingstinct/react-native-healthkit) and Android Health Connect (via
 * react-native-health-connect). READ-ONLY: sleep, steps, heart rate, resting HR,
 * HRV, active energy, workouts.
 *
 * It is loaded LAZILY from `src/lib/healthSync.ts`'s `getHealthSyncAdapter()` via
 * a dynamic `require` inside a try/catch, behind an availability probe — EXACTLY
 * mirroring the F30 voice seam (`src/lib/voiceNative.ts`). That seam is what
 * keeps the jest / `tsc` gate green WITHOUT the native packages installed:
 *
 *   - At RUNTIME in a native (EAS dev/release) build, `require('./healthSyncNative')`
 *     succeeds, the native packages resolve, and `createNativeHealthSyncAdapter()`
 *     returns a working adapter.
 *   - During the GATE, this file is never module-evaluated by the screen tests
 *     (they mock `@/lib/healthSync`), and `getHealthSyncAdapter()`'s require sits
 *     behind a probe; the jest moduleNameMapper points the two native packages at
 *     STUBS that report unavailable → createNativeHealthSyncAdapter() returns null
 *     → honest no-op fallback.
 *   - For `tsc --noEmit`, the imports below resolve against the ambient shims in
 *     `src/types/health-native.d.ts` (declared because the packages aren't
 *     installed for the gate). Delete those shims once the deps are installed.
 *
 * Honest-fallback discipline (the HealthSyncAdapter contract): NOTHING here throws
 * into the caller. `connect()` / `syncNow()` always RESOLVE to a HealthSyncResult;
 * permission denials / read failures / transport errors degrade to a non-
 * 'connected' status with a human-readable reason — failure is DATA, never an
 * exception.
 */

import { Platform } from 'react-native';
import HealthKit, {
  HKQuantityTypeIdentifier,
  HKCategoryTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import {
  initialize as hcInitialize,
  requestPermission as hcRequestPermission,
  readRecords as hcReadRecords,
  getSdkStatus as hcGetSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import type {
  HealthSyncAdapter,
  HealthSyncResult,
  HealthSyncStatus,
} from './healthSync.types';
import { ingestHealthSamples, type HealthSample } from '../api/health';
import {
  mapHealthKitSleepSamples,
  mapHealthConnectSleepSamples,
  type RawHkSleepSample,
  type RawHcSleepSession,
} from './healthSyncMap';

/** How far back to read on a sync. A week balances signal vs read volume. */
const SYNC_LOOKBACK_DAYS = 7;
const ISO = (d: Date) => d.toISOString();
const lookbackStart = (): Date =>
  new Date(Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

/**
 * Hard ceiling on a single sync step (read OR ingest). Without this a native
 * read that never resolves — or an ingest POST that stalls on a dead socket —
 * would leave syncNow() pending forever, which on the Connected Devices screen
 * reads as the UI freezing on a blank "syncing…" state (the user had to force-
 * close). A bounded race converts any hang into an honest, recoverable failure
 * result instead. 20s is generous for a one-week sample read + a single POST.
 */
const SYNC_STEP_TIMEOUT_MS = 20_000;

/**
 * Race a promise against a finite timeout. On timeout the returned promise
 * REJECTS with a labelled error; the caller's try/catch turns that into an
 * honest non-connected result (never an uncaught throw / hang). The pending
 * work is abandoned — we can't cancel a native read or an axios POST here, but
 * we stop AWAITING it so the user is never stuck.
 */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`health-sync ${label} timed out after ${ms}ms`));
    }, ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** ISO timestamp of the last successful sync; the synchronous ground truth for lastSyncedAt(). */
let lastSynced: string | null = null;
/** Whether the user has connected (granted permissions) this session. */
let connected = false;

// ─────────────────────────────────────────────────────────────────────────────
// iOS — HealthKit (@kingstinct/react-native-healthkit)
// ─────────────────────────────────────────────────────────────────────────────

/** READ-ONLY HealthKit identifiers we request. No SHARE/WRITE types (per Apple-review). */
const HK_READ_QUANTITY: HKQuantityTypeIdentifier[] = [
  HKQuantityTypeIdentifier.stepCount,
  HKQuantityTypeIdentifier.heartRate,
  HKQuantityTypeIdentifier.restingHeartRate,
  HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
  HKQuantityTypeIdentifier.activeEnergyBurned,
];
const HK_READ_CATEGORY: HKCategoryTypeIdentifier[] = [
  HKCategoryTypeIdentifier.sleepAnalysis,
];

function buildIosAdapter(): HealthSyncAdapter | null {
  // Availability probe: HealthKit only exists on iOS, and only on a build that
  // bundled the native module. A non-function isHealthDataAvailable means the
  // module isn't really present (e.g. the jest stub) → not usable.
  const available = (() => {
    try {
      return (
        Platform.OS === 'ios' &&
        typeof HealthKit?.isHealthDataAvailable === 'function'
      );
    } catch {
      return false;
    }
  })();
  if (!available) return null;

  async function connect(): Promise<HealthSyncResult> {
    try {
      const ok = await HealthKit.isHealthDataAvailable();
      if (!ok) {
        return { status: 'unavailable', reason: 'Apple Health is not available on this device.' };
      }
      // READ-ONLY: request read access only; pass NO write/share types.
      await HealthKit.requestAuthorization([...HK_READ_QUANTITY, ...HK_READ_CATEGORY], []);
      connected = true;
      return { status: 'connected' };
    } catch {
      return { status: 'disconnected', reason: 'Could not connect to Apple Health. Try again.' };
    }
  }

  async function readSamples(): Promise<HealthSample[]> {
    const from = lookbackStart();
    const opts = { from: ISO(from), to: ISO(new Date()) } as const;
    const out: HealthSample[] = [];

    const readQty = async (
      id: HKQuantityTypeIdentifier,
      kind: HealthSample['kind'],
      unit?: string,
    ) => {
      try {
        const rows = await HealthKit.queryQuantitySamples(id, opts as any);
        for (const r of rows ?? []) {
          out.push({
            kind,
            source: 'apple_health',
            startTime: new Date(r.startDate).toISOString(),
            endTime: r.endDate ? new Date(r.endDate).toISOString() : null,
            value: typeof r.quantity === 'number' ? r.quantity : null,
            unit: unit ?? null,
          });
        }
      } catch {
        /* skip this metric; never throw the whole sync */
      }
    };

    await readQty(HKQuantityTypeIdentifier.stepCount, 'steps', 'count');
    await readQty(HKQuantityTypeIdentifier.heartRate, 'heartRate', 'bpm');
    await readQty(HKQuantityTypeIdentifier.restingHeartRate, 'restingHeartRate', 'bpm');
    await readQty(HKQuantityTypeIdentifier.heartRateVariabilitySDNN, 'hrv', 'ms');
    await readQty(HKQuantityTypeIdentifier.activeEnergyBurned, 'activeEnergy', 'kcal');

    // Sleep: HealthKit emits MANY per-stage category segments per night with NO
    // quality. The PURE mapper (healthSyncMap.ts) collapses them into ONE session
    // per night, synthesizes a baseline quality from sleep efficiency, counts
    // awakenings as disturbances, and emits ONLY the most-recent night that is
    // strictly after the persisted lastSyncedAt — so a daily sync fires ~one twin
    // sleep event (like a manual log) and repeated syncs don't double-count.
    try {
      const sleeps = await HealthKit.queryCategorySamples(
        HKCategoryTypeIdentifier.sleepAnalysis,
        opts as any,
      );
      const raw: RawHkSleepSample[] = (sleeps ?? []).map((s) => ({
        startDate: s.startDate,
        endDate: s.endDate ?? null,
        value: s.value,
      }));
      out.push(...mapHealthKitSleepSamples(raw, lastSynced));
    } catch {
      /* skip sleep; never throw */
    }
    return out;
  }

  return makeAdapter(connect, readSamples);
}

// ─────────────────────────────────────────────────────────────────────────────
// Android — Health Connect (react-native-health-connect)
// ─────────────────────────────────────────────────────────────────────────────

function buildAndroidAdapter(): HealthSyncAdapter | null {
  const available = (() => {
    try {
      return Platform.OS === 'android' && typeof hcInitialize === 'function';
    } catch {
      return false;
    }
  })();
  if (!available) return null;

  async function connect(): Promise<HealthSyncResult> {
    try {
      const status = await hcGetSdkStatus();
      if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        return {
          status: 'unavailable',
          reason: 'Health Connect is not installed or unavailable on this device.',
        };
      }
      await hcInitialize();
      // READ-ONLY permissions only. Health Connect's requestPermission RESOLVES
      // with the set the user actually GRANTED (which may be empty if they
      // declined every toggle) — it does NOT throw on a denial. Honour that:
      // only report 'connected' when at least one READ permission came back.
      const granted = await hcRequestPermission([
        { accessType: 'read', recordType: 'SleepSession' },
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'HeartRate' },
        { accessType: 'read', recordType: 'RestingHeartRate' },
        { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'ExerciseSession' },
      ]);
      const grantedReads = (granted ?? []).filter((p) => p?.accessType === 'read');
      if (grantedReads.length === 0) {
        // User declined every read toggle → we have no data access. Be honest
        // rather than claiming a connection (a sync would silently read nothing).
        connected = false;
        return {
          status: 'disconnected',
          reason: 'Health Connect permission was denied. Grant read access to sync your health data.',
        };
      }
      connected = true;
      return { status: 'connected' };
    } catch {
      return { status: 'disconnected', reason: 'Could not connect to Health Connect. Try again.' };
    }
  }

  async function readSamples(): Promise<HealthSample[]> {
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: ISO(lookbackStart()),
      endTime: ISO(new Date()),
    };
    const out: HealthSample[] = [];

    const read = async (
      recordType: string,
      map: (r: any) => HealthSample | null,
    ) => {
      try {
        const res = await hcReadRecords(recordType, { timeRangeFilter });
        const records = (res?.records ?? res ?? []) as any[];
        for (const r of records) {
          const s = map(r);
          if (s) out.push(s);
        }
      } catch {
        /* skip this record type; never throw the whole sync */
      }
    };

    // Sleep: Health Connect's SleepSession is already one-per-night, but we route
    // it through the SAME pure mapper as HealthKit so both platforms normalize to
    // one session/night with a synthesized baseline quality + awakening-derived
    // disturbances, and only the most-recent not-yet-synced night feeds the live
    // twin (incremental via lastSynced → no per-night fan-out, no double-count).
    try {
      const res = await hcReadRecords('SleepSession', { timeRangeFilter });
      const records = (res?.records ?? res ?? []) as any[];
      const raw: RawHcSleepSession[] = records.map((r) => ({
        startTime: r.startTime,
        endTime: r.endTime ?? null,
        stages: r.stages,
      }));
      out.push(...mapHealthConnectSleepSamples(raw, lastSynced));
    } catch {
      /* skip sleep; never throw */
    }
    await read('Steps', (r) => ({
      kind: 'steps',
      source: 'google_fit',
      startTime: r.startTime,
      endTime: r.endTime ?? null,
      value: typeof r.count === 'number' ? r.count : null,
      unit: 'count',
    }));
    await read('HeartRate', (r) => {
      const bpm = r.samples?.[0]?.beatsPerMinute;
      return {
        kind: 'heartRate',
        source: 'google_fit',
        startTime: r.startTime ?? r.samples?.[0]?.time,
        endTime: r.endTime ?? null,
        value: typeof bpm === 'number' ? bpm : null,
        unit: 'bpm',
      };
    });
    await read('RestingHeartRate', (r) => ({
      kind: 'restingHeartRate',
      source: 'google_fit',
      startTime: r.time ?? r.startTime,
      value: typeof r.beatsPerMinute === 'number' ? r.beatsPerMinute : null,
      unit: 'bpm',
    }));
    await read('HeartRateVariabilityRmssd', (r) => ({
      kind: 'hrv',
      source: 'google_fit',
      startTime: r.time ?? r.startTime,
      value: typeof r.heartRateVariabilityMillis === 'number' ? r.heartRateVariabilityMillis : null,
      unit: 'ms',
    }));
    await read('ActiveCaloriesBurned', (r) => ({
      kind: 'activeEnergy',
      source: 'google_fit',
      startTime: r.startTime,
      endTime: r.endTime ?? null,
      value: typeof r.energy?.inKilocalories === 'number' ? r.energy.inKilocalories : null,
      unit: 'kcal',
    }));
    await read('ExerciseSession', (r) => ({
      kind: 'workout',
      source: 'google_fit',
      startTime: r.startTime,
      endTime: r.endTime ?? null,
    }));

    return out;
  }

  return makeAdapter(connect, readSamples);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared adapter shell (status + never-throw syncNow that POSTs to the backend)
// ─────────────────────────────────────────────────────────────────────────────

/** Drop samples with a non-finite/unparseable timestamp; bound the batch size. */
function sanitize(samples: HealthSample[]): HealthSample[] {
  return samples
    .filter((s) => typeof s.startTime === 'string' && !Number.isNaN(Date.parse(s.startTime)))
    .slice(0, 500);
}

function makeAdapter(
  connect: () => Promise<HealthSyncResult>,
  readSamples: () => Promise<HealthSample[]>,
): HealthSyncAdapter {
  return {
    connect,

    async disconnect(): Promise<void> {
      // Neither HealthKit nor Health Connect exposes a programmatic revoke; the
      // user manages access in Settings. We only clear our local connected flag.
      connected = false;
    },

    getStatus(): HealthSyncStatus {
      return connected ? 'connected' : 'disconnected';
    },

    async syncNow(): Promise<HealthSyncResult> {
      try {
        // Ensure permission first — connect() is idempotent and resolves a result.
        if (!connected) {
          const c = await connect();
          if (c.status !== 'connected') return c;
        }
        // Bound the on-device read: a native query that never resolves must not
        // hang the sync forever (it would freeze the Connected Devices screen).
        const samples = sanitize(
          await withTimeout(readSamples(), SYNC_STEP_TIMEOUT_MS, 'read'),
        );
        if (samples.length === 0) {
          // Honest: connected, but nothing new to send.
          lastSynced = ISO(new Date());
          return { status: 'connected', reason: 'No new health data to sync.' };
        }
        // Bound the network POST too. ingestHealthSamples uses the shared
        // apiClient (axios) and can stall on a dead socket; the timeout race
        // guarantees syncNow() always settles so the UI can leave the spinner
        // state. The inner try makes the ingest failure explicit and isolated
        // from the read above, so the reason we surface is accurate.
        try {
          await withTimeout(
            ingestHealthSamples(samples),
            SYNC_STEP_TIMEOUT_MS,
            'ingest',
          );
        } catch {
          // Read succeeded but the upload failed/stalled — honest, recoverable.
          return {
            status: 'disconnected',
            reason: 'Couldn’t upload your health data — check your connection and try again.',
          };
        }
        lastSynced = ISO(new Date());
        return { status: 'connected' };
      } catch {
        // Never throw: a read/transport/timeout failure degrades to an honest reason.
        return { status: 'disconnected', reason: 'Sync failed — check your connection and try again.' };
      }
    },

    lastSyncedAt(): string | null {
      return lastSynced;
    },
  };
}

/**
 * Build the platform-appropriate native adapter, or null if neither platform's
 * health store is usable on this build/device (so getHealthSyncAdapter() falls
 * back to the honest no-op). Construction itself never throws.
 */
export function createNativeHealthSyncAdapter(): HealthSyncAdapter | null {
  try {
    if (Platform.OS === 'ios') return buildIosAdapter();
    if (Platform.OS === 'android') return buildAndroidAdapter();
    return null;
  } catch {
    return null;
  }
}

export default createNativeHealthSyncAdapter;
