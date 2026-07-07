-- OAuth (Google/Apple) sign-in + email OTP verification.
--
-- Idempotent throughout (IF NOT EXISTS / conditional guards) so it is safe to
-- apply via `prisma migrate deploy` even if a column/table was created manually
-- first. Mirrors the SQL style of the password_reset_tokens migration and the
-- @map column names in schema.prisma.

-- users.password_hash becomes NULLABLE: OAuth-only accounts (Google/Apple) have
-- no local password. Additive/safe — existing rows keep their non-null hash.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable: oauth_accounts
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: email_otps
CREATE TABLE IF NOT EXISTS "email_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: (provider, provider_account_id) unique — one local account per
-- provider identity; the provider's stable `sub` is the lookup key on re-sign-in.
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_otps_email_idx" ON "email_otps"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_otps_user_id_idx" ON "email_otps"("user_id");

-- AddForeignKey: oauth_accounts.user_id -> users.id (cascade delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'oauth_accounts_user_id_fkey'
    ) THEN
        ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: email_otps.user_id -> users.id (cascade delete; nullable FK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'email_otps_user_id_fkey'
    ) THEN
        ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Grandfather EXISTING accounts. Every user created before email-OTP existed has
-- email_verified=false (the column was never written), and the new login() gate
-- rejects unverified accounts. Mark all CURRENT users verified so the OTP gate
-- applies ONLY to signups created after this migration — otherwise every existing
-- user would be locked out at their next login. New rows still default to false
-- (register() issues an OTP for them).
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
