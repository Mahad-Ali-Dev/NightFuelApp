-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_food_micronutrient_columns
-- Date: 2026-06-22
-- Purpose: Add 10 per-serving micronutrient columns to food_items (USDA
--          FoodData Central, public domain). All NULLABLE — legacy FooDB rows
--          report none, and not every food reports every nutrient, so NULL is a
--          first-class "not reported" value. Typed columns (not a JSON blob) so
--          the cycle "best foods for your phase" feature can rank foods by a
--          specific micronutrient (e.g. ORDER BY iron_mg DESC for the menstrual
--          phase). Units are encoded in the column name (_mg = milligrams,
--          _mcg = micrograms).
--
--          This repo applies schema via `prisma db push`; this file is the
--          human-readable record of that change. Uses ADD COLUMN IF NOT EXISTS
--          so it is SAFE to run on a DB that already has data (idempotent on
--          re-run).
-- ─────────────────────────────────────────────────────────────────────────────

-- iron_mg — iron (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "iron_mg" DOUBLE PRECISION;

-- magnesium_mg — magnesium (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "magnesium_mg" DOUBLE PRECISION;

-- calcium_mg — calcium (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "calcium_mg" DOUBLE PRECISION;

-- potassium_mg — potassium (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "potassium_mg" DOUBLE PRECISION;

-- zinc_mg — zinc (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "zinc_mg" DOUBLE PRECISION;

-- vitamin_c_mg — vitamin C / ascorbic acid (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "vitamin_c_mg" DOUBLE PRECISION;

-- vitamin_b6_mg — vitamin B6 / pyridoxine (mg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "vitamin_b6_mg" DOUBLE PRECISION;

-- vitamin_b12_mcg — vitamin B12 / cobalamin (mcg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "vitamin_b12_mcg" DOUBLE PRECISION;

-- folate_mcg — folate / vitamin B9 (mcg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "folate_mcg" DOUBLE PRECISION;

-- vitamin_d_mcg — vitamin D (mcg per serving)
ALTER TABLE "food_items"
  ADD COLUMN IF NOT EXISTS "vitamin_d_mcg" DOUBLE PRECISION;
