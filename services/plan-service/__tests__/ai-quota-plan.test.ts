/**
 * plan-service — AI daily-generation quota on POST /v1/plans/generate.
 *
 * Contract (work-item P0c): BEFORE generateAndStorePlan() / any AI fetch, the
 * /generate ROUTE resolves the caller's plan, counts the user's DayPlan rows
 * created since UTC midnight, and gates on the shared @nightfuel/config policy
 * (AI_LIMITS / assertWithinDailyLimit / AI_QUOTA_EXCEEDED). At/over the cap the
 * route returns 429 { error:'ai_quota_exceeded', limit, plan, resetsAt } and
 * NEVER calls generateAndStorePlan. Plan signal unreachable -> 'free'.
 *
 * CRITICAL invariant also locked here: the SYSTEM auto-generation callers —
 * worker.ts (checkAndRegenerate) and events.ts (circadian:profile-computed) —
 * call planService.generateAndStorePlan WITHOUT consulting the quota gate
 * (no resolvePlan, no DayPlan count). They must stay unblocked or daily/auto
 * plans silently stop.
 *
 * No live DB / Redis / network: prisma.dayPlan.count and global.fetch are
 * mocked, and the worker/event suites use a stub PlanService.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import { sendUnauthorized, AI_LIMITS } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { Channels } from '@nightfuel/types';
import { planRoutes } from '../src/routes';
import { PlanWorker } from '../src/worker';
import { setupEventSubscribers } from '../src/events';
import type { PlanService } from '../src/plan.service';

// Satisfies the service's JWT_SECRET.min(32) contract and lets resolvePlan mint.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const USER_ID = '11111111-1111-1111-1111-111111111111';

const FREE_LIMIT = AI_LIMITS.free.generations; // 3 (default)
const PRO_LIMIT = AI_LIMITS.pro.generations; // 30 (default)

// A minimal generated plan row the route echoes back on success.
const FAKE_PLAN = { id: 'plan-1', userId: USER_ID, planVersion: 1, status: 'ACTIVE' };

/**
 * Stub PlanService for the ROUTE suite. Only the members the /generate handler
 * touches are present:
 *   - generateAndStorePlan: the AI pipeline call we assert is/ isn't reached.
 *   - prisma.dayPlan.count: the inline same-day usage count (returns a fixed N).
 */
function makeMockPlanService(usedToday: number) {
    const count = jest.fn(async ({ where }: any) => {
        // Counts the caller's OWN plans since UTC midnight — userId scoped, with
        // a createdAt lower bound. Lock both so the gate can't silently widen.
        expect(where.userId).toBe(USER_ID);
        expect(where.createdAt.gte).toBeInstanceOf(Date);
        return usedToday;
    });
    const generateAndStorePlan = jest.fn(async () => FAKE_PLAN);
    return {
        generateAndStorePlan,
        prisma: { dayPlan: { count } },
    } as unknown as PlanService & {
        generateAndStorePlan: ReturnType<typeof jest.fn>;
        prisma: { dayPlan: { count: ReturnType<typeof jest.fn> } };
    };
}

/** Mock global fetch so resolvePlan sees a given tier (or a network failure). */
function mockFetchTier(tier: string | null) {
    const fn = jest.fn(async () => {
        if (tier === null) throw new Error('ECONNREFUSED');
        return { ok: true, json: async () => ({ tier }) } as any;
    });
    (global as any).fetch = fn;
    return fn;
}

/**
 * Build a fresh app wired exactly like src/index.ts (minus DB/Redis): Zod
 * compilers, @fastify/jwt (so resolvePlan can mint its internal token AND the
 * authenticate decorator can verify), the authenticate decorator, and the
 * genuine planRoutes plugin at the production /v1/plans prefix.
 */
async function buildApp(planService: PlanService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyJwt, { secret: JWT_SECRET });
    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            return sendUnauthorized(reply, request, err);
        }
    });
    await app.register(
        async (instance) => {
            await planRoutes(instance, { planService });
        },
        { prefix: '/v1/plans' }
    );
    await app.ready();
    return app;
}

function validToken(userId: string = USER_ID): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

function generate(app: FastifyInstance) {
    return app.inject({
        method: 'POST',
        url: '/v1/plans/generate',
        headers: { authorization: `Bearer ${validToken()}` },
        payload: { date: '2026-06-20' },
    });
}

