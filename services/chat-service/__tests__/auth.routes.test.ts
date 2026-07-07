/**
 * Regression suite — chat-service REST routes MUST answer 401 (never a fallback
 * identity) on missing, forged, or expired Bearer tokens.
 *
 * Background: the sprint-4 fix (src/routes.ts) replaced a dev-fallback
 * `authenticate` decorator — which silently impersonated a hard-coded
 * `test-user-id` when no/invalid token was present — with a hard gate that
 * returns the canonical 401 body and verifies every token against the real
 * JWT secret. These tests lock that behaviour in permanently: if anyone
 * reintroduces the impersonation/dev-fallback bug, this file goes red.
 *
 * The app under test is the genuine `routes` plugin imported from `../src`,
 * registered on a fresh Fastify instance wired exactly like `src/index.ts`
 * (fastify-type-provider-zod compilers + @fastify/websocket) so the route
 * schemas validate. The ChatService is fully mocked: every method is a
 * jest.fn(), so a passing auth gate is observable (the mock is hit) and a
 * failing one is too (the mock is NEVER hit on a 401).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';

// A secret that satisfies the service's `JWT_SECRET.min(32)` contract.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

// Every method the routes plugin may call. Each is a jest.fn() so we can assert
// it is NEVER invoked when the request is rejected at the auth gate.
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
        // Resolve to an empty array — a benign, JSON-serialisable value that is
        // valid for every consumer (list endpoints, message endpoints, etc.).
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

// Tokens. `expired` is signed with the REAL secret but already past its TTL, so
// it exercises the jwt.verify TokenExpiredError branch (not a signature error).
function validToken(payload: Record<string, unknown> = { userId: 'real-user-1' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}
function expiredToken(payload: Record<string, unknown> = { userId: 'test-user-id' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' });
}
const GARBAGE_TOKEN = 'garbage.forged.token';

// The byte-for-byte 401 body the gate must return. No identity, no token echo.
const CANONICAL_401_BODY = {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'A valid Bearer token is required.',
};

// Every protected REST route. `payload` is supplied where the route has a body
// schema, so that a *valid*-token request reaches the handler instead of being
// rejected by body validation (which would muddy the positive control).
interface RouteCase {
    name: string;
    method: 'GET' | 'POST';
    url: string;
    payload?: Record<string, unknown>;
}
const PROTECTED_ROUTES: RouteCase[] = [
    { name: 'GET /v1/coaches/directory', method: 'GET', url: '/v1/coaches/directory' },
    { name: 'GET /v1/coaches/conversations', method: 'GET', url: '/v1/coaches/conversations' },
    {
        name: 'POST /v1/coaches/conversations',
        method: 'POST',
        url: '/v1/coaches/conversations',
        payload: { targetUserId: 'coach-123' },
    },
    {
        name: 'GET /v1/coaches/conversations/:id/messages',
        method: 'GET',
        url: '/v1/coaches/conversations/11111111-1111-1111-1111-111111111111/messages',
    },
    {
        name: 'POST /v1/coaches/conversations/:id/messages',
        method: 'POST',
        url: '/v1/coaches/conversations/11111111-1111-1111-1111-111111111111/messages',
        payload: { text: 'hello' },
    },
    {
        name: 'GET /v1/chat/:id/history',
        method: 'GET',
        url: '/v1/chat/11111111-1111-1111-1111-111111111111/history',
    },
    { name: 'GET /v1/chat/ria/messages', method: 'GET', url: '/v1/chat/ria/messages' },
    {
        name: 'POST /v1/chat/ria/send',
        method: 'POST',
        url: '/v1/chat/ria/send',
        payload: { message: 'hi ria' },
    },
];

// The unauthenticated scenarios. Each must yield the canonical 401.
const UNAUTH_SCENARIOS: { label: string; authHeader?: string }[] = [
    { label: 'no Authorization header', authHeader: undefined },
    { label: 'forged Bearer token', authHeader: `Bearer ${GARBAGE_TOKEN}` },
    { label: 'expired Bearer token (real secret, past TTL)', authHeader: `Bearer ${expiredToken()}` },
];

describe('chat-service REST auth gate — 401 on missing/forged/expired tokens', () => {
    let app: FastifyInstance;
    let chatService: MockChatService;

    beforeEach(async () => {
        chatService = makeMockChatService();
        app = await buildApp(chatService);
    });

    afterEach(async () => {
        await app.close();
    });

    for (const route of PROTECTED_ROUTES) {
        describe(route.name, () => {
            for (const scenario of UNAUTH_SCENARIOS) {
                it(`returns the canonical 401 with ${scenario.label}`, async () => {
                    const headers: Record<string, string> = {};
                    if (scenario.authHeader) headers.authorization = scenario.authHeader;

                    const res = await app.inject({
                        method: route.method,
                        url: route.url,
                        headers,
                        payload: route.payload,
                    });

                    // Exact status + byte-for-byte canonical body.
                    expect(res.statusCode).toBe(401);
                    expect(res.json()).toEqual(CANONICAL_401_BODY);

                    // The gate must short-circuit BEFORE any service call — no
                    // data is read or written for an unauthenticated request.
                    for (const method of CHAT_SERVICE_METHODS) {
                        expect(chatService[method]).not.toHaveBeenCalled();
                    }

                    // Hard guard against the dev-fallback bug: the response must
                    // never leak / fall back to the impersonated identity.
                    expect(res.body).not.toContain('test-user-id');
                });
            }
        });
    }

    // Positive control: proves the 401s above are AUTH-driven, not a blanket
    // failure (e.g. a misconfigured app that 401s everything regardless).
    describe('positive control — a valid token is NOT rejected', () => {
        for (const route of PROTECTED_ROUTES) {
            it(`${route.name} returns non-401 with a valid token`, async () => {
                const res = await app.inject({
                    method: route.method,
                    url: route.url,
                    headers: { authorization: `Bearer ${validToken()}` },
                    payload: route.payload,
                });

                // The exact 2xx code is the handler's business; the contract we
                // assert is simply that the auth gate let it through.
                expect(res.statusCode).not.toBe(401);
                expect(res.statusCode).toBeLessThan(500);
            });
        }

        it('a valid token actually reaches the mocked ChatService', async () => {
            // GET /v1/coaches/directory -> chatService.getCoaches(). If the gate
            // passes, the mock is hit exactly once; if it (wrongly) blocked the
            // request, the mock would be untouched — distinguishing a real pass
            // from an accidental 200 produced without invoking the service.
            const res = await app.inject({
                method: 'GET',
                url: '/v1/coaches/directory',
                headers: { authorization: `Bearer ${validToken()}` },
            });

            expect(res.statusCode).not.toBe(401);
            expect(chatService.getCoaches).toHaveBeenCalledTimes(1);
        });
    });
});
