import { CommunityService } from '../src/community.service';

/**
 * Badge bonus-XP cascade regression (sprint F23, group G).
 *
 * When a badge with xpReward > 0 is awarded, the bonus XP is added to the
 * user's score. That bonus can push the total across a HIGHER XP/level
 * threshold (e.g. ON_FIRE at 1000 XP). The bug: _awardBadgeIfNew incremented
 * XP but never recomputed/persisted `level` and never re-ran the XP-badge
 * checks against the new total — so the next badge wasn't granted until the
 * user's NEXT XP event.
 *
 * We drive the REAL CommunityService against in-memory `badge` / `userBadge` /
 * `userScore` delegates that faithfully model the surface the service uses
 * (findUnique by key, findUnique by userId_badgeId, create, upsert with
 * increment, update). This proves the actual service logic — not a mock of it —
 * cascades within a single pass and persists the recomputed level.
 */

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface BadgeRow {
    id: string;
    key: string;
    name: string;
    xpReward: number;
}
interface UserBadgeRow {
    id: string;
    userId: string;
    badgeId: string;
    seen: boolean;
}
interface UserScoreRow {
    userId: string;
    xp: number;
    level: number;
}

// Faithful in-memory Prisma stub for the badge/score surface.
function buildPrismaStub(opts: {
    badges: Array<{ key: string; xpReward: number }>;
    initialScore?: { xp: number; level: number };
}) {
    let seq = 0;
    const badges: BadgeRow[] = opts.badges.map((b) => ({
        id: `badge-${b.key}`,
        key: b.key,
        name: b.key,
        xpReward: b.xpReward,
    }));
    const userBadges: UserBadgeRow[] = [];
    const scores: UserScoreRow[] = opts.initialScore
        ? [{ userId: USER, xp: opts.initialScore.xp, level: opts.initialScore.level }]
        : [];

    const prisma = {
        badge: {
            findUnique: jest.fn(async ({ where }: any) =>
                badges.find((b) => b.key === where.key) ?? null
            ),
        },
        userBadge: {
            findUnique: jest.fn(async ({ where }: any) => {
                const { userId, badgeId } = where.userId_badgeId;
                return (
                    userBadges.find((ub) => ub.userId === userId && ub.badgeId === badgeId) ??
                    null
                );
            }),
            create: jest.fn(async ({ data }: any) => {
                const row: UserBadgeRow = {
                    id: `ub-${++seq}`,
                    userId: data.userId,
                    badgeId: data.badgeId,
                    seen: data.seen ?? false,
                };
                userBadges.push(row);
                return row;
            }),
        },
        userScore: {
            upsert: jest.fn(async ({ where, create, update }: any) => {
                let row = scores.find((s) => s.userId === where.userId);
                if (!row) {
                    row = { userId: create.userId, xp: create.xp, level: create.level };
                    scores.push(row);
                    return { ...row };
                }
                // Only the { xp: { increment } } shape is used by the service.
                if (update?.xp?.increment !== undefined) {
                    row.xp += update.xp.increment;
                }
                return { ...row };
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const row = scores.find((s) => s.userId === where.userId);
                if (!row) throw new Error('not found');
                if (data.level !== undefined) row.level = data.level;
                if (data.xp?.increment !== undefined) row.xp += data.xp.increment;
                return { ...row };
            }),
        },
    } as any;

    return { prisma, badges, userBadges, scores };
}

const hasBadge = (userBadges: UserBadgeRow[], badges: BadgeRow[], key: string) =>
    userBadges.some((ub) => ub.badgeId === badges.find((b) => b.key === key)!.id);

describe('CommunityService — badge bonus-XP cascade', () => {
    it('a bonus that crosses ON_FIRE awards it in the SAME pass', async () => {
        // User already qualifies for POWER_USER (xp >= 500) at 950 XP but does
        // NOT yet qualify for ON_FIRE (xp >= 1000). POWER_USER carries a +100
        // bonus, which pushes the total to 1050 — crossing ON_FIRE.
        const { prisma, badges, userBadges, scores } = buildPrismaStub({
            badges: [
                { key: 'power_user', xpReward: 100 },
                { key: 'on_fire', xpReward: 0 },
            ],
            initialScore: { xp: 950, level: 4 },
        });
        const svc = new CommunityService(prisma);

        // Award POWER_USER (the entry the bug manifested through).
        await svc.awardBadgeByKey(USER, 'power_user');

        // POWER_USER itself is awarded and its bonus applied.
        expect(hasBadge(userBadges, badges, 'power_user')).toBe(true);
        expect(scores[0].xp).toBe(1050);

        // The cascade: ON_FIRE granted SAME pass, no further XP event needed.
        expect(hasBadge(userBadges, badges, 'on_fire')).toBe(true);
    });

    it('persists the recomputed level after the bonus XP increment', async () => {
        // xpToLevel(250) === 2; a +300 bonus -> 550 -> xpToLevel(550) === 3.
        // awardBadgeByKey is the manual award endpoint (no threshold gate); the
        // point here is that the bonus increment recomputes + persists `level`.
        const { prisma, scores } = buildPrismaStub({
            badges: [
                { key: 'power_user', xpReward: 300 },
                { key: 'on_fire', xpReward: 0 },
            ],
            initialScore: { xp: 250, level: 2 },
        });
        const svc = new CommunityService(prisma);

        await svc.awardBadgeByKey(USER, 'power_user');

        // 250 + 300 = 550 XP. Level must be recomputed + persisted from 2.
        expect(scores[0].xp).toBe(550);
        // xpToLevel(550): floor((1+sqrt(1+8*550/100))/2) = floor((1+sqrt(45))/2)
        //   = floor((1+6.7)/2) = floor(3.85) = 3.
        expect(scores[0].level).toBe(3);
        expect(prisma.userScore.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: USER },
                data: { level: 3 },
            })
        );
    });

    it('does not re-award a badge the user already holds (idempotent, no double bonus)', async () => {
        const { prisma, badges, userBadges, scores } = buildPrismaStub({
            badges: [{ key: 'power_user', xpReward: 100 }],
            initialScore: { xp: 600, level: 4 },
        });
        const svc = new CommunityService(prisma);

        await svc.awardBadgeByKey(USER, 'power_user'); // first award -> +100 = 700
        await svc.awardBadgeByKey(USER, 'power_user'); // already held -> no-op

        expect(userBadges.filter((ub) => ub.badgeId === badges[0].id)).toHaveLength(1);
        expect(scores[0].xp).toBe(700); // bonus applied exactly once
    });

    it('terminates (no infinite loop) and does not over-award a single ON_FIRE-crossing chain', async () => {
        // ON_FIRE itself carries a bonus; once it is held it cannot be re-awarded,
        // so the cascade must terminate after awarding it once.
        const { prisma, badges, userBadges, scores } = buildPrismaStub({
            badges: [
                { key: 'power_user', xpReward: 60 },
                { key: 'on_fire', xpReward: 50 },
            ],
            initialScore: { xp: 950, level: 4 },
        });
        const svc = new CommunityService(prisma);

        await svc.awardBadgeByKey(USER, 'power_user');

        // power_user +60 -> 1010 (crosses ON_FIRE); on_fire +50 -> 1060.
        expect(scores[0].xp).toBe(1060);
        expect(userBadges.filter((ub) => ub.badgeId === badges[0].id)).toHaveLength(1); // power_user
        expect(userBadges.filter((ub) => ub.badgeId === badges[1].id)).toHaveLength(1); // on_fire once
    });
});