describe('plan-service POST /v1/plans/generate — AI daily-generation quota', () => {
    const realFetch = global.fetch;
    let app: FastifyInstance;

    beforeEach(() => {
        // resolvePlan only mints when JWT_SECRET is present.
        process.env.JWT_SECRET = JWT_SECRET;
        process.env.SUBSCRIPTION_SERVICE_URL = 'http://subscription-service:3015';
    });

    afterEach(async () => {
        if (app) await app.close();
        (global as any).fetch = realFetch;
    });

    it('UNDER cap (FREE): generates and returns 201', async () => {
        mockFetchTier('FREE');
        // FREE_LIMIT-1 used -> the next generation is still allowed.
        const planService = makeMockPlanService(FREE_LIMIT - 1);
        app = await buildApp(planService);

        const res = await generate(app);

        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({ id: 'plan-1' });
        expect((planService as any).generateAndStorePlan).toHaveBeenCalledTimes(1);
    });

    it('AT/OVER cap (FREE): returns 429 ai_quota_exceeded {limit,plan,resetsAt} and NEVER calls generateAndStorePlan', async () => {
        mockFetchTier('FREE');
        // Exactly at the cap -> blocked (assertWithinDailyLimit: usedToday < limit).
        const planService = makeMockPlanService(FREE_LIMIT);
        app = await buildApp(planService);

        const res = await generate(app);

        expect(res.statusCode).toBe(429);
        const body = res.json();
        expect(body.error).toBe('ai_quota_exceeded');
        expect(body.limit).toBe(FREE_LIMIT);
        expect(body.plan).toBe('free');
        // resetsAt is the next UTC midnight (ISO, exactly 00:00:00.000Z).
        const resets = new Date(body.resetsAt);
        expect(body.resetsAt).toBe(resets.toISOString());
        expect(resets.getUTCHours()).toBe(0);
        expect(resets.getUTCMinutes()).toBe(0);
        expect(resets.getUTCSeconds()).toBe(0);
        expect(resets.getUTCMilliseconds()).toBe(0);

        // The whole point: no AI pipeline call when over cap.
        expect((planService as any).generateAndStorePlan).not.toHaveBeenCalled();
    });

    it('OVER cap (PRO): limit is the pro generations cap, plan:pro', async () => {
        mockFetchTier('PRO');
        const planService = makeMockPlanService(PRO_LIMIT);
        app = await buildApp(planService);

        const res = await generate(app);

        expect(res.statusCode).toBe(429);
        const body = res.json();
        expect(body.error).toBe('ai_quota_exceeded');
        expect(body.limit).toBe(PRO_LIMIT);
        expect(body.plan).toBe('pro');
        expect((planService as any).generateAndStorePlan).not.toHaveBeenCalled();
    });

    it('subscription lookup FAILS -> plan resolves to free (and that free cap is enforced)', async () => {
        mockFetchTier(null); // resolvePlan catches and returns 'free'
        const planService = makeMockPlanService(FREE_LIMIT); // at the FREE cap
        app = await buildApp(planService);

        const res = await generate(app);

        // Defaulting to free means the lower free cap blocks here.
        expect(res.statusCode).toBe(429);
        expect(res.json().plan).toBe('free');
        expect(res.json().limit).toBe(FREE_LIMIT);
        expect((planService as any).generateAndStorePlan).not.toHaveBeenCalled();
    });

    it('requires a valid Bearer token — 401 and neither count nor generate run', async () => {
        mockFetchTier('PRO');
        const planService = makeMockPlanService(0);
        app = await buildApp(planService);

        const res = await app.inject({ method: 'POST', url: '/v1/plans/generate', payload: { date: '2026-06-20' } });

        expect(res.statusCode).toBe(401);
        expect((planService as any).prisma.dayPlan.count).not.toHaveBeenCalled();
        expect((planService as any).generateAndStorePlan).not.toHaveBeenCalled();
    });
});

// ── SYSTEM auto-generation paths must bypass the quota gate ──────────────────────
// worker.ts (checkAndRegenerate) and events.ts (circadian:profile-computed) call
// generateAndStorePlan directly. This is the acceptance contract that they do NOT
// consult resolvePlan / the DayPlan count: the stub PlanService has ONLY
// generateAndStorePlan plus a prisma.dayPlan.count spy — if either auto path
// touched the gate, the count spy would fire (it must not), and crucially neither
// module imports the route's resolvePlan at all.

describe('SYSTEM auto-generation paths bypass the quota gate', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('worker.checkAndRegenerate calls generateAndStorePlan WITHOUT the gate (no DayPlan count)', async () => {
        const generateAndStorePlan = jest.fn(async () => FAKE_PLAN);
        const count = jest.fn(async () => 999); // would block IF the gate ran — it must NOT here
        const planService = { generateAndStorePlan, prisma: { dayPlan: { count } } } as unknown as PlanService;

        // user-service /internal/all returns one user; force their local time to 04:00
        // so checkAndRegenerate triggers regeneration.
        (global as any).fetch = jest.fn(async () => ({
            ok: true,
            json: async () => [{ userId: USER_ID, timezone: 'UTC' }],
        }));
        const realDTF = Intl.DateTimeFormat;
        jest
            .spyOn(Intl, 'DateTimeFormat')
            .mockImplementation(() => ({ format: () => '04:00' }) as any);

        try {
            const worker = new PlanWorker(planService, { USER_SERVICE_URL: 'http://user-service:3009' });
            await (worker as any).checkAndRegenerate();

            // Auto-gen happened…
            expect(generateAndStorePlan).toHaveBeenCalledTimes(1);
            expect(generateAndStorePlan.mock.calls[0][1]).toBe(USER_ID);
            // …and the quota gate was NOT consulted on this system path.
            expect(count).not.toHaveBeenCalled();
        } finally {
            (Intl as any).DateTimeFormat = realDTF;
            delete (global as any).fetch;
        }
    });

    it('events circadian handler calls generateAndStorePlan WITHOUT the gate (no DayPlan count)', async () => {
        const generateAndStorePlan = jest.fn(async () => FAKE_PLAN);
        const count = jest.fn(async () => 999); // would block IF the gate ran — it must NOT here
        const planService = { generateAndStorePlan, prisma: { dayPlan: { count } } } as unknown as PlanService;

        // Capture the handler registered for circadian:profile-computed.
        let handler: ((event: any) => Promise<void>) | undefined;
        const eventBus = {
            subscribe: jest.fn((channel: string, cb: any) => {
                if (channel === Channels.Circadian.ProfileComputed) handler = cb;
            }),
        } as any;

        await setupEventSubscribers(eventBus, planService);
        expect(handler).toBeDefined();

        await handler!({
            userId: USER_ID,
            correlationId: 'corr-1',
            payload: { shiftId: 'shift-1', shiftDate: '2026-06-20' },
        });

        // Auto-gen happened on the event path…
        expect(generateAndStorePlan).toHaveBeenCalledTimes(1);
        expect(generateAndStorePlan.mock.calls[0][1]).toBe(USER_ID);
        // …and the quota gate was NOT consulted.
        expect(count).not.toHaveBeenCalled();
    });
});
