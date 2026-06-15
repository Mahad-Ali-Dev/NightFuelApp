import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';

/**
 * Regression suite (mirrors the user-service / item-2 pattern for community).
 *
 * Proves every protected `/v1/community/*` route enforces the authenticate
 * preHandler (src/routes.ts:10-23): a missing, forged (wrong-secret) or expired
 * Bearer token must yield the canonical 401 body, the mocked CommunityService
 * method must NEVER be invoked, and no hardcoded fallback identity (e.g.
 * 'test-user-id') may leak into any response body. A genuinely valid token must
 * NOT 401 (it reaches the handler / schema layer instead).
 *
 * The real `routes` plugin is mounted on a fresh Fastify() wired with the same
 * zod validator/serializer compilers as src/index.ts and a known jwtSecret, so
 * the auth behaviour under test is the production code path — only the service
 * layer is mocked (jest.fn()) so no DB/network is touched.
 */

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const REAL_UUID = '11111111-1111-4111-8111-111111111111';
const REAL_USER_ID = '22222222-2222-4222-8222-222222222222';

// Every method the routes plugin may call on CommunityService. All are jest.fn()
// so we can assert the auth layer short-circuits BEFORE any of them run.
function buildMockService() {
    return {
        getFeed: jest.fn().mockResolvedValue([]),
        createPost: jest.fn().mockResolvedValue({ id: REAL_UUID }),
        likePost: jest.fn().mockResolvedValue({ id: REAL_UUID, likes: 1 }),
        addComment: jest.fn().mockResolvedValue({ id: 'comment-1' }),
        getPostById: jest.fn().mockResolvedValue({ id: REAL_UUID }),
        getComments: jest.fn().mockResolvedValue([]),
        updatePost: jest.fn().mockResolvedValue({ id: REAL_UUID }),
        deletePost: jest.fn().mockResolvedValue({ success: true }),
        getUserPosts: jest.fn().mockResolvedValue([]),
        getChallenges: jest.fn().mockResolvedValue([]),
        joinChallenge: jest.fn().mockResolvedValue({ id: 'participant-1' }),
        updateChallengeProgress: jest.fn().mockResolvedValue({ id: 'participant-1' }),
        getLeaderboard: jest.fn().mockResolvedValue([]),
        getUserScore: jest.fn().mockResolvedValue({ userId: REAL_USER_ID, xp: 0, level: 1, xpForNextLevel: 100 }),
        getBadgeCatalog: jest.fn().mockResolvedValue([]),
        getUserBadges: jest.fn().mockResolvedValue([]),
        getUnseenBadges: jest.fn().mockResolvedValue([]),
        awardBadgeByKey: jest.fn().mockResolvedValue({ id: 'user-badge-1' }),
    };
}

type MockService = ReturnType<typeof buildMockService>;

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // Same compilers as src/index.ts so the route zod schemas validate identically.
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(routes, { communityService: svc as any, jwtSecret: JWT_SECRET });
    await app.ready();
    return app;
}

// The canonical body produced by the authenticate decorator on any auth failure.
const CANONICAL_401 = {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'A valid Bearer token is required.',
};

// Tokens that must each be rejected with the canonical 401.
const MISSING = undefined; // no Authorization header at all
const FORGED = jwt.sign({ id: REAL_USER_ID }, 'a-totally-different-secret');
const EXPIRED = jwt.sign({ id: REAL_USER_ID }, JWT_SECRET, { expiresIn: -3600 });
const MALFORMED = 'not.a.jwt';
// A genuinely valid token (signed with the known secret) — must NOT 401.
const VALID = jwt.sign({ id: REAL_USER_ID }, JWT_SECRET, { expiresIn: '1h' });

// The full inventory of protected routes. Each carries the method that the
// route's handler delegates to so we can assert it is never reached on a 401.
// Bodies/params are valid where required so that — for the VALID-token case —
// the request is rejected (if at all) by business logic, never by auth.
interface RouteCase {
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    serviceMethod: keyof MockService;
    payload?: Record<string, unknown>;
}

