/**
 * health_samples retention sweep regression suite (F34 #17 / GDPR Art. 5(1)(e)).
 *
 * Locks the DEFAULT-OFF, configurable TTL purge guarantees for
 * SleepRetentionWorker.sweep against a tiny in-memory Prisma fake (no DB in CI):
 *
 *   1. NO-OP WHEN DISABLED — with HEALTH_SAMPLE_RETENTION_DAYS <= 0 / unset the
 *      sweep deletes NOTHING and never even queries Prisma (the byte-identical
 *      default-off path). start() likewise schedules no interval.
 *   2. DELETES ONLY STALE ROWS — when enabled, ONLY rows with startTime strictly
 *      older than (now - retentionDays) are deleted; rows on/after the cutoff
 *      survive. now is injected so the assertion is deterministic.
 *   3. IDEMPOTENT — a second sweep over the already-pruned table deletes 0 more.
 *
 * The fake implements just what sweep() touches: healthSample.findMany({ where:
 * { startTime: { lt } }, select:{id}, take }) and healthSample.deleteMany({ where:
 * { id: { in } } }) — the exact shapes the worker issues.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { SleepRetentionWorker } from '../src/retention.worker';

const NOW = new Date('2026-06-20T00:00:00.000Z');
const DAY = 86_400_000;

function makeFakePrisma(samples: Array<{ id: string; startTime: Date }>) {
    const state = { healthSamples: [...samples] };

    const healthSample = {
        findMany: jest.fn(({ where, take }: any) => {
            const lt: Date = where.startTime.lt;
            const matched = state.healthSamples
                .filter((r) => r.startTime.getTime() < lt.getTime())
                .slice(0, take)
                .map((r) => ({ id: r.id }));
            return Promise.resolve(matched);
        }),
        deleteMany: jest.fn(({ where }: any) => {
            const ids: string[] = where.id.in;
            const before = state.healthSamples.length;
            state.healthSamples = state.healthSamples.filter((r) => !ids.includes(r.id));
            return Promise.resolve({ count: before - state.healthSamples.length });
        }),
    };

    return { prisma: { healthSample } as any, state, healthSample };
}

describe('SleepRetentionWorker.sweep — DEFAULT-OFF', () => {
    it('is a NO-OP when HEALTH_SAMPLE_RETENTION_DAYS is 0 (never queries Prisma)', async () => {
        const { prisma, state, healthSample } = makeFakePrisma([
            { id: 'old', startTime: new Date(NOW.getTime() - 999 * DAY) },
        ]);
        const worker = new SleepRetentionWorker(prisma, { HEALTH_SAMPLE_RETENTION_DAYS: 0 });

        const deleted = await worker.sweep(NOW);

        expect(deleted).toBe(0);
        expect(healthSample.findMany).not.toHaveBeenCalled();
        expect(healthSample.deleteMany).not.toHaveBeenCalled();
        expect(state.healthSamples).toHaveLength(1); // untouched
    });

    it('is a NO-OP for a negative window too', async () => {
        const { prisma, healthSample } = makeFakePrisma([
            { id: 'old', startTime: new Date(NOW.getTime() - 999 * DAY) },
        ]);
        const worker = new SleepRetentionWorker(prisma, { HEALTH_SAMPLE_RETENTION_DAYS: -10 });

        expect(await worker.sweep(NOW)).toBe(0);
        expect(healthSample.deleteMany).not.toHaveBeenCalled();
    });

    it('start() schedules NO interval when disabled', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const { prisma } = makeFakePrisma([]);
        new SleepRetentionWorker(prisma, { HEALTH_SAMPLE_RETENTION_DAYS: 0 }).start();
        expect(setIntervalSpy).not.toHaveBeenCalled();
        setIntervalSpy.mockRestore();
    });
});

describe('SleepRetentionWorker.sweep — ENABLED', () => {
    it('deletes ONLY rows strictly older than the cutoff (now - retentionDays)', async () => {
        // retentionDays=30 → cutoff = 2026-05-21T00:00Z. older/onCutoff stay or go
        // per the strict `<` boundary.
        const { prisma, state } = makeFakePrisma([
            { id: 'ancient', startTime: new Date('2026-01-01T00:00:00.000Z') }, // older → delete
            { id: 'justOld', startTime: new Date('2026-05-20T23:59:59.000Z') }, // < cutoff → delete
            { id: 'onCutoff', startTime: new Date('2026-05-21T00:00:00.000Z') }, // == cutoff → KEEP (not < )
            { id: 'fresh', startTime: new Date('2026-06-19T00:00:00.000Z') }, // newer → keep
        ]);
        const worker = new SleepRetentionWorker(prisma, { HEALTH_SAMPLE_RETENTION_DAYS: 30 });

        const deleted = await worker.sweep(NOW);

        expect(deleted).toBe(2);
        expect(state.healthSamples.map((r) => r.id).sort()).toEqual(['fresh', 'onCutoff']);
    });

    it('is idempotent: a second sweep deletes 0 more', async () => {
        const { prisma, state } = makeFakePrisma([
            { id: 'ancient', startTime: new Date('2026-01-01T00:00:00.000Z') },
            { id: 'fresh', startTime: new Date('2026-06-19T00:00:00.000Z') },
        ]);
        const worker = new SleepRetentionWorker(prisma, { HEALTH_SAMPLE_RETENTION_DAYS: 30 });

        expect(await worker.sweep(NOW)).toBe(1);
        expect(await worker.sweep(NOW)).toBe(0); // tail already gone
        expect(state.healthSamples.map((r) => r.id)).toEqual(['fresh']);
    });
});
