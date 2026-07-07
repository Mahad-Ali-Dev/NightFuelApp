/**
 * user-service perf cluster — UserService method behaviour.
 *
 * Covers:
 *   MEDIUM #9  getPublicProfile() — the lean public read path. Must NOT call
 *              userProfile.count() and must NOT auto-create a missing profile
 *              (returns null), selecting only the public fields.
 *   HIGH   #4  getPublicProfilesBatch() — single findMany({ in: ids }) → mapped
 *              public shape.
 *   HIGH   #3  getAllUsersInternal() — cursor-paginated findMany with take +
 *              cursor + skip, returning { users, nextCursor }.
 *
 * Exercises the REAL UserService against a hand-rolled Prisma stub (no DB).
 */
import { UserService } from '../src/user.service';

function buildEventBusStub() {
    return { publish: jest.fn(async () => undefined) } as any;
}

describe('UserService.getPublicProfile — MEDIUM #9 no-count lean read', () => {
    it('does a single findUnique selecting only public fields, no count(), no auto-create', async () => {
        const findUnique = jest.fn(async () => ({
            userId: 'u1',
            displayName: 'Nyx',
            avatarUrl: 'https://x/n.png',
            timezone: 'UTC',
            isPrivate: true,
        }));
        const count = jest.fn(async () => 1);
        const upsert = jest.fn();
        const prisma = {
            userProfile: { findUnique, count, upsert },
            userPreferences: { upsert: jest.fn() },
        } as any;

        const svc = new UserService(prisma, buildEventBusStub());
        const out = await svc.getPublicProfile('u1');

        expect(out).toEqual({
            id: 'u1',
            displayName: 'Nyx',
            avatarUrl: 'https://x/n.png',
            timezone: 'UTC',
            isPrivate: true,
        });
        // The whole point of #9: the read path no longer calls count() or
        // auto-creates via upsert.
        expect(count).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
        // It selects ONLY the public fields (never the over-fetched full row).
        expect(findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: 'u1' },
                select: expect.objectContaining({
                    userId: true,
                    displayName: true,
                    avatarUrl: true,
                    timezone: true,
                    isPrivate: true,
                }),
            })
        );
        // No preferences / status over-fetch.
        const arg = findUnique.mock.calls[0][0] as any;
        expect(arg.include).toBeUndefined();
    });

    it('returns null (no provision) when the profile is absent', async () => {
        const findUnique = jest.fn(async () => null);
        const count = jest.fn(async () => 0);
        const upsert = jest.fn();
        const prisma = {
            userProfile: { findUnique, count, upsert },
            userPreferences: { upsert: jest.fn() },
        } as any;

        const svc = new UserService(prisma, buildEventBusStub());
        const out = await svc.getPublicProfile('missing');

        expect(out).toBeNull();
        expect(count).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('defaults a null isPrivate to false', async () => {
        const prisma = {
            userProfile: {
                findUnique: jest.fn(async () => ({
                    userId: 'u2',
                    displayName: 'Pete',
                    avatarUrl: null,
                    timezone: 'UTC',
                    isPrivate: null,
                })),
            },
        } as any;
        const svc = new UserService(prisma, buildEventBusStub());
        const out = await svc.getPublicProfile('u2');
        expect(out?.isPrivate).toBe(false);
    });
});

