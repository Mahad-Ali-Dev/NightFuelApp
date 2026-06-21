/**
 * GDPR data-export regression suite — GET /v1/subscriptions/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Two guarantees:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. Without the X-Internal-Token header
 *      (or with the wrong one, or with an unset/empty expected token) it MUST
 *      answer 404 (the stock not-found body), never revealing the route exists,
 *      and SubscriptionService.exportUser is NEVER invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the EXACT SAME three user-owned tables the purge covers
 *      (subscriptions, subscription_events, iap_transactions — each via user_id),
 *      keyed by table name, and ONLY the target user's rows (others excluded).
 *
 * Two layers, mirroring this service's gdpr-purge.test.ts:
 *   • SERVICE — the real SubscriptionService.exportUser runs against a tiny
 *     in-memory Prisma fake (no DB in CI). It proves the actual read semantics
 *     (each table by user_id, others excluded), that the export table set EXACTLY
 *     matches the purge table set (sync invariant), that no secret/credential-
 *     looking field leaks, and that the per-table row cap bounds the payload.
 *   • REST — the genuine `subscriptionRoutes` plugin (mock SubscriptionService)
 *     proves the internal-token guard and the 200 body wiring, mounted on a fresh
 *     Fastify wired like src/index.ts.
 *
 * iap-validator is mocked because routes.ts imports it at module load (the real
 * module reads APPLE_SHARED_SECRET / GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and would
 * hit the network). This suite never calls the IAP route.
 */

// ── Mock the iap-validator module (import-time only; unused by this suite) ─────
jest.mock('../src/iap-validator', () => ({
    validateAppleReceipt: jest.fn(),
    validateGoogleReceipt: jest.fn(),
    productIdToTier: jest.fn(),
}));

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from '../src/routes';
import { SubscriptionService } from '../src/subscription.service';

const INTERNAL_TOKEN = 'subscription-internal-token-value';
const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

// The export table set MUST equal the purge table set.
const EXPORT_TABLES = ['iap_transactions', 'subscription_events', 'subscriptions'];

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what SubscriptionService.exportUser touches: findMany on
// subscription / subscriptionEvent / iAPTransaction with the exact where + orderBy
// + take shapes. Also provides deleteMany + a sequential $transaction so the
// sync-invariant test can run the real purgeUser against the same fake.
function makeFakePrisma(seed?: {
    subscriptions?: any[];
    subscriptionEvents?: any[];
    iapTransactions?: any[];
}) {
    const state = {
        subscriptions: seed?.subscriptions ? [...seed.subscriptions] : [],
        subscriptionEvents: seed?.subscriptionEvents ? [...seed.subscriptionEvents] : [],
        iapTransactions: seed?.iapTransactions ? [...seed.iapTransactions] : [],
    };

    // A row matches only when its user_id strictly equals the target, exactly like
    // Postgres `WHERE user_id = $1`. Newest-first via createdAt desc; bounded by take.
    const findByOwner = (rows: any[], { where, orderBy, take }: any) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (orderBy?.createdAt === 'desc') {
            out = [...out].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
        }
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const deleteFrom = (rows: any[], userId: string) => {
        const before = rows.length;
        const kept = rows.filter((r) => r.userId !== userId);
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        subscription: {
            findMany: (args: any) => findByOwner(state.subscriptions, args),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.subscriptions, where.userId)),
        },
        subscriptionEvent: {
            findMany: (args: any) => findByOwner(state.subscriptionEvents, args),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.subscriptionEvents, where.userId)),
        },
        iAPTransaction: {
            findMany: (args: any) => findByOwner(state.iapTransactions, args),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.iapTransactions, where.userId)),
        },
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

const noopLogger: any = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/** Build a fresh app wired like src/index.ts, with the internal token set. */
async function buildApp(
    subscriptionService: any,
    internalServiceToken: string | undefined = INTERNAL_TOKEN,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    // Stand-in for the @fastify/jwt-backed decorator (referenced by other routes'
    // preHandlers when subscriptionRoutes registers).
    app.decorate('authenticate', async (request: any) => {
        request.user = { id: VICTIM };
    });

    await app.register(async (instance) => {
        await subscriptionRoutes(instance, {
            subscriptionService: subscriptionService as any,
            eventBus: { publish: jest.fn(), subscribe: jest.fn() } as any,
            internalServiceToken,
        });
    });

    await app.ready();
    return app;
}

