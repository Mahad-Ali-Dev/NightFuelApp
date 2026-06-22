-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_library_exercise_video_url
-- Date: 2026-06-22
-- Purpose: Add the self-hosted MP4 exercise-demo column to library_exercises.
--          `video_url` points at an openly-hosted .mp4 demo clip the mobile app
--          streams in-player via the gate-safe expo-video seam. It sits alongside
--          the pre-existing `image_url` (header/frame still) and `demo_url`
--          (curated YouTube tutorial link) columns.
--
--          NULLABLE so every legacy LibraryExercise row (no MP4) and any
--          catalog seeded before this column existed stays valid — the app falls
--          back to its animated image-frame loop / tutorial link when it is NULL.
--          This repo applies schema via `prisma db push`; this file is the
--          human-readable record of that change. Uses ADD COLUMN IF NOT EXISTS so
--          it is SAFE to run on a DB that already has data (and idempotent on
--          re-run).
-- ─────────────────────────────────────────────────────────────────────────────

-- video_url — self-hosted MP4 demo clip (nullable; NULL for clip-less rows)
ALTER TABLE "library_exercises"
  ADD COLUMN IF NOT EXISTS "video_url" TEXT;