const PROTECTED_ROUTES: RouteCase[] = [
    { name: 'GET feed', method: 'GET', url: '/v1/community/feed', serviceMethod: 'getFeed' },
    { name: 'POST post', method: 'POST', url: '/v1/community/post', serviceMethod: 'createPost', payload: { content: 'hello world' } },
    { name: 'POST post/:id/like', method: 'POST', url: `/v1/community/post/${REAL_UUID}/like`, serviceMethod: 'likePost' },
    { name: 'POST post/:id/comment', method: 'POST', url: `/v1/community/post/${REAL_UUID}/comment`, serviceMethod: 'addComment', payload: { text: 'nice post' } },
    { name: 'GET post/:id', method: 'GET', url: `/v1/community/post/${REAL_UUID}`, serviceMethod: 'getPostById' },
    { name: 'GET post/:id/comments', method: 'GET', url: `/v1/community/post/${REAL_UUID}/comments`, serviceMethod: 'getComments' },
    { name: 'PUT post/:id', method: 'PUT', url: `/v1/community/post/${REAL_UUID}`, serviceMethod: 'updatePost', payload: { content: 'edited content' } },
    { name: 'DELETE post/:id', method: 'DELETE', url: `/v1/community/post/${REAL_UUID}`, serviceMethod: 'deletePost' },
    { name: 'GET user/:id/posts', method: 'GET', url: `/v1/community/user/${REAL_USER_ID}/posts`, serviceMethod: 'getUserPosts' },
    { name: 'GET challenges', method: 'GET', url: '/v1/community/challenges', serviceMethod: 'getChallenges' },
    { name: 'POST challenges/:id/join', method: 'POST', url: `/v1/community/challenges/${REAL_UUID}/join`, serviceMethod: 'joinChallenge' },
    { name: 'POST challenges/:id/progress', method: 'POST', url: `/v1/community/challenges/${REAL_UUID}/progress`, serviceMethod: 'updateChallengeProgress', payload: { progress: 50 } },
    { name: 'GET leaderboard', method: 'GET', url: '/v1/community/leaderboard', serviceMethod: 'getLeaderboard' },
    { name: 'GET badges', method: 'GET', url: '/v1/community/badges', serviceMethod: 'getBadgeCatalog' },
    { name: 'GET badges/mine', method: 'GET', url: '/v1/community/badges/mine', serviceMethod: 'getUserBadges' },
    { name: 'GET badges/unseen', method: 'GET', url: '/v1/community/badges/unseen', serviceMethod: 'getUnseenBadges' },
    { name: 'GET badges/user/:userId', method: 'GET', url: `/v1/community/badges/user/${REAL_USER_ID}`, serviceMethod: 'getUserBadges' },
    { name: 'POST badges/award', method: 'POST', url: '/v1/community/badges/award', serviceMethod: 'awardBadgeByKey', payload: { userId: REAL_USER_ID, badgeKey: 'first_post' } },
    { name: 'GET user/:id/score', method: 'GET', url: `/v1/community/user/${REAL_USER_ID}/score`, serviceMethod: 'getUserScore' },
];

function authHeaders(token?: string): Record<string, string> {
    return token ? { authorization: `Bearer ${token}` } : {};
}

describe('community-service protected routes — authentication (401)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    it('covers every protected /v1/community/* route in the inventory', () => {
        // Guard against the inventory silently drifting from src/routes.ts.
        expect(PROTECTED_ROUTES).toHaveLength(19);
    });

    // ── No token ────────────────────────────────────────────────────────────
    describe('missing Bearer token', () => {
        it.each(PROTECTED_ROUTES)('$name -> 401 canonical body, $serviceMethod never called', async (route) => {
            const res = await app.inject({
                method: route.method,
                url: route.url,
                headers: authHeaders(MISSING),
                payload: route.payload,
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual(CANONICAL_401);
            expect(svc[route.serviceMethod]).not.toHaveBeenCalled();
            // No fallback / hardcoded identity may ever surface in the body.
            expect(res.body).not.toContain('test-user-id');
        });
    });

    // ── Forged token (signed with the wrong secret) ──────────────────────────
    describe('forged Bearer token (wrong secret)', () => {
        it.each(PROTECTED_ROUTES)('$name -> 401 canonical body, $serviceMethod never called', async (route) => {
            const res = await app.inject({
                method: route.method,
                url: route.url,
                headers: authHeaders(FORGED),
                payload: route.payload,
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual(CANONICAL_401);
            expect(svc[route.serviceMethod]).not.toHaveBeenCalled();
            expect(res.body).not.toContain('test-user-id');
        });
    });

    // ── Expired token (valid secret, exp in the past) ────────────────────────
    describe('expired Bearer token', () => {
        it.each(PROTECTED_ROUTES)('$name -> 401 canonical body, $serviceMethod never called', async (route) => {
            const res = await app.inject({
                method: route.method,
                url: route.url,
                headers: authHeaders(EXPIRED),
                payload: route.payload,
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual(CANONICAL_401);
            expect(svc[route.serviceMethod]).not.toHaveBeenCalled();
            expect(res.body).not.toContain('test-user-id');
        });
    });

    // ── Malformed token (not a JWT at all) ───────────────────────────────────
    describe('malformed Bearer token', () => {
        it.each(PROTECTED_ROUTES)('$name -> 401 canonical body, $serviceMethod never called', async (route) => {
            const res = await app.inject({
                method: route.method,
                url: route.url,
                headers: authHeaders(MALFORMED),
                payload: route.payload,
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual(CANONICAL_401);
            expect(svc[route.serviceMethod]).not.toHaveBeenCalled();
            expect(res.body).not.toContain('test-user-id');
        });
    });

    // ── Valid token — must pass the auth gate (never 401) ────────────────────
    describe('valid Bearer token', () => {
        it.each(PROTECTED_ROUTES)('$name -> NOT 401 (passes authenticate)', async (route) => {
            const res = await app.inject({
                method: route.method,
                url: route.url,
                headers: authHeaders(VALID),
                payload: route.payload,
            });

            expect(res.statusCode).not.toBe(401);
        });
    });
});
