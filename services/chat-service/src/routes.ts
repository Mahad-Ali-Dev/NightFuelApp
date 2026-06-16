import { FastifyInstance } from 'fastify';
import '@fastify/websocket';
import { z } from 'zod';
import { ChatService } from './chat.service';
import jwt from 'jsonwebtoken';

// Inbound WebSocket frame schema. senderId is intentionally absent — the
// sender is derived from the verified JWT, never from the client payload.
const wsFrameSchema = z.object({
    type: z.literal('send_message'),
    conversationId: z.string().uuid(),
    text: z.string().min(1).max(4000)
});

export default async function (fastify: FastifyInstance, opts: { chatService: ChatService, jwtSecret: string }) {
    const { chatService, jwtSecret } = opts;

    // invalid/missing token -> 401, never a fallback identity
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = request.headers.authorization?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, jwtSecret);
        } catch (err: any) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'A valid Bearer token is required.',
            });
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
                            // Single iterative walk: enforces all four bounds at once.
                            // No recursion — adversarial payloads can't blow the stack.
                            const MAX_BYTES = 16_000;
                            const MAX_DEPTH = 8;
                            const MAX_KEYS = 200;
                            const MAX_STRING = 4096;
                            try {
                                if (JSON.stringify(c).length > MAX_BYTES) return false;
                            } catch {
                                return false;
                            }
                            // Stack entries: [node, depth]. Root object is depth 1.
                            const stack: Array<[unknown, number]> = [[c, 1]];
                            let keyCount = 0;
                            while (stack.length > 0) {
                                const [node, depth] = stack.pop() as [unknown, number];
                                if (depth > MAX_DEPTH) return false;
                                if (node === null || typeof node !== 'object') {
                                    if (typeof node === 'string' && node.length > MAX_STRING) return false;
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

        socket.on('message', async (message: Buffer) => {
            try {
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
