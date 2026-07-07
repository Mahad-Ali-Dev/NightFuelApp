-- Human-readable migration record for the "share cycle with partner" feature
-- (Period P3 tail): a user-initiated, revocable, opaque-code grant that lets a
-- partner see a READ-ONLY, SANITIZED cycle summary (current phase + next-period /
-- fertile-window PREDICTIONS only) — never the raw symptom / discharge / sexual-
-- activity / notes logs.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- `prisma db push --accept-data-loss` on service restart (owner-gated), mirroring
-- the 20260619_user_isprivate / 20260621_cycle_tracker / 20260621_period_log
-- precedents. It is NOT run by `prisma migrate`.
--
-- SAFETY: this only CREATES a brand-new table (cycle_shares). No existing table is
-- altered and no existing row is touched, so the apply is data-loss-free. The
-- table starts EMPTY for everyone — no user has a share until they explicitly
-- generate one, so behaviour is byte-identical for every existing user.

-- CreateTable: cycle_shares — one row per generated partner-share grant.
CREATE TABLE "cycle_shares" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "scopes"     TEXT[] NOT NULL DEFAULT ARRAY['summary']::TEXT[],
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_shares_pkey" PRIMARY KEY ("id")
);

-- The opaque bearer code resolves to exactly one owner: a partner presents only
-- the code, so it MUST be globally unique. High-entropy (192-bit) generation makes
-- a collision astronomically unlikely; the app still retries on the P2002.
CREATE UNIQUE INDEX "cycle_shares_code_key" ON "cycle_shares"("code");

-- Owner-scoped lookups: "does this user have an active share?" (revoke + the
-- idempotent create both filter by user_id) and the account-deletion purge.
CREATE INDEX "cycle_shares_user_id_idx" ON "cycle_shares"("user_id");
