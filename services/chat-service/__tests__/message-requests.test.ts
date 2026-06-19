/**
 * Message-requests regression suite (Instagram-DM style).
 *
 * Two layers:
 *   1. SERVICE logic — ChatService is exercised against a tiny in-memory Prisma
 *      fake (no real DB; CI has none). This proves the actual gate semantics:
 *      a pending requester may send EXACTLY ONE message; a 2nd send throws
 *      RequestPendingError; the recipient (non-requester) may accept -> 'accepted'
 *      (unblocks) or decline -> 'declined'; only the recipient may act; GET
 *      requests returns only INCOMING pending; Ria threads are never gated.
 *   2. REST wiring — the genuine `routes` plugin (mock ChatService) proves the
 *      send handler maps RequestPendingError to HTTP 409 {error:'request_pending'}
 *      and that the accept/decline/list endpoints are wired to the service.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';
import { ChatService, RequestPendingError, RIA_AI_USER_ID } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

// ── In-memory Prisma fake ──────────────────────────────────────────────────────
// Implements just the slice ChatService's request-gate paths touch:
//   conversation.findUnique / update, message.findFirst / findMany / create.
function makeFakePrisma(seed?: { conversations?: any[]; messages?: any[] }) {
    const conversations: any[] = seed?.conversations ? [...seed.conversations] : [];
    const messages: any[] = seed?.messages ? [...seed.messages] : [];
    let seq = messages.length;

    const matchWhere = (row: any, where: any): boolean => {
        if (!where) return true;
        if (where.id && row.id !== where.id) return false;
        if (where.requestState && row.requestState !== where.requestState) return false;
        if (where.conversationId && row.conversationId !== where.conversationId) return false;
        if (where.OR) {
            const ok = where.OR.some((clause: any) => matchWhere(row, clause));
            if (!ok) return false;
        }
        if (where.participantA && row.participantA !== where.participantA) return false;
        if (where.participantB && row.participantB !== where.participantB) return false;
        return true;
    };

    const order = (rows: any[], orderBy: any): any[] => {
        if (!orderBy) return rows;
        const [field, dir] = Array.isArray(orderBy)
            ? [Object.keys(orderBy[0])[0], Object.values(orderBy[0])[0]]
            : [Object.keys(orderBy)[0], Object.values(orderBy)[0]];
        const sorted = [...rows].sort((a, b) => {
            const av = a[field] instanceof Date ? a[field].getTime() : a[field];
            const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
            return av < bv ? -1 : av > bv ? 1 : 0;
        });
        return dir === 'desc' ? sorted.reverse() : sorted;
    };

    return {
        _conversations: conversations,
        _messages: messages,
        conversation: {
            findUnique: jest.fn(async ({ where }: any) => conversations.find((c) => matchWhere(c, where)) ?? null),
            findMany: jest.fn(async ({ where, include, orderBy }: any) => {
                let rows = conversations.filter((c) => matchWhere(c, where));
                rows = order(rows, orderBy);
                if (include?.messages) {
                    rows = rows.map((c) => {
                        let msgs = messages.filter((m) => m.conversationId === c.id);
                        msgs = order(msgs, include.messages.orderBy);
                        if (include.messages.take) msgs = msgs.slice(0, include.messages.take);
                        return { ...c, messages: msgs };
                    });
                }
                return rows;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const c = conversations.find((x) => matchWhere(x, where));
                if (!c) throw new Error('not found');
                Object.assign(c, data);
                return c;
            }),
            create: jest.fn(async ({ data }: any) => {
                const c = { id: `conv-${conversations.length + 1}`, requestState: 'pending', updatedAt: new Date(), ...data };
                conversations.push(c);
                return c;
            }),
        },
        message: {
            findFirst: jest.fn(async ({ where, orderBy }: any) => {
                let rows = messages.filter((m) => matchWhere(m, where));
                rows = order(rows, orderBy);
                return rows[0] ?? null;
            }),
            findMany: jest.fn(async ({ where, orderBy, take }: any) => {
                let rows = messages.filter((m) => matchWhere(m, where));
                rows = order(rows, orderBy);
                if (take) rows = rows.slice(0, take);
                return rows;
            }),
            create: jest.fn(async ({ data }: any) => {
                const m = { id: `msg-${++seq}`, isRead: false, readAt: null, createdAt: new Date(Date.now() + seq), ...data };
                messages.push(m);
                return m;
            }),
            count: jest.fn(async ({ where }: any) => messages.filter((m) => matchWhere(m, where)).length),
            updateMany: jest.fn(async () => ({ count: 0 })),
        },
    };
}

describe('ChatService — message-request gate semantics (in-memory prisma)', () => {
    const REQUESTER = 'user-requester';
    const RECIPIENT = 'user-recipient';
    const CONV_ID = 'conv-1';

    function service(prisma: any) {
        return new ChatService(prisma as any);
    }

    it('allows the requester’s FIRST message, blocks the SECOND while pending', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [],
        });
        const svc = service(prisma);
        const conv = await prisma.conversation.findUnique({ where: { id: CONV_ID } });

        // No messages yet -> first send is the request itself -> allowed.
        await expect(svc.assertCanSend(conv, REQUESTER)).resolves.toBeUndefined();

        // Persist that first message.
        await svc.saveMessage(CONV_ID, REQUESTER, 'hi, can we chat?');

        // Now a SECOND send by the same requester (still pending) must throw.
        await expect(svc.assertCanSend(conv, REQUESTER)).rejects.toBeInstanceOf(RequestPendingError);
    });

    it('never blocks the RECIPIENT from replying while pending', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [{ id: 'm1', conversationId: CONV_ID, senderId: REQUESTER, text: 'hi', createdAt: new Date(1) }],
        });
        const svc = service(prisma);
        const conv = await prisma.conversation.findUnique({ where: { id: CONV_ID } });

        // The recipient is not the requester -> their reply is allowed (it accepts).
        await expect(svc.assertCanSend(conv, RECIPIENT)).resolves.toBeUndefined();
    });

    it('accept() flips to accepted and UNBLOCKS the requester’s further sends', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [{ id: 'm1', conversationId: CONV_ID, senderId: REQUESTER, text: 'hi', createdAt: new Date(1) }],
        });
        const svc = service(prisma);

        const updated = await svc.acceptRequest(CONV_ID, RECIPIENT);
        expect(updated.requestState).toBe('accepted');

        // Re-read and assert the requester is no longer gated.
        const conv = await prisma.conversation.findUnique({ where: { id: CONV_ID } });
        await expect(svc.assertCanSend(conv, REQUESTER)).resolves.toBeUndefined();
    });

    it('decline() sets declined', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [{ id: 'm1', conversationId: CONV_ID, senderId: REQUESTER, text: 'hi', createdAt: new Date(1) }],
        });
        const svc = service(prisma);

        const updated = await svc.declineRequest(CONV_ID, RECIPIENT);
        expect(updated.requestState).toBe('declined');
    });

    it('only the NON-requester may accept/decline (requester acting is Forbidden)', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [{ id: 'm1', conversationId: CONV_ID, senderId: REQUESTER, text: 'hi', createdAt: new Date(1) }],
        });
        const svc = service(prisma);

        await expect(svc.acceptRequest(CONV_ID, REQUESTER)).rejects.toThrow('Forbidden');
        await expect(svc.declineRequest(CONV_ID, REQUESTER)).rejects.toThrow('Forbidden');
    });

    it('getIncomingRequests returns only INCOMING pending (recipient side, not requester)', async () => {
        const prisma = makeFakePrisma({
            conversations: [
                // Incoming: someone requested RECIPIENT.
                { id: 'c-in', participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date(2) },
                // Outgoing: RECIPIENT requested someone else -> NOT incoming for RECIPIENT.
                { id: 'c-out', participantA: RECIPIENT, participantB: 'other-user', requestState: 'pending', updatedAt: new Date(3) },
                // Already accepted -> not a request anymore.
                { id: 'c-acc', participantA: RECIPIENT, participantB: 'friend', requestState: 'accepted', updatedAt: new Date(4) },
            ],
            messages: [
                { id: 'm-in', conversationId: 'c-in', senderId: REQUESTER, text: 'hi recipient', createdAt: new Date(1) },
                { id: 'm-out', conversationId: 'c-out', senderId: RECIPIENT, text: 'i requested them', createdAt: new Date(1) },
                { id: 'm-acc', conversationId: 'c-acc', senderId: 'friend', text: 'old', createdAt: new Date(1) },
            ],
        });
        const svc = service(prisma);

        const incoming = await svc.getIncomingRequests(RECIPIENT);
        expect(incoming).toHaveLength(1);
        expect(incoming[0].id).toBe('c-in');
        expect(incoming[0].requestState).toBe('pending');
        expect(incoming[0].peer.userId).toBe(REQUESTER);
    });

    it('never gates a Ria conversation (assertCanSend resolves regardless of state/messages)', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RIA_AI_USER_ID, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [{ id: 'm1', conversationId: CONV_ID, senderId: REQUESTER, text: 'hi ria', createdAt: new Date(1) }],
        });
        const svc = service(prisma);
        const conv = await prisma.conversation.findUnique({ where: { id: CONV_ID } });

        // Even though it's pending + the requester already sent, Ria is exempt.
        await expect(svc.assertCanSend(conv, REQUESTER)).resolves.toBeUndefined();
    });

    it('getConversations includes requestState + peer{userId,displayName,avatarUrl}', async () => {
        const prisma = makeFakePrisma({
            conversations: [{ id: CONV_ID, participantA: RECIPIENT, participantB: REQUESTER, requestState: 'pending', updatedAt: new Date() }],
            messages: [{ id: 'm1', conversationId: CONV_ID, senderId: REQUESTER, text: 'hi', createdAt: new Date(1) }],
        });
        const svc = service(prisma);

        // user-service is unreachable in CI -> peer falls back to the generic
        // member shape but ALWAYS includes the peer userId + requestState.
        const list = await svc.getConversations(RECIPIENT);
        expect(list).toHaveLength(1);
        expect(list[0].requestState).toBe('pending');
        expect(list[0].peer).toEqual({ userId: REQUESTER, displayName: 'Zeitra Member', avatarUrl: null });
    });
});

// ── REST wiring ────────────────────────────────────────────────────────────────

function makeMockChatService(conv: any) {
    return {
        getCoaches: jest.fn(() => Promise.resolve([])),
        getConversations: jest.fn(() => Promise.resolve([])),
        getOrCreateConversation: jest.fn(() => Promise.resolve(conv)),
        getMessagesForUser: jest.fn(() => Promise.resolve([])),
        getMessageHistory: jest.fn(() => Promise.resolve([])),
        getRiaMessages: jest.fn(() => Promise.resolve([])),
        sendRiaMessage: jest.fn(() => Promise.resolve({})),
        checkRiaQuota: jest.fn(() => Promise.resolve({ allowed: true, limit: 5, plan: 'free', resetsAt: 'x' })),
        assertCanSend: jest.fn(() => Promise.resolve()),
        emitMessageSent: jest.fn(() => Promise.resolve()),
        saveMessage: jest.fn(() => Promise.resolve({ id: 'm', conversationId: conv.id, senderId: 'x', text: 't' })),
        getIncomingRequests: jest.fn(() => Promise.resolve([{ id: conv.id, requestState: 'pending', peer: { userId: 'r', displayName: 'Zeitra Member', avatarUrl: null }, lastMessage: 'hi', lastMessageAt: 'x' }])),
        acceptRequest: jest.fn(() => Promise.resolve({ id: conv.id, requestState: 'accepted' })),
        declineRequest: jest.fn(() => Promise.resolve({ id: conv.id, requestState: 'declined' })),
        prisma: { conversation: { findUnique: jest.fn(() => Promise.resolve(conv)) } },
    } as any;
}

async function buildApp(chatService: any): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyWebsocket as any);
    await app.register(routes as any, { chatService, jwtSecret: JWT_SECRET });
    await app.ready();
    return app;
}

function tokenFor(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('chat-service REST — message-request endpoints', () => {
    const SENDER = 'user-sender';
    const RECIPIENT = 'user-recipient';
    const CONV_ID = '11111111-1111-1111-1111-111111111111';
    let app: FastifyInstance;
    let chatService: any;
    let conv: any;

    beforeEach(async () => {
        conv = { id: CONV_ID, participantA: RECIPIENT, participantB: SENDER, requestState: 'pending' };
        chatService = makeMockChatService(conv);
        app = await buildApp(chatService);
    });

    afterEach(async () => {
        await app.close();
    });

    it('REST send returns 409 {error:request_pending} when the gate throws (and does NOT persist)', async () => {
        chatService.assertCanSend.mockImplementationOnce(() => {
            throw new RequestPendingError();
        });

        const res = await app.inject({
            method: 'POST',
            url: `/v1/coaches/conversations/${CONV_ID}/messages`,
            headers: { authorization: `Bearer ${tokenFor(SENDER)}` },
            payload: { text: 'blocked second message' },
        });

        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({ error: 'request_pending' });
        expect(chatService.saveMessage).not.toHaveBeenCalled();
    });

    it('REST send succeeds (201) when the gate allows the message', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/coaches/conversations/${CONV_ID}/messages`,
            headers: { authorization: `Bearer ${tokenFor(SENDER)}` },
            payload: { text: 'first message ok' },
        });

        expect(res.statusCode).toBe(201);
        expect(chatService.saveMessage).toHaveBeenCalledTimes(1);
    });

    it('GET /v1/chat/requests returns the incoming pending list', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/chat/requests',
            headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` },
        });

        expect(res.statusCode).toBe(200);
        expect(chatService.getIncomingRequests).toHaveBeenCalledWith(RECIPIENT);
        const body = res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].requestState).toBe('pending');
    });

    it('POST /v1/chat/requests/:id/accept flips to accepted', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/chat/requests/${CONV_ID}/accept`,
            headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` },
        });

        expect(res.statusCode).toBe(200);
        expect(chatService.acceptRequest).toHaveBeenCalledWith(CONV_ID, RECIPIENT);
        expect(res.json().data.requestState).toBe('accepted');
    });

    it('POST /v1/chat/requests/:id/decline sets declined', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/chat/requests/${CONV_ID}/decline`,
            headers: { authorization: `Bearer ${tokenFor(RECIPIENT)}` },
        });

        expect(res.statusCode).toBe(200);
        expect(chatService.declineRequest).toHaveBeenCalledWith(CONV_ID, RECIPIENT);
        expect(res.json().data.requestState).toBe('declined');
    });
});
