/**
 * health-sync.service.ts
 *
 * Ingestion of a batch of wearable / health-app samples (Apple Health, Health
 * Connect, BLE) for the authenticated user, plus the PURE mapping that wires the
 * synced signals into the DIGITAL TWIN.
 *
 * ── Where this fits ───────────────────────────────────────────────────────────
 * The mobile app reads recent samples on-device and POSTs them to
 * `POST /v1/sleep/health-sync` (routed through nginx's existing `/v1/sleep`
 * prefix → sleep-service; it is NOT an /internal route, and it is user-
 * authenticated). This module:
 *
 *   1. Persists every sample verbatim into the append-only `health_samples`
 *      archive (raw history; nothing derived).
 *   2. Materializes each SLEEP sample into a normal SleepSession via the EXISTING
 *      `SleepService.createSession()`, which publishes
 *      `nightfuel:sleep:session-logged`. state-service's existing
 *      `handleSleepLogged` then folds it into avgSleepQuality / fatigueLevel
 *      exactly as a manually-logged sleep does. The synced path REUSES the manual
 *      path — it is not a dead store, and there is NO new event type or
 *      materializer change.
 *   3. Lets HRV / resting-HR REFINE fatigue by nudging the synthesized sleep
 *      sample's effective quality + disturbances BEFORE that publish (see
 *      {@link refineSleepWithAutonomicSignals}). Lower HRV / elevated resting HR
 *      = more physiological strain → slightly lower effective quality + a small
 *      disturbance bump, which the existing materializer turns into higher
 *      fatigue. Higher HRV / low resting HR = better recovery → the opposite.
 *
 * ── Byte-identical for non-syncers ───────────────────────────────────────────
 * A user who never syncs never calls this endpoint, so no health_samples rows
 * exist, no event is produced, and the twin is unchanged. The refinement only
 * ever runs over data the user actively synced.
 *
 * ── Purity boundary (so the twin mapping is unit-testable on the gate) ─────────
 * The functions in the "PURE TWIN MAPPING" section import NOTHING from Prisma /
 * the event bus / the generated client. They are plain data→data transforms, so
 * the jest gate (babel-jest, no DB) can exercise them directly. The
 * `HealthSyncService` class wires them to the real SleepService + Prisma.
 */

import { z } from 'zod';
import type { CreateSleepSessionInput } from './sleep.service';

// ─── Sample kinds (mirror the mobile HealthDataKind seam, widened) ────────────
// The mobile seam exposes coarse kinds (steps|heartRate|sleep|workouts); on the
// wire we accept the finer-grained set the adapters actually read so resting-HR
// and HRV are distinguishable from instantaneous heart rate.
export const HEALTH_SAMPLE_KINDS = [
    'sleep',
    'steps',
    'heartRate',
    'restingHeartRate',
    'hrv',
    'activeEnergy',
    'workout',
] as const;

export type HealthSampleKind = (typeof HEALTH_SAMPLE_KINDS)[number];

export const HEALTH_SAMPLE_SOURCES = [
    'apple_health',
    'google_fit',
    'generic_ble',
] as const;

export type HealthSampleSource = (typeof HEALTH_SAMPLE_SOURCES)[number];

/** A single inbound sample. Most fields are optional — a given kind uses a subset. */
export interface HealthSampleInput {
    kind: HealthSampleKind;
    source?: HealthSampleSource;
    startTime: string; // ISO-8601
    endTime?: string | null; // ISO-8601; point readings omit it
    value?: number | null; // steps count / bpm / ms HRV / kcal …
    unit?: string | null;
    quality?: number | null; // sleep only: 0–10
    disturbances?: number | null; // sleep only: count
}

