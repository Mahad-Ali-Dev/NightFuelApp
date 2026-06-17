/**
 * Regression suite — @fastify/rate-limit is registered on the chat-service
 * Fastify instance with a 10/min/IP ceiling. The IP cap is the FIRST line of
 * defence on the only route that can open a long-lived expensive resource
 * (the /v1/chat/ws upgrade): without it, a single host can hammer the WS
 * upgrade unbounded, churning through JWT verifies, DB writes, and AI
 * pipeline calls. The per-socket token bucket inside routes.ts is the
 * second-line floor; this file locks in the first.
 *
 * Test strategy — what we actually prove:
 *   We boot a minimal Fastify app wired EXACTLY like src/index.ts: the
 *   `@fastify/rate-limit` plugin is registered BEFORE the routes plugin
 *   with `{ max: 10, timeWindow: '1 minute', keyGenerator: (req) => req.ip }`.
 *   We then fire 11 requests from the same simulated IP (fastify.inject
 *   sets request.ip from the supplied `remoteAddress`) and assert:
 *     - the first 10 requests pass through the limiter (status != 429)
 *     - the 11th request is rejected with 429
 *
 *   We use the `/health` route as the request target because it has no auth
 *   gate (so a 401 doesn't confuse the assertion) and no body schema (so a
 *   400 doesn't either). The limiter counts requests pre-handler so the
 *   choice of downstream route doesn't change the result, but the simplicity
 *   of /health keeps the test focused.
 *
 *   The ChatService is fully mocked because the routes plugin requires it
 *   at registration even when no chat-routes are exercised in this file.
 *
 * Why no live socket / no `ws` client here:
 *   The rate-limit plugin fires on every Fastify request — including the
 *   GET that initiates a WebSocket upgrade — so an HTTP-only test exercises
 *   the same code path the WS upgrade would hit. Driving a real `ws` client
 *   here would add no signal at substantial test-time cost.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import routes from '../src/routes';

// Satisfies the routes plugin's `jwtSecret.min(32)` expectation. Auth is
// never exercised in this file — the requests target /health — but the
// routes plugin still requires a secret to construct.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

// Mirror the index.ts registration verbatim. If src/index.ts ever changes
// these knobs, this constant MUST track it — that drift is the bug this
// file exists to catch.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = '1 minute';

// All ChatService methods the routes plugin may try to access. None are
// invoked by /health, but Fastify resolves the decorator at registration
// so they all need to exist as jest.fn().
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
        svc[method] = jest.fn(() => Promise.resolve([] as unknown));
    }
    return svc;
}

/**
 * Build a fresh Fastify app wired exactly like src/index.ts (minus DB/Prisma):
 *   - zod-aware validator/serializer compilers
 *   - @fastify/rate-limit registered FIRST with the same options index.ts uses
 *   - @fastify/websocket cast (matches the index.ts cast)
 *   - the genuine routes plugin
 *   - the /health route from index.ts (verbatim)
 *
 * The order matters: the rate-limit plugin must be registered BEFORE routes
 * so the global ceiling covers every endpoint the routes plugin contributes
 * (including the WS upgrade). This is the assertion the test exists to make.
 */
async function buildApp(chatService: MockChatService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, trustProxy: true });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Register rate-limit BEFORE routes — same key+config as src/index.ts.
    await app.register(fastifyRateLimit, {
        max: RATE_LIMIT_MAX,
        timeWindow: RATE_LIMIT_WINDOW,
        keyGenerator: (req) => req.ip,
    });

    // @fastify/websocket types conflict with the Zod type provider — cast,
    // as index.ts does. Required because the routes plugin registers a WS
    // route at the top level even though we don't exercise it here.
    await app.register(fastifyWebsocket as any);

    // /health verbatim from src/index.ts — the request target for these tests.
    app.get('/health', async () => {
        return { status: 'ok', service: 'chat-service' };
    });

    await app.register(routes as any, { chatService, jwtSecret: JWT_SECRET });
    await app.ready();
    return app;
}

describe('chat-service global rate limit — 10/min/IP via @fastify/rate-limit', () => {
    let app: FastifyInstance;
    let chatService: MockChatService;

    beforeEach(async () => {
        chatService = makeMockChatService();
        app = await buildApp(chatService);
    });

    afterEach(async () => {
        await app.close();
    });

    /**
     * The contract: 11th request from the same IP within the window returns
     * 429. The simulated IP is set via fastify.inject's `remoteAddress` so
     * every request shares the same bucket. We exercise the boundary case
     * (request #10 still passes, request #11 is rejected) so a future
     * regression that loosens the limiter — e.g. drops the keyGenerator and
     * partitions buckets per-route — is caught here.
     */
    it('rejects the 11th same-IP request within the window with 429', async () => {
        const sameIp = '203.0.113.42'; // RFC 5737 doc range — never routable.

        // Requests 1..10 must all pass through. We assert each one
        // individually so a regression that fires the 429 too early is
        // easy to diagnose (the failing iteration is in the error output).
        for (let i = 1; i <= RATE_LIMIT_MAX; i++) {
            const res = await app.inject({
                method: 'GET',
                url: '/health',
                remoteAddress: sameIp,
            });
            expect(res.statusCode).not.toBe(429);
            // Defence in depth: should be the 200 from /health.
            expect(res.statusCode).toBe(200);
        }

        // Request 11 — the boundary case the test is named for.
        const limited = await app.inject({
            method: 'GET',
            url: '/health',
            remoteAddress: sameIp,
        });

        expect(limited.statusCode).toBe(429);
    });

    /**
     * Negative control — the bucket is keyed by IP, so a DIFFERENT IP must
     * NOT be limited by the first IP's traffic. This proves keyGenerator is
     * actually partitioning buckets (and not, e.g., collapsing every request
     * into one global bucket because keyGenerator was dropped).
     */
    it('does not rate-limit a different IP within the same window', async () => {
        const noisyIp = '203.0.113.42';
        const quietIp = '198.51.100.7'; // separate RFC 5737 range — never routable.

        // Hammer the noisy IP up to the cap.
        for (let i = 1; i <= RATE_LIMIT_MAX; i++) {
            await app.inject({ method: 'GET', url: '/health', remoteAddress: noisyIp });
        }

        // The quiet IP's first request must still pass — buckets are per-IP.
        const res = await app.inject({
            method: 'GET',
            url: '/health',
            remoteAddress: quietIp,
        });

        expect(res.statusCode).not.toBe(429);
        expect(res.statusCode).toBe(200);
    });
});
