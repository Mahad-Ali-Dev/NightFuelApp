import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';

/**
 * Schema-lock regression for the sprint-4 input bounds on the community write
 * routes (src/routes.ts):
 *   - POST /v1/community/post      body.content   z.string().min(1).max(5000)
 *   - POST /v1/community/post      body.imageUrl  z.string().url().max(2048)
 *   - PUT  /v1/community/post/:id  body.content   z.string().min(1).max(5000)
 *   - POST .../post/:id/comment    body.text      z.string().min(1).max(2000)
 *   - GET  /v1/community/feed      query.limit    z.coerce.number().int().min(1).max(100).default(20)
 *   - GET  /v1/community/feed      query.cursor   z.string().max(200).optional()
 *   - POST /v1/community/badges/award body.userId   z.string().min(1).max(200)
 *   - POST /v1/community/badges/award body.badgeKey z.string().min(1).max(120)
 *   - GET  /v1/community/user/:id/posts query.limit z.coerce.number().int().min(1).max(100).default(20)
 *   - GET  /v1/community/leaderboard    query.limit z.coerce.number().int().min(1).max(100).default(10)
 *
 * Every request below carries a VALID Bearer token, so the auth gate is open and
 * any 400 originates from the zod body schema, NOT from auth. A real UUID is used
 * for :id so the params schema is never the thing that fails. We additionally
 * assert the service mock is NOT invoked on a rejected (400) request — proving
 * the validation short-circuits before the service layer runs.
 */

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const REAL_UUID = '33333333-3333-4333-8333-333333333333';
const VALID = jwt.sign({ id: '44444444-4444-4444-8444-444444444444' }, JWT_SECRET, { expiresIn: '1h' });
const AUTH = { authorization: `Bearer ${VALID}` };

function buildMockService() {
    return {
        getFeed: jest.fn().mockResolvedValue([]),
        createPost: jest.fn().mockResolvedValue({ id: REAL_UUID, content: 'ok' }),
        likePost: jest.fn().mockResolvedValue({ id: REAL_UUID }),
        addComment: jest.fn().mockResolvedValue({ id: 'comment-1', text: 'ok' }),
        getPostById: jest.fn().mockResolvedValue({ id: REAL_UUID }),
        getComments: jest.fn().mockResolvedValue([]),
        updatePost: jest.fn().mockResolvedValue({ id: REAL_UUID, content: 'ok' }),
        deletePost: jest.fn().mockResolvedValue({ success: true }),
        getUserPosts: jest.fn().mockResolvedValue([]),
        getChallenges: jest.fn().mockResolvedValue([]),
        joinChallenge: jest.fn().mockResolvedValue({ id: 'participant-1' }),
        updateChallengeProgress: jest.fn().mockResolvedValue({ id: 'participant-1' }),
        getLeaderboard: jest.fn().mockResolvedValue([]),
        getLeaderboardWithAuthors: jest.fn().mockResolvedValue([]),
        getUserScore: jest.fn().mockResolvedValue({ userId: 'u', xp: 0, level: 1, xpForNextLevel: 100 }),
        getBadgeCatalog: jest.fn().mockResolvedValue([]),
        getUserBadges: jest.fn().mockResolvedValue([]),
        getUnseenBadges: jest.fn().mockResolvedValue([]),
        awardBadgeByKey: jest.fn().mockResolvedValue({ id: 'user-badge-1' }),
    };
}

type MockService = ReturnType<typeof buildMockService>;

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(routes, { communityService: svc as any, jwtSecret: JWT_SECRET });
    await app.ready();
    return app;
}

