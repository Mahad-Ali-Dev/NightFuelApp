-- Human-readable migration RECORD for IAP RECEIPT BINDING (CRITICAL #1 —
-- receipt replay / sharing). One row per validated Apple/Google subscription
-- receipt, created by POST /v1/subscriptions/iap/validate on first redemption.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- `prisma db push --accept-data-loss` on service restart (owner-gated), mirroring
-- the F31 sleep-service `20260621_health_samples` precedent (and the
-- subscription-service Dockerfile is switched from `prisma migrate deploy` to
-- `db push` in lockstep with this file). It is NOT run by `prisma migrate`.
--
-- SAFETY: this only CREATES a brand-new table (iap_transactions). No existing
-- table is altered and no existing row is touched, so the apply is data-loss-free.
-- The table starts EMPTY for everyone. A user who has never redeemed an IAP
-- receipt has zero rows here; the binding lookup finds nothing and behaves as a
-- first redemption, so every pre-existing subscription/tier is byte-identical to
-- before this feature. Because the table is brand-new and starts EMPTY, adding the
-- UNIQUE index below can never fail on a pre-existing duplicate.
--
-- THE GUARANTEE: the UNIQUE index on original_transaction_id is what stops ONE
-- valid receipt from upgrading UNLIMITED accounts. The first userId to validate a
-- receipt is bound to it; a different userId submitting the SAME receipt hits the
-- existing-row-owned-by-someone-else branch and is REJECTED. A concurrent
-- double-submit race is resolved by the DB: the second INSERT raises P2002 on this
-- index, which the service treats as "already bound" and re-resolves the owner.

-- CreateTable: iap_transactions — receipt → account binding ledger.
CREATE TABLE "iap_transactions" (
    "id"                      TEXT NOT NULL,
    "original_transaction_id" TEXT NOT NULL,
    "user_id"                 TEXT NOT NULL,
    "platform"                TEXT NOT NULL,
    "product_id"              TEXT NOT NULL,
    "tier"                    TEXT NOT NULL,
    "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iap_transactions_pkey" PRIMARY KEY ("id")
);

-- The replay/sharing guard: a stable receipt id maps to at most one account.
CREATE UNIQUE INDEX "iap_transactions_original_transaction_id_key"
    ON "iap_transactions"("original_transaction_id");

-- Per-user lookups (e.g. listing a user's redemptions).
CREATE INDEX "iap_transactions_user_id_idx" ON "iap_transactions"("user_id");
