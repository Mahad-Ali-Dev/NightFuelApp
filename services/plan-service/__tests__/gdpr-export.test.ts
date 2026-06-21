/**
 * GDPR data-export regression suite — GET /v1/plans/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Two guarantees:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. Without the X-Internal-Token header
 *      (or with the wrong one) it MUST answer 404 (the stock not-found body),
 *      never revealing the route exists, and PlanService.exportUser is NEVER
 *      invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME user-owned tables the purge covers (day_plans via
 *      user_id, protocol_templates via creator_id), keyed by table name, and ONLY
 *      the target user's rows (others are excluded).
 *
 * Two layers, mirroring this service's gdpr-purge.test.ts:
 *   • SERVICE — the real PlanService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics (day_plans by
 *     user_id, protocol_templates by creator_id, others excluded), that the export
 *     table set EXACTLY matches the purge table set (sync invariant), that no
 *     secret/credential-looking field leaks, and that the per-table row cap bounds
 *     the payload.
 *   • REST — the genuine `planRoutes` plugin (mock PlanService) proves the guard
 *     and the 200 body wiring, mounted on a fresh Fastify wired like src/index.ts.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
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

// The export table set MUST equal the purge table set (day_plans, protocol_templates).
const EXPORT_TABLES = ['day_plans', 'protocol_templates'];

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what PlanService.exportUser touches: findMany on dayPlan /
// protocolTemplate with the exact `where` + orderBy + take shapes exportUser
// builds. Also provides deleteMany + a sequential $transaction so the
// sync-invariant test can call the real purgeUser against the same fake.
function makeFakePrisma(seed?: { dayPlans?: any[]; protocolTemplates?: any[] }) {
    const state = {
        dayPlans: seed?.dayPlans ? [...seed.dayPlans] : [],
        protocolTemplates: seed?.protocolTemplates ? [...seed.protocolTemplates] : [],
    };

    // A row matches only when its owner-id strictly equals the target, exactly
    // like Postgres `WHERE <col> = $1`. Newest-first via createdAt desc; bounded
    // by take.
    const findByOwner = (rows: any[], ownerCol: string, { where, orderBy, take }: any) => {
        let out = rows.filter((r) => r[ownerCol] === where[ownerCol]);
        if (orderBy?.createdAt === 'desc') {
            out = [...out].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
        }
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const deleteFrom = (rows: any[], ownerCol: string, ownerId: string) => {
        const before = rows.length;
        const kept = rows.filter((r) => r[ownerCol] !== ownerId);
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        dayPlan: {
            findMany: (args: any) => findByOwner(state.dayPlans, 'userId', args),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.dayPlans, 'userId', where.userId)),
        },
        protocolTemplate: {
            findMany: (args: any) => findByOwner(state.protocolTemplates, 'creatorId', args),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.protocolTemplates, 'creatorId', where.creatorId)),
        },
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

describe('PlanService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across both tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            dayPlans: [
                { id: 'p1', userId: VICTIM, planVersion: 2, createdAt: '2026-01-02T00:00:00Z' },
                { id: 'p2', userId: VICTIM, planVersion: 1, createdAt: '2026-01-01T00:00:00Z' },
                { id: 'p3', userId: OTHER, planVersion: 1, createdAt: '2026-01-03T00:00:00Z' },
            ],
            protocolTemplates: [
                { id: 't1', creatorId: VICTIM, name: 'Cut', createdAt: '2026-01-01T00:00:00Z' },
                { id: 't2', creatorId: OTHER, name: 'Bulk', createdAt: '2026-01-02T00:00:00Z' },
            ],
        });
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const out = await svc.exportUser(VICTIM);

        // Newest-first ordering preserved; only the victim's rows.
        expect(out.day_plans.map((r: any) => r.id)).toEqual(['p1', 'p2']);
        expect(out.protocol_templates.map((r: any) => r.id)).toEqual(['t1']);

        // No other user's rows leak anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('"id":"p3"');
        expect(serialized).not.toContain('"id":"t2"');
        expect(serialized).not.toContain(`"userId":"${OTHER}"`);
        expect(serialized).not.toContain(`"creatorId":"${OTHER}"`);
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('does NOT leak any secret/credential-looking field (no password/token/secret/key)', async () => {
        const { prisma } = makeFakePrisma({
            dayPlans: [{ id: 'p1', userId: VICTIM, planVersion: 1, createdAt: '2026-01-01T00:00:00Z', plan: { calorieTarget: 2000 }, generationModel: 'openai' }],
            protocolTemplates: [{ id: 't1', creatorId: VICTIM, name: 'Cut', createdAt: '2026-01-01T00:00:00Z', parameters: { calories: 1800 } }],
        });
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const out = await svc.exportUser(VICTIM);
        const serialized = JSON.stringify(out).toLowerCase();

        for (const forbidden of [
            'password',
            'passwordhash',
            'token',
            'secret',
            'apikey',
            'privatekey',
            'credential',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('returns empty arrays (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma, state } = makeFakePrisma({
            dayPlans: [{ id: 'p3', userId: OTHER }],
            protocolTemplates: [{ id: 't2', creatorId: OTHER }],
        });
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        expect(first.day_plans).toEqual([]);
        expect(first.protocol_templates).toEqual([]);
        // Repeatable: identical output for unchanged data, and nothing was deleted.
        expect(second).toEqual(first);
        expect(state.dayPlans.map((r) => r.id)).toEqual(['p3']);
        expect(state.protocolTemplates.map((r) => r.id)).toEqual(['t2']);
    });

    it('bounds each per-user table and flags truncation when over the cap', async () => {
        const cap = 50_000;
        const mkPlans = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `p${i}`,
                userId: VICTIM,
                planVersion: i,
                createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }));
        const { prisma } = makeFakePrisma({ dayPlans: mkPlans(cap + 1) });
        const svc = new PlanService(prisma as any, {} as any, {} as any);

        const out = await svc.exportUser(VICTIM);

        expect(out.day_plans.length).toBe(cap);
        expect(out._meta.dayPlansTruncated).toBe(true);
        expect(out._meta.protocolTemplatesTruncated).toBe(false);
        expect(out._meta.rowLimit).toBe(cap);
    });
});

describe('GET /v1/plans/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    const emptyExport = () =>
        Promise.resolve({
            day_plans: [],
            protocol_templates: [],
            _meta: { dayPlansTruncated: false, protocolTemplatesTruncated: false, rowLimit: 50000 },
        });

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: `/v1/plans/internal/user/${VICTIM}/export` });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/plans/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            day_plans: [{ id: 'p1', userId: VICTIM, planVersion: 1, plan: { calorieTarget: 2000 } }],
            protocol_templates: [{ id: 't1', creatorId: VICTIM, name: 'Cut', parameters: { calories: 1800 } }],
            _meta: { dayPlansTruncated: false, protocolTemplatesTruncated: false, rowLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/plans/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ userId: VICTIM, data });
        // Keyed by the SAME table names the purge deletes.
        expect(Object.keys(res.json().data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/plans/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.day_plans).toEqual([]);
        expect(res.json().data.protocol_templates).toEqual([]);
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/plans/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
