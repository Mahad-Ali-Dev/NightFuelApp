-- Chat Service — message-requests + read receipts
--
-- Adds:
--   conversations.request_state  — Instagram-DM-style request gate
--                                  ('pending' | 'accepted' | 'declined')
--   messages.read_at             — timestamp the message was marked read
--
-- Backfill rules (idempotent-friendly):
--   1. Every EXISTING conversation predates the request gate, so it is already
--      an established thread — backfill ALL rows to 'accepted' so legacy DMs and
--      coach threads are never retroactively blocked.
--   2. Ria/coach conversations are always treated as accepted; the explicit
--      second UPDATE is a belt-and-braces guarantee (and re-asserts 'accepted'
--      even if rule 1 is ever narrowed in a future edit).
--
-- NOTE: This migration FILE is intentionally NOT applied here — there is no DB
-- in CI. It is applied out-of-band against the live database.

ALTER TABLE "conversations" ADD COLUMN "request_state" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMP(3);

-- Backfill: all pre-existing conversations are established threads.
UPDATE "conversations" SET "request_state" = 'accepted';

-- Belt-and-braces: Ria/coach conversations are always accepted.
UPDATE "conversations" SET "request_state" = 'accepted'
  WHERE "participant_a" = 'ria-ai-coach' OR "participant_b" = 'ria-ai-coach';
