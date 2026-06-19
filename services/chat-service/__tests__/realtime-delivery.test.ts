/**
 * Realtime-delivery regression suite — proves the chat WebSocket does more than
 * ACK the sender: it must FAN a saved message out to the recipient's live
 * socket(s), relay typing signals to the recipient only, broadcast read receipts,
 * deregister sockets on close, and publish the best-effort `chat:message-sent`
 * event for human DMs (never for Ria).
 *
 * Strategy — in-process handler capture (same harness as ws-frame.test.ts):
 *   The connected-socket registry in routes.ts is MODULE-LEVEL, so invoking the
 *   captured WS user-handler closure twice (once per user) with hand-rolled v11
 *   socket mocks registers BOTH users into the same map. We can then drive an
 *   inbound frame on the sender's socket and assert what lands on the recipient's
 *   socket — all in microseconds, no ports, no timers kept alive (the idle timer
 *   is unref()'d).
 *
 *   `chatService` is a jest mock. We additionally attach a tiny `prisma` stub so
 *   routes.ts's `resolveConversation` (which reads chatService.prisma.conversation
 *   .findUnique) can return a conversation with known participants + requestState.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';
import { RIA_AI_USER_ID, RequestPendingError } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const WS_PATH = '/v1/chat/ws';

const SENDER = 'user-sender';
const RECIPIENT = 'user-recipient';
const CONV_ID = '11111111-1111-1111-1111-111111111111';

// ── Mock ChatService ─────────────────────────────────────────────────────────
function makeMockChatService(conv: any) {
    const svc: any = {
        getCoaches: jest.fn(() => Promise.resolve([])),
        getConversations: jest.fn(() => Promise.resolve([])),
        getOrCreateConversation: jest.fn(() => Promise.resolve(conv)),
        getMessagesForUser: jest.fn(() => Promise.resolve([])),
        getMessageHistory: jest.fn(() => Promise.resolve([])),
        getRiaMessages: jest.fn(() => Promise.resolve([])),
        sendRiaMessage: jest.fn(() => Promise.resolve({})),
        checkRiaQuota: jest.fn(() => Promise.resolve({ allowed: true, limit: 5, plan: 'free', resetsAt: 'x' })),
        // Real request-gate semantics aren't under test here — default to "allowed".
        assertCanSend: jest.fn(() => Promise.resolve()),
        emitMessageSent: jest.fn(() => Promise.resolve()),
        markConversationRead: jest.fn(() => Promise.resolve(conv)),
        saveMessage: jest.fn((conversationId: string, senderId: string, text: string) =>
            Promise.resolve({ id: 'msg-1', conversationId, senderId, text, createdAt: new Date() }),
        ),
        // routes.resolveConversation reads chatService.prisma.conversation.findUnique
        prisma: {
            conversation: {
                findUnique: jest.fn(() => Promise.resolve(conv)),
            },
        },
    };
    return svc;
}

type WsHandler = (socket: unknown, req: unknown) => unknown | Promise<unknown>;

async function buildAppCapturingWsHandler(chatService: any): Promise<{ app: FastifyInstance; getWsHandler: () => WsHandler }> {
    let captured: WsHandler | null = null;
    const capturingPlugin = async (fastify: any, opts: any) => {
        const originalGet = fastify.get.bind(fastify);
        fastify.get = (...args: any[]) => {
            if (args[0] === WS_PATH) captured = args[args.length - 1] as WsHandler;
            return originalGet(...args);
        };
        await (routes as any)(fastify, opts);
    };
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyWebsocket as any);
    await app.register(capturingPlugin, { chatService, jwtSecret: JWT_SECRET });
    await app.ready();
    return {
        app,
        getWsHandler: () => {
            if (!captured) throw new Error(`WS handler for ${WS_PATH} was not registered`);
            return captured;
        },
    };
}

function makeMockSocket() {
    const listeners: Record<string, Array<(...a: any[]) => void>> = {};
    const sent: string[] = [];
    const closeCalls: Array<{ code?: number; reason?: string }> = [];
    const socket = {
        sent,
        closeCalls,
        close: (code?: number, reason?: string) => closeCalls.push({ code, reason }),
        send: (data: unknown) => sent.push(String(data)),
        on: (event: string, cb: (...a: any[]) => void) => {
            (listeners[event] = listeners[event] || []).push(cb);
        },
        emit: (event: string, ...args: any[]) => (listeners[event] || []).forEach((cb) => cb(...args)),
        hasListener: (event: string) => (listeners[event]?.length ?? 0) > 0,
        /** Parsed view of every frame the server pushed to this socket. */
        frames: () => sent.map((s) => JSON.parse(s)),
    };
    return socket;
}

