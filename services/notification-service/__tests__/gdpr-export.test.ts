/**
 * GDPR data-export regression suite — GET /v1/notifications/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Three guarantees:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses (it lives in the SAME internalRoutes
 *      plugin). Without the X-Internal-Token header (or with the wrong one) it
 *      MUST answer 404 (the stock not-found body), never revealing the route
 *      exists, and NotificationService.exportUser is NEVER invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME user-owned tables the purge covers
 *      (notification_preferences, notifications, push_subscriptions), keyed by
 *      table name, and ONLY the target user's rows (others excluded).
 *   3. SECURITY — push_subscriptions secrets (the endpoint URL, the `auth`
 *      Web-Push secret, the `p256dh` key) are NEVER emitted raw. They are
 *      summarized as presence booleans, and no secret-looking field name or raw
 *      secret value appears anywhere in the output.
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real NotificationService.exportUser runs against a tiny
 *     in-memory Prisma fake (no DB in CI). It proves the actual read semantics
 *     (rows by user_id across the three tables, others excluded), that the export
 *     table set EXACTLY matches the purge table set (sync invariant), that push
 *     secrets are scrubbed, and that the per-table row cap bounds the payload.
 *   • REST — the genuine `internalRoutes` plugin (the SAME plugin src/index.ts
 *     mounts), with a mock service, proves the guard and the 200 body wiring.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { internalRoutes } from '../src/internal-routes';
import { NotificationService } from '../src/notification.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// The export table set MUST equal the purge table set.
const EXPORT_TABLES = ['notification_preferences', 'notifications', 'push_subscriptions'].sort();

const VICTIM = 'victim';
const OTHER = 'other';
const GHOST = 'ghost';

// ── In-memory Prisma fake (export + purge slices) ───────────────────────────────
// Implements just what NotificationService.exportUser touches: findUnique on
// notificationPreference (unique on userId), findMany on notification /
// pushSubscription with the exact where/orderBy/take shapes exportUser builds.
// Also provides deleteMany + a sequential $transaction so the sync-invariant test
// can call the real purgeUser against the same fake.
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

    const findManyByUser = (rows: any[], { where, orderBy, take }: any, sortKey: string) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (orderBy?.[sortKey] === 'desc') {
            out = [...out].sort(
                (a, b) => new Date(b[sortKey]).getTime() - new Date(a[sortKey]).getTime(),
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
        notificationPreference: {
            findUnique: ({ where }: any) =>
                Promise.resolve(
                    state.notificationPreferences.find((r) => r.userId === where.userId) ?? null,
                ),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.notificationPreferences, where.userId)),
        },
        notification: {
            findMany: (args: any) => findManyByUser(state.notifications, args, 'createdAt'),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.notifications, where.userId)),
        },
        pushSubscription: {
            findMany: (args: any) => findManyByUser(state.pushSubscriptions, args, 'createdAt'),
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.pushSubscriptions, where.userId)),
        },
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

/** Build a fresh app wired like src/index.ts (the real internalRoutes plugin). */
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

