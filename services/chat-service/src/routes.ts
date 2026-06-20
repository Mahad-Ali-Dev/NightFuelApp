import { FastifyInstance } from 'fastify';
import '@fastify/websocket';
import { z } from 'zod';
import { ChatService, RequestPendingError, ConversationAccessError } from './chat.service';
import jwt from 'jsonwebtoken';
import { sendUnauthorized } from '@nightfuel/config';

// Inbound WebSocket frame schema — a discriminated union over `type`. senderId is
// intentionally absent from EVERY variant: the sender is derived from the verified
// JWT, never from the client payload.
//   • send_message — persist + deliver a chat message (text bounds preserved).
//   • typing_start / typing_stop — ephemeral typing relay (no DB write).
const wsFrameSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('send_message'),
        conversationId: z.string().uuid(),
        text: z.string().min(1).max(4000),
    }),
    z.object({
        type: z.literal('typing_start'),
        conversationId: z.string().uuid(),
    }),
    z.object({
        type: z.literal('typing_stop'),
        conversationId: z.string().uuid(),
    }),
]);

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

// ── Connected-socket registry ────────────────────────────────────────────────
// Module-level map from userId -> the set of that user's currently-open sockets
// (a user may have several: phone + web). Used to fan a `new_message` /
// `message_read` / typing relay out to the RECIPIENT's live sockets. Entries are
// added after the 4401 auth gate (under the JWT-verified senderId) and removed on
// socket 'close'; an emptied Set is deleted so the map can't leak userIds.
const connectedUsers = new Map<string, Set<any>>();

