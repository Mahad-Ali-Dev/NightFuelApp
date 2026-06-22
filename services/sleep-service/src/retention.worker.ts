import { PrismaClient } from './generated/prisma';
import { createLogger, retentionEnabled, retentionCutoff } from '@nightfuel/config';

const logger = createLogger('sleep-service:retention') as any;

// ── health_samples retention sweep (F34 #17 / GDPR Art. 5(1)(e)) ────────────────
// DEFAULT-OFF, configurable TTL purge of the ARCHIVAL health_samples table — the
// raw, append-only wearable/health-app archive ingested via POST
// /v1/sleep/health-sync. It is the clearest archival case in this service: every
// row is a duplicate of what the watch/phone reported, and the user-VALUABLE
// derived history (sleep_sessions) is materialized separately and is NEVER touched
// here.
//
// Gating: the sweep runs ONLY when HEALTH_SAMPLE_RETENTION_DAYS > 0. When the env
// is unset/0 (the default), `start()` no-ops — no interval is scheduled and no
// delete is ever issued, so the default deployment is byte-identical to before.
//
// Schedule: a setInterval firing once per ~24h, mirroring plan-service's
// PlanWorker (a long-lived interval started in index.ts). The first sweep runs one
// interval AFTER boot (not at boot) so startup stays lean.
//
// Delete semantics: deleteMany of rows whose `startTime` is strictly older than
// the cutoff (now - retentionDays). startTime is the sample's own event time (when
// the reading was taken) — the natural retention axis for an archive; createdAt
// (ingest time) is essentially the same for synced data. IDEMPOTENT: deleteMany
// never throws on zero matches and re-running deletes nothing new once the tail is
// gone. BOUNDED: each pass deletes at most DELETE_BATCH rows and loops until a pass
// clears fewer than the batch, so one nightly run can't lock the table on a huge
// backlog while still draining it over successive batches.

// Once per ~24h, matching the daily cadence the audit finding calls for.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Max rows deleted per deleteMany call; the sweep loops in batches so a large
// backlog drains across bounded statements instead of one giant locking delete.
const DELETE_BATCH = 5_000;

// Hard cap on batches per nightly run — safety stop so a pathological/never-
// draining state can't spin this loop unbounded (≈50M rows at DELETE_BATCH).
const MAX_BATCHES_PER_RUN = 10_000;

export class SleepRetentionWorker {
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly config: { HEALTH_SAMPLE_RETENTION_DAYS: number },
    ) {}

    /**
     * Start the daily sweep — but ONLY if retention is enabled. When
     * HEALTH_SAMPLE_RETENTION_DAYS <= 0 / unset this is a no-op: no interval, no
     * delete. Mirrors PlanWorker.start (idempotent; a second call no-ops).
     */
    start() {
        if (this.isRunning) return;

        if (!retentionEnabled(this.config.HEALTH_SAMPLE_RETENTION_DAYS)) {
            logger.info(
                'health_samples retention DISABLED (HEALTH_SAMPLE_RETENTION_DAYS unset/<=0) — no purge scheduled',
            );
            return;
        }

        this.isRunning = true;
        logger.info(
            { retentionDays: this.config.HEALTH_SAMPLE_RETENTION_DAYS },
            'health_samples retention sweep ENABLED (daily)',
        );

        // Daily cadence, first run one interval after boot. Errors are caught
        // inside sweep() so a failed pass never crashes the interval.
        setInterval(() => { void this.sweep(); }, SWEEP_INTERVAL_MS);
    }

    /**
     * Delete health_samples older than the cutoff. PUBLIC + returning the deleted
     * count so it is unit-testable directly (and a no-op-when-disabled guard is
     * locked in by a test). Safe to call manually/on a schedule; idempotent.
     *
     * @param now Reference instant (inject a fixed Date in tests; defaults to wall clock).
     * @returns   Total rows deleted this run (0 when disabled or nothing is stale).
     */
    async sweep(now: Date = new Date()): Promise<number> {
        const retentionDays = this.config.HEALTH_SAMPLE_RETENTION_DAYS;

        // Guard FIRST: disabled → never compute a cutoff, never delete.
        if (!retentionEnabled(retentionDays)) return 0;

        const cutoff = retentionCutoff(retentionDays, now);
        let totalDeleted = 0;

        try {
            for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                // deleteMany has no `take`; bound the statement by selecting the
                // ids of up to DELETE_BATCH stale rows, then delete exactly those.
                const stale = await this.prisma.healthSample.findMany({
                    where: { startTime: { lt: cutoff } },
                    select: { id: true },
                    take: DELETE_BATCH,
                });
                if (stale.length === 0) break;

                const { count } = await this.prisma.healthSample.deleteMany({
                    where: { id: { in: stale.map((r) => r.id) } },
                });
                totalDeleted += count;

                // Last partial batch → the stale tail is drained; stop.
                if (stale.length < DELETE_BATCH) break;
            }

            if (totalDeleted > 0) {
                logger.info(
                    { totalDeleted, cutoff: cutoff.toISOString(), retentionDays },
                    'health_samples retention sweep purged stale rows',
                );
            }
        } catch (err) {
            // A failed sweep must never crash the interval; log and move on.
            logger.error({ err, retentionDays }, 'health_samples retention sweep failed');
        }

        return totalDeleted;
    }
}
