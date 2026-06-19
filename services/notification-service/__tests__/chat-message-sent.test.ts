/**
 * chat:message-sent subscriber suite — proves the notification-service chat-push
 * PLUMBING. chat-service publishes a best-effort `chat:message-sent` event for a
 * human-to-human DM (raw string channel, NOT a @nightfuel/types Channels
 * constant); its envelope `userId` is the SENDER and `payload.recipientId` is the
 * person to notify. This suite registers the real `setupEventSubscribers`
 * against an in-memory EventBus, publishes one such event, and asserts the
 * subscriber:
 *   1. creates a (preference-gated) COACH_MESSAGE notification for the RECIPIENT
 *      (never the sender) with a deepLink to /messages/<conversationId>, and
 *   2. invokes PushService.sendToUser(recipientId, …) with the same deepLink —
 *      the push transport itself is mocked (a real APNs/FCM delivery needs an EAS
 *      dev build + credentials, which is user-gated and out of scope here).
 *
 * It also pins the recipient-vs-sender invariant, the malformed-payload guard,
 * and that the additive `pushService` param did not disturb the existing
 * subscribers (a representative PLAN_READY event still flows).
 *
 * Strategy — in-memory EventBus capture: `subscribeDurable` records each handler
 * by stream name; a tiny `publish` helper invokes the matching handler so we
 * drive the exact production code path without Redis. NotificationService and
 * PushService are mocked so no DB / network is touched.
 */
import type { EventBus, StreamSubscribeOptions } from '@nightfuel/events';
import { Channels, type NightFuelEvent } from '@nightfuel/types';
import { setupEventSubscribers } from '../src/events';
import type { NotificationService } from '../src/notification.service';
import type { PushService } from '../src/push.service';

const SENDER = '11111111-1111-1111-1111-111111111111';
const RECIPIENT = '22222222-2222-2222-2222-222222222222';
const CONV_ID = '33333333-3333-3333-3333-333333333333';

/**
 * Minimal in-memory EventBus: `subscribeDurable` stashes each handler under its
 * stream; `emit` looks the handler up and awaits it, reproducing the real
 * dispatch path. `publish`/`subscribe`/`disconnect` are present to satisfy the
 * interface but unused here.
 */
function makeInMemoryBus() {
    const handlers = new Map<string, (event: NightFuelEvent<any>) => Promise<void>>();
    const bus: EventBus = {
        publish: jest.fn(async () => {}),
        subscribe: jest.fn(),
        subscribeDurable: <T>(options: StreamSubscribeOptions<T>) => {
            handlers.set(options.stream, options.handler as any);
        },
        disconnect: jest.fn(async () => {}),
    };
    const emit = async (stream: string, event: NightFuelEvent<any>) => {
        const handler = handlers.get(stream);
        if (!handler) throw new Error(`no subscriber registered for "${stream}"`);
        await handler(event);
    };
    return { bus, handlers, emit };
}

function makeChatEvent(
    overrides: Partial<NightFuelEvent<any>> & { payload?: any } = {},
): NightFuelEvent<any> {
    return {
        eventId: 'evt-abc',
        eventType: 'chat.message-sent',
        producedAt: new Date().toISOString(),
        producerService: 'chat-service',
        correlationId: 'corr-1',
        // The envelope userId is the SENDER — the subscriber must NOT notify it.
        userId: SENDER,
        payload: {
            recipientId: RECIPIENT,
            conversationId: CONV_ID,
            textPreview: 'hey, are you free tonight?',
        },
        ...overrides,
    };
}

