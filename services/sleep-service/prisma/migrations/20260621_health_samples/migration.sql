-- Human-readable migration record for WEARABLE / HEALTH-APP SAMPLE INGESTION
-- (watch + health-sync). One row per sample reported by Apple Health / Health
-- Connect / a BLE wearable, persisted by POST /v1/sleep/health-sync.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- `prisma db push --accept-data-loss` on service restart (owner-gated), mirroring
-- the F28 user-service `20260621_period_log` precedent (and the sleep-service
-- Dockerfile is switched to `db push` in lockstep with this file). It is NOT run
-- by `prisma migrate`.
--
-- SAFETY: this only CREATES a brand-new table (health_samples). No existing table
-- is altered and no existing row is touched, so the apply is data-loss-free. The
-- table starts EMPTY for everyone. A user who never syncs has zero rows here, the
-- ingestion endpoint is never called, no sleep.session-logged event is produced
-- from sync, and the digital twin (avgSleepQuality / fatigueLevel on the
-- state-service userState row) is byte-identical to before this feature.
--
-- HOW SYNCED DATA REACHES THE TWIN: ingested SLEEP samples are ALSO written as
-- normal SleepSession rows via the existing SleepService.createSession(), which
-- publishes nightfuel:sleep:session-logged. state-service's existing
-- handleSleepLogged folds that into avgSleepQuality / fatigueLevel exactly as a
-- manually-logged sleep does — the synced path reuses the manual path, it is not
-- a dead store. HRV / resting-HR refine the synthesized sleep sample's
-- quality/disturbances BEFORE that publish (see health-sync.service.ts), so they
-- nudge fatigue through the same single materializer code path (no new event,
-- no materializer change).

-- CreateTable: health_samples — append-only archive of raw wearable readings.
CREATE TABLE "health_samples" (
    "id"           TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "source"       TEXT NOT NULL DEFAULT 'apple_health',
    "start_time"   TIMESTAMP(3) NOT NULL,
    "end_time"     TIMESTAMP(3),
    "value"        DOUBLE PRECISION,
    "unit"         TEXT,
    "quality"      INTEGER,
    "disturbances" INTEGER,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_samples_pkey" PRIMARY KEY ("id")
);

-- Index: history + per-kind queries are scoped by (user_id, kind, start_time).
CREATE INDEX "health_samples_user_id_kind_start_time_idx"
    ON "health_samples"("user_id", "kind", "start_time");

-- IDEMPOTENCY (data-integrity HIGH #3): a replay / re-sync of the SAME reading
-- must NOT duplicate rows (which would re-materialize SleepSessions and RE-FIRE
-- nightfuel:sleep:session-logged into the twin). A reading is uniquely keyed by
-- (user_id, kind, start_time, source). The ingestion path uses
-- createMany({ skipDuplicates: true }) so an overlapping re-ingest silently
-- no-ops the dupes instead of inserting them.
--
-- SAFE TO ADD: this table is brand-new and UNAPPLIED (it is created above in this
-- same record, starts EMPTY for everyone, and is applied via the owner-gated
-- `prisma db push` on service restart — NOT `prisma migrate`). Because no rows
-- exist yet, adding the UNIQUE constraint can never fail on pre-existing
-- duplicates. db push reads the @@unique from schema.prisma and creates this
-- index in lockstep; this DDL documents that delta.
CREATE UNIQUE INDEX "health_samples_user_id_kind_start_time_source_key"
    ON "health_samples"("user_id", "kind", "start_time", "source");
