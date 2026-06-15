/**
 * Regression suite — POST /v1/chat/ria/send MUST bound the free-text it forwards
 * to the AI pipeline. This is a blast-radius control on the only chat route that
 * relays user-authored content (and an arbitrary `context` object) verbatim to a
 * downstream LLM: an unbounded `message` or `context` would let a single request
 * balloon the prompt sent to the AI pipeline.
 *
 * The route schema (src/routes.ts ~105-132) caps `message` at .max(4000) chars
 * and refines `context` so its JSON.stringify length is <= 16_000. These tests
 * lock both limits permanently: if anyone loosens or removes them, this file
 * goes red.
 *
 * The app under test is the genuine `routes` plugin imported from `../src`,
 * registered on a fresh Fastify instance wired exactly like `src/index.ts`
 * (fastify-type-provider-zod compilers + @fastify/websocket) so the Zod body
 * schema actually validates. The ChatService is fully mocked: sendRiaMessage is
 * a jest.fn(), so we can assert it is NEVER invoked when the body is rejected by
 * schema validation (a 400 before the handler runs) and IS invoked exactly once
 * when a valid, in-bounds body passes. A VALID Bearer token is supplied on every
 * request so the auth gate (covered by auth.routes.test.ts) is never the reason
 * for a rejection here — these assertions isolate the size bounds.
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
const MESSAGE_MAX = 4000; // message: z.string().min(1).max(4000)
const CONTEXT_MAX_BYTES = 16_000; // context refine: JSON.stringify(c).length <= 16_000

// Every method the routes plugin may call. Each is a jest.fn(); we assert
// sendRiaMessage specifically is NOT invoked when the body is rejected.
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
    // sendRiaMessage returns the route's real result shape so a passing request
    // serialises cleanly (the response is not under test, only that it is 2xx).
    svc.sendRiaMessage = jest.fn(() =>
        Promise.resolve({
            conversationId: '11111111-1111-1111-1111-111111111111',
            reply: 'ok',
            userMsgId: 'u1',
            aiMsgId: 'a1',
        })
    );
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
// fires and every rejection below is attributable to the body bounds alone.
function validToken(payload: Record<string, unknown> = { userId: 'real-user-1' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const RIA_SEND_URL = '/v1/chat/ria/send';

/** Inject a POST to /v1/chat/ria/send with a valid token and the given body. */
function sendRia(app: FastifyInstance, body: unknown) {
    return app.inject({
        method: 'POST',
        url: RIA_SEND_URL,
        headers: { authorization: `Bearer ${validToken()}` },
        payload: body as any,
    });
}

// Build a `context` object whose JSON.stringify length deterministically exceeds
// CONTEXT_MAX_BYTES. A single string value padded well past the cap is the
// simplest serialisation that overflows it.
function oversizedContext(): Record<string, unknown> {
    const ctx = { blob: 'x'.repeat(CONTEXT_MAX_BYTES + 1000) };
    // Self-check the fixture so the test fails loudly if the helper ever drifts
    // below the boundary it is meant to cross.
    expect(JSON.stringify(ctx).length).toBeGreaterThan(CONTEXT_MAX_BYTES);
    return ctx;
}

// A context that is safely UNDER the cap, used by the positive control.
function smallContext(): Record<string, unknown> {
    const ctx = { goal: 'lose fat', streak: 5 };
    expect(JSON.stringify(ctx).length).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    return ctx;
}

describe('chat-service POST /v1/chat/ria/send — free-text bounds (message.max(4000), context<=16KB)', () => {
    let app: FastifyInstance;
    let chatService: MockChatService;

    beforeEach(async () => {
        chatService = makeMockChatService();
        app = await buildApp(chatService);
    });

    afterEach(async () => {
        await app.close();
    });

    describe('message length bound', () => {
        it('rejects a 4001-char message with 400 and never calls sendRiaMessage', async () => {
            const res = await sendRia(app, { message: 'a'.repeat(MESSAGE_MAX + 1) });

            expect(res.statusCode).toBe(400);
            expect(chatService.sendRiaMessage).not.toHaveBeenCalled();
        });

        it('accepts a 4000-char message (boundary) — not a 400, reaches sendRiaMessage', async () => {
            const res = await sendRia(app, { message: 'a'.repeat(MESSAGE_MAX) });

            // The exact 2xx code is the handler's business; the contract is that
            // the schema let the boundary value through to the service.
            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.sendRiaMessage).toHaveBeenCalledTimes(1);
        });

        it('rejects an empty message (min(1)) with 400 and never calls sendRiaMessage', async () => {
            const res = await sendRia(app, { message: '' });

            expect(res.statusCode).toBe(400);
            expect(chatService.sendRiaMessage).not.toHaveBeenCalled();
        });
    });

    describe('context size bound', () => {
        it('rejects a context whose JSON exceeds 16KB with 400 and never calls sendRiaMessage', async () => {
            const res = await sendRia(app, { message: 'hi ria', context: oversizedContext() });

            expect(res.statusCode).toBe(400);
            expect(chatService.sendRiaMessage).not.toHaveBeenCalled();
        });
    });

    describe('positive control — a valid, in-bounds body reaches the mock', () => {
        it('accepts a small message + small context and invokes sendRiaMessage once', async () => {
            const message = 'How should I time my meals on a night shift?';
            const context = smallContext();

            const res = await sendRia(app, { message, context });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.sendRiaMessage).toHaveBeenCalledTimes(1);

            // The handler forwards (userId, message, context) — assert the
            // in-bounds payload is passed through verbatim, not mangled.
            const [, passedMessage, passedContext] = chatService.sendRiaMessage.mock.calls[0] as [
                string,
                string,
                Record<string, unknown>,
            ];
            expect(passedMessage).toBe(message);
            expect(passedContext).toEqual(context);
        });

        it('accepts a valid message with NO context (context is optional)', async () => {
            const res = await sendRia(app, { message: 'hello' });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(chatService.sendRiaMessage).toHaveBeenCalledTimes(1);
        });
    });
});