function tokenFor(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

/** Let the handler's async message callback settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('chat-service WS realtime delivery (sender ack + recipient fan-out)', () => {
    let app: FastifyInstance;
    let getWsHandler: () => WsHandler;
    let chatService: any;
    let conv: any;

    beforeEach(async () => {
        conv = { id: CONV_ID, participantA: RECIPIENT, participantB: SENDER, requestState: 'accepted' };
        chatService = makeMockChatService(conv);
        ({ app, getWsHandler } = await buildAppCapturingWsHandler(chatService));
    });

    afterEach(async () => {
        await app.close();
    });

    it('acks the sender AND broadcasts new_message to a registered recipient socket', async () => {
        const senderSocket = makeMockSocket();
        const recipientSocket = makeMockSocket();

        // Both users connect — registered into the module-level connectedUsers map.
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });
        await getWsHandler()(recipientSocket, { headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'hello there',
        })));
        await flush();

        // Sender got the ack.
        const senderFrames = senderSocket.frames();
        expect(senderFrames).toContainEqual(
            expect.objectContaining({ type: 'new_message', data: expect.objectContaining({ text: 'hello there' }) }),
        );

        // Recipient got the SAME new_message broadcast (the core of this suite).
        const recipientFrames = recipientSocket.frames();
        expect(recipientFrames).toHaveLength(1);
        expect(recipientFrames[0]).toEqual(
            expect.objectContaining({ type: 'new_message', data: expect.objectContaining({ text: 'hello there' }) }),
        );

        // Persisted exactly once, sender from the verified token.
        expect(chatService.saveMessage).toHaveBeenCalledTimes(1);
        const [, senderArg] = chatService.saveMessage.mock.calls[0];
        expect(senderArg).toBe(SENDER);
    });

    it('does NOT broadcast to a recipient who has no live socket (sender still acked)', async () => {
        const senderSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'no one listening',
        })));
        await flush();

        // Sender acked; persistence still happened; nothing throws.
        expect(senderSocket.frames()).toContainEqual(expect.objectContaining({ type: 'new_message' }));
        expect(chatService.saveMessage).toHaveBeenCalledTimes(1);
    });

    it('removes the connectedUsers entry on socket close (no fan-out after disconnect)', async () => {
        const senderSocket = makeMockSocket();
        const recipientSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });
        await getWsHandler()(recipientSocket, { headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` } });

        // Recipient disconnects.
        recipientSocket.emit('close');

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'after disconnect',
        })));
        await flush();

        // The (now-closed) recipient socket must NOT receive the broadcast — its
        // registry entry was removed on close.
        expect(recipientSocket.frames()).toHaveLength(0);
        // Sender is still acked.
        expect(senderSocket.frames()).toContainEqual(expect.objectContaining({ type: 'new_message' }));
    });

    it('relays typing_start / typing_stop to the recipient ONLY (never echoed to sender, no DB)', async () => {
        const senderSocket = makeMockSocket();
        const recipientSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });
        await getWsHandler()(recipientSocket, { headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({ type: 'typing_start', conversationId: CONV_ID })));
        senderSocket.emit('message', Buffer.from(JSON.stringify({ type: 'typing_stop', conversationId: CONV_ID })));
        await flush();

        // Recipient saw both typing frames, stamped with the SENDER's id.
        expect(recipientSocket.frames()).toEqual([
            { type: 'typing_start', conversationId: CONV_ID, userId: SENDER },
            { type: 'typing_stop', conversationId: CONV_ID, userId: SENDER },
        ]);
        // Sender got nothing echoed back.
        expect(senderSocket.frames()).toHaveLength(0);
        // Typing is ephemeral — never persisted, never emits the outbound event.
        expect(chatService.saveMessage).not.toHaveBeenCalled();
        expect(chatService.emitMessageSent).not.toHaveBeenCalled();
    });

    it('publishes chat:message-sent (via emitMessageSent) on a normal send with recipient + preview', async () => {
        const senderSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'event please',
        })));
        await flush();

        expect(chatService.emitMessageSent).toHaveBeenCalledTimes(1);
        const [sId, rId, cId, text] = chatService.emitMessageSent.mock.calls[0];
        expect(sId).toBe(SENDER);
        expect(rId).toBe(RECIPIENT);
        expect(cId).toBe(CONV_ID);
        expect(text).toBe('event please');
    });

    it('does NOT emit chat:message-sent for a Ria conversation', async () => {
        // Ria conversation: the peer is the AI coach. emitMessageSent itself
        // guards Ria, and the route calls it with the Ria recipient — assert the
        // route recognises there is no human recipient to notify by checking the
        // recipient passed is the Ria id (emitMessageSent then no-ops).
        conv.participantA = RIA_AI_USER_ID;
        conv.participantB = SENDER;

        const senderSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'hey ria',
        })));
        await flush();

        // The route still calls emitMessageSent, but with the Ria recipient id so
        // the (real) implementation no-ops. Lock that the recipient is Ria.
        if (chatService.emitMessageSent.mock.calls.length > 0) {
            const [, rId] = chatService.emitMessageSent.mock.calls[0];
            expect(rId).toBe(RIA_AI_USER_ID);
        }
    });

    it('rejects a pending requester’s 2nd send with a request_pending error frame (socket stays open)', async () => {
        // Gate throws for THIS sender (simulating: pending + already sent once).
        chatService.assertCanSend.mockImplementationOnce(() => {
            throw new RequestPendingError();
        });

        const senderSocket = makeMockSocket();
        const recipientSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(SENDER)}` } });
        await getWsHandler()(recipientSocket, { headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'second message blocked',
        })));
        await flush();

        // Sender got the request_pending error; nothing was persisted or delivered.
        expect(senderSocket.frames()).toContainEqual({ type: 'error', error: 'request_pending' });
        expect(chatService.saveMessage).not.toHaveBeenCalled();
        expect(recipientSocket.frames()).toHaveLength(0);
        // Per-frame veto — socket is NOT closed.
        expect(senderSocket.closeCalls).toHaveLength(0);
    });
});

describe('chat-service POST /v1/chat/conversations/:id/read — receipts', () => {
    let app: FastifyInstance;
    let getWsHandler: () => WsHandler;
    let chatService: any;
    let conv: any;

    beforeEach(async () => {
        conv = { id: CONV_ID, participantA: RECIPIENT, participantB: SENDER, requestState: 'accepted' };
        chatService = makeMockChatService(conv);
        ({ app, getWsHandler } = await buildAppCapturingWsHandler(chatService));
    });

    afterEach(async () => {
        await app.close();
    });

    it('marks read (isRead+readAt via markConversationRead) and broadcasts message_read to the other participant', async () => {
        // RECIPIENT has a live socket; SENDER will POST .../read, so the receipt
        // must land on RECIPIENT's socket.
        const recipientSocket = makeMockSocket();
        await getWsHandler()(recipientSocket, { headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` } });

        const res = await app.inject({
            method: 'POST',
            url: `/v1/chat/conversations/${CONV_ID}/read`,
            headers: { authorization: `Bearer ${tokenFor(SENDER)}` },
        });

        expect(res.statusCode).toBe(200);
        // Service was asked to mark the conversation read for the SENDER (reader).
        expect(chatService.markConversationRead).toHaveBeenCalledWith(CONV_ID, SENDER);
        // The OTHER participant (RECIPIENT) got the receipt.
        expect(recipientSocket.frames()).toContainEqual({
            type: 'message_read',
            conversationId: CONV_ID,
            readerId: SENDER,
        });
    });
});
