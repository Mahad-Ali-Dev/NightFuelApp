-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_meal_log_idempotency_key
-- Date: 2026-06-20
-- Purpose: HIGH #6 — make POST /v1/meals/log idempotent. A client retry /
--          double-tap that re-sends the SAME idempotency key for the SAME user
--          must collapse onto the existing meal_logs row (one row, one
--          meal-logged event) instead of double-logging.
--
--          Adds a NULLABLE "idempotency_key" column and a UNIQUE constraint on
--          (user_id, idempotency_key). Postgres treats NULLs as DISTINCT in a
--          unique index, so every legacy row and every keyless ad-hoc log keeps
--          idempotency_key = NULL and never collides — normal distinct logging
--          is completely unaffected. Only two logs that BOTH carry the SAME
--          non-NULL key for the SAME user are deduped.
--
--          Both statements are IF NOT EXISTS / guarded so this is SAFE to re-run
--          on a DB that already has the column/constraint (idempotent migration).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── column ───────────────────────────────────────────────────────────────────
ALTER TABLE "meal_logs"
    ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- ── unique constraint (user_id, idempotency_key) ─────────────────────────────
-- Implemented as a UNIQUE INDEX (IF NOT EXISTS) rather than ADD CONSTRAINT so the
-- migration is safely re-runnable. Prisma maps @@unique([userId, idempotencyKey])
-- onto this index name.
CREATE UNIQUE INDEX IF NOT EXISTS "meal_logs_user_id_idempotency_key_key"
    ON "meal_logs"("user_id", "idempotency_key");
