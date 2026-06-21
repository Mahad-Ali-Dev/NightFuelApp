/**
 * GDPR purge regression suite — DELETE /v1/subscriptions/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and SubscriptionService.purgeUser
 *      is NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across ALL THREE user-owned tables
 *      (subscriptions, subscription_events, iap_transactions — each via user_id)
 *      and returns a per-table deletedCounts summary. Idempotence is proved by
 *      purging a user with no rows (all-zero counts, still 200) and by re-purging.
 *
 * Two layers, mirroring plan-service's gdpr-purge.test.ts:
 *   • SERVICE — the real SubscriptionService.purgeUser runs against a tiny
 *     in-memory Prisma fake (no DB in CI). It proves the actual delete semantics
 *     (each table by user_id) and that OTHER users' rows survive.
 *   • REST — the genuine `subscriptionRoutes` plugin (mock SubscriptionService)
 *     proves the internal-token guard and the 200 summary wiring, mounted on a
 *     fresh Fastify wired like src/index.ts.
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

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what SubscriptionService.purgeUser touches: a $transaction that
// runs an array of deleteMany promises, and deleteMany on subscription /
// subscriptionEvent / iAPTransaction with the exact `where: { userId }` shape.
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

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        subscription: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.subscriptions, (r) => r.userId === where.userId)),
        },
        subscriptionEvent: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.subscriptionEvents, (r) => r.userId === where.userId)),
        },
        iAPTransaction: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.iapTransactions, (r) => r.userId === where.userId)),
        },
        // purgeUser passes an array of deleteMany promises. Resolve them in order
        // (the operations have already started) and return the results array,
        // exactly like Prisma's sequential-array $transaction.
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

describe('SubscriptionService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across all three tables, leaving others', async () => {
        const { prisma, state } = makeFakePrisma({
            subscriptions: [
                { id: 's1', userId: VICTIM },
                { id: 's2', userId: OTHER },
            ],
            subscriptionEvents: [
                { id: 'e1', userId: VICTIM },
                { id: 'e2', userId: VICTIM },
                { id: 'e3', userId: OTHER },
            ],
            iapTransactions: [
                { id: 'i1', userId: VICTIM },
                { id: 'i2', userId: OTHER },
            ],
        });
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const counts = await svc.purgeUser(VICTIM);

        expect(counts).toEqual({ subscriptions: 1, subscription_events: 2, iap_transactions: 1 });
        // Other users' rows survive.
        expect(state.subscriptions.map((r) => r.id)).toEqual(['s2']);
        expect(state.subscriptionEvents.map((r) => r.id)).toEqual(['e3']);
        expect(state.iapTransactions.map((r) => r.id)).toEqual(['i2']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw)', async () => {
        const { prisma } = makeFakePrisma({
            subscriptions: [{ id: 's2', userId: OTHER }],
            subscriptionEvents: [{ id: 'e3', userId: OTHER }],
            iapTransactions: [{ id: 'i2', userId: OTHER }],
        });
        const svc = new SubscriptionService(prisma as any, noopLogger);

        const first = await svc.purgeUser(GHOST);
        const second = await svc.purgeUser(GHOST); // re-purge is safe

        const zero = { subscriptions: 0, subscription_events: 0, iap_transactions: 0 };
        expect(first).toEqual(zero);
        expect(second).toEqual(zero);
    });
});

describe('DELETE /v1/subscriptions/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ subscriptions: 0, subscription_events: 0, iap_transactions: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/subscriptions/internal/user/${VICTIM}`,
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ subscriptions: 0, subscription_events: 0, iap_transactions: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/subscriptions/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ subscriptions: 1, subscription_events: 4, iap_transactions: 2 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/subscriptions/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: VICTIM,
            deletedCounts: { subscriptions: 1, subscription_events: 4, iap_transactions: 2 },
        });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ subscriptions: 0, subscription_events: 0, iap_transactions: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/subscriptions/internal/user/${GHOST}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({
            subscriptions: 0,
            subscription_events: 0,
            iap_transactions: 0,
        });
    });
});
