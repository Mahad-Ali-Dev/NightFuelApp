-- Account-disabled flag for admin ban enforcement. Idempotent (IF NOT EXISTS) so
-- it is safe to apply via `migrate deploy` even if the column was added manually
-- first, and additive (DEFAULT false) so existing rows are unaffected.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false;
