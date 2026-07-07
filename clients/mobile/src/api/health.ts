/**
 * health.ts
 *
 * Thin API wrapper for WEARABLE / health-app sample ingestion. The real native
 * adapter (`src/lib/healthSyncNative.ts`) reads recent samples on-device and
 * POSTs them here; the backend persists them and wires sleep / HRV / resting-HR
 * into the digital twin (see services/sleep-service health-sync).
 *
 * The endpoint is `/v1/sleep/health-sync` — a user-AUTHENTICATED route that
 * rides nginx's existing `/v1/sleep` prefix (NOT an /internal route). It uses the
 * shared {@link apiClient}, so the JWT is attached and the `/v1` gateway-prefix
 * policy is honoured exactly like every other call (see api/client.ts). The
 * server takes the userId from the verified JWT, never the body — so a client
 * can only ever ingest its OWN samples.
 *
 * This file imports NOTHING native — it is pure TypeScript over axios, safe to
 * import anywhere (including the jest gate).
 */
import { apiClient } from './client';

/**
 * The on-the-wire sample kinds. Finer-grained than the mobile `HealthDataKind`
 * seam (which is the coarse UI taxonomy) so resting-HR and HRV are distinct from
 * instantaneous heart rate. MUST match the server's HEALTH_SAMPLE_KINDS.
 */
export type HealthSampleKind =
  | 'sleep'
  | 'steps'
  | 'heartRate'
  | 'restingHeartRate'
  | 'hrv'
  | 'activeEnergy'
  | 'workout';

/**
 * The HealthSource that produced a sample. `apple_health` / `google_fit` /
 * `generic_ble` mirror the mobile health-sync seam; `camera_ppg` is the
 * camera-based PPG estimate (finger-over-lens + torch) — a consumer-grade
 * wellness reading kept distinct from a BLE strap read. MUST stay in lockstep
 * with the server's HEALTH_SAMPLE_SOURCES (sleep-service/health-sync.service.ts).
 */
export type HealthSampleSource =
  | 'apple_health'
  | 'google_fit'
  | 'generic_ble'
  | 'camera_ppg';

/** One sample on the wire. A given kind uses a subset of the optional fields. */
export interface HealthSample {
  kind: HealthSampleKind;
  source?: HealthSampleSource;
  /** ISO-8601 start. Point readings set start == end (or omit end). */
  startTime: string;
  endTime?: string | null;
  /** Generic numeric value: steps / bpm / ms HRV / kcal active energy. */
  value?: number | null;
  unit?: string | null;
  /** Sleep only: 0–10 quality. */
  quality?: number | null;
  /** Sleep only: disturbance count. */
  disturbances?: number | null;
}

/** The server's ingest summary (services/sleep-service HealthSyncResultSummary). */
export interface HealthSyncIngestResult {
  persisted: number;
  sleepSessionsCreated: number;
  autonomicRefined: boolean;
}

/** Server-enforced batch cap; the client also chunks to this to be safe. */
export const HEALTH_SYNC_MAX_BATCH = 500;

/**
 * POST a batch of samples to the ingestion endpoint. Resolves with the server's
 * summary. Throws on transport/HTTP error — the CALLER (the native adapter's
 * syncNow) is responsible for catching and degrading to an honest result, per
 * the never-throw adapter discipline.
 */
export async function ingestHealthSamples(
  samples: HealthSample[],
): Promise<HealthSyncIngestResult> {
  const { data } = await apiClient.post<HealthSyncIngestResult>(
    '/v1/sleep/health-sync',
    { samples },
  );
  return data;
}
