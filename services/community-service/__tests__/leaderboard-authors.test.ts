import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import { CommunityService } from '../src/community.service';
import routes from '../src/routes';

/**
 * Author-enriched leaderboard regression.
 *
 * The leaderboard MUST surface real author identities (displayName + avatar)
 * resolved from the user-service — UserScore is keyed by userId, so each row's
 * userId is the authorId we enrich on. We exercise the REAL
 * CommunityService.getLeaderboardWithAuthors with:
 *   - a stub PrismaClient whose userScore.findMany returns deterministic rows,
 *   - a stub AuthorResolver.attachAuthors that resolves a KNOWN author and
 *     leaves an UNKNOWN author unresolved,
 * and assert:
 *   1. the known author's row carries its real displayName/avatar and NO
 *      'Zeitra Member'/placeholder,
 *   2. an unresolved author degrades to the neutral 'Zeitra Member' fallback,
 *   3. each row is shaped exactly { userId, xp, level, displayName, avatarUrl },
 *   4. the GET /v1/community/leaderboard ROUTE delegates to this method (so the
 *      wire response contains the real name and never the placeholder for a
 *      known author).
 */

const KNOWN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNKNOWN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KNOWN_NAME = 'Ada Lovelace';
const KNOWN_AVATAR = 'https://cdn.example.com/ada.png';

const LEADER_ROWS = [
    { userId: KNOWN_ID, xp: 900, level: 5 },
    { userId: UNKNOWN_ID, xp: 400, level: 3 },
];

// Minimal Prisma stub — only userScore.findMany is consulted by getLeaderboard.
function buildPrismaStub() {
    return {
        userScore: {
            findMany: jest.fn().mockResolvedValue(LEADER_ROWS),
        },
    } as any;
}

// AuthorResolver stub mirroring the real attachAuthors contract: attach
// `author` only for the KNOWN id; leave the UNKNOWN id unenriched.
function buildResolverStub() {
    return {
        attachAuthors: jest.fn(async (items: Array<{ authorId?: string | null }>) =>
            items.map((item) =>
                item.authorId === KNOWN_ID
                    ? { ...item, author: { id: KNOWN_ID, name: KNOWN_NAME, avatarUrl: KNOWN_AVATAR, isPrivate: false } }
                    : item
            )
        ),
    } as any;
}

describe('CommunityService.getLeaderboardWithAuthors', () => {
    it('enriches a known author with real displayName + avatar (no placeholder)', async () => {
        const svc = new CommunityService(buildPrismaStub(), buildResolverStub());
        const rows = await svc.getLeaderboardWithAuthors(10);

        const known = rows.find((r) => r.userId === KNOWN_ID)!;
        expect(known).toBeDefined();
        expect(known.displayName).toBe(KNOWN_NAME);
        expect(known.avatarUrl).toBe(KNOWN_AVATAR);
        // The whole point: a resolvable author never gets the placeholder.
        expect(known.displayName).not.toBe('Zeitra Member');
    });

    it('falls back to "Zeitra Member" only for an unresolved author', async () => {
        const svc = new CommunityService(buildPrismaStub(), buildResolverStub());
        const rows = await svc.getLeaderboardWithAuthors(10);

        const unknown = rows.find((r) => r.userId === UNKNOWN_ID)!;
        expect(unknown.displayName).toBe('Zeitra Member');
        expect(unknown.avatarUrl).toBeNull();
    });

    it('shapes each row as { userId, xp, level, displayName, avatarUrl }', async () => {
        const svc = new CommunityService(buildPrismaStub(), buildResolverStub());
        const rows = await svc.getLeaderboardWithAuthors(10);

        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(Object.keys(row).sort()).toEqual(
                ['avatarUrl', 'displayName', 'level', 'userId', 'xp'].sort()
            );
        }
        // XP/level carried through from the underlying score rows.
        expect(rows[0]).toMatchObject({ userId: KNOWN_ID, xp: 900, level: 5 });
    });

    it('passes the requested limit through to getLeaderboard', async () => {
        const prisma = buildPrismaStub();
        const svc = new CommunityService(prisma, buildResolverStub());
        await svc.getLeaderboardWithAuthors(3);
        expect(prisma.userScore.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 3 })
        );
    });
});

// ── Route integration: GET /v1/community/leaderboard uses the enriched method ──

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const VIEWER = jwt.sign({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, JWT_SECRET, { expiresIn: '1h' });

describe('GET /v1/community/leaderboard route — author-enriched wire shape', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        const svc = new CommunityService(buildPrismaStub(), buildResolverStub());
        // getUserScore reads userScore.findUnique — stub returns "no score" path.
        (svc as any).prisma.userScore.findUnique = jest.fn().mockResolvedValue(null);

        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        await app.register(routes, { communityService: svc as any, jwtSecret: JWT_SECRET });
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('returns { leaderboard, myScore } with real names and NO placeholder for a known author', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/community/leaderboard',
            headers: { authorization: `Bearer ${VIEWER}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('leaderboard');
        expect(body).toHaveProperty('myScore');

        const known = body.leaderboard.find((r: any) => r.userId === KNOWN_ID);
        expect(known.displayName).toBe(KNOWN_NAME);
        expect(known.avatarUrl).toBe(KNOWN_AVATAR);

        // The known author's row must never carry the placeholder label.
        const knownStr = JSON.stringify(known);
        expect(knownStr).not.toContain('Zeitra Member');
    });
});