describe('SubscriptionService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all three tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            subscriptions: [
                { id: 's1', userId: VICTIM, tier: 'PRO', createdAt: '2026-01-02T00:00:00Z' },
                { id: 's2', userId: OTHER, tier: 'FREE', createdAt: '2026-01-03T00:00:00Z' },
            ],
            subscriptionEvents: [
                { id: 'e1', userId: VICTIM, eventType: 'TIER_UPGRADED', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'e2', userId: VICTIM, eventType: 'SUBSCRIPTION_CREATED', createdAt: '2026-01-01T00:00:00Z' },
                { id: 'e3', userId: OTHER, eventType: 'SUBSCRIPTION_CREATED', createdAt: '2026-01-03T00:00:00Z' },
            ],
            iapTransactions: [
                { id: 'i1', userId: VICTIM, originalTransactionId: 'otx-1', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'i2', userId: OTHER, originalTransactionId: 'otx-2', createdAt: '2026-01-03T00:00:00Z' },
            ],
        });
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const out = await svc.exportUser(VICTIM);

        // Newest-first ordering preserved; only the victim's rows.
        expect((out.subscriptions as any[]).map((r) => r.id)).toEqual(['s1']);
        expect((out.subscription_events as any[]).map((r) => r.id)).toEqual(['e1', 'e2']);
        expect((out.iap_transactions as any[]).map((r) => r.id)).toEqual(['i1']);

        // No other user's rows leak anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('"id":"s2"');
        expect(serialized).not.toContain('"id":"e3"');
        expect(serialized).not.toContain('"id":"i2"');
        expect(serialized).not.toContain(`"userId":"${OTHER}"`);
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('does NOT leak any secret/credential-looking field (no password/token/secret/key)', async () => {
        const { prisma } = makeFakePrisma({
            subscriptions: [
                {
                    id: 's1',
                    userId: VICTIM,
                    tier: 'PRO',
                    stripeCustomerId: 'cus_123',
                    stripeSubId: 'sub_123',
                    stripeConnectId: 'acct_123',
                    createdAt: '2026-01-01T00:00:00Z',
                },
            ],
            iapTransactions: [
                { id: 'i1', userId: VICTIM, originalTransactionId: 'otx-1', productId: 'pro_monthly', createdAt: '2026-01-01T00:00:00Z' },
            ],
        });
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const out = await svc.exportUser(VICTIM);
        const serialized = JSON.stringify(out).toLowerCase();

        // This service stores NO credential columns. Assert none of the usual
        // secret field names ever appear in the export payload.
        for (const forbidden of [
            'password',
            'passwordhash',
            'token',
            'secret',
            'apikey',
            'privatekey',
            'credential',
            'receipt',
            'sharedsecret',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('returns empty arrays (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma, state } = makeFakePrisma({
            subscriptions: [{ id: 's2', userId: OTHER }],
            subscriptionEvents: [{ id: 'e3', userId: OTHER }],
            iapTransactions: [{ id: 'i2', userId: OTHER }],
        });
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        expect(first.subscriptions).toEqual([]);
        expect(first.subscription_events).toEqual([]);
        expect(first.iap_transactions).toEqual([]);
        // Repeatable: identical output for unchanged data, and nothing was deleted.
        expect(second).toEqual(first);
        expect(state.subscriptions.map((r) => r.id)).toEqual(['s2']);
        expect(state.subscriptionEvents.map((r) => r.id)).toEqual(['e3']);
        expect(state.iapTransactions.map((r) => r.id)).toEqual(['i2']);
    });

    it('bounds each per-user table and flags truncation when over the cap', async () => {
        const cap = 50_000;
        const mkEvents = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `e${i}`,
                userId: VICTIM,
                eventType: 'TIER_UPGRADED',
                createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }));
        const { prisma } = makeFakePrisma({ subscriptionEvents: mkEvents(cap + 1) });
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const out = await svc.exportUser(VICTIM);

        expect(out.subscription_events.length).toBe(cap);
        expect(out._meta.subscriptionEventsTruncated).toBe(true);
        expect(out._meta.subscriptionsTruncated).toBe(false);
        expect(out._meta.iapTransactionsTruncated).toBe(false);
        expect(out._meta.rowLimit).toBe(cap);
    });
});

describe('GET /v1/subscriptions/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    const emptyExport = () =>
        Promise.resolve({
            subscriptions: [],
            subscription_events: [],
            iap_transactions: [],
            _meta: {
                subscriptionsTruncated: false,
                subscriptionEventsTruncated: false,
                iapTransactionsTruncated: false,
                rowLimit: 50000,
            },
        });

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/subscriptions/internal/user/${VICTIM}/export`,
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/subscriptions/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            subscriptions: [{ id: 's1', userId: VICTIM, tier: 'PRO' }],
            subscription_events: [{ id: 'e1', userId: VICTIM, eventType: 'TIER_UPGRADED' }],
            iap_transactions: [{ id: 'i1', userId: VICTIM, originalTransactionId: 'otx-1' }],
            _meta: {
                subscriptionsTruncated: false,
                subscriptionEventsTruncated: false,
                iapTransactionsTruncated: false,
                rowLimit: 50000,
            },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/subscriptions/internal/user/${VICTIM}/export`,
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
            url: `/v1/subscriptions/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.subscriptions).toEqual([]);
        expect(res.json().data.subscription_events).toEqual([]);
        expect(res.json().data.iap_transactions).toEqual([]);
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/subscriptions/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
