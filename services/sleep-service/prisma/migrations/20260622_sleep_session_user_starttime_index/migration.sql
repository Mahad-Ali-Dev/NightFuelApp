-- Human-readable migration record for MISSING DB INDEX (perf HIGH #1) on
-- sleep_sessions. Every read path in sleep-service filters by user_id and
-- orders by start_time DESC (the history list endpoint, the latest-session
-- lookup the digital-twin materializer uses). Before this index those queries
-- did a seq scan + in-memory sort of the whole table per user.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- the owner-gated `prisma db push` on service restart (mirroring the F31
-- sleep-service 20260621_health_samples precedent). db push reads the new
-- @@index([userId, startTime(sort: Desc)]) from schema.prisma and issues a
-- plain CREATE INDEX in lockstep; this DDL documents that delta. It is NOT run
-- by `prisma migrate deploy`.
--
-- SAFETY: this only CREATES an index. No table is altered and no row is touched,
-- so the apply is data-loss-free. Query results are byte-identical before and
-- after — only the access path (and latency) changes.
--
-- LARGE-TABLE NOTE: `prisma db push` emits a PLAIN `CREATE INDEX`, which takes a
-- SHARE lock and blocks concurrent writes to sleep_sessions while it builds. On
-- a small/empty table that is instant. On a large existing table the owner may
-- prefer to apply the equivalent `CREATE INDEX CONCURRENTLY` out-of-band (it
-- cannot run inside a transaction and is not what db push emits) and then let
-- db push see the index already present as a no-op.
CREATE INDEX "sleep_sessions_user_id_start_time_idx"
    ON "sleep_sessions"("user_id", "start_time" DESC);

-- Equivalent non-blocking form for a large existing table (run manually; not
-- emitted by db push):
--   CREATE INDEX CONCURRENTLY "sleep_sessions_user_id_start_time_idx"
--       ON "sleep_sessions"("user_id", "start_time" DESC);