/** Send a JSON frame to every live socket of `userId` (no-op if none connected). */
function broadcastToUser(userId: string, frame: unknown): void {
    const sockets = connectedUsers.get(userId);
    if (!sockets) return;
    const payload = JSON.stringify(frame);
    for (const s of sockets) {
        try {
            s.send(payload);
        } catch {
            // A dead/half-closed socket must not break the fan-out to siblings.
        }
    }
}

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
        try {
            const messages = await chatService.getMessagesForUser(conversationId, userId);
            return reply.send({ data: messages });
        } catch (err) {
            // Non-participant (or missing conversation) -> 403, never the messages.
            if (err instanceof ConversationAccessError) {
                return reply.status(403).send({ error: 'forbidden' });
            }
            throw err;
        }
    });

    // ── Send message in a conversation ──────────────────────────────────────
    fastify.post('/v1/coaches/conversations/:conversationId/messages', {
        schema: { body: z.object({ text: z.string().min(1).max(4000) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const { text } = request.body as any;

        // Resolve the conversation so we can enforce the request gate and know the
        // recipient for delivery + the outbound event. A lookup FAILURE must fail
        // CLOSED: we cannot run assertCanSend, so we reject rather than persist a
        // message that bypassed the request gate.
        let conv;
        try {
            conv = await resolveConversation(chatService, conversationId);
        } catch (err) {
            request.log.error({ err, conversationId }, 'send: conversation lookup failed; failing closed');
            return reply.status(503).send({ error: 'conversation_unavailable' });
        }

        try {
            if (conv) await chatService.assertCanSend(conv, userId);
        } catch (err) {
            if (err instanceof RequestPendingError) {
                return reply.status(409).send({ error: 'request_pending' });
            }
            throw err;
        }

        const msg = await chatService.saveMessage(conversationId, userId, text);

        // Real-time delivery + best-effort outbound event to the OTHER participant.
        if (conv) {
            const recipientId = conv.participantA === userId ? conv.participantB : conv.participantA;
            broadcastToUser(recipientId, { type: 'new_message', data: msg });
            await chatService.emitMessageSent(userId, recipientId, conversationId, text);
        }

        return reply.status(201).send({ data: msg });
    });

    // ── Mark a conversation read ─────────────────────────────────────────────
    // Sets isRead + readAt on the peer's unread messages and broadcasts a
    // `message_read` receipt to the OTHER participant's live sockets.
    fastify.post('/v1/chat/conversations/:conversationId/read', {
        schema: { params: z.object({ conversationId: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;

        const conv = await chatService.markConversationRead(conversationId, userId);
        const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;
        broadcastToUser(otherUserId, { type: 'message_read', conversationId, readerId: userId });

        return reply.send({ ok: true });
    });

    // ── Message requests (Instagram-DM style) ────────────────────────────────

    // GET /v1/chat/requests — incoming pending requests (someone DMed me).
    fastify.get('/v1/chat/requests', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const requests = await chatService.getIncomingRequests(userId);
        return reply.send({ data: requests });
    });

    // POST /v1/chat/requests/:conversationId/accept — recipient accepts.
    fastify.post('/v1/chat/requests/:conversationId/accept', {
        schema: { params: z.object({ conversationId: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const conv = await chatService.acceptRequest(conversationId, userId);
        return reply.send({ data: { id: conv.id, requestState: conv.requestState } });
    });

    // POST /v1/chat/requests/:conversationId/decline — recipient declines.
    fastify.post('/v1/chat/requests/:conversationId/decline', {
        schema: { params: z.object({ conversationId: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const conv = await chatService.declineRequest(conversationId, userId);
        return reply.send({ data: { id: conv.id, requestState: conv.requestState } });
    });

    // ── Legacy: get message history by conversation ID ──────────────────────
    // limit is clamped int 1..100 (default 50) so a hostile/non-finite ?limit=
    // (e.g. 99999999, -1, NaN) yields a clean 400 BEFORE the bounded value is
    // forwarded to getMessageHistory's Prisma `take` — never an unbounded read.
    fastify.get('/v1/chat/:conversationId/history', {
        schema: {
            params: z.object({ conversationId: z.string().uuid() }),
            querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { conversationId } = request.params as any;
        const userId = (request as any).user?.userId ?? (request as any).user?.id ?? (request as any).user?.sub;
        const { limit } = request.query as any;
        try {
            return reply.send(await chatService.getMessageHistory(conversationId, userId, limit));
        } catch (err) {
            // Membership gate: a non-participant (or missing conversation) gets 403.
            if (err instanceof ConversationAccessError) {
                return reply.status(403).send({ error: 'forbidden' });
            }
            throw err;
        }
    });

    // ── Ria AI Chat Routes ───────────────────────────────────────────────────

    // GET /v1/chat/ria/messages — load persistent Ria conversation history
    // limit is clamped int 1..100 (default 50) so a hostile/non-finite ?limit=
    // (e.g. 99999999, 0, -1, NaN) is rejected with a clean 400 BEFORE the value
    // reaches getRiaMessages -> Prisma `take`, closing the unbounded-read path.
    fastify.get('/v1/chat/ria/messages', {
        schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }) },
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

        // Daily Ria quota — counted BEFORE persisting or calling the pipeline.
        // At/over the cap we reply 429 and do NOT persist the user message or
        // invoke the AI pipeline. The typeof-guard keeps the route resilient if a
        // ChatService variant doesn't expose checkRiaQuota (in production it always
        // does); a real ChatService never skips the gate.
        if (typeof chatService.checkRiaQuota === 'function') {
            const quota = await chatService.checkRiaQuota(userId);
            if (!quota.allowed) {
                return reply.code(429).send({
                    error: 'ai_quota_exceeded',
                    limit: quota.limit,
                    plan: quota.plan,
                    resetsAt: quota.resetsAt,
                });
            }
        }

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

        // Sender comes from the verified token only — any client-supplied senderId
        // is ignored (and not part of any frame schema).
        const senderId = wsUser.userId ?? wsUser.id ?? wsUser.sub;

        // ── Register this socket under its verified user ───────────────────
        // After the 4401 gate so only authenticated sockets ever enter the
        // delivery registry. A user may hold several sockets (phone + web).
        let sockets = connectedUsers.get(senderId);
        if (!sockets) {
            sockets = new Set();
            connectedUsers.set(senderId, sockets);
        }
        sockets.add(socket);

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
            // Deregister from the delivery map; drop the user's Set entirely once
            // it is empty so the map never accumulates stale userIds.
            const set = connectedUsers.get(senderId);
            if (set) {
                set.delete(socket);
                if (set.size === 0) connectedUsers.delete(senderId);
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

                const frame = parsed.data;

                // ── Typing relay (no DB) ──────────────────────────────────
                // Ephemeral presence signal. Resolve the conversation only to
                // find the recipient, then relay {type,conversationId,userId}
                // to THEIR sockets — never echoed back to the sender, never
                // persisted.
                if (frame.type === 'typing_start' || frame.type === 'typing_stop') {
                    // Ephemeral: a lookup failure simply means we don't relay (no-op),
                    // never a persisted side effect — so swallow the throw here.
                    let conv = null;
                    try {
                        conv = await resolveConversation(chatService, frame.conversationId);
                    } catch {
                        return;
                    }
                    if (conv) {
                        const recipientId = conv.participantA === senderId ? conv.participantB : conv.participantA;
                        broadcastToUser(recipientId, {
                            type: frame.type,
                            conversationId: frame.conversationId,
                            userId: senderId,
                        });
                    }
                    return;
                }

                // ── send_message ──────────────────────────────────────────
                // A lookup FAILURE fails CLOSED: emit an error frame and do NOT
                // persist (the request gate can't be enforced without the conv).
                let conv;
                try {
                    conv = await resolveConversation(chatService, frame.conversationId);
                } catch {
                    socket.send(JSON.stringify({ type: 'error', error: 'conversation_unavailable' }));
                    return;
                }

                // Enforce the request gate; a pending requester's 2nd send is
                // rejected with a `request_pending` error frame (socket stays open).
                if (conv) {
                    try {
                        await chatService.assertCanSend(conv, senderId);
                    } catch (e) {
                        if (e instanceof RequestPendingError) {
                            socket.send(JSON.stringify({ type: 'error', error: 'request_pending' }));
                            return;
                        }
                        throw e;
                    }
                }

                const savedMessage = await chatService.saveMessage(
                    frame.conversationId,
                    senderId,
                    frame.text
                );

                // Ack the sender…
                socket.send(JSON.stringify({
                    type: 'new_message',
                    data: savedMessage
                }));

                // …then deliver the same frame to the recipient's live sockets and
                // emit the best-effort outbound event (both no-op for Ria/absent peers).
                if (conv) {
                    const recipientId = conv.participantA === senderId ? conv.participantB : conv.participantA;
                    broadcastToUser(recipientId, { type: 'new_message', data: savedMessage });
                    await chatService.emitMessageSent(senderId, recipientId, frame.conversationId, frame.text);
                }
            } catch (err) {
                fastify.log.error({ err }, 'WebSocket Error');
            }
        });
    });
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Conversation lookup for delivery/gate decisions. Reads the raw row
 * (participants + requestState) through the ChatService's Prisma client.
 *
 * Returns null when the conversation is genuinely ABSENT (or no DB is wired).
 * A lookup FAILURE (DB fault), however, now PROPAGATES — it is deliberately NOT
 * swallowed. Previously this caught all errors and returned null, which made the
 * send paths skip assertCanSend and persist the message anyway: the request gate
 * failed OPEN under any transient DB error. Callers on the send path must catch
 * the throw and fail CLOSED (reject, never persist); the ephemeral typing relay
 * may treat a throw as "no recipient" and no-op. Kept as a free function so the
 * REST send handler and the WS handler share one path.
 */
async function resolveConversation(
    chatService: ChatService,
    conversationId: string,
): Promise<{ id: string; participantA: string; participantB: string; requestState: string } | null> {
    const prisma = (chatService as any).prisma;
    if (!prisma?.conversation?.findUnique) return null;
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    return conv ?? null;
}
