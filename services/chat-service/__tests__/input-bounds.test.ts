/**
 * Regression suite — chat-service READ routes MUST clamp their `limit`
 * querystring. Two history endpoints feed a Prisma `take` directly:
 *
 *   - GET /v1/chat/ria/messages          query.limit -> getRiaMessages(userId, limit)
 *   - GET /v1/chat/:conversationId/history query.limit -> getMessageHistory(id, userId, limit)
 *
 * Before the sprint bounds, the Ria route used `z.coerce.number().default(50)`
 * with NO .int()/.min()/.max(), so a hostile ?limit=99999999 / 0 / -1 / NaN
 * reached the service -> an unbounded `take`; the legacy history route passed
 * NO limit at all (the service default of 50 applied, but the wire value was
 * never bounded/validated). The schema now caps BOTH at
 * `z.coerce.number().int().min(1).max(100).default(50)`.
 *
 * These tests lock the clamp permanently: an out-of-range/non-finite limit is
 * rejected with a clean 4xx (Fastify + fastify-type-provider-zod) BEFORE the
 * handler runs, the service method is NEVER invoked on a rejected request, and
 * the rejection body never echoes a stack frame or the raw rejected value. A
 * valid/boundary/omitted request reaches the service with the clamped limit.
 *
 * The app under test is the genuine `routes` plugin from `../src`, registered
 * on a fresh Fastify wired exactly like src/index.ts (fastify-type-provider-zod
 * compilers + @fastify/websocket) so the Zod querystring schema actually runs.
 * The ChatService is fully mocked; a VALID Bearer token is supplied on every
 * request so the auth gate (covered by auth.routes.test.ts) is never the reason
 * for a rejection here — these assertions isolate the `limit` bounds.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';

// A secret that satisfies the service's `JWT_SECRET.min(32)` contract.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

// The route's documented bounds (src/routes.ts). Kept as named constants so the
// intent of each boundary case below is unambiguous.
const LIMIT_MAX = 100; // limit: z.coerce.number().int().min(1).max(100)
const LIMIT_DEFAULT = 50; // .default(50) when limit is omitted

// A real UUID for the :conversationId param so the params schema is never the
// thing that fails — only the querystring `limit` bound is under test.
const REAL_UUID = '33333333-3333-4333-8333-333333333333';

// Every method the routes plugin may call. Each is a jest.fn(); we assert
// getRiaMessages / getMessageHistory specifically are NOT invoked when the
// querystring is rejected, and ARE invoked with the clamped limit otherwise.
const CHAT_SERVICE_METHODS = [
    'getCoaches',
    'getConversations',
    'getOrCreateConversation',
    'getMessagesForUser',
    'saveMessage',
    'getMessageHistory',
    'getRiaMessages',
    'sendRiaMessage',
] as const;

type MockChatService = Record<(typeof CHAT_SERVICE_METHODS)[number], ReturnType<typeof jest.fn>>;

function makeMockChatService(): MockChatService {
    const svc = {} as MockChatService;
    for (const method of CHAT_SERVICE_METHODS) {
        // Default: resolve an empty array — both history methods return a
        // message list, so a passing request serialises cleanly (2xx). The
        // response shape is not under test, only the status + the clamped arg.
        svc[method] = jest.fn(() => Promise.resolve([] as unknown));
    }
    return svc;
}

/** Build a fresh app wired exactly like src/index.ts, minus the DB/Prisma. */
async function buildApp(chatService: MockChatService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    // @fastify/websocket types conflict with the Zod type provider — cast, as index.ts does.
    await app.register(fastifyWebsocket as any);
    await app.register(routes as any, { chatService, jwtSecret: JWT_SECRET });
    await app.ready();
    return app;
}

