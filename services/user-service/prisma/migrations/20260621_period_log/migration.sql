-- Human-readable migration record for ongoing menstrual-PERIOD LOGGING + history.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- `prisma db push --accept-data-loss` on service restart (owner-gated), mirroring
-- the 20260619_user_isprivate and 20260621_cycle_tracker precedents. It is NOT
-- run by `prisma migrate`.
--
-- SAFETY: this only CREATES a brand-new table (period_logs). No existing table is
-- altered and no existing row is touched, so the apply is data-loss-free. The
-- table starts empty for everyone -> computeCycleStatsFromLogs([]) returns
-- null averages / UNKNOWN regularity, so non-tracking and existing users are
-- byte-identical (they continue to use the stored 28/14 template / UNKNOWN phase).
--
-- The new POST /v1/users/me/cycle/period endpoint appends rows here and then
-- RECOMPUTES the learned avg_cycle_length_days / avg_period_length_days /
-- cycle_regularity on user_profiles from this history (never the static template
-- once history exists), plus the derived UserStatus.cycle_phase.

-- CreateTable: period_logs — one row per logged period start (+ optional end)
CREATE TABLE "period_logs" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date"   DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_logs_pkey" PRIMARY KEY ("id")
);

-- Index: history queries + the per-user stats recompute are scoped by user_id.
CREATE INDEX "period_logs_user_id_idx" ON "period_logs"("user_id");

-- IDEMPOTENCY (data-integrity LOW #9): a double-submit of the SAME period start
-- must not duplicate a row (duplicate starts skew avg_cycle_length_days /
-- avg_period_length_days and the regularity classification). One logged start per
-- user per calendar day. logPeriod guards the create on this key and treats a
-- duplicate as a no-op (it still recomputes + returns the current stats).
--
-- SAFE TO ADD: this table is brand-new and UNAPPLIED (created above in this same
-- record, starts EMPTY for everyone, applied via the owner-gated `prisma db push`
-- on service restart — NOT `prisma migrate`). No rows exist yet, so the UNIQUE
-- constraint can never fail on pre-existing duplicates. db push reads the
-- @@unique from schema.prisma and creates this index in lockstep.
CREATE UNIQUE INDEX "period_logs_user_id_start_date_key"
    ON "period_logs"("user_id", "start_date");
