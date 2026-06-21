-- Human-readable migration record for MISSING DB INDEXES on community-service:
--   perf MEDIUM #6 — posts.author_id
--   perf MEDIUM #7 — comments.author_id
--   perf LOW    #13 — challenge_participants.user_id
--
-- WHY:
--   * posts.author_id            — the profile feed, per-author post-count, the
--                                  like-sum that powers the Social Butterfly
--                                  badge, and the GDPR delete-by-author path all
--                                  filter authorId; it was unindexed (only
--                                  created_at had an index).
--   * comments.author_id         — author-scoped reads (comment count, GDPR
--                                  delete-by-author) filter authorId; only
--                                  post_id was indexed.
--   * challenge_participants.user_id — the composite UNIQUE
--                                  (challenge_id, user_id) has user_id
--                                  NON-leftmost, so userId-only predicates
--                                  ("challenges this user joined") can't use it.
--
-- NOTE: This file documents the schema delta only. The live apply happens via
-- the owner-gated `prisma db push` on service restart (mirroring the F31
-- sleep-service 20260621_health_samples / community-service 20260621_post_like
-- migration-record precedents). db push reads the new @@index(...) lines from
-- schema.prisma and issues plain CREATE INDEX statements in lockstep; this DDL
-- documents that delta. It is NOT run by `prisma migrate deploy`.
--
-- SAFETY: this only CREATES indexes. No table is altered and no row is touched,
-- so the apply is data-loss-free. Query results are byte-identical before and
-- after — only the access path (and latency) changes.
--
-- LARGE-TABLE NOTE: `prisma db push` emits PLAIN `CREATE INDEX` statements,
-- which take a SHARE lock and block concurrent writes to the target table while
-- they build. On small/empty tables that is instant. On a large existing table
-- the owner may prefer to apply the equivalent `CREATE INDEX CONCURRENTLY`
-- out-of-band (it cannot run inside a transaction and is not what db push emits)
-- and then let db push see each index already present as a no-op.

-- perf MEDIUM #6 — posts.author_id
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- perf MEDIUM #7 — comments.author_id
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- perf LOW #13 — challenge_participants.user_id
CREATE INDEX "challenge_participants_user_id_idx"
    ON "challenge_participants"("user_id");

-- Equivalent non-blocking forms for large existing tables (run manually; not
-- emitted by db push):
--   CREATE INDEX CONCURRENTLY "posts_author_id_idx" ON "posts"("author_id");
--   CREATE INDEX CONCURRENTLY "comments_author_id_idx" ON "comments"("author_id");
--   CREATE INDEX CONCURRENTLY "challenge_participants_user_id_idx"
--       ON "challenge_participants"("user_id");