describe('community-service input bounds (valid token, schema-lock)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    // ── POST /v1/community/post — content .max(5000) ─────────────────────────
    describe('POST /v1/community/post content bound (max 5000)', () => {
        it('content of 5001 chars -> 400 and createPost NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: 'a'.repeat(5001) },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.createPost).not.toHaveBeenCalled();
        });

        it('content of exactly 5000 chars -> not 400 (passes schema, reaches service)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: 'a'.repeat(5000) },
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.createPost).toHaveBeenCalledTimes(1);
        });

        it('empty content -> 400 (min 1) and createPost NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: '' },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.createPost).not.toHaveBeenCalled();
        });
    });

    // ── PUT /v1/community/post/:id — content .max(5000) ──────────────────────
    describe('PUT /v1/community/post/:id content bound (max 5000)', () => {
        it('content of 5001 chars (valid uuid) -> 400 and updatePost NOT called', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: `/v1/community/post/${REAL_UUID}`,
                headers: AUTH,
                payload: { content: 'a'.repeat(5001) },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.updatePost).not.toHaveBeenCalled();
        });

        it('content of exactly 5000 chars (valid uuid) -> not 400 (reaches service)', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: `/v1/community/post/${REAL_UUID}`,
                headers: AUTH,
                payload: { content: 'a'.repeat(5000) },
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.updatePost).toHaveBeenCalledTimes(1);
        });
    });

    // ── POST .../post/:id/comment — text .max(2000) ──────────────────────────
    describe('POST /v1/community/post/:id/comment text bound (max 2000)', () => {
        it('text of 2001 chars (valid uuid) -> 400 and addComment NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: `/v1/community/post/${REAL_UUID}/comment`,
                headers: AUTH,
                payload: { text: 'a'.repeat(2001) },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.addComment).not.toHaveBeenCalled();
        });

        it('text of exactly 2000 chars (valid uuid) -> not 400 (reaches service)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: `/v1/community/post/${REAL_UUID}/comment`,
                headers: AUTH,
                payload: { text: 'a'.repeat(2000) },
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.addComment).toHaveBeenCalledTimes(1);
        });
    });

    // ── POST /v1/community/post — imageUrl url() + .max(2048) ─────────────────
    describe('POST /v1/community/post imageUrl bound (url + max 2048)', () => {
        it('imageUrl="not-a-url" -> 400 and createPost NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: 'hello', imageUrl: 'not-a-url' },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.createPost).not.toHaveBeenCalled();
        });

        it('imageUrl longer than 2048 chars -> 400 and createPost NOT called', async () => {
            // Well-formed https URL whose total length exceeds 2048.
            const longUrl = 'https://x.com/' + 'a'.repeat(2050);
            expect(longUrl.length).toBeGreaterThan(2048);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: 'hello', imageUrl: longUrl },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.createPost).not.toHaveBeenCalled();
        });

        it('valid https imageUrl (<=2048) -> not 400 (reaches service)', async () => {
            const okUrl = 'https://cdn.example.com/uploads/photo-12345.png';
            expect(okUrl.length).toBeLessThanOrEqual(2048);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: 'hello', imageUrl: okUrl },
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.createPost).toHaveBeenCalledTimes(1);
            expect(svc.createPost).toHaveBeenCalledWith(expect.anything(), 'hello', okUrl);
        });

        it('imageUrl at the 2048-char boundary -> not 400 (reaches service)', async () => {
            // Construct a syntactically valid https URL of EXACTLY 2048 chars.
            const prefix = 'https://x.com/';
            const boundaryUrl = prefix + 'a'.repeat(2048 - prefix.length);
            expect(boundaryUrl.length).toBe(2048);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/post',
                headers: AUTH,
                payload: { content: 'hello', imageUrl: boundaryUrl },
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.createPost).toHaveBeenCalledTimes(1);
        });
    });

    // ── GET /v1/community/feed — limit .int().min(1).max(100).default(20) ─────
    describe('GET /v1/community/feed limit bound (int, 1..100, default 20)', () => {
        it('limit omitted -> not 400 and getFeed receives the default 20', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/feed',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getFeed).toHaveBeenCalledTimes(1);
            // Default page size is preserved: first positional arg is 20.
            expect(svc.getFeed).toHaveBeenCalledWith(20, undefined);
        });

        it('limit=101 (above max) -> 400 and getFeed NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/feed?limit=101',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getFeed).not.toHaveBeenCalled();
        });

        it('limit=999999999 (far above max) -> 400 and getFeed NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/feed?limit=999999999',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getFeed).not.toHaveBeenCalled();
        });

        it('limit=100 (at the boundary) -> not 400 (reaches service with 100)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/feed?limit=100',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getFeed).toHaveBeenCalledTimes(1);
            expect(svc.getFeed).toHaveBeenCalledWith(100, undefined);
        });

        it('limit=0 (below min) -> 400 and getFeed NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/feed?limit=0',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getFeed).not.toHaveBeenCalled();
        });

        it('cursor longer than 200 chars -> 400 and getFeed NOT called', async () => {
            const longCursor = 'c'.repeat(201);
            const res = await app.inject({
                method: 'GET',
                url: `/v1/community/feed?cursor=${longCursor}`,
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getFeed).not.toHaveBeenCalled();
        });

        it('valid limit + cursor (in range) -> not 400 (reaches service with both)', async () => {
            const cursor = '33333333-3333-4333-8333-333333333333';
            const res = await app.inject({
                method: 'GET',
                url: `/v1/community/feed?limit=10&cursor=${cursor}`,
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getFeed).toHaveBeenCalledTimes(1);
            expect(svc.getFeed).toHaveBeenCalledWith(10, cursor);
        });
    });

    // ── POST /v1/community/badges/award — userId/badgeKey length bounds ───────
    describe('POST /v1/community/badges/award body bounds (userId<=200, badgeKey 1..120)', () => {
        it('badgeKey longer than 120 chars -> 400 and awardBadgeByKey NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/badges/award',
                headers: AUTH,
                payload: { userId: '44444444-4444-4444-8444-444444444444', badgeKey: 'k'.repeat(121) },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.awardBadgeByKey).not.toHaveBeenCalled();
        });

        it('empty badgeKey -> 400 (min 1) and awardBadgeByKey NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/badges/award',
                headers: AUTH,
                payload: { userId: '44444444-4444-4444-8444-444444444444', badgeKey: '' },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.awardBadgeByKey).not.toHaveBeenCalled();
        });

        it('userId longer than 200 chars -> 400 and awardBadgeByKey NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/badges/award',
                headers: AUTH,
                payload: { userId: 'u'.repeat(201), badgeKey: 'first_post' },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.awardBadgeByKey).not.toHaveBeenCalled();
        });

        it('empty userId -> 400 (min 1) and awardBadgeByKey NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/badges/award',
                headers: AUTH,
                payload: { userId: '', badgeKey: 'first_post' },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.awardBadgeByKey).not.toHaveBeenCalled();
        });

        it('valid in-range award -> 200 and awardBadgeByKey called once', async () => {
            const userId = '44444444-4444-4444-8444-444444444444';
            const res = await app.inject({
                method: 'POST',
                url: '/v1/community/badges/award',
                headers: AUTH,
                payload: { userId, badgeKey: 'first_post' },
            });

            expect(res.statusCode).toBe(200);
            expect(svc.awardBadgeByKey).toHaveBeenCalledTimes(1);
            expect(svc.awardBadgeByKey).toHaveBeenCalledWith(userId, 'first_post');
            expect(res.json()).toEqual({ awarded: true, badgeKey: 'first_post' });
        });
    });

    // ── GET /v1/community/user/:id/posts — limit .int().min(1).max(100).default(20) ─
    // A plain string :id is used ('me' resolves to the authed user), so the params
    // schema is never the thing that fails — any 400 here is the new limit bound.
    describe('GET /v1/community/user/:id/posts limit bound (int, 1..100, default 20)', () => {
        it('limit omitted -> not 400 and getUserPosts receives the default 20', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/user/me/posts',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getUserPosts).toHaveBeenCalledTimes(1);
            // Signature is now (viewerId, authorId, limit) for the privacy gate —
            // default page size is preserved as the THIRD positional arg.
            expect(svc.getUserPosts).toHaveBeenCalledWith(expect.anything(), expect.anything(), 20);
        });

        it('limit=101 (above max) -> 400 and getUserPosts NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/user/me/posts?limit=101',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getUserPosts).not.toHaveBeenCalled();
        });

        it('limit=999999999 (far above max) -> 400 and getUserPosts NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/user/me/posts?limit=999999999',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getUserPosts).not.toHaveBeenCalled();
        });

        it('limit=100 (at the boundary) -> not 400 (reaches service with 100)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/user/me/posts?limit=100',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getUserPosts).toHaveBeenCalledTimes(1);
            expect(svc.getUserPosts).toHaveBeenCalledWith(expect.anything(), expect.anything(), 100);
        });

        it('limit=0 (below min) -> 400 and getUserPosts NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/user/me/posts?limit=0',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getUserPosts).not.toHaveBeenCalled();
        });
    });

    // ── GET /v1/community/leaderboard — limit .int().min(1).max(100).default(10) ──
    // The route calls getLeaderboardWithAuthors(limit) + getUserScore(...); we
    // assert against getLeaderboardWithAuthors (the limit-bearing call).
    describe('GET /v1/community/leaderboard limit bound (int, 1..100, default 10)', () => {
        it('limit omitted -> not 400 and getLeaderboardWithAuthors receives the default 10', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/leaderboard',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getLeaderboardWithAuthors).toHaveBeenCalledTimes(1);
            // Default page size is preserved: first positional arg is 10.
            expect(svc.getLeaderboardWithAuthors).toHaveBeenCalledWith(10);
        });

        it('limit=101 (above max) -> 400 and getLeaderboardWithAuthors NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/leaderboard?limit=101',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getLeaderboardWithAuthors).not.toHaveBeenCalled();
        });

        it('limit=999999999 (far above max) -> 400 and getLeaderboardWithAuthors NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/leaderboard?limit=999999999',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getLeaderboardWithAuthors).not.toHaveBeenCalled();
        });

        it('limit=100 (at the boundary) -> not 400 (reaches service with 100)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/leaderboard?limit=100',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.getLeaderboardWithAuthors).toHaveBeenCalledTimes(1);
            expect(svc.getLeaderboardWithAuthors).toHaveBeenCalledWith(100);
        });

        it('limit=0 (below min) -> 400 and getLeaderboardWithAuthors NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/community/leaderboard?limit=0',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.getLeaderboardWithAuthors).not.toHaveBeenCalled();
        });
    });
});
