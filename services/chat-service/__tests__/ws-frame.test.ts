/**
 * Regression suite — the chat WebSocket upgrade (GET /v1/chat/ws) MUST refuse a
 * missing/forged/expired token by closing the socket with code 4401, and MUST
 * NOT close it for a valid token. Unlike the REST `authenticate` decorator, the
 * socket path has no fallback identity at all: the sender of every persisted
 * message is taken from the verified JWT payload, so an unauthenticated socket
 * must never stay open.
 *
 * Test strategy — why we drive the handler directly instead of a live socket:
 *   This suite is the FAST in-process companion to ws-wire.test.ts (which boots
 *   a real Fastify listener and asserts the actual close frame over the wire).
 *   Here we capture the v11 user-handler closure registered by routes.ts and
 *   invoke it with a hand-rolled socket mock. That deterministically exercises
 *   the real jwt.verify gate and its close(4401) decision with no ports, no OS
 *   sockets, and no timers — every branch fires in microseconds.
 *
 *   The mock's shape mirrors the @fastify/websocket v11 contract, which is what
 *   routes.ts is now written against: the handler's FIRST argument IS the raw
 *   WebSocket, NOT a `{ socket }` wrapper. So we pass `socket` directly and the
 *   handler calls `socket.close(...)`, `socket.on(...)`, `socket.send(...)`
 *   straight on it — exactly as it would against a real v11 socket.
 *
 *   The on-the-wire behaviour (a peer actually receiving the 4401 close frame)
 *   is locked separately by ws-wire.test.ts. Together the two files form a
 *   defense in depth: this file proves the auth DECISION; ws-wire.test.ts
 *   proves the v11 TRANSPORT actually delivers it.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import routes from '../src/routes';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const WS_PATH = '/v1/chat/ws';

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
 * Register the real `routes` plugin but intercept its `fastify.get(WS_PATH, ...)`
 * call so we capture the actual WS user-handler closure for direct invocation.
 * Everything else (zod compilers, @fastify/websocket) is wired like src/index.ts
 * so the schemas and plugin context match production.
 */
type WsHandler = (socket: unknown, req: unknown) => unknown | Promise<unknown>;