describe('UserService.getPublicProfilesBatch — HIGH #4 single round-trip', () => {
    it('resolves all ids with ONE findMany({ in }) and maps to the public shape', async () => {
        const findMany = jest.fn(async () => [
            { userId: 'a', displayName: 'Ann', avatarUrl: 'https://x/a.png', timezone: 'UTC', isPrivate: false },
            { userId: 'b', displayName: 'Bob', avatarUrl: null, timezone: 'America/New_York', isPrivate: true },
        ]);
        const prisma = { userProfile: { findMany } } as any;
        const svc = new UserService(prisma, buildEventBusStub());

        const out = await svc.getPublicProfilesBatch(['a', 'b', 'a']); // dupe deduped

        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: { in: ['a', 'b'] } } })
        );
        expect(out).toEqual([
            { id: 'a', displayName: 'Ann', avatarUrl: 'https://x/a.png', timezone: 'UTC', isPrivate: false },
            { id: 'b', displayName: 'Bob', avatarUrl: null, timezone: 'America/New_York', isPrivate: true },
        ]);
    });

    it('short-circuits with no query for an empty id list', async () => {
        const findMany = jest.fn();
        const prisma = { userProfile: { findMany } } as any;
        const svc = new UserService(prisma, buildEventBusStub());
        const out = await svc.getPublicProfilesBatch([]);
        expect(out).toEqual([]);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe('UserService.getAllUsersInternal — HIGH #3 cursor pagination', () => {
    function svcWithRows(rows: Array<{ userId: string; timezone: string }>) {
        const findMany = jest.fn(async (args: any) => {
            // emulate cursor+skip+take over a sorted dataset
            let start = 0;
            if (args.cursor) {
                const idx = rows.findIndex((r) => r.userId === args.cursor.userId);
                start = idx + (args.skip ?? 0);
            }
            return rows.slice(start, start + args.take);
        });
        const prisma = { userProfile: { findMany } } as any;
        return { svc: new UserService(prisma, buildEventBusStub()), findMany };
    }

    it('returns a bounded page + nextCursor when more rows remain', async () => {
        const rows = [
            { userId: 'u1', timezone: 'UTC' },
            { userId: 'u2', timezone: 'UTC' },
            { userId: 'u3', timezone: 'UTC' },
        ];
        const { svc, findMany } = svcWithRows(rows);

        const page = await svc.getAllUsersInternal({ limit: 2 });

        expect(page.users).toEqual([rows[0], rows[1]]);
        expect(page.nextCursor).toBe('u2'); // full page => more may remain
        // take applied + ordered by stable cursor; no cursor on first page.
        const arg = findMany.mock.calls[0][0] as any;
        expect(arg.take).toBe(2);
        expect(arg.orderBy).toEqual({ userId: 'asc' });
        expect(arg.cursor).toBeUndefined();
    });

    it('resuming from a cursor skips the cursor row (skip:1) and ends on a short page', async () => {
        const rows = [
            { userId: 'u1', timezone: 'UTC' },
            { userId: 'u2', timezone: 'UTC' },
            { userId: 'u3', timezone: 'UTC' },
        ];
        const { svc, findMany } = svcWithRows(rows);

        const page = await svc.getAllUsersInternal({ cursor: 'u2', limit: 2 });

        expect(page.users).toEqual([rows[2]]); // only u3 left
        expect(page.nextCursor).toBeNull(); // short page => exhausted
        const arg = findMany.mock.calls[0][0] as any;
        expect(arg.cursor).toEqual({ userId: 'u2' });
        expect(arg.skip).toBe(1);
    });

    it('paging through to exhaustion yields every user exactly once', async () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({ userId: `u${i}`, timezone: 'UTC' }));
        const { svc } = svcWithRows(rows);

        const collected: Array<{ userId: string; timezone: string }> = [];
        let cursor: string | null = null;
        for (let i = 0; i < 100; i++) {
            const page = await svc.getAllUsersInternal({ cursor: cursor ?? undefined, limit: 2 });
            collected.push(...page.users);
            if (!page.nextCursor) break;
            cursor = page.nextCursor;
        }

        expect(collected).toEqual(rows);
    });

    it('clamps an over-large limit to the max bound', async () => {
        const rows = [{ userId: 'u1', timezone: 'UTC' }];
        const { svc, findMany } = svcWithRows(rows);
        await svc.getAllUsersInternal({ limit: 999999 });
        const arg = findMany.mock.calls[0][0] as any;
        expect(arg.take).toBeLessThanOrEqual(1000);
    });
});
