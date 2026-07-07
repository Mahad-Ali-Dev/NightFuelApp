import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommunityService, SelfFollowError } from './community.service';
import jwt from 'jsonwebtoken';
import { sendUnauthorized, makeInternalAuthGuard } from '@nightfuel/config';
import { handleUpload, handleServeUpload } from './uploads';

// BUG #3: a post's imageUrl MUST be an https URL. The author's local file:// (or
// any http/data) URI is rejected on every device by the on-device trust gate, so
// accepting it server-side would store a value that renders blank for everyone but
// the author. The client now uploads the picked file to POST /v1/community/upload
// first and posts with the returned https URL; this validator enforces the
// contract end-to-end. `.url()` already requires an absolute URL; we additionally
// pin the scheme to https.
const httpsImageUrl = z
    .string()
    .url()
    .max(2048)
    .refine((u) => /^https:\/\//i.test(u), { message: 'imageUrl must be an https URL' });

// ── Input upper bounds ──────────────────────────────────────────────────────
// Generous caps so every currently-valid app payload still passes; only
// absurd/abusive page sizes are rejected with the standard 400. Mirrors the
// named `MAX_*` style in meal-service/src/routes.ts and the existing
// .max(100) feed bound below.
const MAX_USER_POSTS_LIMIT = 100;   // GET /user/:id/posts page size
const MAX_LEADERBOARD_LIMIT = 100;  // GET /leaderboard page size

export default async function (fastify: FastifyInstance, opts: { communityService: CommunityService, jwtSecret: string, internalServiceToken?: string }) {
    const { communityService, jwtSecret } = opts;

    // F34 #5: in-service guard for the server-to-server-only /internal/* routes.
    // Constant-time checks X-Internal-Token == INTERNAL_SERVICE_TOKEN; on a
    // missing/wrong token it replies 404 (never revealing the route exists) and
    // the real handler never runs. An unset token fails CLOSED (every request 404s).
    const internalAuth = makeInternalAuthGuard(opts.internalServiceToken);

    // Authentication middleware
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = request.headers.authorization?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, jwtSecret);
        } catch (err: any) {
            // invalid/missing token -> 401, never a fallback identity
            return sendUnauthorized(reply, request, err);
        }
    });

    fastify.get('/v1/community/feed', {
        schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().max(200).optional() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const viewerId = (request as any).user?.id || (request as any).user?.userId;
        const { limit, cursor } = request.query as any;
        const posts = await communityService.getFeed(viewerId, limit, cursor);
        const mappedPosts = posts.map(p => ({ ...p, commentsCount: (p as any)._count?.comments || 0 }));
        return reply.send(mappedPosts);
    });

    fastify.post('/v1/community/post', {
        schema: { body: z.object({ content: z.string().min(1).max(5000), imageUrl: httpsImageUrl.optional() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        try {
            const userId = (request as any).user?.id || (request as any).user?.userId;
            const { content, imageUrl } = request.body as any;
            return reply.code(201).send(await communityService.createPost(userId, content, imageUrl));
        } catch (err: any) {
            request.log.error({ err }, 'createPost failed');
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    // ── Image upload (BUG #3) ─────────────────────────────────────────────────
    // POST /v1/community/upload — authenticated multipart/form-data; persists the
    // first image file part and returns its absolute https URL. The multipart body
    // is collected as a Buffer by the content-type parser registered in index.ts,
    // so this route declares no Zod body schema (the body is raw bytes, parsed in
    // handleUpload). The returned URL rides the existing nginx /v1/community proxy.
    fastify.post('/v1/community/upload', {
        preHandler: [(fastify as any).authenticate]
    }, handleUpload);

    // GET /v1/community/uploads/:file — serve a stored image. Intentionally PUBLIC
    // (no auth): the mobile <Image> component cannot attach the JWT, and the
    // filenames are unguessable random tokens, mirroring how avatar/image URLs are
    // fetched elsewhere. handleServeUpload is hardened against path traversal.
    fastify.get('/v1/community/uploads/:file', {
        schema: { params: z.object({ file: z.string().min(1).max(256) }) },
    }, handleServeUpload);

    fastify.post('/v1/community/post/:id/like', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const likerId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        // likerId de-dupes the like (one per user) so the count can't be inflated.
        return reply.send(await communityService.likePost(id, likerId));
    });

    fastify.delete('/v1/community/post/:id/like', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const likerId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        return reply.send(await communityService.unlikePost(id, likerId));
    });

    fastify.post('/v1/community/post/:id/comment', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ text: z.string().min(1).max(2000) })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        const { text } = request.body as any;
        return reply.code(201).send(await communityService.addComment(id, userId, text));
    });

    fastify.get('/v1/community/post/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const viewerId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        // viewerId drives the privacy gate; a private author's post is hidden
        // (treated as not found) from a non-follower.
        const post = await communityService.getPostById(viewerId, id);
        if (!post) return reply.code(404).send({ error: 'Post not found' });
        return reply.send({ ...post, commentsCount: (post as any)._count?.comments || 0 });
    });

    fastify.get('/v1/community/post/:id/comments', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const viewerId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        // viewerId drives the privacy gate; comments inherit the post author's visibility.
        return reply.send(await communityService.getComments(viewerId, id));
    });

    // Post Management
    fastify.put('/v1/community/post/:id', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ content: z.string().min(1).max(5000) })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        const { content } = request.body as any;
        return reply.send(await communityService.updatePost(id, userId, content));
    });

    fastify.delete('/v1/community/post/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        return reply.send(await communityService.deletePost(id, userId));
    });

    // User Feed
    fastify.get('/v1/community/user/:id/posts', {
        schema: {
            params: z.object({ id: z.string() }),
            querystring: z.object({ limit: z.coerce.number().int().min(1).max(MAX_USER_POSTS_LIMIT).default(20) })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const viewerId = (request as any).user?.id || (request as any).user?.userId;
        let { id } = request.params as any;
        if (id === 'me') {
            id = viewerId;
        }
        const { limit } = request.query as any;
        // viewerId drives the privacy gate: a private author's posts are returned
        // only to the author themselves or an accepted follower.
        const posts = await communityService.getUserPosts(viewerId, id, limit);
        const mappedPosts = posts.map(p => ({ ...p, commentsCount: (p as any)._count?.comments || 0 }));
        return reply.send(mappedPosts);
    });

    // Challenges
    fastify.get('/v1/community/challenges', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        return reply.send(await communityService.getChallenges(userId));
    });

    fastify.post('/v1/community/challenges/:id/join', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        return reply.code(201).send(await communityService.joinChallenge(id, userId));
    });

    fastify.post('/v1/community/challenges/:id/progress', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ progress: z.number().min(0).max(100) })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        const { id } = request.params as any;
        const { progress } = request.body as any;
        return reply.send(await communityService.updateChallengeProgress(id, userId, progress));
    });

    // Leaderboard — rows enriched with real displayName/avatar (author-resolved)
    fastify.get('/v1/community/leaderboard', {
        schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(MAX_LEADERBOARD_LIMIT).default(10) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { limit } = request.query as any;
        const topUsers = await communityService.getLeaderboardWithAuthors(limit);
        const me = await communityService.getUserScore((request as any).user?.id || (request as any).user?.userId);
        return reply.send({ leaderboard: topUsers, myScore: me });
    });

    // ── Social Graph (Follow) Routes ──────────────────────────────────────────
    // The follower is ALWAYS the authenticated caller (from the JWT); the
    // :userId path param is the target being followed/queried.

    // POST /v1/community/follow/:userId — idempotent follow; rejects self-follow
    fastify.post('/v1/community/follow/:userId', {
        schema: { params: z.object({ userId: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const followerId = (request as any).user?.id || (request as any).user?.userId;
        const { userId: targetId } = request.params as any;
        try {
            const result = await communityService.followUser(followerId, targetId);
            return reply.send(result);
        } catch (err: any) {
            if (err instanceof SelfFollowError) {
                return reply.code(400).send({ error: err.code });
            }
            request.log.error({ err }, 'followUser failed');
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    // DELETE /v1/community/follow/:userId — idempotent unfollow
    fastify.delete('/v1/community/follow/:userId', {
        schema: { params: z.object({ userId: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const followerId = (request as any).user?.id || (request as any).user?.userId;
        const { userId: targetId } = request.params as any;
        return reply.send(await communityService.unfollowUser(followerId, targetId));
    });

    // GET /v1/community/users/:userId/social — { isFollowing, followers, following }
    fastify.get('/v1/community/users/:userId/social', {
        schema: { params: z.object({ userId: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const viewerId = (request as any).user?.id || (request as any).user?.userId;
        const { userId: targetId } = request.params as any;
        return reply.send(await communityService.getSocial(viewerId, targetId));
    });

    // GET /v1/community/users/:userId/profile — detailed profile (privacy-composed)
    fastify.get('/v1/community/users/:userId/profile', {
        schema: { params: z.object({ userId: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const viewerId = (request as any).user?.id || (request as any).user?.userId;
        const { userId: targetId } = request.params as any;
        return reply.send(await communityService.getUserDetailedProfile(viewerId, targetId));
    });

    // ── Badge / Achievement Routes ────────────────────────────────────────────

    // GET /v1/community/badges — full catalog of all badges
    fastify.get('/v1/community/badges', {
        preHandler: [(fastify as any).authenticate]
    }, async (_request, reply) => {
        return reply.send(await communityService.getBadgeCatalog());
    });

    // GET /v1/community/badges/mine — badges earned by the current user
    fastify.get('/v1/community/badges/mine', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        return reply.send(await communityService.getUserBadges(userId));
    });

    // GET /v1/community/badges/unseen — unseen badges (clears unseen flag)
    fastify.get('/v1/community/badges/unseen', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.id || (request as any).user?.userId;
        return reply.send(await communityService.getUnseenBadges(userId));
    });

    // GET /v1/community/badges/user/:userId — public badge wall for another user
    fastify.get('/v1/community/badges/user/:userId', {
        schema: { params: z.object({ userId: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { userId } = request.params as any;
        return reply.send(await communityService.getUserBadges(userId));
    });

    // POST /v1/community/badges/award — award a badge by key (internal / cross-service)
    fastify.post('/v1/community/badges/award', {
        schema: {
            // Internal / cross-service. award does NOT special-case 'me', so userId is
            // bounded length-only (no .uuid() — callers are not guaranteed to pass a uuid).
            body: z.object({ userId: z.string().min(1).max(200), badgeKey: z.string().min(1).max(120) })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { userId, badgeKey } = request.body as any;
        const result = await communityService.awardBadgeByKey(userId, badgeKey);
        return reply.send({ awarded: !!result, badgeKey });
    });

    // GET /v1/community/user/:id/score — XP + level for any user
    fastify.get('/v1/community/user/:id/score', {
        schema: { params: z.object({ id: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const userId = id === 'me'
            ? ((request as any).user?.id || (request as any).user?.userId)
            : id;
        return reply.send(await communityService.getUserScore(userId));
    });

    // ── DELETE /v1/community/internal/user/:userId (GDPR purge) ──────────────────
    // Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
    // internalAuth preHandler additionally requires X-Internal-Token). PERMANENTLY
    // erases EVERY community-service row owned by :userId across all user-owned
    // tables (posts, comments, post_likes, user_scores, user_badges,
    // challenge_participants, follows). IDEMPOTENT: purging a user with no rows
    // returns 200 with zero counts; purging twice is safe (deleteMany never throws
    // on zero rows). Returns a per-table deletedCounts summary.
    fastify.delete(
        '/v1/community/internal/user/:userId',
        { preHandler: internalAuth },
        async (request, reply) => {
            const { userId } = request.params as { userId: string };
            try {
                const deletedCounts = await communityService.purgeUser(userId);
                return reply.code(200).send({ userId, deletedCounts });
            } catch (err: any) {
                request.log.error({ err, userId }, 'GDPR purge failed');
                return reply.code(500).send({ error: 'Internal server error' });
            }
        },
    );

    // ── GET /v1/community/internal/user/:userId/export (GDPR data export) ─────────
    // Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the SAME
    // internalAuth preHandler the purge uses additionally requires X-Internal-Token,
    // so a missing/wrong token gets 404 and the handler never runs). READ-ONLY
    // counterpart of the purge: returns EVERY community-service row owned by :userId
    // across the SAME user-owned tables the purge erases (posts, comments,
    // post_likes, user_scores, user_badges, challenge_participants, follows), as a
    // JSON object keyed by table name. Mirrors the purge's table set EXACTLY so
    // export and erasure stay in sync. Idempotent (no writes).
    //
    // SECURITY: this service's schema has no password/token/secret/raw-key columns,
    // so nothing is redacted; the large per-user tables (posts/comments/post_likes)
    // are bounded inside exportUser to avoid an unbounded read for a heavy account.
    fastify.get(
        '/v1/community/internal/user/:userId/export',
        { preHandler: internalAuth },
        async (request, reply) => {
            const { userId } = request.params as { userId: string };
            try {
                const data = await communityService.exportUser(userId);
                return reply.code(200).send({ userId, data });
            } catch (err: any) {
                request.log.error({ err, userId }, 'GDPR export failed');
                return reply.code(500).send({ error: 'Internal server error' });
            }
        },
    );
};
