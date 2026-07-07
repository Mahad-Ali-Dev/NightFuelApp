/**
 * GDPR purge regression suite — DELETE /v1/community/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and CommunityService.purgeUser
 *      is NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across all of this service's user-owned tables
 *      (posts, comments, post_likes, user_scores, user_badges,
 *      challenge_participants, follows) and returns a per-table deletedCounts
 *      summary. Idempotence is proved by purging a user with no rows (all-zero
 *      counts, still 200) and by re-purging.
 *
 * Layers, mirroring the rest of this service's suites:
 *   • SERVICE — the real CommunityService.purgeUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual delete semantics: posts by
 *     author_id (cascading to comments on those posts), the user's own comments
 *     elsewhere by author_id, likes/scores/badges/participants by user_id, and
 *     follows in BOTH directions — and that OTHER users' rows survive.
 *   • REST — the genuine `routes` plugin (mock CommunityService) proves the guard
 *     and the 200 summary wiring.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import routes from '../src/routes';
import { CommunityService } from '../src/community.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

const ZERO_COUNTS = {
    posts: 0,
    comments: 0,
    post_likes: 0,
    user_scores: 0,
    user_badges: 0,
    challenge_participants: 0,
    follows: 0,
};

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what CommunityService.purgeUser touches: a $transaction that
// runs an array of deleteMany promises, and deleteMany on post / comment /
// postLike / userScore / userBadge / challengeParticipant / follow with the exact
// `where` shapes purgeUser builds. The post deleteMany additionally cascades to
// comments on those posts (modelling comments.post onDelete: Cascade).
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

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        post: {
            deleteMany: ({ where }: any) => {
                const deletedPostIds = state.posts
                    .filter((r) => r.authorId === where.authorId)
                    .map((r) => r.id);
                const res = deleteFrom(state.posts, (r) => r.authorId === where.authorId);
                // Cascade: remove every comment on a deleted post (any author).
                deleteFrom(state.comments, (c) => deletedPostIds.includes(c.postId));
                return Promise.resolve(res);
            },
        },
        comment: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.comments, (r) => r.authorId === where.authorId)),
        },
        postLike: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.postLikes, (r) => r.userId === where.userId)),
        },
        userScore: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.userScores, (r) => r.userId === where.userId)),
        },
        userBadge: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.userBadges, (r) => r.userId === where.userId)),
        },
        challengeParticipant: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(
                    deleteFrom(state.challengeParticipants, (r) => r.userId === where.userId),
                ),
        },
        follow: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(
                    deleteFrom(state.follows, (r) =>
                        where.OR.some(
                            (c: any) =>
                                (c.followerId && r.followerId === c.followerId) ||
                                (c.followingId && r.followingId === c.followingId),
                        ),
                    ),
                ),
        },
        // CommunityService.purgeUser passes an array of deleteMany promises.
        // Resolve them in order (the operations have already started) and return
        // the results array, exactly like Prisma's sequential-array $transaction.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

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

describe('CommunityService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across all tables, leaving others', async () => {
        const { prisma, state } = makeFakePrisma({
            posts: [
                { id: 'p1', authorId: 'victim' },
                { id: 'p2', authorId: 'victim' },
                { id: 'p3', authorId: 'other' },
            ],
            comments: [
                { id: 'cm1', postId: 'p1', authorId: 'victim' }, // own comment on own post (cascade)
                { id: 'cm2', postId: 'p1', authorId: 'other' }, // other's comment on victim's post (cascade)
                { id: 'cm3', postId: 'p3', authorId: 'victim' }, // victim's comment on other's post (by author)
                { id: 'cm4', postId: 'p3', authorId: 'other' }, // unrelated — survives
            ],
            postLikes: [
                { id: 'l1', userId: 'victim', postId: 'p3' },
                { id: 'l2', userId: 'other', postId: 'p1' },
            ],
            userScores: [{ userId: 'victim' }, { userId: 'other' }],
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

        const counts = await svc.purgeUser('victim');

        expect(counts).toEqual({
            posts: 2,
            comments: 1, // only cm3 counted by author_id; cm1/cm2 went via post cascade
            post_likes: 1,
            user_scores: 1,
            user_badges: 1,
            challenge_participants: 1,
            follows: 2, // both directions
        });

        // Other users' rows survive.
        expect(state.posts.map((p) => p.id)).toEqual(['p3']);
        expect(state.comments.map((c) => c.id)).toEqual(['cm4']);
        expect(state.postLikes.map((l) => l.id)).toEqual(['l2']);
        expect(state.userScores).toEqual([{ userId: 'other' }]);
        expect(state.userBadges.map((b) => b.id)).toEqual(['b2']);
        expect(state.challengeParticipants.map((c) => c.id)).toEqual(['cp2']);
        expect(state.follows.map((f) => f.id)).toEqual(['f3']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw)', async () => {
        const { prisma } = makeFakePrisma({
            posts: [{ id: 'p1', authorId: 'someone-else' }],
            follows: [{ id: 'f1', followerId: 'someone-else', followingId: 'third' }],
        });
        const svc = new CommunityService(prisma as any);

        const first = await svc.purgeUser('ghost');
        const second = await svc.purgeUser('ghost'); // re-purge is safe

        expect(first).toEqual(ZERO_COUNTS);
        expect(second).toEqual(ZERO_COUNTS);
    });
});

describe('DELETE /v1/community/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ ...ZERO_COUNTS }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/community/internal/user/victim',
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ ...ZERO_COUNTS }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/community/internal/user/victim',
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const counts = {
            posts: 2,
            comments: 3,
            post_likes: 4,
            user_scores: 1,
            user_badges: 5,
            challenge_participants: 2,
            follows: 6,
        };
        const purgeUser = jest.fn(() => Promise.resolve(counts));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/community/internal/user/victim',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ userId: 'victim', deletedCounts: counts });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith('victim');
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ ...ZERO_COUNTS }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/community/internal/user/ghost',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual(ZERO_COUNTS);
    });

    it('fails CLOSED: with an UNSET internal token every request 404s', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ ...ZERO_COUNTS }));
        app = await buildApp({ purgeUser }, ''); // empty expected token

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/community/internal/user/victim',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });
});
