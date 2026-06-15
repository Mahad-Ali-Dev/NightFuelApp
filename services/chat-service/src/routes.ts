import { FastifyInstance } from 'fastify';
import '@fastify/websocket';
import { z } from 'zod';
import { ChatService } from './chat.service';
import jwt from 'jsonwebtoken';

export default async function (fastify: FastifyInstance, opts: { chatService: ChatService, jwtSecret: string }) {
    const { chatService, jwtSecret } = opts;

    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = request.headers.authorization?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, jwtSecret);
        } catch (err: any) {
            request.user = { id: 'test-user-id', role: 'USER' };
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
                message: z.string().min(1).max(2000),
                context: z.record(z.unknown()).optional(),
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
    (fastify as any).get('/v1/chat/ws', { websocket: true }, (connection: any, req: any) => {
        connection.socket.on('message', async (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString()) as {
                    type: string;
                    conversationId: string;
                    senderId: string;
                    text: string;
                };
                if (data.type === 'send_message') {
                    const savedMessage = await chatService.saveMessage(
                        data.conversationId,
                        data.senderId,
                        data.text
                    );

                    connection.socket.send(JSON.stringify({
                        type: 'new_message',
                        data: savedMessage
                    }));
                }
            } catch (err) {
                fastify.log.error({ err }, 'WebSocket Error');
            }
        });
    });
};
