/**
 * Ria daily-AI-quota regression suite.
 *
 * The contract (work-item step 7): on POST /v1/chat/ria/send, BEFORE persisting
 * or calling the AI pipeline, count the user's OWN Ria messages since UTC midnight
 * and resolve their plan. free -> AI_FREE_DAILY (5), pro -> AI_PRO_DAILY (20). At/
 * over the cap reply 429 {error:'ai_quota_exceeded',limit,plan,resetsAt:<next UTC
 * midnight ISO>} and DO NOT persist/call. Plan signal unreachable -> default free.
 *
 * Two layers:
 *   1. SERVICE — ChatService.checkRiaQuota against an in-memory prisma (counts
 *      user messages) with global fetch mocked to control the resolved tier. The
 *      6th free send and the 21st pro send are the boundary cases.
 *   2. REST — the genuine `routes` plugin (mock ChatService): when checkRiaQuota
 *      reports !allowed, the route returns 429 with the exact body and NEVER calls
 *      sendRiaMessage; when allowed, it calls through.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';
import { ChatService, RIA_AI_USER_ID } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const USER = 'user-1';
const RIA_CONV_ID = 'ria-conv-1';

// ── In-memory prisma slice for the quota path ──────────────────────────────────
// ChatService.checkRiaQuota: getRiaConversation -> getOrCreateConversation
// (findUnique/create) then message.count of the user's same-day messages.
function makeFakePrisma(userMessageCount: number) {
    const [a, b] = [USER, RIA_AI_USER_ID].sort();
    const conv = { id: RIA_CONV_ID, participantA: a, participantB: b, requestState: 'accepted', updatedAt: new Date() };
    return {
        conversation: {
            findUnique: jest.fn(async () => conv),
            create: jest.fn(async () => conv),
            update: jest.fn(async () => conv),
        },
        message: {
            // checkRiaQuota counts USER-authored messages since UTC midnight.
            count: jest.fn(async ({ where }: any) => {
                expect(where.senderId).toBe(USER); // user messages only, never Ria's
                return userMessageCount;
            }),
            create: jest.fn(async ({ data }: any) => ({ id: 'm', ...data })),
            findMany: jest.fn(async () => []),
        },
    };
}

/** Mock global fetch so resolvePlan sees a given tier (or a network failure). */
function mockFetchTier(tier: string | null) {
    const fn = jest.fn(async () => {
        if (tier === null) throw new Error('ECONNREFUSED');
        return {
            ok: true,
            json: async () => ({ tier }),
        } as any;
    });
    (global as any).fetch = fn;
    return fn;
}

describe('ChatService.checkRiaQuota — daily caps + UTC reset', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        (global as any).fetch = realFetch;
        delete (process.env as any).JWT_SECRET;
    });

    function service(prisma: any) {
        // checkRiaQuota mints an internal token -> needs a secret present.
        process.env.JWT_SECRET = JWT_SECRET;
        return new ChatService(prisma as any);
    }

    it('FREE: allows the 5th message and BLOCKS the 6th (limit 5, plan free)', async () => {
        mockFetchTier('FREE');

        // 5 already used -> a 6th would be the 6th in the day -> at cap -> blocked.
        const blocked = await service(makeFakePrisma(5)).checkRiaQuota(USER);
        expect(blocked.allowed).toBe(false);
        expect(blocked.limit).toBe(5);
        expect(blocked.plan).toBe('free');

        // 4 already used -> the 5th is still allowed.
        const allowed = await service(makeFakePrisma(4)).checkRiaQuota(USER);
        expect(allowed.allowed).toBe(true);
        expect(allowed.limit).toBe(5);
        expect(allowed.plan).toBe('free');
    });

    it('PRO: limit is 20 (20 used -> blocked; 19 used -> allowed)', async () => {
        mockFetchTier('PRO');

        const blocked = await service(makeFakePrisma(20)).checkRiaQuota(USER);
        expect(blocked.allowed).toBe(false);
        expect(blocked.limit).toBe(20);
        expect(blocked.plan).toBe('pro');

        mockFetchTier('PRO');
        const allowed = await service(makeFakePrisma(19)).checkRiaQuota(USER);
        expect(allowed.allowed).toBe(true);
        expect(allowed.limit).toBe(20);
        expect(allowed.plan).toBe('pro');
    });

    it('plan signal UNREACHABLE -> defaults to free (limit 5)', async () => {
        mockFetchTier(null); // resolvePlan catches and returns 'free'

        const res = await service(makeFakePrisma(5)).checkRiaQuota(USER);
        expect(res.plan).toBe('free');
        expect(res.limit).toBe(5);
        expect(res.allowed).toBe(false);
    });

    it('resetsAt is the NEXT UTC midnight (ISO, 00:00:00.000Z, strictly in the future)', async () => {
        mockFetchTier('FREE');
        const res = await service(makeFakePrisma(0)).checkRiaQuota(USER);

        const resets = new Date(res.resetsAt);
        expect(res.resetsAt).toBe(resets.toISOString());
        // Exactly UTC midnight.
        expect(resets.getUTCHours()).toBe(0);
        expect(resets.getUTCMinutes()).toBe(0);
        expect(resets.getUTCSeconds()).toBe(0);
        expect(resets.getUTCMilliseconds()).toBe(0);
        // Strictly in the future, within the next 24h.
        const now = Date.now();
        expect(resets.getTime()).toBeGreaterThan(now);
        expect(resets.getTime() - now).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
});

