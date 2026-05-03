-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_recipes_fasting
-- Date: 2026-02-26
-- Purpose: Add the recipes and fasting_logs tables that were present in the
--          Prisma schema but were missing from the initial migration file.
--          Both statements use CREATE TABLE IF NOT EXISTS so this is SAFE to
--          run on a DB that already has these tables (created by prisma db push
--          or by the rewritten init migration).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── recipes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recipes" (
    "id"             TEXT             NOT NULL,
    "title"          TEXT             NOT NULL,
    "description"    TEXT,
    "prep_time_mins" INTEGER          NOT NULL DEFAULT 0,
    "cook_time_mins" INTEGER          NOT NULL DEFAULT 0,
    "servings"       INTEGER          NOT NULL DEFAULT 1,
    "calories"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "protein"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ingredients"    JSONB            NOT NULL DEFAULT '[]',
    "instructions"   JSONB            NOT NULL DEFAULT '[]',
    "tags"           TEXT[]           NOT NULL DEFAULT '{}',
    "image"          TEXT,
    "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- ── fasting_logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fasting_logs" (
    "id"           TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "start_time"   TIMESTAMP(3) NOT NULL,
    "end_time"     TIMESTAMP(3),
    "target_hours" INTEGER      NOT NULL DEFAULT 16,
    "status"       TEXT         NOT NULL DEFAULT 'ACTIVE',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fasting_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fasting_logs_user_id_start_time_idx"
    ON "fasting_logs"("user_id", "start_time" DESC);
