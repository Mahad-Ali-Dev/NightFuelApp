-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20240101000000_init  (complete idempotent baseline)
-- All DDL uses IF NOT EXISTS / DO-EXCEPTION so it is SAFE to run on a
-- database that already has tables from a previous `prisma db push`.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_trgm is useful for fuzzy search; safe to create if missing
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── food_items ───────────────────────────────────────────────────────────────
-- Full schema including all FoodDB columns added later.
-- New installs get every column at once; existing DBs hit IF NOT EXISTS and
-- keep their data untouched.
CREATE TABLE IF NOT EXISTS "food_items" (
    "id"             TEXT             NOT NULL,
    "name"           TEXT             NOT NULL,
    "calories"       DOUBLE PRECISION NOT NULL,
    "protein"        DOUBLE PRECISION NOT NULL,
    "carbs"          DOUBLE PRECISION NOT NULL,
    "fat"            DOUBLE PRECISION NOT NULL,
    "fiber"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sugar"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sodium_mg"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serving_size"   TEXT             NOT NULL DEFAULT '100g',
    "glycemic_index" INTEGER,
    "is_vegan"       BOOLEAN          NOT NULL DEFAULT false,
    "is_gluten_free" BOOLEAN          NOT NULL DEFAULT false,
    "is_halal"       BOOLEAN          NOT NULL DEFAULT false,
    "region"         TEXT,
    "cuisine_tags"   TEXT[]           NOT NULL DEFAULT '{}',
    "source"         TEXT             NOT NULL DEFAULT 'OPENFOODFACTS',
    "food_group"     TEXT,
    "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "food_items_name_idx"       ON "food_items"("name");
CREATE INDEX IF NOT EXISTS "food_items_food_group_idx" ON "food_items"("food_group");
CREATE INDEX IF NOT EXISTS "food_items_source_idx"     ON "food_items"("source");

-- ── meal_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "meal_logs" (
    "id"             TEXT             NOT NULL,
    "user_id"        TEXT             NOT NULL,
    "logged_at"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meal_type"      "MealType"       NOT NULL,
    "food_items"     JSONB            NOT NULL,
    "total_calories" DOUBLE PRECISION NOT NULL,
    "total_protein"  DOUBLE PRECISION NOT NULL,
    "total_carbs"    DOUBLE PRECISION NOT NULL,
    "total_fat"      DOUBLE PRECISION NOT NULL,
    "is_adherent"    BOOLEAN          NOT NULL,
    "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "meal_logs_user_id_logged_at_idx"
    ON "meal_logs"("user_id", "logged_at" DESC);

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
