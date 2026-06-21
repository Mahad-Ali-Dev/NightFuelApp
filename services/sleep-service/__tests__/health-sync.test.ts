/**
 * Regression suite — sleep-service HEALTH-SYNC ingestion + DIGITAL-TWIN wiring
 * (src/health-sync.service.ts).
 *
 * Two halves are locked here:
 *
 *   (A) The PURE twin mapping — extractAutonomicSignals / sleepSampleToSessionInput
 *       / refineSleepWithAutonomicSignals. These are plain data→data transforms
 *       (no Prisma, no event bus), so they run directly on the babel-jest gate.
 *       This is the load-bearing proof that synced HRV / resting-HR actually MOVE
 *       the inputs the decision-engine reads (avgSleepQuality / fatigueLevel) —
 *       via the synthesized sleep sample that flows through the existing
 *       sleep.session-logged → materializer path.
 *
 *   (B) HealthSyncService.ingest happy-path — over a FAKE prisma + a FAKE
 *       SleepService, it (1) persists every sample once via createMany, and
 *       (2) materializes each sleep sample through createSession (the existing
 *       twin path), refining the latest with autonomic signals. No real infra is
 *       touched (mirrors state-finite.test.ts driving the materializer with a
 *       fake Prisma).
 *
 * BYTE-IDENTICAL invariant: a batch with NO autonomic signals refines nothing —
 * a synced sleep behaves exactly like a manual sleep log.
 */
import {
    extractAutonomicSignals,
    refineSleepWithAutonomicSignals,
    sleepSampleToSessionInput,
    HealthSyncService,
    type HealthSampleInput,
    type HealthSampleStore,
    type SleepSessionCreator,
} from '../src/health-sync.service';

const USER = 'user-1';

// ── (A) PURE: extractAutonomicSignals ────────────────────────────────────────
describe('extractAutonomicSignals', () => {
    it('averages HRV and resting-HR samples; ignores other kinds', () => {
        const samples: HealthSampleInput[] = [
            { kind: 'hrv', startTime: '2026-06-20T08:00:00.000Z', value: 40 },
            { kind: 'hrv', startTime: '2026-06-20T08:05:00.000Z', value: 60 },
            { kind: 'restingHeartRate', startTime: '2026-06-20T08:00:00.000Z', value: 70 },
            { kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: 5000 },
        ];
        expect(extractAutonomicSignals(samples)).toEqual({ avgHrvMs: 50, avgRestingHrBpm: 70 });
    });

    it('returns an empty object when no autonomic samples are present', () => {
        const samples: HealthSampleInput[] = [
            { kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: 5000 },
        ];
        expect(extractAutonomicSignals(samples)).toEqual({});
    });

    it('drops non-finite readings before averaging', () => {
        const samples: HealthSampleInput[] = [
            { kind: 'hrv', startTime: '2026-06-20T08:00:00.000Z', value: 60 },
            { kind: 'hrv', startTime: '2026-06-20T08:05:00.000Z', value: NaN },
        ];
        expect(extractAutonomicSignals(samples)).toEqual({ avgHrvMs: 60 });
    });
});

// ── (A) PURE: sleepSampleToSessionInput ──────────────────────────────────────
describe('sleepSampleToSessionInput', () => {
    it('maps a sleep sample to a CreateSleepSessionInput with clamped fields', () => {
        const input = sleepSampleToSessionInput(USER, {
            kind: 'sleep',
            startTime: '2026-06-20T23:00:00.000Z',
            endTime: '2026-06-21T07:00:00.000Z',
            quality: 8,
            disturbances: 2,
            source: 'apple_health',
        });
        expect(input).toEqual({
            userId: USER,
            startTime: '2026-06-20T23:00:00.000Z',
            endTime: '2026-06-21T07:00:00.000Z',
            quality: 8,
            disturbances: 2,
            source: 'apple_health',
        });
    });

    it('returns null for a non-sleep sample', () => {
        expect(
            sleepSampleToSessionInput(USER, { kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: 5000 }),
        ).toBeNull();
    });

    it('returns null for an unparseable startTime', () => {
        expect(
            sleepSampleToSessionInput(USER, { kind: 'sleep', startTime: 'not-a-date' }),
        ).toBeNull();
    });

    it('clamps an out-of-range quality into the SleepSession 1..10 bound', () => {
        const input = sleepSampleToSessionInput(USER, {
            kind: 'sleep',
            startTime: '2026-06-20T23:00:00.000Z',
            quality: 99,
        });
        expect(input?.quality).toBe(10);
    });
});

