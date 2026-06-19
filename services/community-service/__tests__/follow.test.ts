import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import { CommunityService, SelfFollowError } from '../src/community.service';
import routes from '../src/routes';

/**
 * Follow system + privacy-composition regression.
 *
 * We drive the REAL CommunityService against an in-memory `follow` delegate
 * that faithfully models the @@unique([followerId, followingId]) constraint and
 * the createMany/skipDuplicates / deleteMany / count / findUnique surface the
 * service uses. This proves the actual service logic (not a mock of it):
 *   - followUser is idempotent (re-follow is a no-op, never a duplicate row),
 *   - followUser rejects a self-follow with the typed SelfFollowError,
 *   - unfollowUser is idempotent (unfollowing a non-edge is a no-op),
 *   - getSocial returns correct isFollowing + accurate followers/following
 *     counts after follow → unfollow,
 *   - getUserDetailedProfile withholds detailed fields from a non-follower of a
 *     PRIVATE target, returns them to a follower, and ALWAYS returns the
 *     minimal { userId, displayName, avatarUrl, isPrivate } shape.
 * Route-level tests then assert the three social endpoints wire the follower
 * from the JWT and the :userId param as the target, with the contract bodies.
 */

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THIRD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface FollowRow {
    id: string;
    followerId: string;
    followingId: string;
    createdAt: Date;
}

// Faithful in-memory model of the Prisma `follow` delegate used by the service.
function buildFollowStore() {
    const rows: FollowRow[] = [];
    let seq = 0;

    const matchUnique = (where: any) =>
        where?.followerId_followingId
            ? rows.find(
                  (r) =>
                      r.followerId === where.followerId_followingId.followerId &&
                      r.followingId === where.followerId_followingId.followingId
              )
            : undefined;

    const follow = {
        findUnique: jest.fn(async ({ where }: any) => matchUnique(where) ?? null),
        count: jest.fn(async ({ where }: any) =>
            rows.filter(
                (r) =>
                    (where.followerId === undefined || r.followerId === where.followerId) &&
                    (where.followingId === undefined || r.followingId === where.followingId)
            ).length
        ),
        createMany: jest.fn(async ({ data, skipDuplicates }: any) => {
            const items: Array<{ followerId: string; followingId: string }> = Array.isArray(data) ? data : [data];
            let count = 0;
            for (const item of items) {
                const dup = rows.some(
                    (r) => r.followerId === item.followerId && r.followingId === item.followingId
                );
                if (dup) {
                    if (skipDuplicates) continue;
                    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
                }
                rows.push({ id: `f${++seq}`, followerId: item.followerId, followingId: item.followingId, createdAt: new Date() });
                count++;
            }
            return { count };
        }),
        deleteMany: jest.fn(async ({ where }: any) => {
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (
                    (where.followerId === undefined || rows[i].followerId === where.followerId) &&
                    (where.followingId === undefined || rows[i].followingId === where.followingId)
                ) {
                    rows.splice(i, 1);
                }
            }
            return { count: before - rows.length };
        }),
    };

    return { follow, rows };
}

// Prisma stub: the follow store + a userScore.findUnique used by getUserScore
// inside getUserDetailedProfile's "visible" branch.
function buildPrismaStub() {
    const { follow, rows } = buildFollowStore();
    return {
        prisma: {
            follow,
            userScore: { findUnique: jest.fn().mockResolvedValue({ userId: TARGET, xp: 250, level: 3 }) },
        } as any,
        rows,
    };
}

// AuthorResolver stub whose target privacy is configurable per test.
function buildResolver(isPrivate: boolean) {
    return {
        resolveOne: jest.fn(async (id: string) => ({
            id,
            name: 'Target User',
            avatarUrl: 'https://cdn.example.com/t.png',
            isPrivate,
        })),
        attachAuthors: jest.fn(async (items: any[]) => items),
    } as any;
}

describe('CommunityService — follow graph', () => {
    it('followUser is idempotent: re-follow does not create a duplicate row', async () => {
        const { prisma, rows } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(false));

        await svc.followUser(VIEWER, TARGET);
        await svc.followUser(VIEWER, TARGET); // re-follow — no-op

        expect(rows.filter((r) => r.followerId === VIEWER && r.followingId === TARGET)).toHaveLength(1);
    });

    it('followUser rejects a self-follow with SelfFollowError (no row written)', async () => {
        const { prisma, rows } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(false));

        await expect(svc.followUser(VIEWER, VIEWER)).rejects.toBeInstanceOf(SelfFollowError);
        await expect(svc.followUser(VIEWER, VIEWER)).rejects.toMatchObject({ code: 'self_follow' });
        expect(rows).toHaveLength(0);
    });

    it('unfollowUser is idempotent: unfollowing a non-edge is a no-op', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(false));

        await expect(svc.unfollowUser(VIEWER, TARGET)).resolves.toEqual({ success: true });

        await svc.followUser(VIEWER, TARGET);
        await expect(svc.unfollowUser(VIEWER, TARGET)).resolves.toEqual({ success: true });
        await expect(svc.unfollowUser(VIEWER, TARGET)).resolves.toEqual({ success: true }); // again — still fine
    });

    it('getSocial returns correct isFollowing + accurate counts after follow then unfollow', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(false));

        // Baseline: nobody follows anyone.
        expect(await svc.getSocial(VIEWER, TARGET)).toEqual({ isFollowing: false, followers: 0, following: 0 });

        // VIEWER follows TARGET, THIRD follows TARGET, TARGET follows THIRD.
        await svc.followUser(VIEWER, TARGET);
        await svc.followUser(THIRD, TARGET);
        await svc.followUser(TARGET, THIRD);

        const after = await svc.getSocial(VIEWER, TARGET);
        expect(after.isFollowing).toBe(true);   // viewer -> target exists
        expect(after.followers).toBe(2);        // VIEWER + THIRD follow TARGET
        expect(after.following).toBe(1);        // TARGET follows THIRD

        // VIEWER unfollows TARGET.
        await svc.unfollowUser(VIEWER, TARGET);
        const post = await svc.getSocial(VIEWER, TARGET);
        expect(post.isFollowing).toBe(false);
        expect(post.followers).toBe(1);         // only THIRD now
        expect(post.following).toBe(1);
    });
});