describe('notification-service — chat:message-sent subscriber', () => {
    let notificationService: jest.Mocked<Pick<NotificationService, 'createNotificationIfEnabled'>>;
    let pushService: jest.Mocked<Pick<PushService, 'sendToUser'>>;
    let fastify: { io: { to: jest.Mock; emit: jest.Mock } };
    let bus: ReturnType<typeof makeInMemoryBus>;

    beforeEach(() => {
        notificationService = {
            createNotificationIfEnabled: jest.fn().mockResolvedValue({ id: 'notif-1' }),
        } as any;
        // Mock the push transport — sendToUser resolves without hitting Expo/APNs/FCM.
        pushService = {
            sendToUser: jest.fn().mockResolvedValue(undefined),
        } as any;
        const ioEmit = jest.fn();
        fastify = { io: { to: jest.fn(() => ({ emit: ioEmit })), emit: ioEmit } } as any;
        bus = makeInMemoryBus();

        setupEventSubscribers(
            bus.bus,
            notificationService as unknown as NotificationService,
            pushService as unknown as PushService,
            fastify,
        );
    });

    it('registers a durable subscriber for the literal "chat:message-sent" channel', () => {
        expect(bus.handlers.has('chat:message-sent')).toBe(true);
    });

    it('creates a COACH_MESSAGE notification for the RECIPIENT with a deepLink to the conversation', async () => {
        await bus.emit('chat:message-sent', makeChatEvent());

        expect(notificationService.createNotificationIfEnabled).toHaveBeenCalledTimes(1);
        expect(notificationService.createNotificationIfEnabled).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: RECIPIENT, // recipient, NOT the sender
                type: 'COACH_MESSAGE',
                title: 'New message',
                body: 'hey, are you free tonight?',
                data: expect.objectContaining({
                    conversationId: CONV_ID,
                    deepLink: `/messages/${CONV_ID}`,
                    eventId: 'evt-abc',
                }),
            }),
        );
    });

    it('invokes PushService.sendToUser for the recipient with a deepLink to /messages/<conversationId>', async () => {
        await bus.emit('chat:message-sent', makeChatEvent());

        expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
        expect(pushService.sendToUser).toHaveBeenCalledWith(
            RECIPIENT,
            expect.objectContaining({
                title: 'New message',
                body: 'hey, are you free tonight?',
                url: `/messages/${CONV_ID}`,
                data: expect.objectContaining({
                    conversationId: CONV_ID,
                    deepLink: `/messages/${CONV_ID}`,
                }),
            }),
        );
    });

    it('notifies the RECIPIENT, never the SENDER (envelope userId is the sender)', async () => {
        await bus.emit('chat:message-sent', makeChatEvent());

        const notifTarget = notificationService.createNotificationIfEnabled.mock.calls[0][0].userId;
        const pushTarget = pushService.sendToUser.mock.calls[0][0];
        expect(notifTarget).toBe(RECIPIENT);
        expect(pushTarget).toBe(RECIPIENT);
        expect(notifTarget).not.toBe(SENDER);
        expect(pushTarget).not.toBe(SENDER);
    });

    it('broadcasts the persisted notification to the recipient\'s real-time room (parity)', async () => {
        await bus.emit('chat:message-sent', makeChatEvent());
        expect(fastify.io.to).toHaveBeenCalledWith(`user:${RECIPIENT}`);
    });

    it('no-ops on a malformed payload (missing recipientId) — no notification, no push', async () => {
        await bus.emit(
            'chat:message-sent',
            makeChatEvent({ payload: { conversationId: CONV_ID, textPreview: 'x' } }),
        );
        expect(notificationService.createNotificationIfEnabled).not.toHaveBeenCalled();
        expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('no-ops on a malformed payload (missing conversationId) — no notification, no push', async () => {
        await bus.emit(
            'chat:message-sent',
            makeChatEvent({ payload: { recipientId: RECIPIENT, textPreview: 'x' } }),
        );
        expect(notificationService.createNotificationIfEnabled).not.toHaveBeenCalled();
        expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('a push-transport failure propagates so the durable consumer can retry (try/catch re-throws)', async () => {
        pushService.sendToUser.mockRejectedValueOnce(new Error('expo unreachable'));
        await expect(bus.emit('chat:message-sent', makeChatEvent())).rejects.toThrow('expo unreachable');
        // The notification was still created before the push attempt.
        expect(notificationService.createNotificationIfEnabled).toHaveBeenCalledTimes(1);
    });

    it('additive pushService param leaves existing subscribers intact (PLAN_READY still flows)', async () => {
        // A representative existing subscriber must be unaffected by the widened
        // signature — register is proven by the handler existing and firing.
        // (Existing subscribers use the prefixed @nightfuel/types Channels
        // constant — unlike the bare 'chat:message-sent' string.)
        expect(bus.handlers.has(Channels.Plan.PlanGenerated)).toBe(true);
        await bus.emit(Channels.Plan.PlanGenerated, {
            eventId: 'evt-plan',
            eventType: 'plan.generated',
            producedAt: new Date().toISOString(),
            producerService: 'plan-service',
            correlationId: 'corr-2',
            userId: RECIPIENT,
            payload: { planId: 'plan-1', planDate: '2026-06-20T00:00:00.000Z' },
        });
        expect(notificationService.createNotificationIfEnabled).toHaveBeenCalledWith(
            expect.objectContaining({ userId: RECIPIENT, type: 'PLAN_READY' }),
        );
        // Existing subscribers never call the push transport.
        expect(pushService.sendToUser).not.toHaveBeenCalled();
    });
});