// ── (A) PURE: refineSleepWithAutonomicSignals (the twin-move proof) ───────────
describe('refineSleepWithAutonomicSignals', () => {
    const base = {
        userId: USER,
        startTime: '2026-06-20T23:00:00.000Z',
        endTime: '2026-06-21T07:00:00.000Z',
        quality: 7,
        disturbances: 0,
        source: 'apple_health',
    };

    it('NO signals → input returned UNCHANGED (synced == manual log)', () => {
        const out = refineSleepWithAutonomicSignals(base, {});
        expect(out).toBe(base);
    });

    it('neutral HRV + neutral resting-HR → no change (delta 0)', () => {
        const out = refineSleepWithAutonomicSignals(base, { avgHrvMs: 60, avgRestingHrBpm: 60 });
        expect(out).toBe(base);
    });

    it('LOW HRV (suppressed recovery) LOWERS quality and pushes disturbances PAST the fatigue threshold', () => {
        // 20ms is HRV_SPAN below neutral → -MAX_QUALITY_ADJUST (2) on quality.
        const out = refineSleepWithAutonomicSignals(base, { avgHrvMs: 20 });
        expect(out.quality).toBe(5); // 7 - 2
        // Strain must cross the materializer's `disturbances > 3 → +fatigue` gate,
        // otherwise fatigue would move the WRONG way (decrement). > 3.
        expect(out.disturbances).toBeGreaterThan(3);
    });

    it('HIGH resting HR (strain) LOWERS quality and pushes disturbances PAST the fatigue threshold', () => {
        // 80bpm is RESTING_HR_SPAN above neutral → -2 quality.
        const out = refineSleepWithAutonomicSignals(base, { avgRestingHrBpm: 80 });
        expect(out.quality).toBe(5);
        expect(out.disturbances).toBeGreaterThan(3);
    });

    it('NULL quality (the REAL platform path) is seeded to a neutral baseline and still refines', () => {
        // The device adapter can emit sleep with no quality; refinement must NOT
        // bail (the old dead no-op) — it seeds 7 and moves from there.
        const noQuality = { ...base, quality: null as number | null };
        const worse = refineSleepWithAutonomicSignals(noQuality, { avgHrvMs: 20 });
        expect(worse.quality).toBe(5); // seeded 7 → 7 - 2
        expect(worse.disturbances).toBeGreaterThan(3);
        const better = refineSleepWithAutonomicSignals(noQuality, { avgHrvMs: 100 });
        expect(better.quality).toBeGreaterThan(7); // seeded 7 → raised
    });

    it('refined quality is floored at 1 (never 0) so it never 400s the decision-engine', () => {
        // Even with extreme strain on the lowest base, the quality the twin/engine
        // sees stays >= 1 (decision-engine userStateSchema requires min(1)).
        const low = { ...base, quality: 1 };
        const out = refineSleepWithAutonomicSignals(low, { avgHrvMs: 0, avgRestingHrBpm: 200 });
        expect(out.quality).toBeGreaterThanOrEqual(1);
    });

    it('HIGH HRV (good recovery) RAISES quality and does NOT add a disturbance', () => {
        const out = refineSleepWithAutonomicSignals(base, { avgHrvMs: 100 });
        expect(out.quality).toBeGreaterThan(7);
        expect(out.disturbances).toBe(0); // recovery never fabricates a disturbance
    });

    it('the quality adjustment is clamped to ±2 even for extreme signals', () => {
        const worse = refineSleepWithAutonomicSignals(base, { avgHrvMs: 0, avgRestingHrBpm: 200 });
        // combined delta would be huge negative; clamped to -2 → quality 5.
        expect(worse.quality).toBe(5);
        const better = refineSleepWithAutonomicSignals(base, { avgHrvMs: 300, avgRestingHrBpm: 30 });
        expect(better.quality).toBe(9); // 7 + 2 (clamped)
    });

    it('refined quality never escapes the 0..10 scale', () => {
        const low = { ...base, quality: 1 };
        const out = refineSleepWithAutonomicSignals(low, { avgHrvMs: 0 });
        expect(out.quality).toBeGreaterThanOrEqual(0);
        expect(out.quality).toBeLessThanOrEqual(10);
    });
});

// ── (B) HealthSyncService.ingest happy-path over fakes ───────────────────────
function makeFakes() {
    const createManyCalls: unknown[][] = [];
    const createdSessions: any[] = [];
    const store: HealthSampleStore = {
        healthSample: {
            createMany: async ({ data }) => {
                createManyCalls.push(data as unknown[]);
                return { count: (data as unknown[]).length };
            },
        },
    };
    const sleep: SleepSessionCreator = {
        createSession: async (input) => {
            createdSessions.push(input);
            return { id: `s-${createdSessions.length}` };
        },
    };
    return { store, sleep, createManyCalls, createdSessions };
}

