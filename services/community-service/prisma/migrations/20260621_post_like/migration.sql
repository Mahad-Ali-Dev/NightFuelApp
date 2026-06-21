-- Human-readable migration record for PER-USER POST LIKES (de-duplicated likes).
-- One row per (user_id, post_id) — a user can like a given post at most once,
-- enforced by the unique constraint. likePost increments posts.likes only on a
-- user's FIRST like; a second like by the same user is a no-op (the unique
-- violation is swallowed). This closes the data-integrity hole where one user
-- could inflate a post's like count unboundedly and game the Social Butterfly
-- badge (which sums posts.likes across an author's posts).
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- an owner-gated `prisma db push` (mirroring the F31 sleep-service
-- 20260621_health_samples and F28 user-service 20260621_period_log precedents).
-- It is additive (new table only) and is NOT run automatically by
-- `prisma migrate deploy`.
--
-- SAFETY: this only CREATES a brand-new table (post_likes). No existing table is
-- altered and no existing row is touched, so the apply is data-loss-free. The
-- table starts EMPTY for everyone. Existing posts.likes values are left exactly
-- as they are — going forward, every NEW like is attributed to a user and
-- de-duplicated. A caller that never likes a post produces zero rows here and a
-- byte-identical posts row to before this feature. The legacy unauthenticated
-- like path (no liker id) still increments the counter unconditionally, so no
-- previously-working call path changes behaviour.

-- CreateTable: post_likes — one accepted like per (user_id, post_id).
CREATE TABLE "post_likes" (
    "id"         TEXT NOT NULL,
    "post_id"    TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- Unique: a user may like a given post at most once (the de-dup guard).
CREATE UNIQUE INDEX "post_likes_user_id_post_id_key"
    ON "post_likes"("user_id", "post_id");

-- Index: count / list likes for a post.
CREATE INDEX "post_likes_post_id_idx" ON "post_likes"("post_id");
