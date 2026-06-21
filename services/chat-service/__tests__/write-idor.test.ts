/**
 * Write-IDOR regression suite.
 *
 * Proves the send-path membership gate added to ChatService.assertCanSend: a
 * NON-participant must never be able to persist/deliver a message into someone
 * else's conversation, while the two REAL participants still succeed and the
 * existing request-state / Ria semantics are untouched.
 *
 * Three layers:
 *   1. SERVICE — assertCanSend throws ConversationAccessError for a stranger
 *      (accepted, pending, AND Ria threads) and resolves for real participants.
 *   2. REST send — POST .../messages by a non-participant returns 403
 *      {error:'forbidden'} and does NOT persist; a participant gets 201.
 *   3. WS send — send_message frame from a non-participant yields an
 *      {type:'error',error:'forbidden'} frame, no persist/fan-out, socket open;
 *      a participant's send is acked + persisted.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';
import { ChatService, ConversationAccessError, RIA_AI_USER_ID } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const WS_PATH = '/v1/chat/ws';

const PARTICIPANT_A = 'user-alice';
const PARTICIPANT_B = 'user-bob';
const STRANGER = 'user-mallory';
const CONV_ID = '11111111-1111-1111-1111-111111111111';

// ── SERVICE-level membership gate ──────────────────────────────────────────────
describe('ChatService.assertCanSend — write-IDOR membership gate', () => {
    function svc() {
        // No prisma calls are reached for the accepted/Ria membership-reject paths;
        // a bare {} prisma is enough. (getConversationRequestInfo is only hit on the
        // pending-non-stranger branch, which the stranger never reaches.)
        return new ChatService({} as any);
    }

    it('throws ConversationAccessError for a NON-participant on an ACCEPTED conversation', async () => {
        const conv = { id: CONV_ID, participantA: PARTICIPANT_A, participantB: PARTICIPANT_B, requestState: 'accepted' };
        await expect(svc().assertCanSend(conv, STRANGER)).rejects.toBeInstanceOf(ConversationAccessError);
    });

    it('throws ConversationAccessError for a NON-participant on a PENDING conversation', async () => {
        const conv = { id: CONV_ID, participantA: PARTICIPANT_A, participantB: PARTICIPANT_B, requestState: 'pending' };
        await expect(svc().assertCanSend(conv, STRANGER)).rejects.toBeInstanceOf(ConversationAccessError);
    });

    it('throws ConversationAccessError for a NON-participant on a RIA conversation (no Ria-exemption bypass)', async () => {
        const conv = { id: CONV_ID, participantA: RIA_AI_USER_ID, participantB: PARTICIPANT_A, requestState: 'pending' };
        // STRANGER is not the human owner of this Ria thread -> rejected.
        await expect(svc().assertCanSend(conv, STRANGER)).rejects.toBeInstanceOf(ConversationAccessError);
    });

    it('still ALLOWS both real participants on an accepted conversation', async () => {
        const conv = { id: CONV_ID, participantA: PARTICIPANT_A, participantB: PARTICIPANT_B, requestState: 'accepted' };
        await expect(svc().assertCanSend(conv, PARTICIPANT_A)).resolves.toBeUndefined();
        await expect(svc().assertCanSend(conv, PARTICIPANT_B)).resolves.toBeUndefined();
    });

    it('still ALLOWS the human participant of a Ria thread', async () => {
        const conv = { id: CONV_ID, participantA: RIA_AI_USER_ID, participantB: PARTICIPANT_A, requestState: 'pending' };
        await expect(svc().assertCanSend(conv, PARTICIPANT_A)).resolves.toBeUndefined();
    });
});

// ── Shared mock ChatService for the route layers ───────────────────────────────
// Delegates assertCanSend to the REAL implementation so the membership gate (not a
// stub) decides allow/reject; everything else is a jest mock. A tiny prisma stub
// feeds routes.resolveConversation.
function makeMockChatService(conv: any) {
    const real = new ChatService({} as any);
    return {
        getCoaches: jest.fn(() => Promise.resolve([])),
        getConversations: jest.fn(() => Promise.resolve([])),
        getOrCreateConversation: jest.fn(() => Promise.resolve(conv)),
        getMessagesForUser: jest.fn(() => Promise.resolve([])),
        getMessageHistory: jest.fn(() => Promise.resolve([])),
        getRiaMessages: jest.fn(() => Promise.resolve([])),
        sendRiaMessage: jest.fn(() => Promise.resolve({})),
        checkRiaQuota: jest.fn(() => Promise.resolve({ allowed: true, limit: 5, plan: 'free', resetsAt: 'x' })),
        // REAL gate under test.
        assertCanSend: (c: any, s: string) => real.assertCanSend(c, s),
        emitMessageSent: jest.fn(() => Promise.resolve()),
        markConversationRead: jest.fn(() => Promise.resolve(conv)),
        saveMessage: jest.fn((conversationId: string, senderId: string, text: string) =>
            Promise.resolve({ id: 'msg-1', conversationId, senderId, text, createdAt: new Date() }),
        ),
        prisma: { conversation: { findUnique: jest.fn(() => Promise.resolve(conv)) } },
    } as any;
}

function tokenFor(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

// ── REST send path ─────────────────────────────────────────────────────────────
describe('chat-service REST send — write-IDOR', () => {
    let app: FastifyInstance;
    let chatService: any;
    let conv: any;

    beforeEach(async () => {
        conv = { id: CONV_ID, participantA: PARTICIPANT_A, participantB: PARTICIPANT_B, requestState: 'accepted' };
        chatService = makeMockChatService(conv);
        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        await app.register(fastifyWebsocket as any);
        await app.register(routes as any, { chatService, jwtSecret: JWT_SECRET });
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('rejects a NON-participant with 403 {error:forbidden} and does NOT persist', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/coaches/conversations/${CONV_ID}/messages`,
            headers: { authorization: `Bearer ${tokenFor(STRANGER)}` },
            payload: { text: 'intruding into a stranger thread' },
        });

        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: 'forbidden' });
        expect(chatService.saveMessage).not.toHaveBeenCalled();
        expect(chatService.emitMessageSent).not.toHaveBeenCalled();
    });

    it('still lets a REAL participant send (201, persisted)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/coaches/conversations/${CONV_ID}/messages`,
            headers: { authorization: `Bearer ${tokenFor(PARTICIPANT_A)}` },
            payload: { text: 'legit message' },
        });

        expect(res.statusCode).toBe(201);
        expect(chatService.saveMessage).toHaveBeenCalledTimes(1);
        const [, senderArg] = chatService.saveMessage.mock.calls[0];
        expect(senderArg).toBe(PARTICIPANT_A);
    });
});

// ── WS send path ───────────────────────────────────────────────────────────────
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
    return {
        sent,
        closeCalls,
        close: (code?: number, reason?: string) => closeCalls.push({ code, reason }),
        send: (data: unknown) => sent.push(String(data)),
        on: (event: string, cb: (...a: any[]) => void) => {
            (listeners[event] = listeners[event] || []).push(cb);
        },
        emit: (event: string, ...args: any[]) => (listeners[event] || []).forEach((cb) => cb(...args)),
        frames: () => sent.map((s) => JSON.parse(s)),
    };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('chat-service WS send — write-IDOR', () => {
    let app: FastifyInstance;
    let getWsHandler: () => WsHandler;
    let chatService: any;
    let conv: any;

    beforeEach(async () => {
        conv = { id: CONV_ID, participantA: PARTICIPANT_A, participantB: PARTICIPANT_B, requestState: 'accepted' };
        chatService = makeMockChatService(conv);
        ({ app, getWsHandler } = await buildAppCapturingWsHandler(chatService));
    });

    afterEach(async () => {
        await app.close();
    });

    it('rejects a NON-participant send_message with a forbidden error frame (no persist/fan-out, socket open)', async () => {
        const strangerSocket = makeMockSocket();
        const participantSocket = makeMockSocket();
        // Both connect so we can prove nothing is fanned out to the real participant.
        await getWsHandler()(strangerSocket, { headers: { authorization: `Bearer ${tokenFor(STRANGER)}` } });
        await getWsHandler()(participantSocket, { headers: { authorization: `Bearer ${tokenFor(PARTICIPANT_A)}` } });

        strangerSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'WS intrusion',
        })));
        await flush();

        expect(strangerSocket.frames()).toContainEqual({ type: 'error', error: 'forbidden' });
        expect(chatService.saveMessage).not.toHaveBeenCalled();
        expect(participantSocket.frames()).toHaveLength(0);
        // Per-frame veto — the socket is NOT closed.
        expect(strangerSocket.closeCalls).toHaveLength(0);
    });

    it('still lets a REAL participant send over WS (ack + persist + fan-out to the peer)', async () => {
        const senderSocket = makeMockSocket();
        const peerSocket = makeMockSocket();
        await getWsHandler()(senderSocket, { headers: { authorization: `Bearer ${tokenFor(PARTICIPANT_A)}` } });
        await getWsHandler()(peerSocket, { headers: { authorization: `Bearer ${tokenFor(PARTICIPANT_B)}` } });

        senderSocket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId: CONV_ID,
            text: 'legit ws message',
        })));
        await flush();

        expect(senderSocket.frames()).toContainEqual(
            expect.objectContaining({ type: 'new_message', data: expect.objectContaining({ text: 'legit ws message' }) }),
        );
        expect(peerSocket.frames()).toContainEqual(
            expect.objectContaining({ type: 'new_message', data: expect.objectContaining({ text: 'legit ws message' }) }),
        );
        expect(chatService.saveMessage).toHaveBeenCalledTimes(1);
    });
});