describe('HealthSyncService.ingest', () => {
    it('persists every sample once (single createMany) and reports the count', async () => {
        const { store, sleep, createManyCalls } = makeFakes();
        const svc = new HealthSyncService(store, sleep);
        const samples: HealthSampleInput[] = [
            { kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: 5000 },
            { kind: 'restingHeartRate', startTime: '2026-06-20T08:00:00.000Z', value: 58 },
        ];
        const res = await svc.ingest(USER, samples);
        expect(createManyCalls).toHaveLength(1);
        expect(createManyCalls[0]).toHaveLength(2);
        expect(res.persisted).toBe(2);
        expect(res.sleepSessionsCreated).toBe(0);
        expect(res.autonomicRefined).toBe(false);
    });

    it('materializes sleep samples THROUGH createSession (the existing twin path)', async () => {
        const { store, sleep, createdSessions } = makeFakes();
        const svc = new HealthSyncService(store, sleep);
        const samples: HealthSampleInput[] = [
            { kind: 'sleep', startTime: '2026-06-19T23:00:00.000Z', endTime: '2026-06-20T07:00:00.000Z', quality: 6 },
            { kind: 'sleep', startTime: '2026-06-20T23:00:00.000Z', endTime: '2026-06-21T07:00:00.000Z', quality: 8 },
        ];
        const res = await svc.ingest(USER, samples);
        expect(res.sleepSessionsCreated).toBe(2);
        expect(createdSessions).toHaveLength(2);
        // Chronological order: the latest night (quality 8) is materialized LAST,
        // so the materializer's last-write-wins avgSleepQuality reflects it.
        expect(createdSessions[0].startTime).toBe('2026-06-19T23:00:00.000Z');
        expect(createdSessions[1].startTime).toBe('2026-06-20T23:00:00.000Z');
    });

    it('refines the LATEST sleep with autonomic signals (HRV/resting-HR move the twin)', async () => {
        const { store, sleep, createdSessions } = makeFakes();
        const svc = new HealthSyncService(store, sleep);
        const samples: HealthSampleInput[] = [
            { kind: 'sleep', startTime: '2026-06-20T23:00:00.000Z', endTime: '2026-06-21T07:00:00.000Z', quality: 7, disturbances: 0 },
            { kind: 'hrv', startTime: '2026-06-21T07:00:00.000Z', value: 20 }, // low → strain
            { kind: 'restingHeartRate', startTime: '2026-06-21T07:00:00.000Z', value: 80 }, // high → strain
        ];
        const res = await svc.ingest(USER, samples);
        expect(res.autonomicRefined).toBe(true);
        // The single sleep session was refined DOWN (lower quality, +disturbance),
        // which the existing materializer turns into higher fatigue.
        expect(createdSessions[0].quality).toBeLessThan(7);
        expect(createdSessions[0].disturbances).toBeGreaterThanOrEqual(1);
    });

    it('ADAPTER-SHAPE strain night (quality null) refines DOWN past the fatigue threshold', async () => {
        // Mirrors the REAL device path: the collapsed sleep night reaches the
        // backend with a quality (synthesized client-side), but even if it were
        // null the null-safe refinement seeds a neutral baseline. Strain signals
        // (low HRV + high resting-HR) must drive quality DOWN and disturbances > 3,
        // which the materializer turns into HIGHER fatigue.
        const { store, sleep, createdSessions } = makeFakes();
        const svc = new HealthSyncService(store, sleep);
        const samples: HealthSampleInput[] = [
            // quality intentionally null — the adapter shape before synthesis.
            { kind: 'sleep', startTime: '2026-06-20T23:00:00.000Z', endTime: '2026-06-21T07:00:00.000Z', quality: null },
            { kind: 'hrv', startTime: '2026-06-21T07:00:00.000Z', value: 20 },
            { kind: 'restingHeartRate', startTime: '2026-06-21T07:00:00.000Z', value: 85 },
        ];
        const res = await svc.ingest(USER, samples);
        expect(res.autonomicRefined).toBe(true);
        expect(createdSessions[0].quality).toBeGreaterThanOrEqual(1); // never 0 → engine-safe
        expect(createdSessions[0].quality).toBeLessThan(7); // seeded 7, refined down
        expect(createdSessions[0].disturbances).toBeGreaterThan(3); // → materializer raises fatigue
    });

    it('a sleep-only batch with NO autonomic signals does NOT refine (byte-identical to manual)', async () => {
        const { store, sleep, createdSessions } = makeFakes();
        const svc = new HealthSyncService(store, sleep);
        const samples: HealthSampleInput[] = [
            { kind: 'sleep', startTime: '2026-06-20T23:00:00.000Z', endTime: '2026-06-21T07:00:00.000Z', quality: 7, disturbances: 1 },
        ];
        const res = await svc.ingest(USER, samples);
        expect(res.autonomicRefined).toBe(false);
        expect(createdSessions[0].quality).toBe(7);
        expect(createdSessions[0].disturbances).toBe(1);
    });

    it('an empty-of-sleep batch creates no sessions but still persists', async () => {
        const { store, sleep, createdSessions } = makeFakes();
        const svc = new HealthSyncService(store, sleep);
        const res = await svc.ingest(USER, [
            { kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: 5000 },
        ]);
        expect(createdSessions).toHaveLength(0);
        expect(res.persisted).toBe(1);
    });
});
