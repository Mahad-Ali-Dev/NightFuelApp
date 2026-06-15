import { PrismaClient } from './generated/prisma';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('chat.service');

// ── RIA AI constants ──────────────────────────────────────────────────────────
export const RIA_AI_USER_ID = 'ria-ai-coach';
const AI_PIPELINE_URL = process.env.AI_PIPELINE_URL || 'http://localhost:3010';

export class ChatService {
    constructor(private prisma: PrismaClient) { }

    async getCoaches() {
        return this.prisma.coachProfile.findMany({
            where: { active: true },
            orderBy: { rating: 'desc' }
        });
    }

    async getOrCreateConversation(userId: string, coachId: string) {
        const [participantA, participantB] = [userId, coachId].sort();

        let conv = await this.prisma.conversation.findUnique({
            where: {
                participantA_participantB: { participantA, participantB }
            }
        });

        if (!conv) {
            conv = await this.prisma.conversation.create({
                data: { participantA, participantB }
            });
        }
        return conv;
    }

    /** List all conversations for a user with last message preview */
    async getConversations(userId: string) {
        const conversations = await this.prisma.conversation.findMany({
            where: {
                OR: [
                    { participantA: userId },
                    { participantB: userId },
                ],
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return conversations.map((conv) => {
            const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;
            const lastMsg = conv.messages[0];
            const isRia = otherUserId === RIA_AI_USER_ID;
            return {
                id: conv.id,
                participantName: isRia ? 'Coach Ria' : `User ${otherUserId.substring(0, 6)}`,
                avatarUrl: isRia ? null : null,
                isRia,
                lastMessage: lastMsg?.text ?? '',
                lastMessageAt: lastMsg?.createdAt?.toISOString() ?? conv.updatedAt.toISOString(),
                isOnline: isRia ? true : false,
                unreadCount: 0,
                role: isRia ? 'AI_COACH' : null,
            };
        });
    }

    async getMessageHistory(conversationId: string, limit: number = 50) {
        return this.prisma.message.findMany({
            where: { conversationId },
            take: limit,
            orderBy: { createdAt: 'asc' }
        });
    }

    /** Get messages formatted for the frontend */
    async getMessagesForUser(conversationId: string, userId: string, limit: number = 50) {
        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            take: limit,
            orderBy: { createdAt: 'asc' },
        });

        return messages.map((msg) => ({
            id: msg.id,
            text: msg.text,
            content: msg.text,
            isOwn: msg.senderId === userId,
            sender: msg.senderId === RIA_AI_USER_ID ? 'ai' : (msg.senderId === userId ? 'user' : 'other'),
            createdAt: msg.createdAt.toISOString(),
            status: msg.isRead ? 'read' : 'delivered',
        }));
    }

    async saveMessage(conversationId: string, senderId: string, text: string) {
        const msg = await this.prisma.message.create({
            data: { conversationId, senderId, text }
        });

        // Touch conversation updatedAt
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        return msg;
    }

    // ── RIA AI Chat ───────────────────────────────────────────────────────────

    /** Get or create the persistent Ria AI conversation for a user */
    async getRiaConversation(userId: string) {
        return this.getOrCreateConversation(userId, RIA_AI_USER_ID);
    }

    /** Get last N messages for the Ria conversation */
    async getRiaMessages(userId: string, limit: number = 50) {
        const conv = await this.getRiaConversation(userId);
        return this.getMessagesForUser(conv.id, userId, limit);
    }

    /**
     * Send a message to Ria, get an AI response, persist both, and return the reply.
     * Falls back to a stub if the AI pipeline is unreachable.
     */
    async sendRiaMessage(
        userId: string,
        userMessage: string,
        context: Record<string, unknown> = {}
    ): Promise<{ conversationId: string; reply: string; userMsgId: string; aiMsgId: string }> {
        const conv = await this.getRiaConversation(userId);

        // Save the user's message
        const userMsg = await this.saveMessage(conv.id, userId, userMessage);

        // Fetch recent history for context (last 20 messages)
        const history = await this.prisma.message.findMany({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        const historyForAI = history
            .reverse()
            .slice(0, -1) // exclude the message we just saved
            .map(m => ({
                role: m.senderId === RIA_AI_USER_ID ? 'assistant' : 'user' as const,
                content: m.text,
            }));

        // Call the AI pipeline
        let replyText: string;
        try {
            const res = await fetch(`${AI_PIPELINE_URL}/v1/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    message: userMessage,
                    history: historyForAI,
                    context,
                }),
                signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) throw new Error(`AI pipeline returned ${res.status}`);
            const json = await res.json() as { reply: string };
            replyText = json.reply;
        } catch (err: any) {
            logger.warn({ err: err.message }, 'AI pipeline unreachable — using fallback response');
            replyText = "Hey! I'm temporarily offline. Keep up the great work and check back soon! 💪";
        }

        // Save the AI response
        const aiMsg = await this.saveMessage(conv.id, RIA_AI_USER_ID, replyText);

        return {
            conversationId: conv.id,
            reply: replyText,
            userMsgId: userMsg.id,
            aiMsgId: aiMsg.id,
        };
    }
}
