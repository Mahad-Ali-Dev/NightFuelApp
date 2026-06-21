import { FastifyInstance } from 'fastify';
import { makeInternalAuthGuard } from '@nightfuel/config';
import { NotificationService } from './notification.service';

/**
 * Server-to-server-only internal routes for the notification-service.
 *
 * Registered WITHOUT the public `/v1/notifications` JWT prefix: these routes use
 * absolute paths and are guarded by `makeInternalAuthGuard` (constant-time
 * X-Internal-Token check) rather than the user JWT. nginx additionally 404s
 * /v1/<svc>/internal/* at the edge; this in-service guard is defense-in-depth so
 * a request reaching the route directly (over the Docker network or a bypassed
 * edge) must still present the shared INTERNAL_SERVICE_TOKEN.
 */
export const internalRoutes = async (
    fastify: FastifyInstance,
    opts: { notificationService: NotificationService; internalServiceToken?: string },
): Promise<void> => {
    const service = opts.notificationService;

    // Build the guard once. On a missing/wrong token it replies 404 (the stock
    // Fastify not-found body) and the handler never runs. An unset token fails
    // closed (every request 404s) — prod must set INTERNAL_SERVICE_TOKEN.
    const internalAuth = makeInternalAuthGuard(opts.internalServiceToken);

    // ── DELETE /v1/notifications/internal/user/:userId (GDPR purge) ─────────────
    // PERMANENTLY erases EVERY notification-service row owned by :userId across
    // all three user-owned tables (notification_preferences, notifications,
    // push_subscriptions). IDEMPOTENT: purging a user with no rows returns 200
    // with zero counts; purging twice is safe (deleteMany never throws on zero
    // rows). Returns a per-table deletedCounts summary.
    fastify.delete(
        '/v1/notifications/internal/user/:userId',
        { preHandler: internalAuth },
        async (request, reply) => {
            const { userId } = request.params as { userId: string };
            try {
                const deletedCounts = await service.purgeUser(userId);
                return reply.code(200).send({ userId, deletedCounts });
            } catch (err: any) {
                request.log.error({ err, userId }, 'GDPR purge failed');
                return reply.code(500).send({ error: 'Internal server error' });
            }
        },
    );

    // ── GET /v1/notifications/internal/user/:userId/export (GDPR data export) ────
    // READ-ONLY counterpart of the purge (GDPR Right of Access). Behind the SAME
    // internal-token guard the purge uses (404 without the token). READS and
    // returns EVERY notification-service row owned by :userId across the SAME
    // user-owned tables the purge erases (notification_preferences, notifications,
    // push_subscriptions), as a JSON object keyed by table name, so export and
    // erasure stay in sync. IDEMPOTENT: a user with no rows returns empty tables,
    // still 200; no writes ever occur. SECURITY: push_subscriptions secrets
    // (endpoint URL / auth / p256dh) are summarized as presence booleans —
    // exportUser NEVER emits the raw push credentials.
    fastify.get(
        '/v1/notifications/internal/user/:userId/export',
        { preHandler: internalAuth },
        async (request, reply) => {
            const { userId } = request.params as { userId: string };
            try {
                const data = await service.exportUser(userId);
                return reply.code(200).send({ userId, data });
            } catch (err: any) {
                request.log.error({ err, userId }, 'GDPR export failed');
                return reply.code(500).send({ error: 'Internal server error' });
            }
        },
    );
};

export default internalRoutes;
