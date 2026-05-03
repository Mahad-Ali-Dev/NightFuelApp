-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_foodb_columns
-- Date: 2026-02-26
-- Purpose: Add missing columns to food_items that were omitted from the
--          initial migration. Uses ADD COLUMN IF NOT EXISTS everywhere so
--          this is SAFE to run on a DB that already has data.
-- ─────────────────────────────────────────────────────────────────────────────

-- region (nullable — 'us' | 'eu' | 'ap' | null for international)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "region" TEXT;

-- cuisine_tags (array, defaults to empty)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "cuisine_tags" TEXT[] NOT NULL DEFAULT '{}';

-- updated_at — Prisma @updatedAt needs this. DEFAULT NOW() makes it safe to
-- add to a table that already has rows (no NOT NULL violation).
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- fiber (g per 100g serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "fiber" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- sugar (g per 100g serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "sugar" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- sodium_mg (mg per 100g serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "sodium_mg" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- source — where this food came from: FOODB | OPENFOODFACTS | CUSTOM
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'OPENFOODFACTS';

-- food_group — FoodDB category: 'Fruits', 'Vegetables', 'Aquatic foods', etc.
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "food_group" TEXT;

-- Index on name for fast ILIKE searches (replaces trigram for broad compat)
CREATE INDEX IF NOT EXISTS "food_items_name_idx" ON "food_items"("name");

-- Index on food_group for filter queries
CREATE INDEX IF NOT EXISTS "food_items_food_group_idx" ON "food_items"("food_group");

-- Index on source for filter queries
CREATE INDEX IF NOT EXISTS "food_items_source_idx" ON "food_items"("source");

-- Backfill updated_at for any existing rows (set to created_at)
UPDATE "food_items"
  SET "updated_at" = "created_at"
  WHERE "updated_at" = NOW()
    AND "created_at" < NOW() - INTERVAL '1 minute';
