import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import { CommunityService } from '../src/community.service';
import routes from '../src/routes';

/**
 * Per-user post-like de-duplication regression (data-integrity HIGH #4).
 *
 * The bug: likePost did an UNCONDITIONAL Post.likes++ with no per-user record,
 * and the route didn't pass a likerId — so one user could re-like a post
 * unboundedly, inflating its like count and gaming the Social Butterfly badge
 * (which sums Post.likes across an author's posts).
 *
 * We drive the REAL CommunityService against in-memory `postLike` / `post`
 * delegates that faithfully model the @@unique([userId, postId]) constraint and
 * the $transaction / findUnique / create / deleteMany / update / aggregate
 * surface the service uses — proving the actual service logic de-dupes, not a
 * mock of it.
 */

const POST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AUTHOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

interface PostLikeRow { id: string; postId: string; userId: string; }
interface PostRow { id: string; authorId: string; likes: number; }

function buildPrismaStub(initialPost: PostRow) {
    let seq = 0;
    const likeRows: PostLikeRow[] = [];
    const postRows: PostRow[] = [{ ...initialPost }];

    const findPost = (id: string) => postRows.find((p) => p.id === id);

    const postLike = {
        findUnique: jest.fn(async ({ where }: any) => {
            const k = where.userId_postId;
            return likeRows.find((r) => r.userId === k.userId && r.postId === k.postId) ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
            const dup = likeRows.some((r) => r.userId === data.userId && r.postId === data.postId);
            if (dup) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            const row = { id: `pl${++seq}`, postId: data.postId, userId: data.userId };
            likeRows.push(row);
            return row;
        }),
        deleteMany: jest.fn(async ({ where }: any) => {
            const before = likeRows.length;
            for (let i = likeRows.length - 1; i >= 0; i--) {
                if (likeRows[i].userId === where.userId && likeRows[i].postId === where.postId) {
                    likeRows.splice(i, 1);
                }
            }
            return { count: before - likeRows.length };
        }),
        count: jest.fn(async ({ where }: any) =>
            likeRows.filter((r) => r.postId === where.postId).length
        ),
    };

    const post = {
        findUnique: jest.fn(async ({ where }: any) => {
            const p = findPost(where.id);
            return p ? { ...p } : null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
            const p = findPost(where.id);
            if (!p) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
            if (data.likes?.increment) p.likes += data.likes.increment;
            if (data.likes?.decrement) p.likes -= data.likes.decrement;
            return { ...p };
        }),
        aggregate: jest.fn(async ({ where }: any) => {
            const sum = postRows
                .filter((p) => p.authorId === where.authorId)
                .reduce((acc, p) => acc + p.likes, 0);
            return { _sum: { likes: sum } };
        }),
    };

    const prisma: any = {
        postLike,
        post,
        // Pass-through transaction over the same in-memory delegates.
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
        // Social-butterfly badge lookups — no badge row, so award is a no-op.
        badge: { findUnique: jest.fn(async () => null) },
        userBadge: { findUnique: jest.fn(async () => null), create: jest.fn() },
    };

    return { prisma, likeRows, postRows };
}

describe('CommunityService.likePost — per-user de-duplication', () => {
    it('same user likes twice => likes == 1, single PostLike row', async () => {
        const { prisma, likeRows, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        const svc = new CommunityService(prisma);

        await svc.likePost(POST_ID, USER_A);
        const second = await svc.likePost(POST_ID, USER_A); // re-like — no-op

        expect(second!.likes).toBe(1);
        expect(postRows[0].likes).toBe(1);
        expect(likeRows.filter((r) => r.postId === POST_ID)).toHaveLength(1);
    });

    it('two different users => likes == 2, two PostLike rows', async () => {
        const { prisma, likeRows, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        const svc = new CommunityService(prisma);

        await svc.likePost(POST_ID, USER_A);
        await svc.likePost(POST_ID, USER_B);

        expect(postRows[0].likes).toBe(2);
        expect(likeRows.filter((r) => r.postId === POST_ID)).toHaveLength(2);
    });

    it('a lost-race duplicate (P2002 on create) is swallowed, counter untouched', async () => {
        const { prisma, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        const svc = new CommunityService(prisma);
        // First like succeeds.
        await svc.likePost(POST_ID, USER_A);
        // Force the check-then-act to miss the existing row, then hit the unique
        // constraint on create — exactly the concurrent double-like race.
        (prisma.postLike.findUnique as jest.Mock).mockResolvedValueOnce(null);
        const res = await svc.likePost(POST_ID, USER_A);
        expect(res!.likes).toBe(1);
        expect(postRows[0].likes).toBe(1);
    });

    it('unlikePost is idempotent: decrements only when a like existed', async () => {
        const { prisma, likeRows, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        const svc = new CommunityService(prisma);

        await svc.likePost(POST_ID, USER_A);
        expect(postRows[0].likes).toBe(1);

        await svc.unlikePost(POST_ID, USER_A);
        expect(postRows[0].likes).toBe(0);
        expect(likeRows).toHaveLength(0);

        // Unliking again is a no-op — never goes negative.
        await svc.unlikePost(POST_ID, USER_A);
        expect(postRows[0].likes).toBe(0);
    });

    it('legacy path (no likerId) keeps the unconditional increment', async () => {
        const { prisma, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        const svc = new CommunityService(prisma);

        await svc.likePost(POST_ID);
        await svc.likePost(POST_ID);

        expect(postRows[0].likes).toBe(2);
    });
});

// ── Route wiring: like/unlike attribute the like to the JWT caller ────────────

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const TOKEN_A = jwt.sign({ id: USER_A }, JWT_SECRET, { expiresIn: '1h' });

describe('like routes — wire likerId from JWT', () => {
    let app: FastifyInstance;

    async function buildApp(svc: CommunityService): Promise<FastifyInstance> {
        const a = Fastify({ logger: false });
        a.setValidatorCompiler(validatorCompiler);
        a.setSerializerCompiler(serializerCompiler);
        await a.register(routes, { communityService: svc as any, jwtSecret: JWT_SECRET });
        await a.ready();
        return a;
    }

    afterEach(async () => { if (app) await app.close(); });

    it('POST /post/:id/like passes the caller id; re-like by same user keeps likes == 1', async () => {
        const { prisma, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        app = await buildApp(new CommunityService(prisma));

        const first = await app.inject({
            method: 'POST', url: `/v1/community/post/${POST_ID}/like`,
            headers: { authorization: `Bearer ${TOKEN_A}` },
        });
        expect(first.statusCode).toBe(200);
        expect(first.json().likes).toBe(1);

        const second = await app.inject({
            method: 'POST', url: `/v1/community/post/${POST_ID}/like`,
            headers: { authorization: `Bearer ${TOKEN_A}` },
        });
        expect(second.json().likes).toBe(1);
        expect(postRows[0].likes).toBe(1);
    });

    it('DELETE /post/:id/like decrements idempotently', async () => {
        const { prisma, postRows } = buildPrismaStub({ id: POST_ID, authorId: AUTHOR, likes: 0 });
        app = await buildApp(new CommunityService(prisma));

        await app.inject({ method: 'POST', url: `/v1/community/post/${POST_ID}/like`, headers: { authorization: `Bearer ${TOKEN_A}` } });
        const res = await app.inject({ method: 'DELETE', url: `/v1/community/post/${POST_ID}/like`, headers: { authorization: `Bearer ${TOKEN_A}` } });
        expect(res.statusCode).toBe(200);
        expect(postRows[0].likes).toBe(0);
    });
});
