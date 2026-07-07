import { PrismaClient } from './generated/prisma';
import { createLogger, retentionEnabled, retentionCutoff } from '@nightfuel/config';

const logger = createLogger('progress-service:retention') as any;

// ── ai_usage_logs retention sweep (F34 #17 / GDPR Art. 5(1)(e)) ─────────────────
// DEFAULT-OFF, configurable TTL purge of the ai_usage_logs table — the LLM
// cost/telemetry sink the ai-pipeline POSTs to (action, provider, token counts +
// createdAt). It is the clearest archival case in this service: pure operational
// telemetry, not user-valuable history. The other five progress tables
// (daily_progress, streaks, body_metrics, hydration_logs, performance_reports) are
// the user's own fitness HISTORY and are deliberately NEVER swept here — they are
// only ever deleted on user request (F36 erasure).
//
// Gating: runs ONLY when AI_USAGE_RETENTION_DAYS > 0. Unset/0 (the default) →
// start() no-ops (no interval, no delete), so the default deployment is unchanged.
//
// Schedule + semantics mirror sleep-service's SleepRetentionWorker exactly: a
// once-per-~24h setInterval started in index.ts, deleteMany of rows whose
// createdAt is strictly older than (now - retentionDays), drained in bounded
// batches, idempotent, and never crashing the interval on a failed pass.

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DELETE_BATCH = 5_000;
const MAX_BATCHES_PER_RUN = 10_000;

export class AiUsageRetentionWorker {
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly config: { AI_USAGE_RETENTION_DAYS: number },
    ) {}

    /**
     * Start the daily sweep — but ONLY if retention is enabled. When
     * AI_USAGE_RETENTION_DAYS <= 0 / unset this is a no-op: no interval, no
     * delete. Idempotent (a second call no-ops).
     */
    start() {
        if (this.isRunning) return;

        if (!retentionEnabled(this.config.AI_USAGE_RETENTION_DAYS)) {
            logger.info(
                'ai_usage_logs retention DISABLED (AI_USAGE_RETENTION_DAYS unset/<=0) — no purge scheduled',
            );
            return;
        }

        this.isRunning = true;
        logger.info(
            { retentionDays: this.config.AI_USAGE_RETENTION_DAYS },
            'ai_usage_logs retention sweep ENABLED (daily)',
        );

        setInterval(() => { void this.sweep(); }, SWEEP_INTERVAL_MS);
    }

    /**
     * Delete ai_usage_logs older than the cutoff. PUBLIC + returns the deleted
     * count so it is unit-testable directly. Idempotent; safe to call manually.
     *
     * @param now Reference instant (inject a fixed Date in tests; defaults to wall clock).
     * @returns   Total rows deleted this run (0 when disabled or nothing is stale).
     */
    async sweep(now: Date = new Date()): Promise<number> {
        const retentionDays = this.config.AI_USAGE_RETENTION_DAYS;

        // Guard FIRST: disabled → never compute a cutoff, never delete.
        if (!retentionEnabled(retentionDays)) return 0;

        const cutoff = retentionCutoff(retentionDays, now);
        const p = this.prisma as any;
        let totalDeleted = 0;

        try {
            for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                const stale = await p.aiUsageLog.findMany({
                    where: { createdAt: { lt: cutoff } },
                    select: { id: true },
                    take: DELETE_BATCH,
                });
                if (stale.length === 0) break;

                const { count } = await p.aiUsageLog.deleteMany({
                    where: { id: { in: stale.map((r: { id: string }) => r.id) } },
                });
                totalDeleted += count;

                if (stale.length < DELETE_BATCH) break;
            }

            if (totalDeleted > 0) {
                logger.info(
                    { totalDeleted, cutoff: cutoff.toISOString(), retentionDays },
                    'ai_usage_logs retention sweep purged stale rows',
                );
            }
        } catch (err) {
            logger.error({ err, retentionDays }, 'ai_usage_logs retention sweep failed');
        }

        return totalDeleted;
    }
}
