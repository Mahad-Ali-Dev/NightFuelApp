-- F38 (human-readable record; plan-service applies schema via `prisma db push` on
-- restart, NOT `migrate deploy` — see services/plan-service/Dockerfile + docs/DEPLOY-HANDOFF.md).
--
-- Make day_plans.protocol_id -> protocol_templates.id ON DELETE SET NULL.
--
-- Why: the F36 GDPR account-erasure deletes a coach's protocol_templates by creator_id.
-- Without an ON DELETE rule, another user's day_plans that reference a deleted protocol
-- would block the delete (Postgres default NO ACTION/RESTRICT) and ABORT the coach's
-- erasure (incomplete GDPR deletion). protocol_id is nullable and the plan engine treats
-- null as "no protocol", so SET NULL is safe and non-destructive to other users' plans.
--
-- `prisma db push` reconciles the FK to match schema.prisma
-- (`protocol ProtocolTemplate? @relation(fields: [protocolId], references: [id], onDelete: SetNull)`).
-- The explicit DDL equivalent, if applied by hand:

ALTER TABLE "day_plans" DROP CONSTRAINT IF EXISTS "day_plans_protocol_id_fkey";
ALTER TABLE "day_plans"
  ADD CONSTRAINT "day_plans_protocol_id_fkey"
  FOREIGN KEY ("protocol_id") REFERENCES "protocol_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
