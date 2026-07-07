/**
 * ai_usage_logs retention sweep regression suite (F34 #17 / GDPR Art. 5(1)(e)).
 *
 * Locks the DEFAULT-OFF, configurable TTL purge guarantees for
 * AiUsageRetentionWorker.sweep against a tiny in-memory Prisma fake (no DB in CI):
 *
 *   1. NO-OP WHEN DISABLED — AI_USAGE_RETENTION_DAYS <= 0 / unset deletes NOTHING
 *      and never queries Prisma; start() schedules no interval.
 *   2. DELETES ONLY STALE ROWS — only ai_usage_logs whose createdAt is strictly
 *      older than (now - retentionDays) are deleted; rows on/after the cutoff
 *      survive. now is injected for determinism.
 *   3. IDEMPOTENT — a second sweep deletes 0 more.
 *   4. NEVER touches user-valuable history — the worker only ever references the
 *      aiUsageLog model (asserted by the fake: any other model access would throw).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { AiUsageRetentionWorker } from '../src/retention.worker';

const NOW = new Date('2026-06-20T00:00:00.000Z');
const DAY = 86_400_000;

function makeFakePrisma(logs: Array<{ id: string; createdAt: Date }>) {
    const state = { aiUsageLogs: [...logs] };

    const aiUsageLog = {
        findMany: jest.fn(({ where, take }: any) => {
            const lt: Date = where.createdAt.lt;
            const matched = state.aiUsageLogs
                .filter((r) => r.createdAt.getTime() < lt.getTime())
                .slice(0, take)
                .map((r) => ({ id: r.id }));
            return Promise.resolve(matched);
        }),
        deleteMany: jest.fn(({ where }: any) => {
            const ids: string[] = where.id.in;
            const before = state.aiUsageLogs.length;
            state.aiUsageLogs = state.aiUsageLogs.filter((r) => !ids.includes(r.id));
            return Promise.resolve({ count: before - state.aiUsageLogs.length });
        }),
    };

    // A Proxy that throws on ANY model access other than aiUsageLog — proves the
    // sweep NEVER touches user-valuable history tables (daily_progress, streaks,
    // body_metrics, hydration_logs, performance_reports).
    const prisma = new Proxy(
        { aiUsageLog },
        {
            get(target: any, prop: string) {
                if (prop === 'aiUsageLog') return target.aiUsageLog;
                throw new Error(`retention sweep must NOT touch model "${String(prop)}"`);
            },
        },
    );

    return { prisma: prisma as any, state, aiUsageLog };
}

describe('AiUsageRetentionWorker.sweep — DEFAULT-OFF', () => {
    it('is a NO-OP when AI_USAGE_RETENTION_DAYS is 0 (never queries Prisma)', async () => {
        const { prisma, state, aiUsageLog } = makeFakePrisma([
            { id: 'old', createdAt: new Date(NOW.getTime() - 999 * DAY) },
        ]);
        const worker = new AiUsageRetentionWorker(prisma, { AI_USAGE_RETENTION_DAYS: 0 });

        const deleted = await worker.sweep(NOW);

        expect(deleted).toBe(0);
        expect(aiUsageLog.findMany).not.toHaveBeenCalled();
        expect(aiUsageLog.deleteMany).not.toHaveBeenCalled();
        expect(state.aiUsageLogs).toHaveLength(1);
    });

    it('start() schedules NO interval when disabled', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const { prisma } = makeFakePrisma([]);
        new AiUsageRetentionWorker(prisma, { AI_USAGE_RETENTION_DAYS: 0 }).start();
        expect(setIntervalSpy).not.toHaveBeenCalled();
        setIntervalSpy.mockRestore();
    });
});

describe('AiUsageRetentionWorker.sweep — ENABLED', () => {
    it('deletes ONLY rows strictly older than the cutoff and touches no other model', async () => {
        // retentionDays=90 → cutoff = 2026-03-22T00:00Z.
        const { prisma, state } = makeFakePrisma([
            { id: 'ancient', createdAt: new Date('2026-01-01T00:00:00.000Z') }, // delete
            { id: 'onCutoff', createdAt: new Date('2026-03-22T00:00:00.000Z') }, // == cutoff → KEEP
            { id: 'fresh', createdAt: new Date('2026-06-19T00:00:00.000Z') }, // keep
        ]);
        const worker = new AiUsageRetentionWorker(prisma, { AI_USAGE_RETENTION_DAYS: 90 });

        const deleted = await worker.sweep(NOW);

        expect(deleted).toBe(1);
        expect(state.aiUsageLogs.map((r) => r.id).sort()).toEqual(['fresh', 'onCutoff']);
    });

    it('is idempotent: a second sweep deletes 0 more', async () => {
        const { prisma, state } = makeFakePrisma([
            { id: 'ancient', createdAt: new Date('2026-01-01T00:00:00.000Z') },
            { id: 'fresh', createdAt: new Date('2026-06-19T00:00:00.000Z') },
        ]);
        const worker = new AiUsageRetentionWorker(prisma, { AI_USAGE_RETENTION_DAYS: 90 });

        expect(await worker.sweep(NOW)).toBe(1);
        expect(await worker.sweep(NOW)).toBe(0);
        expect(state.aiUsageLogs.map((r) => r.id)).toEqual(['fresh']);
    });
});
