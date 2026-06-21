import { CommunityService } from '../src/community.service';

/**
 * Private-account content-leak regression (sprint findings HIGH #7, HIGH #8,
 * MEDIUM #13). Before this fix THREE read paths bypassed the follow/privacy
 * gate that getUserPosts already enforced via canViewUserContent:
 *   - getFeed       returned a private author's posts in everyone's global feed
 *   - getPostById   returned any post by id with no privacy gate
 *   - getComments   returned a post's comments with no privacy gate
 *
 * These tests drive the REAL CommunityService against an in-memory follow store
 * + post/comment stubs, with a configurable-privacy AuthorResolver, and assert:
 *   - a PRIVATE author's post/comments are HIDDEN from a non-follower,
 *   - VISIBLE to an accepted follower,
 *   - VISIBLE to the author themselves,
 *   - a PUBLIC author's content is always visible (behaviour unchanged).
 */

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';   // a non-follower
const FOLLOWER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';  // follows AUTHOR
const AUTHOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';    // the (possibly private) author
const PUBLIC_AUTHOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface FollowRow { id: string; followerId: string; followingId: string; createdAt: Date; }

// In-memory `follow` delegate modelling findUnique / findMany / createMany.
function buildFollowStore(seed: Array<[string, string]> = []) {
    const rows: FollowRow[] = seed.map(([f, t], i) => ({
        id: `f${i}`, followerId: f, followingId: t, createdAt: new Date(),
    }));
    let seq = rows.length;
    const follow = {
        findUnique: jest.fn(async ({ where }: any) => {
            const k = where.followerId_followingId;
            return rows.find((r) => r.followerId === k.followerId && r.followingId === k.followingId) ?? null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
            const ins: string[] | undefined = where.followingId?.in;
            return rows.filter(
                (r) =>
                    (where.followerId === undefined || r.followerId === where.followerId) &&
                    (ins === undefined || ins.includes(r.followingId))
            ).map((r) => ({ followingId: r.followingId }));
        }),
        createMany: jest.fn(async ({ data }: any) => {
            const items = Array.isArray(data) ? data : [data];
            for (const it of items) {
                if (!rows.some((r) => r.followerId === it.followerId && r.followingId === it.followingId)) {
                    rows.push({ id: `f${++seq}`, ...it, createdAt: new Date() });
                }
            }
            return { count: items.length };
        }),
    };
    return { follow, rows };
}

// AuthorResolver stub: AUTHOR's privacy is configurable; PUBLIC_AUTHOR is public.
function buildResolver(authorIsPrivate: boolean) {
    const make = (id: string) => ({
        id,
        name: 'Author',
        avatarUrl: null,
        isPrivate: id === AUTHOR ? authorIsPrivate : false,
    });
    return {
        resolveOne: jest.fn(async (id: string) => make(id)),
        resolveMany: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, make(id)]))),
        attachAuthors: jest.fn(async (items: any[]) => items),
        attachAuthor: jest.fn(async (item: any) => item),
    } as any;
}

function buildPrisma(opts: {
    seedFollows?: Array<[string, string]>;
    posts?: any[];
    comments?: any[];
    postById?: Record<string, any>;
}) {
    const { follow } = buildFollowStore(opts.seedFollows);
    const posts = opts.posts ?? [];
    const byId = opts.postById ?? {};
    return {
        follow,
        post: {
            findMany: jest.fn(async () => posts),
            findUnique: jest.fn(async ({ where }: any) => byId[where.id] ?? null),
        },
        comment: {
            findMany: jest.fn(async () => opts.comments ?? []),
        },
    } as any;
}

const PRIVATE_POST = { id: 'p1', authorId: AUTHOR, content: 'secret', likes: 0, createdAt: new Date(), _count: { comments: 1 } };
const PUBLIC_POST = { id: 'p2', authorId: PUBLIC_AUTHOR, content: 'hello', likes: 0, createdAt: new Date(), _count: { comments: 0 } };
const PRIVATE_COMMENTS = [{ id: 'c1', postId: 'p1', authorId: AUTHOR, text: 'thread', createdAt: new Date() }];

