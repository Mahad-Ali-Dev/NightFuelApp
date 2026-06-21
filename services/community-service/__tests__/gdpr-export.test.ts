/**
 * GDPR data-export regression suite — GET /v1/community/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge. Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only, behind the SAME internal-token
 *      guard the purge uses. Without the X-Internal-Token header (or with the
 *      wrong one) it MUST answer 404 (the stock not-found body), never revealing
 *      the route exists, and CommunityService.exportUser is NEVER invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME user-owned tables the purge covers (posts, comments,
 *      post_likes, user_scores, user_badges, challenge_participants, follows),
 *      keyed by table name, and only the target user's rows (others are excluded).
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real CommunityService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics: posts/comments
 *     by author_id, likes/scores/badges/participants by user_id, follows in BOTH
 *     directions — and that OTHER users' rows are NOT returned. It also proves the
 *     export table set EXACTLY matches the purge table set (sync invariant) and that
 *     no secret/credential-looking field leaks into the output.
 *   • REST — the genuine `routes` plugin (mock CommunityService) proves the guard
 *     and the 200 body wiring.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import routes from '../src/routes';
import { CommunityService } from '../src/community.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

const EXPORT_TABLES = [
    'challenge_participants',
    'comments',
    'follows',
    'post_likes',
    'posts',
    'user_badges',
    'user_scores',
];

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what CommunityService.exportUser touches: findMany on post /
// comment / postLike / userScore / userBadge / challengeParticipant / follow with
// the exact `where` shapes exportUser builds, plus the post/comment orderBy
// (createdAt desc) + take bound.
function makeFakePrisma(seed?: {
    posts?: any[];
    comments?: any[];
    postLikes?: any[];
    userScores?: any[];
    userBadges?: any[];
    challengeParticipants?: any[];
    follows?: any[];
}) {
    const state = {
        posts: seed?.posts ? [...seed.posts] : [],
        comments: seed?.comments ? [...seed.comments] : [],
        postLikes: seed?.postLikes ? [...seed.postLikes] : [],
        userScores: seed?.userScores ? [...seed.userScores] : [],
        userBadges: seed?.userBadges ? [...seed.userBadges] : [],
        challengeParticipants: seed?.challengeParticipants ? [...seed.challengeParticipants] : [],
        follows: seed?.follows ? [...seed.follows] : [],
    };

    const findByAuthor = (rows: any[], { where, orderBy, take }: any) => {
        let out = rows.filter((r) => r.authorId === where.authorId);
        if (orderBy?.createdAt === 'desc') {
            out = [...out].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
        }
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const findByUser = (rows: any[], { where, take }: any) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const prisma: any = {
        post: { findMany: (args: any) => findByAuthor(state.posts, args) },
        comment: { findMany: (args: any) => findByAuthor(state.comments, args) },
        postLike: { findMany: (args: any) => findByUser(state.postLikes, args) },
        userScore: { findMany: (args: any) => findByUser(state.userScores, args) },
        userBadge: { findMany: (args: any) => findByUser(state.userBadges, args) },
        challengeParticipant: {
            findMany: (args: any) => findByUser(state.challengeParticipants, args),
        },
        follow: {
            findMany: ({ where }: any) =>
                Promise.resolve(
                    state.follows.filter((r) =>
                        where.OR.some(
                            (c: any) =>
                                (c.followerId && r.followerId === c.followerId) ||
                                (c.followingId && r.followingId === c.followingId),
                        ),
                    ),
                ),
        },
        // exportUser only reads; purgeUser (used by the sync-invariant test) runs an
        // array of deleteMany promises through $transaction. Provide stub deleteMany +
        // a sequential $transaction so purgeUser('nobody') returns all-zero counts.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };
    for (const model of [
        'post',
        'comment',
        'postLike',
        'userScore',
        'userBadge',
        'challengeParticipant',
        'follow',
    ]) {
        prisma[model].deleteMany = () => Promise.resolve({ count: 0 });
    }

    return { prisma, state };
}

/** Build a fresh app wired like src/index.ts, with the internal token set. */
async function buildApp(
    communityService: any,
    internalServiceToken: string | undefined = INTERNAL_TOKEN,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(routes as any, {
        communityService,
        jwtSecret: JWT_SECRET,
        internalServiceToken,
    });
    await app.ready();
    return app;
}

