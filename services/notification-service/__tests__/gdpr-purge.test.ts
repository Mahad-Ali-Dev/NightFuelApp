/**
 * GDPR purge regression suite — DELETE /v1/notifications/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and NotificationService.purgeUser
 *      is NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across all three user-owned tables
 *      (notification_preferences, notifications, push_subscriptions) and returns
 *      a per-table deletedCounts summary. Idempotence is proved by purging a user
 *      with no rows (all-zero counts, still 200) and by re-purging.
 *
 * Layers, mirroring the rest of this service's suites:
 *   • SERVICE — the real NotificationService.purgeUser runs against a tiny
 *     in-memory Prisma fake (no DB in CI). It proves the actual delete semantics:
 *     rows matched by user_id across the three tables — and that OTHER users'
 *     rows survive.
 *   • REST — the genuine `internalRoutes` plugin (mock service) proves the guard
 *     and the 200 summary wiring.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { internalRoutes } from '../src/internal-routes';
import { NotificationService } from '../src/notification.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what NotificationService.purgeUser touches: a $transaction that
// runs an array of deleteMany promises, and deleteMany on the three delegates with
// the exact `where: { userId }` shape purgeUser builds.
function makeFakePrisma(seed?: {
    notificationPreferences?: any[];
    notifications?: any[];
    pushSubscriptions?: any[];
}) {
    const state = {
        notificationPreferences: seed?.notificationPreferences ? [...seed.notificationPreferences] : [],
        notifications: seed?.notifications ? [...seed.notifications] : [],
        pushSubscriptions: seed?.pushSubscriptions ? [...seed.pushSubscriptions] : [],
    };

    const deleteFrom = (rows: any[], userId: string) => {
        const before = rows.length;
        const kept = rows.filter((r) => r.userId !== userId);
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        notificationPreference: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.notificationPreferences, where.userId)),
        },
        notification: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.notifications, where.userId)),
        },
        pushSubscription: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.pushSubscriptions, where.userId)),
        },
        // purgeUser passes an array of deleteMany promises. Resolve them in order
        // (the operations have already started) and return the results array,
        // exactly like Prisma's sequential-array $transaction.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

/** Build a fresh app wired like src/index.ts (internalRoutes, no JWT prefix). */
async function buildApp(
    notificationService: any,
    internalServiceToken = INTERNAL_TOKEN,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(async (instance) => {
        await internalRoutes(instance, { notificationService, internalServiceToken });
    });
    await app.ready();
    return app;
}

describe('NotificationService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across all three tables, leaving others', async () => {
        const { prisma, state } = makeFakePrisma({
            notificationPreferences: [{ userId: 'victim' }, { userId: 'other' }],
            notifications: [
                { id: 'n1', userId: 'victim' },
                { id: 'n2', userId: 'victim' },
                { id: 'n3', userId: 'other' },
            ],
            pushSubscriptions: [
                { id: 's1', userId: 'victim' },
                { id: 's2', userId: 'third' },
            ],
        });
        const svc = new NotificationService(prisma as any);

        const counts = await svc.purgeUser('victim');

        expect(counts).toEqual({
            notification_preferences: 1,
            notifications: 2,
            push_subscriptions: 1,
        });
        // Other users' rows survive.
        expect(state.notificationPreferences).toEqual([{ userId: 'other' }]);
        expect(state.notifications.map((n) => n.id)).toEqual(['n3']);
        expect(state.pushSubscriptions.map((s) => s.id)).toEqual(['s2']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw)', async () => {
        const { prisma } = makeFakePrisma({
            notificationPreferences: [{ userId: 'someone-else' }],
        });
        const svc = new NotificationService(prisma as any);

        const first = await svc.purgeUser('ghost');
        const second = await svc.purgeUser('ghost'); // re-purge is safe

        const zero = { notification_preferences: 0, notifications: 0, push_subscriptions: 0 };
        expect(first).toEqual(zero);
        expect(second).toEqual(zero);
    });
});

describe('DELETE /v1/notifications/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ notification_preferences: 0, notifications: 0, push_subscriptions: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/notifications/internal/user/victim',
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ notification_preferences: 0, notifications: 0, push_subscriptions: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/notifications/internal/user/victim',
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ notification_preferences: 1, notifications: 5, push_subscriptions: 2 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/notifications/internal/user/victim',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: 'victim',
            deletedCounts: { notification_preferences: 1, notifications: 5, push_subscriptions: 2 },
        });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith('victim');
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ notification_preferences: 0, notifications: 0, push_subscriptions: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/notifications/internal/user/ghost',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({
            notification_preferences: 0,
            notifications: 0,
            push_subscriptions: 0,
        });
    });
});
