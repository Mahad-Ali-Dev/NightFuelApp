-- Community Service — safe idempotent init migration
-- Creates only community-specific tables using IF NOT EXISTS
-- so it is safe to run against a shared Supabase DB

CREATE TABLE IF NOT EXISTS "posts" (
    "id"        TEXT        NOT NULL,
    "author_id" TEXT        NOT NULL,
    "content"   TEXT        NOT NULL,
    "image_url" TEXT,
    "likes"     INTEGER     NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "posts_created_at_idx" ON "posts"("created_at" DESC);

CREATE TABLE IF NOT EXISTS "comments" (
    "id"         TEXT        NOT NULL,
    "post_id"    TEXT        NOT NULL,
    "author_id"  TEXT        NOT NULL,
    "text"       TEXT        NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "comments_post_id_idx" ON "comments"("post_id");

CREATE TABLE IF NOT EXISTS "user_scores" (
    "user_id" TEXT    NOT NULL,
    "xp"      INTEGER NOT NULL DEFAULT 0,
    "level"   INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "user_scores_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX IF NOT EXISTS "user_scores_xp_idx" ON "user_scores"("xp" DESC);

CREATE TABLE IF NOT EXISTS "challenges" (
    "id"          TEXT        NOT NULL,
    "title"       TEXT        NOT NULL,
    "description" TEXT        NOT NULL,
    "xp_reward"   INTEGER     NOT NULL,
    "start_date"  TIMESTAMP(3) NOT NULL,
    "end_date"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "challenge_participants" (
    "id"           TEXT        NOT NULL,
    "challenge_id" TEXT        NOT NULL,
    "user_id"      TEXT        NOT NULL,
    "progress"     INTEGER     NOT NULL DEFAULT 0,
    "completed"    BOOLEAN     NOT NULL DEFAULT false,
    "joined_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "challenge_participants_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$ BEGIN
    ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_user_id_key" UNIQUE ("challenge_id", "user_id");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
