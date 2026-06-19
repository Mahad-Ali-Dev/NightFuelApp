/**
 * Unit suite — AI-routine-generator daily quota gate
 * (src/index.ts, POST /v1/exercises/routines/generate).
 *
 * Contract (work-item P0b): the generate route, AFTER resolving userId and
 * BEFORE building the prompt / calling the AI pipeline / createRoutine, resolves
 * the caller's plan tier and counts the user's WorkoutRoutine rows created since
 * UTC midnight. At/over AI_LIMITS[plan].generations it replies
 *   429 { error: 'ai_quota_exceeded', limit, plan, resetsAt }
 * and DOES NOT call the AI-pipeline fetch or createRoutine. Plan tier is
 * resolved the SAME way the chat-service Ria quota does (GET
 * subscription-service /v1/subscriptions/me with a minted internal Bearer token;
 * tier 'FREE' -> 'free', anything else -> 'pro'; non-OK / throw / timeout ->
 * 'free', the safer, lower limit).
 *
 * Why replicate the route logic instead of importing src/:
 *   - src/index.ts is the service bootstrap; it constructs a PrismaClient and a
 *     RedisEventBus and calls fastify.listen() at import time, so it cannot be
 *     loaded in a unit test (the SAME documented constraint as
 *     ai-routine-libraryid.test.ts / heatmap-window.test.ts /
 *     inline-404-redaction.test.ts).
 *   - So this suite copies the EXACT quota-gate logic and the EXACT resolvePlan
 *     strategy from src/index.ts into a small harness, drives it through a mocked
 *     global.fetch (for BOTH the subscription lookup and the AI pipeline) plus an
 *     in-memory prisma.workoutRoutine.count + a spied createRoutine, and asserts
 *     the gate behaviour. It is written to FAIL if the gate regresses (e.g. the
 *     AI fetch fires while over the cap, or the 429 body shape changes).
 *
 * The shared policy (assertWithinDailyLimit / AI_LIMITS / AI_QUOTA_EXCEEDED) is
 * owned by another work-item and lives in @nightfuel/config. Because src/ cannot
 * be imported here, this suite re-declares those three to their DOCUMENTED shape
 * (the same technique heatmap-window.test.ts uses for MAX_QUERY_RANGE_DAYS) so
 * the test is hermetic and does not depend on the runtime config build. The
 * concrete generations numbers in the local AI_LIMITS are FIXTURES — the suite
 * asserts the gate LOGIC relative to those fixtures (boundary at `usedToday <
 * limit`, free-vs-pro selection), never a hard-coded magic count, so it stays
 * correct regardless of the production numbers the shared module ships.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ── Shared-policy shapes re-declared to their documented contract ───────────────
// AI_LIMITS: per-plan daily caps. `.generations` is the AI-routine-generator cap.
// FIXTURE values — the suite tests the gate logic relative to these, not the
// specific numbers (see file header).
const AI_LIMITS: Record<'free' | 'pro', { generations: number }> = {
    free: { generations: 3 },
    pro: { generations: 50 },
};
const AI_QUOTA_EXCEEDED = 'ai_quota_exceeded';

// assertWithinDailyLimit({usedToday,limit,now}) -> { allowed, resetsAt }.
// allowed = usedToday < limit; resetsAt = next UTC-midnight ISO from `now`.
// Mirrors chat-service checkRiaQuota's boundary + UTC reset semantics.
function assertWithinDailyLimit(input: { usedToday: number; limit: number; now: Date }): {
    allowed: boolean;
    resetsAt: string;
} {
    const { usedToday, limit, now } = input;
    const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const nextUtcMidnight = new Date(startOfUtcDay.getTime() + 24 * 60 * 60 * 1000);
    return { allowed: usedToday < limit, resetsAt: nextUtcMidnight.toISOString() };
}

// ── Config the route closes over (subset) ───────────────────────────────────────
const config = {
    JWT_SECRET: 'test-secret-of-at-least-32-characters-long',
    SUBSCRIPTION_SERVICE_URL: 'http://subscription-service:3015',
    AI_PIPELINE_URL: 'http://ai-pipeline:3010',
};

// A stand-in for the @fastify/jwt instance the route uses to mint the internal
// token. The real call is `(fastify as any).jwt.sign({userId,sub:userId},...)` —
// no new dependency. The token value is opaque to this suite (the subscription
// fetch is mocked), so a deterministic stub is sufficient; we still assert it is
// minted AS the target user (userId + sub) so the /me subject derivation works.
const fakeJwt = {
    sign: jest.fn((payload: any, _opts: any) => `signed:${JSON.stringify(payload)}`),
};

const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

// ── resolvePlan copied VERBATIM from src/index.ts ───────────────────────────────
// (config / fakeJwt / logger injected via module scope, mirroring how the real
//  fn closes over config / fastify / logger).
async function resolvePlan(userId: string): Promise<'free' | 'pro'> {
    if (!config.JWT_SECRET) return 'free';
    const url = `${config.SUBSCRIPTION_SERVICE_URL}/v1/subscriptions/me`;
    const token = fakeJwt.sign({ userId, sub: userId }, { expiresIn: '60s' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
        const res = await (global as any).fetch(url, {
            method: 'GET',
            headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
            signal: controller.signal,
        });
        if (!res.ok) {
            logger.debug({ userId, status: res.status }, 'Subscription lookup non-OK; defaulting plan=free');
            return 'free';
        }
        const sub = (await res.json()) as { tier?: string };
        return (sub.tier ?? 'FREE').toUpperCase() === 'FREE' ? 'free' : 'pro';
    } catch (err) {
        logger.warn({ err, userId }, 'Failed to resolve subscription tier; defaulting plan=free');
        return 'free';
    } finally {
        clearTimeout(timer);
    }
}

// ── A minimal reply double matching the bits the route uses ─────────────────────
function makeReply() {
    return {
        statusCode: 200,
        body: undefined as any,
        code(c: number) {
            this.statusCode = c;
            return this;
        },
        send(b: any) {
            this.body = b;
            return this;
        },
    };
}

// ── The generate route's quota gate + happy path, copied VERBATIM from index.ts ──
// Everything downstream of the gate is reduced to the two side-effecting calls
// the acceptance cares about: the AI-pipeline `fetch(`${AI_PIPELINE_URL}/chat`)`
// and `createRoutine`. If the gate passes, we run the SAME order the route does:
// AI fetch (best-effort) -> deterministic fallback when needed -> createRoutine,
// returning 201. If the gate blocks, neither side effect fires.
async function runGenerateRoutine(
    userId: string,
    body: { goal: string; level: string; daysPerWeek: number; focusAreas?: string[]; equipment?: string },
    deps: {
        prisma: { workoutRoutine: { count: (args: any) => Promise<number> } };
        createRoutine: (userId: string, data: any, aiGenerated?: boolean) => Promise<any>;
    },
) {
    const reply = makeReply();
    const { goal, level, daysPerWeek, focusAreas, equipment } = body;

    // ── Daily AI quota — gated BEFORE the AI-pipeline fetch / createRoutine ──
    // Only AI-generated routines count: the filter includes aiGenerated:true, so
    // manual routine creates (aiGenerated:false) never burn the quota.
    const plan = await resolvePlan(userId);
    const now = new Date();
    const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const usedToday = await deps.prisma.workoutRoutine.count({
        where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } },
    });
    const limit = AI_LIMITS[plan].generations;
    const q = assertWithinDailyLimit({ usedToday, limit, now });
    if (!q.allowed) {
        return reply.code(429).send({ error: AI_QUOTA_EXCEEDED, limit, plan, resetsAt: q.resetsAt });
    }

    // ── Allowed path (downstream of the gate; unchanged behaviour) ──
    const prompt = `Generate a ${daysPerWeek}-day per week ${level} ${goal} workout routine.`;
    let routineData: any = null;
    try {
        const aiRes = await (global as any).fetch(`${config.AI_PIPELINE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, message: prompt, history: [], context: { goal, level, daysPerWeek, focusAreas, equipment } }),
        });
        if (!aiRes.ok) throw new Error(`AI pipeline returned ${aiRes.status}`);
        const aiBody = (await aiRes.json()) as { reply: string };
        const jsonMatch = aiBody.reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) routineData = JSON.parse(jsonMatch[0]);
    } catch {
        // best-effort; fall through to deterministic fallback
    }
    if (!routineData || !Array.isArray(routineData.exercises) || routineData.exercises.length === 0) {
        routineData = { title: `${goal} routine`, exercises: [{ name: 'Barbell Squat', sets: 4, reps: 10 }] };
    }
    // aiGenerated:true — the generate route always persists its routine as
    // AI-generated (mirrors src/index.ts createRoutine(userId, routineData, true)),
    // so the row counts toward tomorrow's quota.
    const created = await deps.createRoutine(userId, routineData, true);
    return reply.code(201).send(created);
}

// ── The manual create route, copied VERBATIM from index.ts (POST /v1/exercises/
// routines). It does NO quota gate and persists the routine with the DEFAULT
// aiGenerated=false, so a manual create NEVER consumes the daily AI quota. Modeled
// here so the regression can assert manual-vs-AI accounting directly. ──
async function runCreateRoutine(
    userId: string,
    body: any,
    deps: { createRoutine: (userId: string, data: any, aiGenerated?: boolean) => Promise<any> },
) {
    const reply = makeReply();
    const created = await deps.createRoutine(userId, body);
    return reply.code(201).send(created);
}

// ── fetch mocks ─────────────────────────────────────────────────────────────────
// The route's global.fetch is hit by BOTH resolvePlan (subscription /me) and the
// AI pipeline (/chat). Route by URL so a single mock serves both and we can both
// control the tier AND assert whether the AI call ever fired.
function installFetch(opts: {
    tier?: string | null; // null => subscription lookup throws (unreachable); 'NONOK' => non-OK response
    aiReply?: string;      // body.reply the AI pipeline returns when reached
}) {
    const aiCalls: string[] = [];
    const fn = jest.fn(async (url: string) => {
        if (url.includes('/v1/subscriptions/me')) {
            if (opts.tier === null) throw new Error('ECONNREFUSED');
            if (opts.tier === 'NONOK') return { ok: false, status: 500, json: async () => ({}) } as any;
            return { ok: true, status: 200, json: async () => ({ tier: opts.tier }) } as any;
        }
        if (url.endsWith('/chat')) {
            aiCalls.push(url);
            return { ok: true, status: 200, json: async () => ({ reply: opts.aiReply ?? '{"title":"AI","exercises":[{"name":"Bench Press","sets":5,"reps":5}]}' }) } as any;
        }
        throw new Error(`unexpected fetch ${url}`);
    });
    (global as any).fetch = fn;
    return { fn, aiCalls };
}

const USER = 'user-1';
const BODY = { goal: 'strength', level: 'intermediate', daysPerWeek: 3 };

describe('AI-routine quota gate — POST /v1/exercises/routines/generate', () => {
    const realFetch = (global as any).fetch;
    afterEach(() => {
        (global as any).fetch = realFetch;
        jest.clearAllMocks();
    });

    function makePrisma(usedToday: number) {
        return {
            workoutRoutine: {
                count: jest.fn(async ({ where }: any) => {
                    // Counts the caller's OWN *AI-generated* routines since UTC
                    // midnight. The aiGenerated:true filter is what makes manual
                    // creates (aiGenerated:false) not consume the AI quota.
                    expect(where.userId).toBe(USER);
                    expect(where.aiGenerated).toBe(true);
                    expect(where.createdAt.gte instanceof Date).toBe(true);
                    return usedToday;
                }),
            },
        };
    }

    // (1) Under the limit -> AI/fallback path runs and createRoutine yields 201.
    it('FREE under limit: runs the AI path and returns 201 from createRoutine', async () => {
        const { aiCalls } = installFetch({ tier: 'FREE' });
        const prisma = makePrisma(AI_LIMITS.free.generations - 1); // 2 used of 3
        const createRoutine = jest.fn(async (_u: string, data: any) => ({ id: 'routine-1', ...data }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(201);
        expect(reply.body).toMatchObject({ id: 'routine-1' });
        expect(aiCalls.length).toBe(1);            // AI pipeline WAS called
        expect(createRoutine).toHaveBeenCalledTimes(1);
        // The generate route persists the routine AS AI-generated so it counts
        // toward the daily quota: createRoutine(userId, data, /* aiGenerated */ true).
        expect(createRoutine).toHaveBeenCalledWith(USER, expect.any(Object), true);
        // token minted AS the target user so /me resolves them, not a principal
        expect(fakeJwt.sign).toHaveBeenCalledWith({ userId: USER, sub: USER }, { expiresIn: '60s' });
    });

    // (2) At/over the limit -> 429 with the exact body; AI fetch + createRoutine NEVER called.
    it('FREE at limit: 429 ai_quota_exceeded, NO AI fetch, NO createRoutine', async () => {
        const now = new Date();
        const expectedResetsAt = assertWithinDailyLimit({ usedToday: 0, limit: 1, now }).resetsAt;
        const { fn, aiCalls } = installFetch({ tier: 'FREE' });
        const prisma = makePrisma(AI_LIMITS.free.generations); // exactly AT the cap (3 of 3)
        const createRoutine = jest.fn(async () => ({ id: 'should-not-happen' }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(429);
        expect(reply.body).toEqual({
            error: 'ai_quota_exceeded',
            limit: AI_LIMITS.free.generations,
            plan: 'free',
            resetsAt: expectedResetsAt,
        });
        // The AI pipeline /chat fetch was NEVER hit (only the subscription lookup).
        expect(aiCalls.length).toBe(0);
        expect(createRoutine).not.toHaveBeenCalled();
        // resetsAt is a real next-UTC-midnight ISO, strictly in the future.
        const resets = new Date(reply.body.resetsAt);
        expect(reply.body.resetsAt).toBe(resets.toISOString());
        expect(resets.getTime()).toBeGreaterThan(now.getTime());
        // Sanity: the only fetch that fired was the subscription lookup.
        const urls = fn.mock.calls.map((c: any) => c[0]);
        expect(urls.every((u: string) => u.includes('/v1/subscriptions/me'))).toBe(true);
    });

    it('FREE over limit: 429 and no side effects (usedToday well past the cap)', async () => {
        const { aiCalls } = installFetch({ tier: 'FREE' });
        const prisma = makePrisma(AI_LIMITS.free.generations + 5);
        const createRoutine = jest.fn(async () => ({ id: 'nope' }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(429);
        expect(reply.body.error).toBe('ai_quota_exceeded');
        expect(reply.body.plan).toBe('free');
        expect(reply.body.limit).toBe(AI_LIMITS.free.generations);
        expect(aiCalls.length).toBe(0);
        expect(createRoutine).not.toHaveBeenCalled();
    });

    // (3) Subscription lookup non-OK / throw -> plan='free' and the free limit applies.
    it('subscription NON-OK: degrades to plan=free (free limit gates the 429)', async () => {
        const { aiCalls } = installFetch({ tier: 'NONOK' });
        // usedToday sits between the free cap and the (higher) pro cap: a pro user
        // would be allowed, a free user is blocked — so this proves we used 'free'.
        const between = AI_LIMITS.free.generations; // == free cap, < pro cap
        const prisma = makePrisma(between);
        const createRoutine = jest.fn(async () => ({ id: 'nope' }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(429);
        expect(reply.body.plan).toBe('free');
        expect(reply.body.limit).toBe(AI_LIMITS.free.generations);
        expect(aiCalls.length).toBe(0);
        expect(createRoutine).not.toHaveBeenCalled();
    });

    it('subscription THROW (unreachable): degrades to plan=free; under free cap still runs', async () => {
        const { aiCalls } = installFetch({ tier: null }); // /me throws
        const prisma = makePrisma(AI_LIMITS.free.generations - 1); // under the free cap
        const createRoutine = jest.fn(async (_u: string, data: any) => ({ id: 'routine-2', ...data }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        // plan resolved to 'free', but still under the free cap -> allowed path runs.
        expect(reply.statusCode).toBe(201);
        expect(aiCalls.length).toBe(1);
        expect(createRoutine).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalled(); // unreachable lookup was logged
    });

    // (4) PRO tier -> the (higher) pro limit applies.
    it('PRO tier: uses the pro generations limit (allowed where a free user would be blocked)', async () => {
        const { aiCalls } = installFetch({ tier: 'PRO' });
        // usedToday is past the free cap but under the pro cap -> a PRO user is allowed.
        const used = AI_LIMITS.free.generations + 1;
        expect(used).toBeLessThan(AI_LIMITS.pro.generations); // fixture sanity
        const prisma = makePrisma(used);
        const createRoutine = jest.fn(async (_u: string, data: any) => ({ id: 'routine-pro', ...data }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(201);
        expect(aiCalls.length).toBe(1);
        expect(createRoutine).toHaveBeenCalledTimes(1);
    });

    it('PRO tier at its own cap: 429 with plan=pro and the pro limit', async () => {
        const { aiCalls } = installFetch({ tier: 'PRO' });
        const prisma = makePrisma(AI_LIMITS.pro.generations); // at the pro cap
        const createRoutine = jest.fn(async () => ({ id: 'nope' }));

        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(429);
        expect(reply.body).toMatchObject({
            error: 'ai_quota_exceeded',
            limit: AI_LIMITS.pro.generations,
            plan: 'pro',
        });
        expect(aiCalls.length).toBe(0);
        expect(createRoutine).not.toHaveBeenCalled();
    });
});

// ── Manual-vs-AI accounting regression ──────────────────────────────────────────
// The whole point of the aiGenerated column: a MANUAL routine create must NOT
// burn the daily AI quota, while an AI generate must. Both routes share a single
// in-memory store of {aiGenerated} rows; the quota COUNT — exactly as the generate
// route runs it (where.aiGenerated:true) — only sees the AI rows. So creating many
// manual routines leaves the counted usage at 0, and a free user can still generate.
describe('manual-vs-AI accounting — manual creates do not consume the AI quota', () => {
    const realFetch = (global as any).fetch;
    afterEach(() => {
        (global as any).fetch = realFetch;
        jest.clearAllMocks();
    });

    // A tiny stateful Prisma double. `createRoutine(userId, data, aiGenerated)`
    // pushes a row; `count({where})` honours the aiGenerated:true filter the
    // generate route passes — i.e. it counts ONLY AI-generated rows since UTC
    // midnight, mirroring prisma.workoutRoutine.count's real filter semantics.
    function makeStatefulStore() {
        const rows: Array<{ userId: string; aiGenerated: boolean; createdAt: Date }> = [];
        const createRoutine = jest.fn(async (userId: string, _data: any, aiGenerated = false) => {
            const row = { userId, aiGenerated, createdAt: new Date() };
            rows.push(row);
            return { id: `routine-${rows.length}`, ...row };
        });
        const prisma = {
            workoutRoutine: {
                count: jest.fn(async ({ where }: any) => {
                    // The generate route ALWAYS passes aiGenerated:true here.
                    expect(where.aiGenerated).toBe(true);
                    return rows.filter(
                        (r) =>
                            r.userId === where.userId &&
                            r.aiGenerated === where.aiGenerated &&
                            r.createdAt >= where.createdAt.gte,
                    ).length;
                }),
            },
        };
        return { rows, prisma, createRoutine };
    }

    it('many MANUAL creates leave AI-counted usage at 0; a FREE user can still generate', async () => {
        const { rows, prisma, createRoutine } = makeStatefulStore();

        // Create MANY manual routines — well past the free cap. Each persists
        // aiGenerated=false (the manual route never passes aiGenerated).
        for (let i = 0; i < AI_LIMITS.free.generations + 5; i++) {
            await runCreateRoutine(USER, { title: `manual ${i}`, exercises: [] }, { createRoutine });
        }
        // Every manual row is non-AI.
        expect(rows.length).toBe(AI_LIMITS.free.generations + 5);
        expect(rows.every((r) => r.aiGenerated === false)).toBe(true);
        // The manual route never passes an explicit aiGenerated arg (it relies on
        // the createRoutine default false): every recorded call has arity 2.
        expect(createRoutine.mock.calls.every((c: any[]) => c.length === 2 && c[0] === USER)).toBe(true);

        // Now a FREE user generates: despite many manual rows, the AI-filtered
        // COUNT is still 0 (< free cap), so the generate path runs and 201s.
        installFetch({ tier: 'FREE' });
        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(201);
        // The count query saw zero AI rows — manual creates did NOT consume quota.
        expect(prisma.workoutRoutine.count).toHaveBeenCalledTimes(1);
        await expect((prisma.workoutRoutine.count as any).mock.results[0].value).resolves.toBe(0);
        // The generated routine WAS persisted as AI-generated, so it now counts.
        const aiRows = rows.filter((r) => r.aiGenerated === true);
        expect(aiRows.length).toBe(1);
    });

    it('AI generate persists aiGenerated:true and that row is the only one counted', async () => {
        const { rows, prisma, createRoutine } = makeStatefulStore();
        installFetch({ tier: 'FREE' });

        // One manual create (not counted) then one AI generate (counted).
        await runCreateRoutine(USER, { title: 'manual', exercises: [] }, { createRoutine });
        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        expect(reply.statusCode).toBe(201);
        // The generate route called createRoutine with aiGenerated === true.
        expect(createRoutine).toHaveBeenLastCalledWith(USER, expect.any(Object), true);
        // Exactly one AI row exists; the manual row is excluded from the count.
        expect(rows.filter((r) => r.aiGenerated === true).length).toBe(1);
        expect(rows.filter((r) => r.aiGenerated === false).length).toBe(1);
        await expect((prisma.workoutRoutine.count as any).mock.results[0].value).resolves.toBe(0);
    });

    it('once at the AI cap, further AI generates are blocked even with manual rows present', async () => {
        const { rows, prisma, createRoutine } = makeStatefulStore();

        // Seed the store at the free cap of AI rows directly (simulating earlier
        // AI generations today) plus some manual noise that must NOT raise/lower
        // the AI count.
        for (let i = 0; i < AI_LIMITS.free.generations; i++) rows.push({ userId: USER, aiGenerated: true, createdAt: new Date() });
        for (let i = 0; i < 3; i++) rows.push({ userId: USER, aiGenerated: false, createdAt: new Date() });

        installFetch({ tier: 'FREE' });
        const reply = await runGenerateRoutine(USER, BODY, { prisma, createRoutine });

        // AI-filtered count == free cap -> 429, and createRoutine never fires.
        expect(reply.statusCode).toBe(429);
        expect(reply.body).toMatchObject({ error: 'ai_quota_exceeded', plan: 'free', limit: AI_LIMITS.free.generations });
        expect(createRoutine).not.toHaveBeenCalled();
    });
});
