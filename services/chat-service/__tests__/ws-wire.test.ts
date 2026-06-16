/**
 * Wire-level regression suite — boots a REAL Fastify listener on an ephemeral
 * port (`{ port: 0 }`), connects with a real `ws` client, and asserts that the
 * actual close frame delivered on the wire carries code 4401 when the upgrade
 * lacks/forges a Bearer token, and that a valid token leaves the socket OPEN.
 *
 * Why this exists IN ADDITION TO ws-frame.test.ts:
 *   ws-frame.test.ts invokes the user-handler closure with a hand-rolled mock.
 *   That mock satisfies the v11 signature the handler expects today — but a
 *   future API-shape regression (e.g. wrapping the socket back in `{ socket }`,
 *   or routing close() through a method that doesn't actually emit a close
 *   frame) could silently pass the in-process suite while breaking the wire.
 *   This file is the gold-standard regression net: if any change makes the
 *   server NOT emit a 4401 close on an unauthenticated upgrade, the live
 *   client will hang waiting and the test will time out (red).
 *
 *   We mirror src/index.ts's bootstrap exactly (Zod compilers, @fastify/websocket
 *   registration, the real `routes` plugin) but skip Prisma and the env-schema
 *   load — the ChatService is a jest mock and the JWT secret is hard-coded.
 *
 * Why `ws` is OK to use:
 *   `ws` ships with @fastify/websocket as a non-optional dependency, so it is
 *   already installed in node_modules under the chat-service tree (transitive).
 *   This file is test-only, so no runtime dep is added.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import routes from '../src/routes';

// A secret that satisfies the service's `JWT_SECRET.min(32)` contract.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const WS_PATH = '/v1/chat/ws';

// Bound the live-socket waits — each `close`/`open` event should arrive in tens
// of milliseconds on localhost, so 2s is generous and keeps a regression visible.
const SOCKET_EVENT_TIMEOUT_MS = 2000;

// Every method the routes plugin may call. None of these should fire during a
// rejected upgrade. We don't strictly need a fully populated mock for the wire
// tests, but matching the auth.routes / ria-bounds shape keeps the bootstrap
// identical and the diff between test files reviewable.
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
 * Build a fresh Fastify app wired exactly like `src/index.ts` (minus DB/Prisma)
 * and start it listening on an ephemeral port. Returns the actual `ws://` URL
 * the test should connect to plus an `app` handle for graceful teardown.
 */
async function startLiveApp(chatService: MockChatService): Promise<{ app: FastifyInstance; wsUrl: string }> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyWebsocket as any);
    await app.register(routes as any, { chatService, jwtSecret: JWT_SECRET });

    // `{ port: 0 }` asks the OS for any free port — robust under parallel jest workers.
    // host '127.0.0.1' keeps the listener loopback-only so we don't surprise anything
    // on the host network.
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') {
        throw new Error('Fastify did not bind a TCP port (got string/null address)');
    }
    return { app, wsUrl: `ws://127.0.0.1:${addr.port}${WS_PATH}` };
}

function validToken(payload: Record<string, unknown> = { userId: 'real-user-1' }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}
const GARBAGE_TOKEN = 'garbage.forged.token';

/**
 * Resolve once the live `ws` client receives a `close` event. Captures the close
 * code so callers can assert it. Rejects on the `error` path or after the
 * SOCKET_EVENT_TIMEOUT_MS budget — both indicate a wire-level regression.
 */
function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(`Timed out waiting ${SOCKET_EVENT_TIMEOUT_MS}ms for close event`));
        }, SOCKET_EVENT_TIMEOUT_MS);

        ws.once('close', (code: number, reason: Buffer) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ code, reason: reason?.toString?.() ?? '' });
        });
        ws.once('error', (err) => {
            // A connection refused / handshake failure is a different bug than a
            // 4401 close, so surface it loudly rather than swallow.
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

/** Resolve once the live `ws` client emits `open`, reject on close/error/timeout. */
function waitForOpen(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
        // Single-shot guard so leftover close/error listeners (after `open`
        // resolves) don't try to re-reject an already-settled promise.
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(`Timed out waiting ${SOCKET_EVENT_TIMEOUT_MS}ms for open event`));
        }, SOCKET_EVENT_TIMEOUT_MS);

        const cleanup = () => clearTimeout(timer);
        ws.once('open', () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        });
        ws.once('close', (code: number) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`Socket closed (code=${code}) before open fired`));
        });
        ws.once('error', (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        });
    });
}

describe('chat-service WS upgrade — on-the-wire close frame (real socket / ephemeral port)', () => {
    let app: FastifyInstance;
    let wsUrl: string;
    let chatService: MockChatService;

    beforeEach(async () => {
        chatService = makeMockChatService();
        ({ app, wsUrl } = await startLiveApp(chatService));
    });

    afterEach(async () => {
        await app.close();
    });

    it('closes with code 4401 when no Authorization header is supplied', async () => {
        // No `headers` -> the server sees no Bearer token. Per the auth contract
        // the upgrade must close 4401 before any frames are pumped.
        const ws = new WebSocket(wsUrl);

        const { code } = await waitForClose(ws);

        expect(code).toBe(4401);
        // Defense in depth: the rejected upgrade must NOT have reached any
        // ChatService method (no fallback identity, no persisted message).
        for (const method of CHAT_SERVICE_METHODS) {
            expect(chatService[method]).not.toHaveBeenCalled();
        }
    });

    it('closes with code 4401 when a forged Bearer token is supplied', async () => {
        // The `ws` client lets us inject the Authorization header on the upgrade
        // request. A garbage value fails jwt.verify -> close 4401.
        const ws = new WebSocket(wsUrl, {
            headers: { authorization: `Bearer ${GARBAGE_TOKEN}` },
        });

        const { code } = await waitForClose(ws);

        expect(code).toBe(4401);
        for (const method of CHAT_SERVICE_METHODS) {
            expect(chatService[method]).not.toHaveBeenCalled();
        }
    });

    it('opens (no server-side close) when a valid signed token is supplied', async () => {
        // A real, non-expired token signed with the same secret -> the upgrade
        // proceeds, `open` fires, and the server does NOT close us afterwards.
        const ws = new WebSocket(wsUrl, {
            headers: { authorization: `Bearer ${validToken()}` },
        });

        // Record the close event whenever it eventually fires (server-side OR
        // client-side). At `open` time it must still be null; after we call
        // ws.close() from the client, the code must NOT be 4401 (the server
        // contract is "don't close the auth gate on a valid token").
        let closeEvent: { code: number; reason: string } | null = null;
        const closePromise = new Promise<void>((resolve) => {
            ws.once('close', (code: number, reason: Buffer) => {
                closeEvent = { code, reason: reason?.toString?.() ?? '' };
                resolve();
            });
        });

        await waitForOpen(ws);

        // At the moment `open` fires the server must NOT have already pushed
        // a close frame. If it had, this would be set.
        expect(closeEvent).toBeNull();

        // Close from the client side. The eventual close code MUST NOT be 4401
        // — if it were, the server had buffered an auth-reject close that just
        // hadn't arrived at the moment `open` fired (a subtle but real bug).
        ws.close();
        await closePromise;
        expect(closeEvent).not.toBeNull();
        expect((closeEvent as unknown as { code: number }).code).not.toBe(4401);
    });
});