// ── (a) getFeed ───────────────────────────────────────────────────────────────
describe('CommunityService.getFeed — privacy gate', () => {
    it('hides a PRIVATE author\'s post from a non-follower (but keeps public posts)', async () => {
        const prisma = buildPrisma({ posts: [PRIVATE_POST, PUBLIC_POST] });
        const svc = new CommunityService(prisma, buildResolver(true));

        const feed = await svc.getFeed(VIEWER, 20);

        expect(feed.map((p: any) => p.id)).toEqual(['p2']); // private p1 filtered out
    });

    it('shows a PRIVATE author\'s post to an accepted follower', async () => {
        const prisma = buildPrisma({ posts: [PRIVATE_POST, PUBLIC_POST], seedFollows: [[FOLLOWER, AUTHOR]] });
        const svc = new CommunityService(prisma, buildResolver(true));

        const feed = await svc.getFeed(FOLLOWER, 20);

        expect(feed.map((p: any) => p.id).sort()).toEqual(['p1', 'p2']);
    });

    it('shows a PRIVATE author their OWN post in the feed', async () => {
        const prisma = buildPrisma({ posts: [PRIVATE_POST, PUBLIC_POST] });
        const svc = new CommunityService(prisma, buildResolver(true));

        const feed = await svc.getFeed(AUTHOR, 20);

        expect(feed.map((p: any) => p.id).sort()).toEqual(['p1', 'p2']);
    });

    it('PUBLIC author posts appear for everyone (behaviour unchanged)', async () => {
        const prisma = buildPrisma({ posts: [PUBLIC_POST] });
        const svc = new CommunityService(prisma, buildResolver(false));

        const feed = await svc.getFeed(VIEWER, 20);

        expect(feed.map((p: any) => p.id)).toEqual(['p2']);
    });
});

// ── (b) getPostById ─────────────────────────────────────────────────────────────
describe('CommunityService.getPostById — privacy gate', () => {
    it('returns null (-> 404) for a PRIVATE author\'s post to a non-follower', async () => {
        const prisma = buildPrisma({ postById: { p1: PRIVATE_POST } });
        const svc = new CommunityService(prisma, buildResolver(true));

        expect(await svc.getPostById(VIEWER, 'p1')).toBeNull();
    });

    it('returns the post to an accepted follower of a PRIVATE author', async () => {
        const prisma = buildPrisma({ postById: { p1: PRIVATE_POST }, seedFollows: [[FOLLOWER, AUTHOR]] });
        const svc = new CommunityService(prisma, buildResolver(true));

        const post: any = await svc.getPostById(FOLLOWER, 'p1');
        expect(post?.id).toBe('p1');
    });

    it('returns the post to the author themselves (private)', async () => {
        const prisma = buildPrisma({ postById: { p1: PRIVATE_POST } });
        const svc = new CommunityService(prisma, buildResolver(true));

        const post: any = await svc.getPostById(AUTHOR, 'p1');
        expect(post?.id).toBe('p1');
    });

    it('returns a PUBLIC author\'s post to anyone (behaviour unchanged)', async () => {
        const prisma = buildPrisma({ postById: { p2: PUBLIC_POST } });
        const svc = new CommunityService(prisma, buildResolver(false));

        const post: any = await svc.getPostById(VIEWER, 'p2');
        expect(post?.id).toBe('p2');
    });
});

// ── (c) getComments ─────────────────────────────────────────────────────────────
describe('CommunityService.getComments — privacy gate', () => {
    it('returns an empty list for a PRIVATE author\'s post to a non-follower', async () => {
        const prisma = buildPrisma({ postById: { p1: PRIVATE_POST }, comments: PRIVATE_COMMENTS });
        const svc = new CommunityService(prisma, buildResolver(true));

        expect(await svc.getComments(VIEWER, 'p1')).toEqual([]);
        // Gate blocks before the comment query runs.
        expect(prisma.comment.findMany).not.toHaveBeenCalled();
    });

    it('returns comments to an accepted follower of a PRIVATE author', async () => {
        const prisma = buildPrisma({ postById: { p1: PRIVATE_POST }, comments: PRIVATE_COMMENTS, seedFollows: [[FOLLOWER, AUTHOR]] });
        const svc = new CommunityService(prisma, buildResolver(true));

        const comments = await svc.getComments(FOLLOWER, 'p1');
        expect(comments).toHaveLength(1);
        expect(prisma.comment.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns comments to the author themselves (private)', async () => {
        const prisma = buildPrisma({ postById: { p1: PRIVATE_POST }, comments: PRIVATE_COMMENTS });
        const svc = new CommunityService(prisma, buildResolver(true));

        const comments = await svc.getComments(AUTHOR, 'p1');
        expect(comments).toHaveLength(1);
    });

    it('returns comments on a PUBLIC author\'s post to anyone (behaviour unchanged)', async () => {
        const prisma = buildPrisma({ postById: { p2: PUBLIC_POST }, comments: [{ id: 'c2', postId: 'p2', authorId: PUBLIC_AUTHOR, text: 'hi', createdAt: new Date() }] });
        const svc = new CommunityService(prisma, buildResolver(false));

        const comments = await svc.getComments(VIEWER, 'p2');
        expect(comments).toHaveLength(1);
    });

    it('returns an empty list when the post does not exist', async () => {
        const prisma = buildPrisma({ postById: {}, comments: PRIVATE_COMMENTS });
        const svc = new CommunityService(prisma, buildResolver(true));

        expect(await svc.getComments(VIEWER, 'missing')).toEqual([]);
    });
});
