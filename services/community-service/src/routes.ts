import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommunityService } from './community.service';
import jwt from 'jsonwebtoken';
import { sendUnauthorized } from '@nightfuel/config';

export default async function (fastify: FastifyInstance, opts: { communityService: CommunityService, jwtSecret: string }) {
    const { communityService, jwtSecret } = opts;

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
        schema: { querystring: z.object({ limit: z.coerce.number().default(20), cursor: z.string().optional() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { limit, cursor } = request.query as any;
        const posts = await communityService.getFeed(limit, cursor);
        const mappedPosts = posts.map(p => ({ ...p, commentsCount: (p as any)._count?.comments || 0 }));
        return reply.send(mappedPosts);
    });

    fastify.post('/v1/community/post', {
        schema: { body: z.object({ content: z.string().min(1).max(5000), imageUrl: z.string().url().max(2048).optional() }) },
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

    fastify.post('/v1/community/post/:id/like', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any;
        return reply.send(await communityService.likePost(id));
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
        const { id } = request.params as any;
        const post = await communityService.getPostById(id);
        if (!post) return reply.code(404).send({ error: 'Post not found' });
        return reply.send({ ...post, commentsCount: (post as any)._count?.comments || 0 });
    });

    fastify.get('/v1/community/post/:id/comments', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any;
        return reply.send(await communityService.getComments(id));
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
            querystring: z.object({ limit: z.coerce.number().default(20) })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        let { id } = request.params as any;
        if (id === 'me') {
            id = (request as any).user?.id || (request as any).user?.userId;
        }
        const { limit } = request.query as any;
        const posts = await communityService.getUserPosts(id, limit);
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

    // Leaderboard
    fastify.get('/v1/community/leaderboard', {
        schema: { querystring: z.object({ limit: z.coerce.number().default(10) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { limit } = request.query as any;
        const topUsers = await communityService.getLeaderboard(limit);
        const me = await communityService.getUserScore((request as any).user?.id || (request as any).user?.userId);
        return reply.send({ leaderboard: topUsers, myScore: me });
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
            body: z.object({ userId: z.string(), badgeKey: z.string() })
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
};
