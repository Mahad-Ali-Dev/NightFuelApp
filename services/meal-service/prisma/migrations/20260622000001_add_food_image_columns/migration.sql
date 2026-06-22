-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_food_image_columns
-- Date: 2026-06-22
-- Purpose: Add the Open Food Facts photo + license-credit columns to
--          food_items. `image_url` points at an openly-licensed product image
--          (Open Food Facts, ODbL/CC-BY-SA); `image_attribution` carries the
--          credit string we must display/retain to honor that license.
--
--          Both are NULLABLE so legacy FooDB rows (no photo) and CUSTOM foods
--          stay valid. This repo applies schema via `prisma db push`; this file
--          is the human-readable record of that change. Uses
--          ADD COLUMN IF NOT EXISTS so it is SAFE to run on a DB that already
--          has data (and idempotent on re-run).
-- ─────────────────────────────────────────────────────────────────────────────

-- image_url — openly-licensed food photo (nullable; NULL for photo-less rows)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "image_url" TEXT;

-- image_attribution — license credit string to display alongside image_url
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "image_attribution" TEXT;
