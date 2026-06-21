/**
 * GDPR purge regression suite — DELETE /v1/plans/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and PlanService.purgeUser is
 *      NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across BOTH user-owned tables (day_plans via
 *      user_id, protocol_templates via creator_id) and returns a per-table
 *      deletedCounts summary. Idempotence is proved by purging a user with no
 *      rows (all-zero counts, still 200) and by re-purging.
 *
 * Two layers, mirroring this service's internal-auth.routes.test.ts:
 *   • SERVICE — the real PlanService.purgeUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual delete semantics:
 *     day_plans by user_id, protocol_templates by creator_id — and that OTHER
 *     users' rows survive.
 *   • REST — the genuine `planRoutes` plugin (mock PlanService) proves the guard
 *     and the 200 summary wiring, mounted on a fresh Fastify wired like src/index.ts.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import { sendUnauthorized } from '@nightfuel/config';
import { planRoutes } from '../src/routes';
import { PlanService } from '../src/plan.service';
import type { PlanService as PlanServiceType } from '../src/plan.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const INTERNAL_TOKEN = 'plan-internal-token-value';
const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what PlanService.purgeUser touches: a $transaction that runs an
// array of deleteMany promises, and deleteMany on dayPlan / protocolTemplate with
// the exact `where` shapes purgeUser builds.
function makeFakePrisma(seed?: { dayPlans?: any[]; protocolTemplates?: any[] }) {
    const state = {
        dayPlans: seed?.dayPlans ? [...seed.dayPlans] : [],
        protocolTemplates: seed?.protocolTemplates ? [...seed.protocolTemplates] : [],
    };

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        dayPlan: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.dayPlans, (r) => r.userId === where.userId)),
        },
        protocolTemplate: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(
                    deleteFrom(state.protocolTemplates, (r) => r.creatorId === where.creatorId),
                ),
        },
        // purgeUser passes an array of deleteMany promises. Resolve them in order
        // (the operations have already started) and return the results array,
        // exactly like Prisma's sequential-array $transaction.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

/** Build a fresh app wired like src/index.ts, with the internal token set. */
async function buildApp(planService: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
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
            await planRoutes(instance, {
                planService: planService as unknown as PlanServiceType,
                internalServiceToken,
            });
        },
        { prefix: '/v1/plans' },
    );
    await app.ready();
    return app;
}

describe('PlanService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across both tables, leaving others', async () => {
        const { prisma, state } = makeFakePrisma({
            dayPlans: [
                { id: 'p1', userId: VICTIM },
                { id: 'p2', userId: VICTIM },
                { id: 'p3', userId: OTHER },
            ],
            protocolTemplates: [
                { id: 't1', creatorId: VICTIM },
                { id: 't2', creatorId: OTHER },
            ],
        });
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const counts = await svc.purgeUser(VICTIM);

        expect(counts).toEqual({ day_plans: 2, protocol_templates: 1 });
        // Other users' rows survive.
        expect(state.dayPlans.map((r) => r.id)).toEqual(['p3']);
        expect(state.protocolTemplates.map((r) => r.id)).toEqual(['t2']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw)', async () => {
        const { prisma } = makeFakePrisma({
            dayPlans: [{ id: 'p3', userId: OTHER }],
            protocolTemplates: [{ id: 't2', creatorId: OTHER }],
        });
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const first = await svc.purgeUser(GHOST);
        const second = await svc.purgeUser(GHOST); // re-purge is safe

        expect(first).toEqual({ day_plans: 0, protocol_templates: 0 });
        expect(second).toEqual({ day_plans: 0, protocol_templates: 0 });
    });
});

describe('DELETE /v1/plans/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ day_plans: 0, protocol_templates: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({ method: 'DELETE', url: `/v1/plans/internal/user/${VICTIM}` });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ day_plans: 0, protocol_templates: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/plans/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ day_plans: 3, protocol_templates: 1 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/plans/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: VICTIM,
            deletedCounts: { day_plans: 3, protocol_templates: 1 },
        });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ day_plans: 0, protocol_templates: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/plans/internal/user/${GHOST}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({ day_plans: 0, protocol_templates: 0 });
    });
});