describe('NotificationService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all three tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            notificationPreferences: [
                { id: 'p1', userId: VICTIM, mealReminderEnabled: true },
                { id: 'p2', userId: OTHER, mealReminderEnabled: false },
            ],
            notifications: [
                { id: 'n1', userId: VICTIM, type: 'SYSTEM', title: 'Hi', body: 'b', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'n2', userId: VICTIM, type: 'MEAL_REMINDER', title: 'Eat', body: 'b', createdAt: '2026-01-01T00:00:00Z' },
                { id: 'n3', userId: OTHER, type: 'SYSTEM', title: 'X', body: 'b', createdAt: '2026-01-03T00:00:00Z' },
            ],
            pushSubscriptions: [
                { id: 's1', userId: VICTIM, platform: 'WEB', endpoint: 'https://push/abc', auth: 'authsecret', p256dh: 'keydata', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
                { id: 's2', userId: OTHER, platform: 'EXPO', endpoint: 'ExponentPushToken[zzz]', auth: null, p256dh: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
            ],
        });
        const svc = new NotificationService(prisma as any);

        const out = await svc.exportUser(VICTIM);

        // Preference is a 0-or-1 array; only the victim's row.
        expect(out.notification_preferences.map((r: any) => r.id)).toEqual(['p1']);
        // Notifications newest-first; only the victim's rows.
        expect(out.notifications.map((r: any) => r.id)).toEqual(['n1', 'n2']);
        // Push subs: only the victim's row.
        expect(out.push_subscriptions.map((r: any) => r.id)).toEqual(['s1']);

        // No other user's rows leak anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('"id":"n3"');
        expect(serialized).not.toContain('"id":"p2"');
        expect(serialized).not.toContain('"id":"s2"');
        expect(serialized).not.toContain(`"userId":"${OTHER}"`);
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new NotificationService(prisma as any);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('SECURITY: scrubs push_subscriptions secrets — emits presence flags, never raw endpoint/auth/p256dh', async () => {
        const { prisma } = makeFakePrisma({
            pushSubscriptions: [
                {
                    id: 's1',
                    userId: VICTIM,
                    platform: 'WEB',
                    endpoint: 'https://fcm.googleapis.com/send/SUPER-SECRET-ENDPOINT-TOKEN',
                    auth: 'RAW-AUTH-SECRET',
                    p256dh: 'RAW-P256DH-KEY',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                },
                {
                    id: 's2',
                    userId: VICTIM,
                    platform: 'EXPO',
                    endpoint: 'ExponentPushToken[xyz]',
                    auth: null,
                    p256dh: null,
                    createdAt: '2026-01-02T00:00:00Z',
                    updatedAt: '2026-01-02T00:00:00Z',
                },
            ],
        });
        const svc = new NotificationService(prisma as any);

        const out = await svc.exportUser(VICTIM);

        // Presence flags reflect the underlying data, no raw values.
        expect(out.push_subscriptions).toEqual([
            // newest-first (s2 createdAt > s1)
            { id: 's2', userId: VICTIM, platform: 'EXPO', endpointPresent: true, authPresent: false, p256dhPresent: false, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
            { id: 's1', userId: VICTIM, platform: 'WEB', endpointPresent: true, authPresent: true, p256dhPresent: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ]);

        const serialized = JSON.stringify(out);
        // The raw secret/credential VALUES never appear.
        expect(serialized).not.toContain('SUPER-SECRET-ENDPOINT-TOKEN');
        expect(serialized).not.toContain('fcm.googleapis.com');
        expect(serialized).not.toContain('RAW-AUTH-SECRET');
        expect(serialized).not.toContain('RAW-P256DH-KEY');
        expect(serialized).not.toContain('ExponentPushToken');

        // The raw secret FIELD NAMES are not emitted (only the *Present summaries).
        const lower = serialized.toLowerCase();
        expect(lower).not.toContain('"endpoint"');
        expect(lower).not.toContain('"auth"');
        expect(lower).not.toContain('"p256dh"');
        for (const forbidden of ['password', 'secret', 'credential', 'apikey', 'privatekey']) {
            expect(lower).not.toContain(forbidden);
        }
    });

    it('returns empty tables (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma, state } = makeFakePrisma({
            notificationPreferences: [{ id: 'p9', userId: OTHER }],
            notifications: [{ id: 'n9', userId: OTHER, createdAt: '2026-01-01T00:00:00Z' }],
        });
        const svc = new NotificationService(prisma as any);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        expect(first.notification_preferences).toEqual([]);
        expect(first.notifications).toEqual([]);
        expect(first.push_subscriptions).toEqual([]);
        // Repeatable: identical output, and nothing was deleted.
        expect(second).toEqual(first);
        expect(state.notificationPreferences.map((r) => r.id)).toEqual(['p9']);
        expect(state.notifications.map((r) => r.id)).toEqual(['n9']);
    });

    it('bounds the notifications table and flags truncation when over the cap', async () => {
        const cap = 50_000;
        const mkNotifs = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `n${i}`,
                userId: VICTIM,
                type: 'SYSTEM',
                title: 't',
                body: 'b',
                createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }));
        const { prisma } = makeFakePrisma({ notifications: mkNotifs(cap + 1) });
        const svc = new NotificationService(prisma as any);

        const out = await svc.exportUser(VICTIM);

        expect(out.notifications.length).toBe(cap);
        expect(out._meta.notificationsTruncated).toBe(true);
        expect(out._meta.rowLimit).toBe(cap);
    });
});

describe('GET /v1/notifications/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    const emptyExport = () =>
        Promise.resolve({
            notification_preferences: [],
            notifications: [],
            push_subscriptions: [],
            _meta: { notificationsTruncated: false, rowLimit: 50000 },
        });

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/notifications/internal/user/${VICTIM}/export`,
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/notifications/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            notification_preferences: [{ id: 'p1', userId: VICTIM, mealReminderEnabled: true }],
            notifications: [{ id: 'n1', userId: VICTIM, type: 'SYSTEM', title: 'Hi', body: 'b' }],
            push_subscriptions: [
                { id: 's1', userId: VICTIM, platform: 'WEB', endpointPresent: true, authPresent: true, p256dhPresent: true },
            ],
            _meta: { notificationsTruncated: false, rowLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/notifications/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ userId: VICTIM, data });
        // Keyed by the SAME table names the purge deletes.
        expect(Object.keys(res.json().data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        // No raw push secrets surface over the wire.
        const serialized = JSON.stringify(res.json()).toLowerCase();
        expect(serialized).not.toContain('"endpoint"');
        expect(serialized).not.toContain('"auth"');
        expect(serialized).not.toContain('"p256dh"');
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/notifications/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.notification_preferences).toEqual([]);
        expect(res.json().data.notifications).toEqual([]);
        expect(res.json().data.push_subscriptions).toEqual([]);
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/notifications/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