// ── Bounds (mirror src/index.ts + state-service/events.ts input-bounds idiom) ──
// Generous: reject the absurd, accept the real. A batch is capped so one POST
// can't be used to bulk-insert unbounded rows; per-sample numeric fields are
// bounded so a poisoned value can never reach the DB or the twin.
export const MAX_BATCH_SAMPLES = 500;
export const MAX_HR_BPM = 300; // far beyond any real instantaneous/resting HR
export const MIN_HR_BPM = 20;
export const MAX_HRV_MS = 500; // RMSSD ceiling well beyond physiological range
export const MAX_STEPS = 200_000; // a day of steps, with huge headroom
export const MAX_ACTIVE_ENERGY_KCAL = 30_000;
export const MAX_QUALITY = 10;
export const MAX_DISTURBANCES = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED ROUTE SCHEMA (the DEPLOYED validation — D3)
// ─────────────────────────────────────────────────────────────────────────────
// The POST /v1/sleep/health-sync body schema lives HERE (next to the bounds it
// references) so there is ONE definition imported by BOTH src/index.ts (the
// deployed route) and __tests__/health-sync-route.test.ts (the regression suite).
// Previously the test copied the schema verbatim, so the test could pass while
// the deployed schema drifted. This is import-safe: it pulls in NOTHING from
// Prisma / the event bus / Fastify, only zod + the local bound consts.
export const healthSampleSchema = z
    .object({
        kind: z.enum(HEALTH_SAMPLE_KINDS),
        source: z.enum(HEALTH_SAMPLE_SOURCES).optional(),
        startTime: z.string().datetime(),
        endTime: z.string().datetime().optional().nullable(),
        value: z.number().finite().optional().nullable(),
        unit: z.string().max(20).optional().nullable(),
        quality: z.number().int().min(0).max(MAX_QUALITY).optional().nullable(),
        disturbances: z.number().int().min(0).max(MAX_DISTURBANCES).optional().nullable(),
    })
    .superRefine((s, ctx) => {
        const v = s.value;
        const fail = (message: string) =>
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });
        switch (s.kind) {
            case 'heartRate':
            case 'restingHeartRate':
                if (v != null && (v < MIN_HR_BPM || v > MAX_HR_BPM)) fail('heart rate out of range');
                break;
            case 'hrv':
                if (v != null && (v < 0 || v > MAX_HRV_MS)) fail('hrv out of range');
                break;
            case 'steps':
                if (v != null && (v < 0 || v > MAX_STEPS)) fail('steps out of range');
                break;
            case 'activeEnergy':
                if (v != null && (v < 0 || v > MAX_ACTIVE_ENERGY_KCAL)) fail('active energy out of range');
                break;
            // 'sleep' uses quality/disturbances (already bounded); 'workout' uses
            // value as a duration-mins/kcal blob bounded only by .finite() above.
        }
    });

export const healthSyncSchema = z.object({
    samples: z.array(healthSampleSchema).min(1).max(MAX_BATCH_SAMPLES),
});

// ─────────────────────────────────────────────────────────────────────────────
// PURE TWIN MAPPING (no Prisma / no event bus — unit-tested on the gate)
// ─────────────────────────────────────────────────────────────────────────────

/** Finite number or undefined (NaN/Infinity/non-number → undefined). */
const finite = (n: unknown): number | undefined =>
    typeof n === 'number' && Number.isFinite(n) ? n : undefined;

/** Clamp into [lo, hi]; a non-finite input returns undefined (skip the field). */
const clamp = (n: unknown, lo: number, hi: number): number | undefined => {
    const v = finite(n);
    return v === undefined ? undefined : Math.min(hi, Math.max(lo, v));
};

