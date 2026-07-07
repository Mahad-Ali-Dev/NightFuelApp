/**
 * Conversation access-control regression suite (sprint F18).
 *
 * Locks two confirmed F18 security findings:
 *
 *   FINDING 2 (IDOR, high) — the message READ paths filtered by conversationId
 *     alone, with NO participant check, so any authenticated user could read any
 *     other pair's private DM. getMessagesForUser / getMessageHistory must now
 *     reject a non-participant (and a missing conversation) with
 *     ConversationAccessError. Proven here at the SERVICE layer against a tiny
 *     in-memory Prisma fake.
 *
 *   FINDING 6 (fail-open send, medium) — resolveConversation swallowed every
 *     error and returned null, which made the send handler skip assertCanSend and
 *     persist the message anyway: the request gate failed OPEN under a DB fault.
 *     A lookup FAILURE must now fail CLOSED (reject, never persist). Proven here
 *     at the REST layer with a prisma whose findUnique rejects.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';
import { ChatService, ConversationAccessError } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

// ── FINDING 2 — SERVICE-layer participant gate ──────────────────────────────────
describe('ChatService — read paths enforce conversation membership (IDOR guard)', () => {
    const A = 'participant-a';
    const B = 'participant-b';
    const OUTSIDER = 'user-outsider';
    const CONV_ID = 'conv-1';

    // Minimal prisma fake: just the slice the participant gate + reads touch.
    function makePrisma() {
        const conv = { id: CONV_ID, participantA: A, participantB: B, requestState: 'accepted' };
        return {
            conversation: {
                findUnique: jest.fn(async ({ where }: any) => (where?.id === CONV_ID ? conv : null)),
            },
            message: {
                findMany: jest.fn(async () => [
                    { id: 'm1', senderId: A, text: 'hi', isRead: true, createdAt: new Date() },
                ]),
            },
        } as any;
    }

    function svc() {
        return new ChatService(makePrisma());
    }

    it('getMessagesForUser: a participant is allowed', async () => {
        await expect(svc().getMessagesForUser(CONV_ID, A)).resolves.toHaveLength(1);
        await expect(svc().getMessagesForUser(CONV_ID, B)).resolves.toHaveLength(1);
    });

    it('getMessagesForUser: a NON-participant is rejected with ConversationAccessError', async () => {
        await expect(svc().getMessagesForUser(CONV_ID, OUTSIDER)).rejects.toBeInstanceOf(ConversationAccessError);
    });

    it('getMessageHistory: a participant is allowed, a non-participant is rejected', async () => {
        await expect(svc().getMessageHistory(CONV_ID, A)).resolves.toHaveLength(1);
        await expect(svc().getMessageHistory(CONV_ID, OUTSIDER)).rejects.toBeInstanceOf(ConversationAccessError);
    });

    it('a MISSING conversation is rejected (collapsed into forbidden — no existence oracle)', async () => {
        await expect(svc().getMessagesForUser('does-not-exist', A)).rejects.toBeInstanceOf(ConversationAccessError);
        await expect(svc().getMessageHistory('does-not-exist', A)).rejects.toBeInstanceOf(ConversationAccessError);
    });

    it('the thrown error carries the typed `forbidden` code the route maps to 403', async () => {
        const err = await svc().getMessagesForUser(CONV_ID, OUTSIDER).catch((e) => e);
        expect(err).toBeInstanceOf(ConversationAccessError);
        expect((err as ConversationAccessError).code).toBe('forbidden');
    });
});

// ── FINDING 6 — REST send fails CLOSED on a conversation-lookup failure ──────────
describe('chat-service REST — send fails CLOSED when conversation lookup errors', () => {
    const SENDER = 'user-sender';
    const CONV_ID = '11111111-1111-1111-1111-111111111111';
    let app: FastifyInstance;
    let chatService: any;

    function makeMockChatService(): any {
        return {
            getCoaches: jest.fn(() => Promise.resolve([])),
            getConversations: jest.fn(() => Promise.resolve([])),
            getOrCreateConversation: jest.fn(() => Promise.resolve({})),
            getMessagesForUser: jest.fn(() => Promise.resolve([])),
            getMessageHistory: jest.fn(() => Promise.resolve([])),
            getRiaMessages: jest.fn(() => Promise.resolve([])),
            sendRiaMessage: jest.fn(() => Promise.resolve({})),
            assertCanSend: jest.fn(() => Promise.resolve()),
            emitMessageSent: jest.fn(() => Promise.resolve()),
            saveMessage: jest.fn(() => Promise.resolve({ id: 'm', conversationId: CONV_ID, senderId: SENDER, text: 't' })),
            // The lookup FAILS (transient DB fault). resolveConversation now lets this
            // propagate so the send handler can fail closed.
            prisma: { conversation: { findUnique: jest.fn(() => Promise.reject(new Error('db down'))) } },
        };
    }

    beforeEach(async () => {
        chatService = makeMockChatService();
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

    it('returns 503 and does NOT persist the message (gate cannot be enforced)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/coaches/conversations/${CONV_ID}/messages`,
            headers: { authorization: `Bearer ${jwt.sign({ userId: SENDER }, JWT_SECRET, { expiresIn: '1h' })}` },
            payload: { text: 'should not be saved on a lookup failure' },
        });

        expect(res.statusCode).toBe(503);
        expect(chatService.saveMessage).not.toHaveBeenCalled();
        expect(chatService.assertCanSend).not.toHaveBeenCalled();
    });
});
