
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';
import {
    listNotificationsQuerySchema,
    notificationIdParamSchema,
    updatePreferencesSchema,
} from './schemas';

const errorResponseSchema = z.object({
    error: z.string(),
});

export const notificationRoutes = async (
    fastify: FastifyInstance,
    opts: { notificationService: NotificationService; pushService: PushService },
): Promise<void> => {
    const service = opts.notificationService;
    const push = opts.pushService;

    // -----------------------------------------------------------------------
    // GET /v1/notifications
    // List the authenticated user's notifications (newest first).
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                querystring: listNotificationsQuerySchema,
                response: {
                    200: z.object({
                        data: z.array(z.any()),
                        count: z.number(),
                    }),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const notifications = await service.listNotifications(userId, request.query);
                reply.send({ data: notifications, count: notifications.length });
            } catch (err: any) {
                request.log.error(err, 'Failed to list notifications');
                reply.code(500).send({ error: 'Failed to fetch notifications' });
            }
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/notifications/:id/read
    // Mark a single notification as read.
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/:id/read',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: notificationIdParamSchema,
                response: {
                    200: z.any(),
                    404: errorResponseSchema,
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const notification = await service.markAsRead(request.params.id, userId);
                reply.send(notification);
            } catch (err: any) {
                request.log.error(err, 'Failed to mark notification as read');
                if (
                    err.message?.includes('not found') ||
                    err.message?.includes('does not belong')
                ) {
                    reply.code(404).send({ error: err.message });
                } else {
                    reply.code(500).send({ error: 'Failed to mark notification as read' });
                }
            }
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/notifications/read-all
    // Mark all of the authenticated user's notifications as read.
    // NOTE: This route must be registered BEFORE /:id/read so that Fastify
    //       does not mistakenly match "read-all" as a UUID param segment.
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/read-all',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                // No additional input — acts on the authenticated user only
                response: {
                    200: z.object({ updated: z.number().int() }),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const count = await service.markAllAsRead(userId);
                reply.send({ updated: count });
            } catch (err: any) {
                request.log.error(err, 'Failed to mark all notifications as read');
                reply.code(500).send({ error: 'Failed to mark all notifications as read' });
            }
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/notifications/preferences
    // Fetch or lazily create the user's notification preferences.
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/preferences',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                response: {
                    200: z.any(),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const prefs = await service.getOrCreatePreferences(userId);
                reply.send(prefs);
            } catch (err: any) {
                request.log.error(err, 'Failed to fetch preferences');
                reply.code(500).send({ error: 'Failed to fetch preferences' });
            }
        },
    );

    // -----------------------------------------------------------------------
    // PUT /v1/notifications/preferences
    // Partial update of the user's notification preferences.
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/preferences',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: updatePreferencesSchema,
                response: {
                    200: z.any(),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const prefs = await service.updatePreferences(userId, request.body);
                reply.send(prefs);
            } catch (err: any) {
                request.log.error(err, 'Failed to update preferences');
                reply.code(500).send({ error: 'Failed to update preferences' });
            }
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/notifications/push/vapid-key
    // Public endpoint — returns the VAPID public key needed by the browser
    // service worker to subscribe to web push.
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/push/vapid-key',
        {
            schema: {
                response: {
                    200: z.object({ publicKey: z.string() }),
                    503: errorResponseSchema,
                },
            },
        },
        async (_request, reply) => {
            const key = push.getVapidPublicKey();
            if (!key) {
                reply.code(503).send({ error: 'Push notifications are not configured on this server' });
                return;
            }
            reply.send({ publicKey: key });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/notifications/push/subscribe
    // Register a Web Push (browser) subscription for the authenticated user.
    // Body: { endpoint, p256dh, auth }
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/push/subscribe',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: z.object({
                    endpoint: z.string().url(),
                    p256dh: z.string().min(1),
                    auth: z.string().min(1),
                }),
                response: {
                    200: z.object({ id: z.string() }),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const { endpoint, p256dh, auth } = request.body;
                const result = await push.registerWebPush({ userId, endpoint, p256dh, auth });
                reply.send(result);
            } catch (err: any) {
                request.log.error(err, 'Failed to register web push subscription');
                reply.code(500).send({ error: 'Failed to register push subscription' });
            }
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/notifications/push/subscribe/expo
    // Register an Expo push token for the authenticated user (React Native).
    // Body: { expoPushToken }
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/push/subscribe/expo',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: z.object({
                    expoPushToken: z.string().min(1),
                }),
                response: {
                    200: z.object({ id: z.string() }),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const { expoPushToken } = request.body;
                const result = await push.registerExpoPush({ userId, expoPushToken });
                reply.send(result);
            } catch (err: any) {
                request.log.error(err, 'Failed to register Expo push subscription');
                reply.code(500).send({ error: 'Failed to register Expo push subscription' });
            }
        },
    );

    // -----------------------------------------------------------------------
    // DELETE /v1/notifications/push/unsubscribe
    // Remove a push subscription (web or expo) for the authenticated user.
    // Body: { endpoint }
    // -----------------------------------------------------------------------
    fastify.withTypeProvider<ZodTypeProvider>().delete(
        '/push/unsubscribe',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: z.object({
                    endpoint: z.string().min(1),
                }),
                response: {
                    200: z.object({ ok: z.boolean() }),
                    500: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId: string = (request.user as any).id || (request.user as any).userId;
                const { endpoint } = request.body;
                await push.unregister(userId, endpoint);
                reply.send({ ok: true });
            } catch (err: any) {
                request.log.error(err, 'Failed to unregister push subscription');
                reply.code(500).send({ error: 'Failed to unregister push subscription' });
            }
        },
    );
};
