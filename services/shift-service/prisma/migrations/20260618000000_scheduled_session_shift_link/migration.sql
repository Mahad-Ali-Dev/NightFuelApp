-- AlterTable
-- Strictly additive: a single OPTIONAL nullable scalar column on the
-- scheduled_sessions table so a scheduled training session can OPTIONALLY
-- reference one of the user's own Shift rows. No default and no FK constraint
-- by design — same-user ownership is enforced in the POST handler, and the
-- absence of a constraint keeps this independent of the un-run base
-- 20260617000000_scheduled_sessions migration (no table-ordering concern).
-- USER-GATED: this file is UN-RUN until a human deploys it.
ALTER TABLE "scheduled_sessions" ADD COLUMN "shift_id" TEXT;
