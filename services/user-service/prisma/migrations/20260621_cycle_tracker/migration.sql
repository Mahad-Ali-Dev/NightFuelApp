-- Human-readable migration record for the menstrual-cycle tracker feature.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- `prisma db push --accept-data-loss` on service restart (owner-gated), mirroring
-- the 20260619_user_isprivate precedent. It is NOT run by `prisma migrate`.
--
-- All new columns are nullable / defaulted so existing rows take safe values:
--   * cycle_tracking_enabled defaults false  -> existing users are NON-tracking,
--     so computeCyclePhase returns UNKNOWN and behaviour is unchanged.
--   * derived cycle_phase starts NULL (resolved to UNKNOWN by readers).

-- AlterTable: user_profiles — raw cycle-tracking INPUTS
ALTER TABLE "user_profiles" ADD COLUMN "cycle_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN "last_period_start_date" DATE;
ALTER TABLE "user_profiles" ADD COLUMN "avg_cycle_length_days" INTEGER DEFAULT 28;
ALTER TABLE "user_profiles" ADD COLUMN "avg_period_length_days" INTEGER DEFAULT 5;
ALTER TABLE "user_profiles" ADD COLUMN "cycle_regularity" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "hormonal_contraception" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: user_statuses — DERIVED cycle phase (alongside circadian_peak_time)
ALTER TABLE "user_statuses" ADD COLUMN "cycle_phase" TEXT;