describe('CommunityService.getUserDetailedProfile — privacy composition', () => {
    it('withholds detailed fields from a NON-follower of a PRIVATE target', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(true)); // target is private

        const profile = await svc.getUserDetailedProfile(VIEWER, TARGET);

        // Minimal shape ONLY — no xp/level/social leak.
        expect(profile).toEqual({
            userId: TARGET,
            displayName: 'Target User',
            avatarUrl: 'https://cdn.example.com/t.png',
            isPrivate: true,
        });
        expect(profile).not.toHaveProperty('xp');
        expect(profile).not.toHaveProperty('followers');
    });

    it('returns the fuller profile to an ACCEPTED follower of a PRIVATE target', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(true));

        await svc.followUser(VIEWER, TARGET); // follow grants visibility immediately

        const profile: any = await svc.getUserDetailedProfile(VIEWER, TARGET);
        // level is the DERIVED value getUserScore computes from xp (xpToLevel(250) === 2),
        // not the raw stored row — assert the composed value flows through.
        expect(profile).toMatchObject({
            userId: TARGET,
            displayName: 'Target User',
            isPrivate: true,
            xp: 250,
            level: 2,
            isFollowing: true,
        });
    });

    it('returns the fuller profile for a PUBLIC target regardless of follow state', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(false)); // public

        const profile: any = await svc.getUserDetailedProfile(VIEWER, TARGET);
        expect(profile.isPrivate).toBe(false);
        expect(profile.xp).toBe(250);
        expect(profile).toHaveProperty('followers');
    });

    it('always returns the minimal { userId, displayName, avatarUrl, isPrivate } keys', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(true));
        const profile = await svc.getUserDetailedProfile(VIEWER, TARGET);
        for (const key of ['userId', 'displayName', 'avatarUrl', 'isPrivate']) {
            expect(profile).toHaveProperty(key);
        }
    });

    it('returns own private profile in full (viewer === target)', async () => {
        const { prisma } = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolver(true));
        // userScore for self
        (prisma.userScore.findUnique as jest.Mock).mockResolvedValue({ userId: VIEWER, xp: 99, level: 2 });
        const profile: any = await svc.getUserDetailedProfile(VIEWER, VIEWER);
        expect(profile.isPrivate).toBe(true);
        expect(profile).toHaveProperty('xp');
    });
});

// ── Route integration for the three social endpoints ──────────────────────────

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const VIEWER_TOKEN = jwt.sign({ id: VIEWER }, JWT_SECRET, { expiresIn: '1h' });

async function buildApp(svc: CommunityService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(routes, { communityService: svc as any, jwtSecret: JWT_SECRET });
    await app.ready();
    return app;
}

describe('social routes — wire contract', () => {
    let app: FastifyInstance;
    let svc: CommunityService;

    beforeEach(async () => {
        const { prisma } = buildPrismaStub();
        svc = new CommunityService(prisma, buildResolver(false));
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    it('POST /v1/community/follow/:userId — follower from JWT, idempotent 200', async () => {
        const first = await app.inject({
            method: 'POST',
            url: `/v1/community/follow/${TARGET}`,
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ success: true });

        // Re-follow is idempotent — still 200, still success.
        const second = await app.inject({
            method: 'POST',
            url: `/v1/community/follow/${TARGET}`,
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(second.statusCode).toBe(200);
        expect(second.json()).toEqual({ success: true });
    });

    it('POST /v1/community/follow/:userId — self-follow -> 400 self_follow', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/community/follow/${VIEWER}`, // target === caller
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'self_follow' });
    });

    it('DELETE /v1/community/follow/:userId — idempotent 200', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/community/follow/${TARGET}`,
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ success: true });
    });

    it('GET /v1/community/users/:userId/social — correct isFollowing + counts after follow/unfollow', async () => {
        // Before following.
        let res = await app.inject({
            method: 'GET',
            url: `/v1/community/users/${TARGET}/social`,
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(res.json()).toEqual({ isFollowing: false, followers: 0, following: 0 });

        // Follow then re-check.
        await app.inject({ method: 'POST', url: `/v1/community/follow/${TARGET}`, headers: { authorization: `Bearer ${VIEWER_TOKEN}` } });
        res = await app.inject({
            method: 'GET',
            url: `/v1/community/users/${TARGET}/social`,
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(res.json()).toEqual({ isFollowing: true, followers: 1, following: 0 });

        // Unfollow then re-check.
        await app.inject({ method: 'DELETE', url: `/v1/community/follow/${TARGET}`, headers: { authorization: `Bearer ${VIEWER_TOKEN}` } });
        res = await app.inject({
            method: 'GET',
            url: `/v1/community/users/${TARGET}/social`,
            headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
        });
        expect(res.json()).toEqual({ isFollowing: false, followers: 0, following: 0 });
    });
});