async function buildAppCapturingWsHandler(
    chatService: MockChatService,
): Promise<{ app: FastifyInstance; getWsHandler: () => WsHandler }> {
    let captured: WsHandler | null = null;

    const capturingPlugin = async (fastify: any, opts: any) => {
        const originalGet = fastify.get.bind(fastify);
        fastify.get = (...args: any[]) => {
            if (args[0] === WS_PATH) {
                // signature used by routes.ts: get(path, { websocket: true }, handler)
                captured = args[args.length - 1] as WsHandler;
            }
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

/**
 * A mock raw WebSocket matching the @fastify/websocket v11 contract: the handler
 * receives this object directly as its first argument (no `{ socket }` wrapper).
 * Records every close() call and lets us drive inbound 'message' frames.
 */
function makeMockSocket() {
    const listeners: Record<string, Array<(...a: any[]) => void>> = {};
    const sent: string[] = [];
    const closeCalls: Array<{ code?: number; reason?: string }> = [];

    const socket = {
        closeCalls,
        sent,
        close: (code?: number, reason?: string) => {
            closeCalls.push({ code, reason });
        },
        send: (data: unknown) => {
            sent.push(String(data));
        },
        on: (event: string, cb: (...a: any[]) => void) => {
            (listeners[event] = listeners[event] || []).push(cb);
        },
        emit: (event: string, ...args: any[]) => {
            (listeners[event] || []).forEach((cb) => cb(...args));
        },
        hasListener: (event: string) => (listeners[event]?.length ?? 0) > 0,
    };

    return socket;
}

function validToken(payload: Record<string, unknown> = { userId: 'real-user-1' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}
function expiredToken(payload: Record<string, unknown> = { userId: 'test-user-id' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' });
}
const GARBAGE_TOKEN = 'garbage.forged.token';

describe('chat-service WebSocket upgrade — closes 4401 on missing/forged/expired tokens', () => {
    let app: FastifyInstance;
    let getWsHandler: () => WsHandler;
    let chatService: MockChatService;

    beforeEach(async () => {
        chatService = makeMockChatService();
        ({ app, getWsHandler } = await buildAppCapturingWsHandler(chatService));
    });

    afterEach(async () => {
        await app.close();
    });

    const badTokenScenarios: { label: string; headers: Record<string, string> }[] = [
        { label: 'no Authorization header', headers: {} },
        { label: 'forged token', headers: { authorization: `Bearer ${GARBAGE_TOKEN}` } },
        { label: 'expired token (real secret, past TTL)', headers: { authorization: `Bearer ${expiredToken()}` } },
    ];

    for (const scenario of badTokenScenarios) {
        it(`closes the socket with code 4401 — ${scenario.label}`, async () => {
            const socket = makeMockSocket();

            await getWsHandler()(socket, { headers: scenario.headers });

            // The authored contract: a single close(4401, 'Unauthorized').
            expect(socket.closeCalls).toHaveLength(1);
            expect(socket.closeCalls[0]).toEqual({ code: 4401, reason: 'Unauthorized' });

            // An unauthenticated upgrade must not wire up the message pump, so no
            // client frame could ever reach the service.
            expect(socket.hasListener('message')).toBe(false);
        });

        it(`never registers a message handler nor calls ChatService — ${scenario.label}`, async () => {
            const socket = makeMockSocket();

            await getWsHandler()(socket, { headers: scenario.headers });

            // Even if a (would-be) client tried to send after a rejected upgrade,
            // there is no listener, so saveMessage can never fire.
            socket.emit('message', Buffer.from(JSON.stringify({
                type: 'send_message',
                conversationId: '11111111-1111-1111-1111-111111111111',
                text: 'should never persist',
            })));

            for (const method of CHAT_SERVICE_METHODS) {
                expect(chatService[method]).not.toHaveBeenCalled();
            }
        });
    }

    it('keeps the socket open (no close) for a valid token', async () => {
        const socket = makeMockSocket();

        await getWsHandler()(socket, {
            headers: { authorization: `Bearer ${validToken()}` },
        });

        // Valid token -> the handler proceeds past the auth gate and wires the
        // message pump instead of closing the socket.
        expect(socket.closeCalls).toHaveLength(0);
        expect(socket.hasListener('message')).toBe(true);
    });

    it('derives the sender from the verified token, not any client-supplied id', async () => {
        // Positive control for the no-fallback guarantee: on a valid socket, a
        // saved message must use the token's userId — never a client value and
        // never the impersonated dev identity.
        const socket = makeMockSocket();
        const conversationId = '11111111-1111-1111-1111-111111111111';

        chatService.saveMessage.mockResolvedValueOnce({
            id: 'msg-1',
            conversationId,
            senderId: 'real-user-1',
            text: 'authentic',
        } as unknown);

        await getWsHandler()(socket, {
            headers: { authorization: `Bearer ${validToken({ userId: 'real-user-1' })}` },
        });

        // Simulate an inbound frame that maliciously tries to spoof senderId.
        socket.emit('message', Buffer.from(JSON.stringify({
            type: 'send_message',
            conversationId,
            text: 'authentic',
            senderId: 'attacker-controlled',
        })));

        // Allow the handler's async message callback to settle.
        await new Promise((resolve) => setImmediate(resolve));

        expect(chatService.saveMessage).toHaveBeenCalledTimes(1);
        const [, senderArg] = chatService.saveMessage.mock.calls[0] as unknown[];
        expect(senderArg).toBe('real-user-1');
        expect(senderArg).not.toBe('attacker-controlled');
        expect(senderArg).not.toBe('test-user-id');
    });
});
