-- Follow / social-graph migration
-- Creates the follows table (idempotent) so it is safe to run against a
-- shared Supabase DB. A row (follower_id -> following_id) is an ACCEPTED
-- follow and grants the follower immediate visibility of a private profile.

CREATE TABLE IF NOT EXISTS "follows" (
    "id"           TEXT         NOT NULL,
    "follower_id"  TEXT         NOT NULL,
    "following_id" TEXT         NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "follows_following_id_idx" ON "follows"("following_id");
