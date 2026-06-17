import { FastifyInstance } from 'fastify';
import '@fastify/websocket';
import { z } from 'zod';
import { ChatService } from './chat.service';
import jwt from 'jsonwebtoken';
import { sendUnauthorized } from '@nightfuel/config';

// Inbound WebSocket frame schema. senderId is intentionally absent — the
// sender is derived from the verified JWT, never from the client payload.
const wsFrameSchema = z.object({
    type: z.literal('send_message'),
    conversationId: z.string().uuid(),
    text: z.string().min(1).max(4000)
});

// ── WebSocket per-socket hardening constants ─────────────────────────────────
// MAX_FRAME_BYTES — every inbound frame must be smaller than this BEFORE we
// hand it to JSON.parse. 8KB comfortably fits the 4000-char `text` field plus
// the schema envelope; anything larger is treated as a wire-level abuse.
const MAX_FRAME_BYTES = 8192;
// Token-bucket params — a per-socket floor that runs INSIDE the (already
// IP-capped) global @fastify/rate-limit plugin. Burst up to 5 frames; refill
// at 1 token/sec. A missing token returns an error frame WITHOUT closing the
// socket so legitimate clients can back off and continue.
const TOKEN_BUCKET_MAX = 5;
const TOKEN_REFILL_PER_SEC = 1;
// Idle close: silent sockets are reaped after 5 minutes with a custom code
// (4408 — "idle timeout", in the application-defined 4000-4999 close range).
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export default async function (fastify: FastifyInstance, opts: { chatService: ChatService, jwtSecret: string }) {
    const { chatService, jwtSecret } = opts;

    // invalid/missing token -> 401, never a fallback identity
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = request.headers.authorization?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, jwtSecret);
        } catch (err: any) {
            return sendUnauthorized(reply, request, err);
        }
    });

    // ── Coach directory ─────────────────────────────────────────────────────
    fastify.get('/v1/coaches/directory', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        return reply.send(await chatService.getCoaches());
    });

    // ── List conversations for current user ─────────────────────────────────
    fastify.get('/v1/coaches/conversations', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const conversations = await chatService.getConversations(userId);
        return reply.send({ data: conversations });
    });

    // ── Create or get conversation with a target user ───────────────────────
    fastify.post('/v1/coaches/conversations', {
        schema: { body: z.object({ targetUserId: z.string() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const { targetUserId } = request.body as any;
        const conv = await (opts.chatService as any).getOrCreateConversation(userId, targetUserId);
        return reply.send({ data: conv });
    });

    // ── Get messages for a conversation ─────────────────────────────────────
    fastify.get('/v1/coaches/conversations/:conversationId/messages', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const messages = await chatService.getMessagesForUser(conversationId, userId);
        return reply.send({ data: messages });
    });

    // ── Send message in a conversation ──────────────────────────────────────
    fastify.post('/v1/coaches/conversations/:conversationId/messages', {
        schema: { body: z.object({ text: z.string().min(1).max(4000) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const { text } = request.body as any;
        const msg = await chatService.saveMessage(conversationId, userId, text);
        return reply.status(201).send({ data: msg });
    });

    // ── Legacy: get message history by conversation ID ──────────────────────
    fastify.get('/v1/chat/:conversationId/history', {
        schema: { params: z.object({ conversationId: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        return reply.send(await chatService.getMessageHistory(conversationId));
    });

    // ── Ria AI Chat Routes ───────────────────────────────────────────────────

    // GET /v1/chat/ria/messages — load persistent Ria conversation history
    fastify.get('/v1/chat/ria/messages', {
        schema: { querystring: z.object({ limit: z.coerce.number().default(50) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const { limit } = request.query as any;
        const messages = await chatService.getRiaMessages(userId, limit);
        return reply.send({ data: messages });
    });

    // POST /v1/chat/ria/send — send a message to Ria and get AI response
    fastify.post('/v1/chat/ria/send', {
        schema: {
            body: z.object({
                message: z.string().min(1).max(4000),
                // context is forwarded verbatim to the AI pipeline — keep it a
                // plain object and bound its serialized size, nesting depth,
                // total key count, and individual string lengths to limit
                // downstream LLM-prompt-injection / DoS abuse.
                context: z
                    .record(z.unknown())
                    .refine(
                        (c) => {
                            // Single iterative walk: enforces all six bounds at once.
                            // No recursion — adversarial payloads can't blow the stack.
                            const MAX_BYTES = 16_000;
                            const MAX_DEPTH = 8;
                            const MAX_KEYS = 200;
                            const MAX_STRING = 4096;
                            // SUM_STRING_BYTES — total chars across every string value in
                            // the payload. The per-string MAX_STRING cap alone lets an
                            // attacker fan out N nearly-4KB strings under the JSON byte
                            // cap; this aggregate cap blocks that "many medium strings"
                            // amplification path before it reaches the LLM prompt.
                            const SUM_STRING_BYTES = 24_000;
                            try {
                                if (JSON.stringify(c).length > MAX_BYTES) return false;
                            } catch {
                                return false;
                            }
                            // Stack entries: [node, depth]. Root object is depth 1.
                            const stack: Array<[unknown, number]> = [[c, 1]];
                            let keyCount = 0;
                            let stringByteSum = 0;
                            while (stack.length > 0) {
                                const [node, depth] = stack.pop() as [unknown, number];
                                if (depth > MAX_DEPTH) return false;
                                if (node === null || typeof node !== 'object') {
                                    if (typeof node === 'string' && node.length > MAX_STRING) return false;
                                    if (typeof node === 'string') {
                                        stringByteSum += node.length;
                                        if (stringByteSum > SUM_STRING_BYTES) return false;
                                    }
                                    continue;
                                }
                                if (Array.isArray(node)) {
                                    for (let i = 0; i < node.length; i++) {
                                        stack.push([node[i], depth + 1]);
                                    }
                                    continue;
                                }
                                const obj = node as Record<string, unknown>;
                                for (const k in obj) {
                                    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
                                    // Prototype-pollution defence: reject any key that
                                    // could redirect a downstream merge/clone into
                                    // Object.prototype. These keys have no legitimate
                                    // use in an LLM context payload.
                                    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
                                    keyCount++;
                                    if (keyCount > MAX_KEYS) return false;
                                    stack.push([obj[k], depth + 1]);
                                }
                            }
                            return true;
                        },
                        { message: 'context exceeds size/depth/key/string bounds' }
                    )
                    .optional(),
            })
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const { message, context = {} } = request.body as any;
        const result = await chatService.sendRiaMessage(userId, message, context);
        return reply.send(result);
    });

    // ── WebSocket route for real-time chat ──────────────────────────────────
    (fastify as any).get('/v1/chat/ws', { websocket: true }, (socket: any, req: any) => {
        // Authenticate the upgrade from the Bearer token. Unlike the dev-fallback
        // `authenticate` decorator, the socket MUST close on a bad/missing token —
        // the sender identity below is trusted to come from this verified payload.
        // NOTE: @fastify/websocket v11 passes the raw WebSocket as the first arg
        // (not the v10-era wrapper object). The pre-v11 nested-property access
        // pattern silently threw and left the socket OPEN — a critical auth-bypass
        // vector. Always invoke close/on/send directly on this `socket` arg.
        const token = (req.headers?.authorization as string | undefined)?.replace('Bearer ', '');
        let wsUser: any;
        try {
            if (!token) throw new Error('missing');
            wsUser = jwt.verify(token, jwtSecret);
        } catch {
            socket.close(4401, 'Unauthorized');
            return;
        }

        // ── Per-socket hardening state ─────────────────────────────────────
        // Token bucket — bursts up to TOKEN_BUCKET_MAX, refilled lazily at
        // TOKEN_REFILL_PER_SEC. Closure-scoped so each upgraded socket has its
        // own floor on top of the IP-cap enforced globally by @fastify/rate-limit.
        const bucket = { tokens: TOKEN_BUCKET_MAX, last: Date.now() };

        // Idle-close timer — reset on every inbound message. Silent sockets get
        // reaped after IDLE_TIMEOUT_MS with code 4408 ("idle timeout"). unref()
        // so the timer never keeps the Node event loop alive on its own (matters
        // in tests where the mock socket never emits `close`).
        let idleTimer: NodeJS.Timeout | null = null;
        const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                socket.close(4408, 'idle timeout');
            }, IDLE_TIMEOUT_MS);
            // unref is defined on Node's Timeout but not in the DOM Timeout typing;
            // guard so we don't crash if the runtime doesn't expose it.
            if (typeof (idleTimer as any).unref === 'function') (idleTimer as any).unref();
        };
        resetIdleTimer();

        socket.on('close', () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        });

        socket.on('message', async (message: Buffer) => {
            try {
                // ── Wire-level frame cap ──────────────────────────────────
                // Reject anything that wouldn't fit a max-sized send_message
                // BEFORE we let JSON.parse see it — JSON.parse on a multi-MB
                // string is itself a CPU DoS vector. message.length is the
                // raw byte count on a Buffer.
                if (message.length > MAX_FRAME_BYTES) {
                    socket.send(JSON.stringify({ type: 'error', error: 'invalid_frame' }));
                    return;
                }

                // Activity observed — reset the idle reaper.
                resetIdleTimer();

                // ── Per-socket token bucket ───────────────────────────────
                // Lazy refill: top up the bucket based on elapsed seconds
                // since the last frame, cap at TOKEN_BUCKET_MAX. On an empty
                // bucket we reject the frame but DO NOT close — legitimate
                // clients (back-off-and-retry loops) recover within ~1s.
                const now = Date.now();
                const elapsedSec = (now - bucket.last) / 1000;
                bucket.tokens = Math.min(
                    TOKEN_BUCKET_MAX,
                    bucket.tokens + elapsedSec * TOKEN_REFILL_PER_SEC,
                );
                bucket.last = now;
                if (bucket.tokens < 1) {
                    socket.send(JSON.stringify({ type: 'error', error: 'rate_limited' }));
                    return;
                }
                bucket.tokens -= 1;

                let raw: unknown;
                try {
                    raw = JSON.parse(message.toString());
                } catch {
                    socket.send(JSON.stringify({ type: 'error', error: 'invalid_frame' }));
                    return;
                }

                const parsed = wsFrameSchema.safeParse(raw);
                if (!parsed.success) {
                    socket.send(JSON.stringify({ type: 'error', error: 'invalid_frame' }));
                    return;
                }

                // Sender comes from the verified token only — any client-supplied
                // senderId is ignored (and not part of the schema).
                const senderId = wsUser.userId ?? wsUser.id ?? wsUser.sub;
                const savedMessage = await chatService.saveMessage(
                    parsed.data.conversationId,
                    senderId,
                    parsed.data.text
                );

                socket.send(JSON.stringify({
                    type: 'new_message',
                    data: savedMessage
                }));
            } catch (err) {
                fastify.log.error({ err }, 'WebSocket Error');
            }
        });
    });
};