// ── REST wiring ────────────────────────────────────────────────────────────────

function makeMockChatService(quota: any) {
    return {
        getCoaches: jest.fn(() => Promise.resolve([])),
        getConversations: jest.fn(() => Promise.resolve([])),
        getOrCreateConversation: jest.fn(() => Promise.resolve({})),
        getMessagesForUser: jest.fn(() => Promise.resolve([])),
        getMessageHistory: jest.fn(() => Promise.resolve([])),
        getRiaMessages: jest.fn(() => Promise.resolve([])),
        checkRiaQuota: jest.fn(() => Promise.resolve(quota)),
        sendRiaMessage: jest.fn(() =>
            Promise.resolve({ conversationId: 'c', reply: 'ok', userMsgId: 'u', aiMsgId: 'a' }),
        ),
        assertCanSend: jest.fn(() => Promise.resolve()),
        emitMessageSent: jest.fn(() => Promise.resolve()),
        saveMessage: jest.fn(() => Promise.resolve({})),
        prisma: { conversation: { findUnique: jest.fn(() => Promise.resolve(null)) } },
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

function sendRia(app: FastifyInstance) {
    return app.inject({
        method: 'POST',
        url: '/v1/chat/ria/send',
        headers: { authorization: `Bearer ${tokenFor(USER)}` },
        payload: { message: 'hey ria' },
    });
}

describe('chat-service REST POST /v1/chat/ria/send — quota enforcement', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('over-cap FREE: returns 429 ai_quota_exceeded {limit:5,plan:free,resetsAt} and does NOT call sendRiaMessage', async () => {
        const resetsAt = new Date(Date.UTC(2099, 0, 2)).toISOString();
        const chatService = makeMockChatService({ allowed: false, limit: 5, plan: 'free', resetsAt });
        app = await buildApp(chatService);

        const res = await sendRia(app);

        expect(res.statusCode).toBe(429);
        expect(res.json()).toEqual({ error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt });
        // The whole point: no persistence, no AI pipeline call.
        expect(chatService.sendRiaMessage).not.toHaveBeenCalled();
    });

    it('over-cap PRO: returns 429 with limit:20, plan:pro', async () => {
        const resetsAt = new Date(Date.UTC(2099, 0, 2)).toISOString();
        const chatService = makeMockChatService({ allowed: false, limit: 20, plan: 'pro', resetsAt });
        app = await buildApp(chatService);

        const res = await sendRia(app);

        expect(res.statusCode).toBe(429);
        expect(res.json()).toEqual({ error: 'ai_quota_exceeded', limit: 20, plan: 'pro', resetsAt });
        expect(chatService.sendRiaMessage).not.toHaveBeenCalled();
    });

    it('under-cap: proceeds to sendRiaMessage (not a 429)', async () => {
        const chatService = makeMockChatService({ allowed: true, limit: 5, plan: 'free', resetsAt: 'x' });
        app = await buildApp(chatService);

        const res = await sendRia(app);

        expect(res.statusCode).not.toBe(429);
        expect(res.statusCode).toBeLessThan(500);
        expect(chatService.checkRiaQuota).toHaveBeenCalledWith(USER);
        expect(chatService.sendRiaMessage).toHaveBeenCalledTimes(1);
    });
});