/** Mean of the finite values in a list, or undefined if none are finite. */
function meanFinite(values: Array<number | null | undefined>): number | undefined {
    const xs = values.map(finite).filter((v): v is number => v !== undefined);
    if (xs.length === 0) return undefined;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * The autonomic-recovery signals distilled from a sync batch. Both are optional —
 * a batch may carry neither, one, or both. These never touch the DB directly;
 * they only ADJUST the synthesized sleep sample that flows through the existing
 * twin path.
 */
export interface AutonomicSignals {
    /** Mean HRV (RMSSD, ms) across the batch, if any HRV samples were present. */
    avgHrvMs?: number;
    /** Mean resting heart rate (bpm) across the batch, if any were present. */
    avgRestingHrBpm?: number;
}

/**
 * Distil HRV + resting-HR signals from a validated batch. Pure: it only reads the
 * already-bounded samples. Out-of-range / non-finite readings are dropped by the
 * `finite` filter inside meanFinite.
 */
export function extractAutonomicSignals(samples: HealthSampleInput[]): AutonomicSignals {
    const hrv = samples.filter((s) => s.kind === 'hrv').map((s) => s.value);
    const restingHr = samples.filter((s) => s.kind === 'restingHeartRate').map((s) => s.value);
    const signals: AutonomicSignals = {};
    const avgHrv = meanFinite(hrv);
    const avgResting = meanFinite(restingHr);
    if (avgHrv !== undefined) signals.avgHrvMs = avgHrv;
    if (avgResting !== undefined) signals.avgRestingHrBpm = avgResting;
    return signals;
}

// Reference points for the autonomic refinement. These are deliberately gentle —
// the science is individual, so we nudge, never prescribe. A "neutral" HRV/HR
// leaves quality/disturbances untouched; clear deviations shift them by a small,
// bounded amount that the existing materializer turns into a fatigue step.
const HRV_NEUTRAL_MS = 60; // typical adult night-time RMSSD midpoint
const HRV_SPAN_MS = 40; // ±40ms maps to the full ±adjustment
const RESTING_HR_NEUTRAL_BPM = 60; // typical resting HR midpoint
const RESTING_HR_SPAN_BPM = 20; // ±20bpm maps to the full ±adjustment
const MAX_QUALITY_ADJUST = 2; // never move quality by more than ±2 on the 0–10 scale

// Quality floor that must reach the twin/decision-engine. The decision-engine's
// userStateSchema requires avgSleepQuality >= 1 (routes.ts), so a refined quality
// must NEVER be 0 — it would 400 the engine. Floor at 1 everywhere on the live path.
export const MIN_SLEEP_QUALITY = 1;

// Neutral baseline seeded when a synced sleep sample carries NO quality (the real
// HealthKit/Health-Connect path before synthesis, or a sample that lost its
// quality). Matches the manual-log default the materializer uses on create (7).
export const NEUTRAL_BASELINE_QUALITY = 7;

// The materializer raises fatigue only when disturbances > 3 (state-service
// materializer.ts). For a net-NEGATIVE (strain) refinement to actually RAISE
// fatigue — not lower it — the refined disturbance count must cross that
// threshold. We bump strained nights to at least this value so low HRV / high
// resting-HR moves fatigue UP, as intended.
const FATIGUE_DISTURBANCE_THRESHOLD = 3;

/**
 * Refine a synthesized sleep sample's quality + disturbances using the batch's
 * autonomic signals, returning a NEW {@link CreateSleepSessionInput}. Pure.
 *
 * Direction:
 *   - HRV BELOW neutral (suppressed recovery) → lower quality, +1 disturbance.
 *   - HRV ABOVE neutral (good recovery)       → higher quality.
 *   - Resting HR ABOVE neutral (strain)       → lower quality, +1 disturbance.
 *   - Resting HR BELOW neutral (recovered)    → higher quality.
 * The two signals sum, then clamp to ±MAX_QUALITY_ADJUST so a single sync can
 * never swing quality wildly. With NO autonomic signals the input is returned
 * UNCHANGED — a sync of pure sleep data behaves exactly like a manual sleep log.
 *
 * Because the existing materializer derives a fatigue STEP from disturbances>3
 * and writes avgSleepQuality directly, nudging these two fields is exactly how
 * HRV / resting-HR "refine fatigue" without any materializer change.
 */
export function refineSleepWithAutonomicSignals(
    base: CreateSleepSessionInput,
    signals: AutonomicSignals,
): CreateSleepSessionInput {
    // NULL-SAFE (D1): real platform sleep can arrive with NO quality. Rather than
    // bail (which made refinement a dead no-op on the device path), seed a NEUTRAL
    // baseline so HRV / resting-HR can still move it. A manual log that carried a
    // real quality keeps that value as the base.
    const baseQuality = clamp(base.quality, 0, MAX_QUALITY) ?? NEUTRAL_BASELINE_QUALITY;

    let delta = 0;
    if (signals.avgHrvMs !== undefined) {
        // +ve when HRV above neutral (better), -ve below (worse).
        delta += ((signals.avgHrvMs - HRV_NEUTRAL_MS) / HRV_SPAN_MS) * MAX_QUALITY_ADJUST;
    }
    if (signals.avgRestingHrBpm !== undefined) {
        // +ve when resting HR below neutral (better), -ve above (worse).
        delta +=
            ((RESTING_HR_NEUTRAL_BPM - signals.avgRestingHrBpm) / RESTING_HR_SPAN_BPM) *
            MAX_QUALITY_ADJUST;
    }
    if (delta === 0) return base;

    const boundedDelta = Math.max(-MAX_QUALITY_ADJUST, Math.min(MAX_QUALITY_ADJUST, delta));
    // Floor at MIN_SLEEP_QUALITY (1), NOT 0 (D4): a 0 would 400 the decision-engine
    // (userStateSchema avgSleepQuality.min(1)). The refined quality always reaches
    // the twin via the materializer, so it must never be 0.
    const refinedQuality = Math.round(
        Math.min(MAX_QUALITY, Math.max(MIN_SLEEP_QUALITY, baseQuality + boundedDelta)),
    );

    // DIRECTION (D1): the materializer raises fatigue only when disturbances > 3.
    // A net-negative (strain) refinement therefore bumps disturbances PAST that
    // threshold so low HRV / high resting-HR moves fatigue UP — previously it only
    // added +1 (→ 1 from a baseline of 0), which stayed below 3 and made the
    // materializer DECREMENT fatigue, i.e. the wrong direction. Recovery (a
    // non-negative refinement) never fabricates a disturbance.
    const baseDisturbances = clamp(base.disturbances, 0, MAX_DISTURBANCES) ?? 0;
    const refinedDisturbances =
        boundedDelta < 0
            ? Math.min(
                  MAX_DISTURBANCES,
                  Math.max(baseDisturbances + 1, FATIGUE_DISTURBANCE_THRESHOLD + 1),
              )
            : baseDisturbances;

    return { ...base, quality: refinedQuality, disturbances: refinedDisturbances };
}

/**
 * Map a single inbound SLEEP sample to the {@link CreateSleepSessionInput} the
 * existing SleepService.createSession() consumes, BEFORE autonomic refinement.
 * Pure. Returns null if the sample isn't a usable sleep session (no/!finite
 * window). Quality/disturbances are clamped to the SleepSession bounds.
 */
export function sleepSampleToSessionInput(
    userId: string,
    sample: HealthSampleInput,
): CreateSleepSessionInput | null {
    if (sample.kind !== 'sleep') return null;
    if (typeof sample.startTime !== 'string') return null;
    const startMs = Date.parse(sample.startTime);
    if (Number.isNaN(startMs)) return null;

    const quality = clamp(sample.quality, 1, MAX_QUALITY);
    const disturbances = clamp(sample.disturbances, 0, MAX_DISTURBANCES);

    return {
        userId,
        startTime: sample.startTime,
        endTime: sample.endTime ?? null,
        quality: quality ?? null,
        disturbances: disturbances ?? 0,
        source: sample.source ?? 'apple_health',
    };
}

/**
 * Summary returned to the caller after an ingest. Pure-shaped (no infra types) so
 * the route can serialize it directly and tests can assert it.
 */
export interface HealthSyncResultSummary {
    /** Total samples persisted to the archive. */
    persisted: number;
    /** Sleep sessions materialized (→ twin) from sleep samples. */
    sleepSessionsCreated: number;
    /** Whether autonomic signals (HRV / resting-HR) refined the latest sleep. */
    autonomicRefined: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE (wires the pure mapping to Prisma + the existing SleepService)
// ─────────────────────────────────────────────────────────────────────────────

/** The slice of SleepService this ingestion depends on (keeps it test-seamable). */
export interface SleepSessionCreator {
    createSession(input: CreateSleepSessionInput): Promise<{ id: string }>;
}

/** The slice of the Prisma client this ingestion depends on. */
export interface HealthSampleStore {
    healthSample: {
        createMany(args: { data: unknown[] }): Promise<{ count: number }>;
    };
}

export class HealthSyncService {
    constructor(
        private readonly store: HealthSampleStore,
        private readonly sleep: SleepSessionCreator,
    ) {}

    /**
     * Persist a validated batch and wire its sleep + autonomic signals into the
     * twin. `samples` MUST already be schema-validated/bounded by the route (this
     * method applies the same clamps defensively but assumes the size cap held).
     */
    async ingest(userId: string, samples: HealthSampleInput[]): Promise<HealthSyncResultSummary> {
        // 1. Persist the raw archive (append-only). One createMany, not N inserts.
        const rows = samples.map((s) => ({
            userId,
            kind: s.kind,
            source: s.source ?? 'apple_health',
            startTime: new Date(s.startTime),
            endTime: s.endTime ? new Date(s.endTime) : null,
            value: finite(s.value) ?? null,
            unit: s.unit ?? null,
            quality: clamp(s.quality, 0, MAX_QUALITY) ?? null,
            disturbances: clamp(s.disturbances, 0, MAX_DISTURBANCES) ?? null,
        }));
        const { count } = rows.length
            ? await this.store.healthSample.createMany({ data: rows })
            : { count: 0 };

        // 2. Materialize sleep samples → SleepSession (→ existing twin path).
        //    Autonomic signals refine the MOST RECENT sleep sample only, so the
        //    refinement nudges the freshest avgSleepQuality the materializer
        //    overwrites (older nights still flow through verbatim).
        const signals = extractAutonomicSignals(samples);
        const sleepInputs = samples
            .map((s) => sleepSampleToSessionInput(userId, s))
            .filter((x): x is CreateSleepSessionInput => x !== null)
            // chronological so the latest is last (refined) and the materializer's
            // last-write-wins avgSleepQuality reflects the most recent night.
            .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

        let autonomicRefined = false;
        const hasSignals = signals.avgHrvMs !== undefined || signals.avgRestingHrBpm !== undefined;
        for (let i = 0; i < sleepInputs.length; i++) {
            const isLatest = i === sleepInputs.length - 1;
            let input = sleepInputs[i];
            if (isLatest && hasSignals) {
                const refined = refineSleepWithAutonomicSignals(input, signals);
                if (refined !== input) {
                    input = refined;
                    autonomicRefined = true;
                }
            }
            // createSession publishes sleep.session-logged → state-service twin.
            await this.sleep.createSession(input);
        }

        return {
            persisted: count,
            sleepSessionsCreated: sleepInputs.length,
            autonomicRefined,
        };
    }
}