describe('CommunityService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            posts: [
                { id: 'p1', authorId: 'victim', content: 'a', createdAt: '2026-01-01T00:00:00Z' },
                { id: 'p2', authorId: 'victim', content: 'b', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'p3', authorId: 'other', content: 'c', createdAt: '2026-01-03T00:00:00Z' },
            ],
            comments: [
                { id: 'cm1', postId: 'p1', authorId: 'victim', createdAt: '2026-01-01T00:00:00Z' },
                { id: 'cm2', postId: 'p3', authorId: 'victim', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'cm3', postId: 'p3', authorId: 'other', createdAt: '2026-01-03T00:00:00Z' },
            ],
            postLikes: [
                { id: 'l1', userId: 'victim', postId: 'p3' },
                { id: 'l2', userId: 'other', postId: 'p1' },
            ],
            userScores: [{ userId: 'victim', xp: 100 }, { userId: 'other', xp: 5 }],
            userBadges: [
                { id: 'b1', userId: 'victim' },
                { id: 'b2', userId: 'other' },
            ],
            challengeParticipants: [
                { id: 'cp1', userId: 'victim' },
                { id: 'cp2', userId: 'other' },
            ],
            follows: [
                { id: 'f1', followerId: 'victim', followingId: 'other' }, // victim follows
                { id: 'f2', followerId: 'other', followingId: 'victim' }, // victim is followed
                { id: 'f3', followerId: 'other', followingId: 'third' }, // unrelated
            ],
        });
        const svc = new CommunityService(prisma as any);

        const out = await svc.exportUser('victim');

        expect(out.posts.map((p: any) => p.id).sort()).toEqual(['p1', 'p2']);
        expect(out.comments.map((c: any) => c.id).sort()).toEqual(['cm1', 'cm2']);
        expect(out.post_likes.map((l: any) => l.id)).toEqual(['l1']);
        expect(out.user_scores).toEqual([{ userId: 'victim', xp: 100 }]);
        expect(out.user_badges.map((b: any) => b.id)).toEqual(['b1']);
        expect(out.challenge_participants.map((c: any) => c.id)).toEqual(['cp1']);
        // Both directions of the social graph belong to the user.
        expect(out.follows.map((f: any) => f.id).sort()).toEqual(['f1', 'f2']);

        // Unrelated user's rows are NOT present anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('"id":"p3"');
        expect(serialized).not.toContain('"id":"cm3"');
        expect(serialized).not.toContain('"id":"f3"');
        expect(serialized).not.toContain('"userId":"other"');
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new CommunityService(prisma as any);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('does NOT leak any secret/credential-looking field (no password/token/secret/key)', async () => {
        const { prisma } = makeFakePrisma({
            posts: [{ id: 'p1', authorId: 'victim', content: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
            comments: [{ id: 'cm1', postId: 'p1', authorId: 'victim', text: 'yo', createdAt: '2026-01-01T00:00:00Z' }],
            postLikes: [{ id: 'l1', userId: 'victim', postId: 'p1' }],
            userScores: [{ userId: 'victim', xp: 100, level: 2 }],
            userBadges: [{ id: 'b1', userId: 'victim', badgeId: 'first_post' }],
            challengeParticipants: [{ id: 'cp1', userId: 'victim', challengeId: 'ch1' }],
            follows: [{ id: 'f1', followerId: 'victim', followingId: 'other' }],
        });
        const svc = new CommunityService(prisma as any);

        const out = await svc.exportUser('victim');
        const serialized = JSON.stringify(out).toLowerCase();

        for (const forbidden of [
            'password',
            'passwordhash',
            'token',
            'secret',
            'apikey',
            'privatekey',
            'credential',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('returns empty arrays (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma } = makeFakePrisma({ posts: [{ id: 'p1', authorId: 'someone-else' }] });
        const svc = new CommunityService(prisma as any);

        const first = await svc.exportUser('ghost');
        const second = await svc.exportUser('ghost');

        expect(first.posts).toEqual([]);
        expect(first.comments).toEqual([]);
        expect(first.post_likes).toEqual([]);
        expect(first.user_scores).toEqual([]);
        expect(first.user_badges).toEqual([]);
        expect(first.challenge_participants).toEqual([]);
        expect(first.follows).toEqual([]);
        // Repeatable: identical output for unchanged data.
        expect(second).toEqual(first);
    });

    it('bounds the large per-user tables and flags truncation when over the cap', async () => {
        const cap = 50_000;
        const mkPosts = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `p${i}`,
                authorId: 'victim',
                content: 't',
                createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }));
        const { prisma } = makeFakePrisma({ posts: mkPosts(cap + 1) });
        const svc = new CommunityService(prisma as any);

        const out = await svc.exportUser('victim');

        expect(out.posts.length).toBe(cap);
        expect(out._meta.postsTruncated).toBe(true);
        expect(out._meta.commentsTruncated).toBe(false);
        expect(out._meta.rowLimit).toBe(cap);
    });
});

describe('GET /v1/community/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    const emptyExport = () =>
        Promise.resolve({
            posts: [],
            comments: [],
            post_likes: [],
            user_scores: [],
            user_badges: [],
            challenge_participants: [],
            follows: [],
            _meta: { postsTruncated: false, commentsTruncated: false, postLikesTruncated: false, rowLimit: 50000 },
        });

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: '/v1/community/internal/user/victim/export' });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/community/internal/user/victim/export',
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            posts: [{ id: 'p1', authorId: 'victim', content: 'hi' }],
            comments: [{ id: 'cm1', authorId: 'victim', text: 'yo' }],
            post_likes: [{ id: 'l1', userId: 'victim', postId: 'p1' }],
            user_scores: [{ userId: 'victim', xp: 100 }],
            user_badges: [{ id: 'b1', userId: 'victim' }],
            challenge_participants: [{ id: 'cp1', userId: 'victim' }],
            follows: [{ id: 'f1', followerId: 'victim', followingId: 'other' }],
            _meta: { postsTruncated: false, commentsTruncated: false, postLikesTruncated: false, rowLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/community/internal/user/victim/export',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ userId: 'victim', data });
        // Keyed by the SAME table names the purge deletes.
        expect(Object.keys(res.json().data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith('victim');
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/community/internal/user/ghost/export',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.posts).toEqual([]);
        expect(res.json().data.follows).toEqual([]);
    });

    it('fails CLOSED: with an UNSET internal token every request 404s', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser }, ''); // empty expected token

        const res = await app.inject({
            method: 'GET',
            url: '/v1/community/internal/user/victim/export',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