// A valid, non-expired token signed with the REAL secret, so the auth gate never
// fires and every rejection below is attributable to the querystring bounds alone.
function validToken(payload: Record<string, unknown> = { userId: 'real-user-1' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const AUTH = () => ({ authorization: `Bearer ${validToken()}` });

/** Inject a GET with a valid token at the given url. */
function get(app: FastifyInstance, url: string) {
    return app.inject({ method: 'GET', url, headers: AUTH() });
}

/**
 * Assert a 4xx rejection body never echoes a stack frame or the raw rejected
 * value. The shared error handler reflects only Fastify+zod's user-facing
 * validation message (a description of the constraint), never the input value
 * or a stack — these negative matches lock that.
 */
function expectNoLeak(body: string, rejectedValue: string) {
    expect(body).not.toContain('stack');
    expect(body).not.toContain('at /'); // stack-frame path fragment
    // The raw rejected querystring value must not be reflected back.
    expect(body).not.toContain(rejectedValue);
}

describe('chat-service input bounds — GET history `limit` clamp (int, 1..100, default 50)', () => {
    let app: FastifyInstance;
    let chatService: MockChatService;

    beforeEach(async () => {
        chatService = makeMockChatService();
        app = await buildApp(chatService);
    });

    afterEach(async () => {
        await app.close();
    });

    // ── GET /v1/chat/ria/messages ────────────────────────────────────────────
    describe('GET /v1/chat/ria/messages', () => {
        it('limit=99999999 (far above max) -> 400, getRiaMessages NOT called, no leak', async () => {
            const res = await get(app, '/v1/chat/ria/messages?limit=99999999');

            expect(res.statusCode).toBe(400);
            expect(chatService.getRiaMessages).not.toHaveBeenCalled();
            expectNoLeak(res.body, '99999999');
        });

        it('limit=0 (below min) -> 400 and getRiaMessages NOT called', async () => {
            const res = await get(app, '/v1/chat/ria/messages?limit=0');

            expect(res.statusCode).toBe(400);
            expect(chatService.getRiaMessages).not.toHaveBeenCalled();
        });

        it('limit=-1 (negative) -> 400 and getRiaMessages NOT called', async () => {
            const res = await get(app, '/v1/chat/ria/messages?limit=-1');

            expect(res.statusCode).toBe(400);
            expect(chatService.getRiaMessages).not.toHaveBeenCalled();
        });

        it('limit=2.5 (non-integer) -> 400 and getRiaMessages NOT called', async () => {
            const res = await get(app, '/v1/chat/ria/messages?limit=2.5');

            expect(res.statusCode).toBe(400);
            expect(chatService.getRiaMessages).not.toHaveBeenCalled();
        });

        it('limit=abc (non-finite / NaN) -> 400 and getRiaMessages NOT called', async () => {
            const res = await get(app, '/v1/chat/ria/messages?limit=abc');

            expect(res.statusCode).toBe(400);
            expect(chatService.getRiaMessages).not.toHaveBeenCalled();
            expectNoLeak(res.body, 'abc');
        });

        it('limit=100 (at the boundary) -> not 400, reaches getRiaMessages with 100', async () => {
            const res = await get(app, `/v1/chat/ria/messages?limit=${LIMIT_MAX}`);

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.getRiaMessages).toHaveBeenCalledTimes(1);
            // Second positional arg is the clamped limit.
            expect(chatService.getRiaMessages).toHaveBeenCalledWith(expect.anything(), LIMIT_MAX);
        });

        it('limit omitted -> not 400, reaches getRiaMessages with the default 50', async () => {
            const res = await get(app, '/v1/chat/ria/messages');

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.getRiaMessages).toHaveBeenCalledTimes(1);
            expect(chatService.getRiaMessages).toHaveBeenCalledWith(expect.anything(), LIMIT_DEFAULT);
        });

        it('limit=1 (lower boundary) -> not 400, reaches getRiaMessages with 1', async () => {
            const res = await get(app, '/v1/chat/ria/messages?limit=1');

            expect(res.statusCode).not.toBe(400);
            expect(chatService.getRiaMessages).toHaveBeenCalledTimes(1);
            expect(chatService.getRiaMessages).toHaveBeenCalledWith(expect.anything(), 1);
        });
    });

    // ── GET /v1/chat/:conversationId/history ─────────────────────────────────
    describe('GET /v1/chat/:conversationId/history', () => {
        const historyUrl = (qs = '') => `/v1/chat/${REAL_UUID}/history${qs}`;

        it('limit=99999999 (far above max) -> 400, getMessageHistory NOT called, no leak', async () => {
            const res = await get(app, historyUrl('?limit=99999999'));

            expect(res.statusCode).toBe(400);
            expect(chatService.getMessageHistory).not.toHaveBeenCalled();
            expectNoLeak(res.body, '99999999');
        });

        it('limit=0 (below min) -> 400 and getMessageHistory NOT called', async () => {
            const res = await get(app, historyUrl('?limit=0'));

            expect(res.statusCode).toBe(400);
            expect(chatService.getMessageHistory).not.toHaveBeenCalled();
        });

        it('limit=-1 (negative) -> 400 and getMessageHistory NOT called', async () => {
            const res = await get(app, historyUrl('?limit=-1'));

            expect(res.statusCode).toBe(400);
            expect(chatService.getMessageHistory).not.toHaveBeenCalled();
        });

        it('limit=abc (non-finite / NaN) -> 400 and getMessageHistory NOT called', async () => {
            const res = await get(app, historyUrl('?limit=abc'));

            expect(res.statusCode).toBe(400);
            expect(chatService.getMessageHistory).not.toHaveBeenCalled();
            expectNoLeak(res.body, 'abc');
        });

        it('limit=100 (at the boundary) -> not 400, reaches getMessageHistory with (uuid, 100)', async () => {
            const res = await get(app, historyUrl(`?limit=${LIMIT_MAX}`));

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.getMessageHistory).toHaveBeenCalledTimes(1);
            // The route now threads the authenticated userId (for the participant
            // gate) between the conversationId and the clamped limit.
            expect(chatService.getMessageHistory).toHaveBeenCalledWith(REAL_UUID, 'real-user-1', LIMIT_MAX);
        });

        it('limit omitted -> not 400, reaches getMessageHistory with the default 50', async () => {
            const res = await get(app, historyUrl());

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.getMessageHistory).toHaveBeenCalledTimes(1);
            // The route now forwards the schema default rather than relying on
            // the service-side default — assert the bounded value reaches it.
            expect(chatService.getMessageHistory).toHaveBeenCalledWith(REAL_UUID, 'real-user-1', LIMIT_DEFAULT);
        });

        it('valid in-range limit=10 -> not 400, reaches getMessageHistory with (uuid, 10)', async () => {
            const res = await get(app, historyUrl('?limit=10'));

            expect(res.statusCode).not.toBe(400);
            expect(chatService.getMessageHistory).toHaveBeenCalledTimes(1);
            expect(chatService.getMessageHistory).toHaveBeenCalledWith(REAL_UUID, 'real-user-1', 10);
        });
    });
});
