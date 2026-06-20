import { PrismaClient } from './generated/prisma';
import { createLogger, resolvePlan } from '@nightfuel/config';
import type { EventBus } from '@nightfuel/events';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

const logger = createLogger('chat.service');

// ── RIA AI constants ──────────────────────────────────────────────────────────
export const RIA_AI_USER_ID = 'ria-ai-coach';
const AI_PIPELINE_URL = process.env.AI_PIPELINE_URL || 'http://localhost:3010';

// ── Internal service-to-service call config ─────────────────────────────────────
const DEFAULT_USER_SERVICE_URL = 'http://user-service:3009';
const DEFAULT_SUBSCRIPTION_SERVICE_URL = 'http://subscription-service:3015';
const INTERNAL_REQUEST_TIMEOUT_MS = 3_000;

// ── Ria daily AI quota ──────────────────────────────────────────────────────────
// Per-plan daily caps on USER-authored Ria messages, counted since UTC midnight.
// Overridable from the environment so ops can tune without a redeploy; the
// fallbacks match the product spec (free:5, pro:20).
const AI_FREE_DAILY = parseInt(process.env.AI_FREE_DAILY || '5', 10);
const AI_PRO_DAILY = parseInt(process.env.AI_PRO_DAILY || '20', 10);

/**
 * Thrown by assertCanSend when a pending request's requester tries to send a
 * second message before the recipient has accepted. Carries a typed marker so
 * the REST/WS layers can translate it into a `request_pending` response without
 * string-matching the message.
 */
export class RequestPendingError extends Error {
    readonly code = 'request_pending';
    constructor(message = 'request_pending') {
        super(message);
        this.name = 'RequestPendingError';
    }
}

/**
 * Thrown when a caller tries to read/act on a conversation they are not a
 * participant of (or that does not exist). Carries a typed `code` so the route
 * layer can map it to 403 without string-matching. Missing and non-participant
 * are deliberately collapsed into the SAME error so the response never reveals
 * whether a given conversationId exists (no existence oracle). This is the
 * membership gate the message READ paths previously lacked — they filtered by
 * conversationId alone, an IDOR letting any authenticated user read any DM.
 */
export class ConversationAccessError extends Error {
    readonly code = 'forbidden';
    constructor(message = 'forbidden') {
        super(message);
        this.name = 'ConversationAccessError';
    }
}

/** Resolved peer identity attached to a conversation list item. */
export interface ConversationPeer {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
}

/** Result of the Ria daily-quota check. */
export interface RiaQuotaResult {
    allowed: boolean;
    limit: number;
    plan: 'free' | 'pro';
    resetsAt: string; // next UTC-midnight ISO timestamp
}

export class ChatService {
    private readonly jwtSecret: string;
    private readonly userServiceUrl: string;
    private readonly subscriptionServiceUrl: string;

    // eventBus is OPTIONAL and additive: existing callers `new ChatService(prisma)`
    // keep compiling. When supplied, normal (non-Ria) sends emit a best-effort
    // `chat:message-sent` event for downstream fan-out (push notifications etc.).
    constructor(
        private prisma: PrismaClient,
        private eventBus?: EventBus,
    ) {
        // Reuse the same JWT secret the service already loads for auth so internal
        // tokens verify against the user/subscription services (which share it).
        this.jwtSecret = process.env.JWT_SECRET || '';
        this.userServiceUrl = (process.env.USER_SERVICE_URL || DEFAULT_USER_SERVICE_URL).replace(/\/+$/, '');
        this.subscriptionServiceUrl = (process.env.SUBSCRIPTION_SERVICE_URL || DEFAULT_SUBSCRIPTION_SERVICE_URL).replace(/\/+$/, '');
    }

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
            // New 1:1 conversations default to 'pending' via the DB column default
            // (Instagram-DM request gate). Ria/coach conversations are still stored
            // 'pending' here but are treated as accepted in assertCanSend, so they
            // are never request-blocked.
            conv = await this.prisma.conversation.create({
                data: { participantA, participantB }
            });
        }
        return conv;
    }

    /** List all conversations for a user with last message preview + request state. */
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

        // Resolve the human-readable peer identity for every NON-Ria peer via the
        // user-service internal profile path. One short-lived token covers the
        // whole batch; each lookup is independently bounded and degrades to a
        // generic member fallback (never throwing) so a slow user-service can't
        // stall the conversation list.
        const peerIds = [
            ...new Set(
                conversations
                    .map((conv) => (conv.participantA === userId ? conv.participantB : conv.participantA))
                    .filter((id) => id !== RIA_AI_USER_ID),
            ),
        ];
        const peers = await this.resolvePeers(peerIds);

        return conversations.map((conv) => {
            const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;
            const lastMsg = conv.messages[0];
            const isRia = otherUserId === RIA_AI_USER_ID;
            const peer: ConversationPeer = isRia
                ? { userId: RIA_AI_USER_ID, displayName: 'Coach Ria', avatarUrl: null }
                : peers.get(otherUserId) ?? { userId: otherUserId, displayName: 'Zeitra Member', avatarUrl: null };
            return {
                id: conv.id,
                requestState: conv.requestState,
                peer,
                participantName: peer.displayName,
                avatarUrl: peer.avatarUrl,
                isRia,
                lastMessage: lastMsg?.text ?? '',
                lastMessageAt: lastMsg?.createdAt?.toISOString() ?? conv.updatedAt.toISOString(),
                isOnline: isRia ? true : false,
                unreadCount: 0,
                role: isRia ? 'AI_COACH' : null,
            };
        });
    }

    /**
     * Load a conversation and assert `userId` is one of its two participants.
     * Throws ConversationAccessError (mapped to 403 by the route) when the
     * conversation is missing OR the user is not a participant — the membership
     * gate the read paths previously lacked. Mirrors the participant check
     * already enforced in markConversationRead / transitionRequest.
     */
    private async assertParticipant(conversationId: string, userId: string) {
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv || (conv.participantA !== userId && conv.participantB !== userId)) {
            throw new ConversationAccessError();
        }
        return conv;
    }

    async getMessageHistory(conversationId: string, userId: string, limit: number = 50) {
        // Membership gate: only a participant may read a conversation's history.
        await this.assertParticipant(conversationId, userId);
        return this.prisma.message.findMany({
            where: { conversationId },
            take: limit,
            orderBy: { createdAt: 'asc' }
        });
    }

    /** Get messages formatted for the frontend */
    async getMessagesForUser(conversationId: string, userId: string, limit: number = 50) {
        // Membership gate: only a participant may read a conversation's messages.
        await this.assertParticipant(conversationId, userId);
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

    // ── Message requests (Instagram-DM style) ───────────────────────────────────

    /**
     * Derive request metadata for a conversation: the requester is the sender of
     * the EARLIEST message (the person who opened the thread). `hasMessages` lets
     * callers distinguish "first message of a brand-new request" (allowed) from a
     * "second message before acceptance" (blocked).
     */
    async getConversationRequestInfo(
        conversationId: string,
    ): Promise<{ requesterId: string | null; hasMessages: boolean }> {
        const earliest = await this.prisma.message.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            select: { senderId: true },
        });
        return {
            requesterId: earliest?.senderId ?? null,
            hasMessages: !!earliest,
        };
    }

    /**
     * Enforce the request gate for a would-be sender. Throws RequestPendingError
     * when the conversation is still 'pending' AND the sender is the original
     * requester AND a message already exists (i.e. the requester is trying to
     * send a SECOND message before the recipient accepts).
     *
     * Ria conversations are always allowed: a user must be able to keep chatting
     * with the AI coach regardless of the stored request_state.
     */
    async assertCanSend(
        conv: { id: string; participantA: string; participantB: string; requestState: string },
        senderId: string,
    ): Promise<void> {
        // Ria/coach AI thread — never request-blocked.
        if (conv.participantA === RIA_AI_USER_ID || conv.participantB === RIA_AI_USER_ID) return;

        // Only a 'pending' conversation gates anything.
        if (conv.requestState !== 'pending') return;

        const { requesterId, hasMessages } = await this.getConversationRequestInfo(conv.id);

        // The requester gets EXACTLY ONE message while pending. The first message
        // (no prior messages) is always allowed — it IS the request. Any further
        // send by the same requester is blocked until acceptance. The recipient is
        // free to reply (their reply is what implicitly/explicitly accepts).
        if (hasMessages && requesterId === senderId) {
            throw new RequestPendingError();
        }
    }

    /**
     * Incoming pending requests for a user: conversations that are still 'pending'
     * where the user is a participant but NOT the requester (i.e. someone DMed
     * them and they have not yet accepted/declined).
     */
    async getIncomingRequests(userId: string) {
        const conversations = await this.prisma.conversation.findMany({
            where: {
                requestState: 'pending',
                OR: [{ participantA: userId }, { participantB: userId }],
            },
            include: {
                messages: { orderBy: { createdAt: 'asc' }, take: 1 },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const incoming = conversations.filter((conv) => {
            const first = conv.messages[0];
            // No messages yet -> nobody has actually requested; skip. Otherwise the
            // requester is the earliest sender; the recipient is "incoming".
            if (!first) return false;
            const requesterId = first.senderId;
            return requesterId !== userId && requesterId !== RIA_AI_USER_ID;
        });

        const requesterIds = [...new Set(incoming.map((c) => c.messages[0].senderId))];
        const peers = await this.resolvePeers(requesterIds);

        return incoming.map((conv) => {
            const requesterId = conv.messages[0].senderId;
            const lastMsg = conv.messages[0];
            const peer = peers.get(requesterId) ?? {
                userId: requesterId,
                displayName: 'Zeitra Member',
                avatarUrl: null,
            };
            return {
                id: conv.id,
                requestState: conv.requestState,
                peer,
                lastMessage: lastMsg?.text ?? '',
                lastMessageAt: lastMsg?.createdAt?.toISOString() ?? conv.updatedAt.toISOString(),
            };
        });
    }

    /**
     * Accept a pending request. Only the NON-requester (the recipient) may accept.
     * Flips request_state to 'accepted', unblocking further sends from the
     * requester. Idempotent on an already-accepted conversation.
     */
    async acceptRequest(conversationId: string, userId: string) {
        return this.transitionRequest(conversationId, userId, 'accepted');
    }

    /**
     * Decline a pending request. Only the NON-requester (the recipient) may
     * decline. Flips request_state to 'declined'.
     */
    async declineRequest(conversationId: string, userId: string) {
        return this.transitionRequest(conversationId, userId, 'declined');
    }

    private async transitionRequest(
        conversationId: string,
        userId: string,
        next: 'accepted' | 'declined',
    ) {
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv) {
            throw new Error('Conversation not found');
        }
        // Authorisation: the actor must be a participant…
        if (conv.participantA !== userId && conv.participantB !== userId) {
            throw new Error('Forbidden');
        }
        // …and must NOT be the requester — only the recipient may act on a request.
        const { requesterId } = await this.getConversationRequestInfo(conversationId);
        if (requesterId === userId) {
            throw new Error('Forbidden');
        }

        return this.prisma.conversation.update({
            where: { id: conversationId },
            data: { requestState: next },
        });
    }

    // ── Read receipts ───────────────────────────────────────────────────────────

    /**
     * Mark every unread message in `conversationId` that the reader did NOT send
     * as read (isRead + readAt). Returns the resolved conversation so the route
     * can broadcast `message_read` to the OTHER participant's sockets.
     */
    async markConversationRead(conversationId: string, readerId: string) {
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv) {
            throw new Error('Conversation not found');
        }
        if (conv.participantA !== readerId && conv.participantB !== readerId) {
            throw new Error('Forbidden');
        }

        await this.prisma.message.updateMany({
            where: {
                conversationId,
                senderId: { not: readerId },
                isRead: false,
            },
            data: { isRead: true, readAt: new Date() },
        });

        return conv;
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
     * Daily Ria quota check. Counts the user's OWN Ria messages (senderId === userId)
     * since UTC midnight, resolves the caller's plan from the subscription-service,
     * and reports whether another send is allowed. Never persists or calls the AI
     * pipeline — purely a gate the route consults BEFORE sendRiaMessage.
     *
     * Plan signal unreachable -> defaults to 'free' (the safer, lower limit). See
     * the work-item RISK note.
     */
    async checkRiaQuota(userId: string): Promise<RiaQuotaResult> {
        // resolver centralized into @nightfuel/config; the shared token mints
        // {userId, sub} — a compatible superset (subscription-service reads only
        // userId/id), so chat's old role:'SYSTEM'/no-sub and exercise/plan's
        // sub/no-role both reduce to behavior-identical at /me.
        const plan = await resolvePlan({
            userId,
            jwtSecret: this.jwtSecret,
            subscriptionServiceUrl: this.subscriptionServiceUrl,
            timeoutMs: INTERNAL_REQUEST_TIMEOUT_MS,
        });
        const limit = plan === 'pro' ? AI_PRO_DAILY : AI_FREE_DAILY;

        const conv = await this.getRiaConversation(userId);

        // UTC midnight boundary — quotas reset at 00:00 UTC.
        const now = new Date();
        const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const nextUtcMidnight = new Date(startOfUtcDay.getTime() + 24 * 60 * 60 * 1000);

        const usedToday = await this.prisma.message.count({
            where: {
                conversationId: conv.id,
                senderId: userId, // USER-authored messages only — not Ria's replies
                createdAt: { gte: startOfUtcDay },
            },
        });

        return {
            allowed: usedToday < limit,
            limit,
            plan,
            resetsAt: nextUtcMidnight.toISOString(),
        };
    }

    /**
     * Send a message to Ria, get an AI response, persist both, and return the reply.
     * Falls back to a stub if the AI pipeline is unreachable.
     *
     * NOTE: this does NOT emit `chat:message-sent` — that event is for human-to-human
     * DMs only (the Ria thread has no recipient to notify).
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

    // ── Outbound event ──────────────────────────────────────────────────────────

    /**
     * Best-effort `chat:message-sent` emission for a NON-Ria send. Wrapped so a
     * Redis hiccup never blocks or fails the user's send. The publish is fire-and-
     * forget from the caller's perspective: any error is swallowed and logged.
     */
    async emitMessageSent(senderId: string, recipientId: string, conversationId: string, text: string): Promise<void> {
        if (!this.eventBus) return;
        if (recipientId === RIA_AI_USER_ID || senderId === RIA_AI_USER_ID) return;
        try {
            await this.eventBus.publish('chat:message-sent', {
                eventId: crypto.randomUUID(),
                eventType: 'chat.message-sent',
                producedAt: new Date().toISOString(),
                producerService: 'chat-service',
                correlationId: crypto.randomUUID(),
                userId: senderId,
                payload: {
                    recipientId,
                    conversationId,
                    textPreview: text.slice(0, 120),
                },
            });
        } catch (err) {
            // Never block or throw on the messaging hot path.
            logger.warn({ err, conversationId }, 'Failed to publish chat:message-sent (best-effort)');
        }
    }

    // ── Internal service-to-service helpers ─────────────────────────────────────

    /**
     * Mint a short-lived internal JWT mirroring the auth-service { userId, role }
     * shape. Defaults to the synthetic 'chat-service' identity for path-param
     * lookups (e.g. /users/internal/profile/:id, where the subject is in the URL).
     * Pass an explicit `subjectUserId` for `/me`-style endpoints that derive the
     * subject FROM the token (e.g. subscription-service /v1/subscriptions/me) so
     * the call resolves the target user rather than the service principal.
     */
    private mintInternalToken(subjectUserId: string = 'chat-service'): string {
        return jwt.sign(
            { userId: subjectUserId, role: 'SYSTEM' },
            this.jwtSecret,
            { expiresIn: '60s' },
        );
    }

    /**
     * Resolve a set of peer ids to {userId, displayName, avatarUrl} via the
     * user-service internal profile path. Each lookup is independently bounded
     * (3s) and degrades to a generic member fallback; a missing/slow peer never
     * throws and never blocks the others.
     */
    private async resolvePeers(ids: string[]): Promise<Map<string, ConversationPeer>> {
        const result = new Map<string, ConversationPeer>();
        const unique = [...new Set(ids.filter((id) => !!id))];
        if (unique.length === 0) return result;

        // Without a JWT secret we cannot mint an internal token, so we can't call
        // user-service — degrade every peer to the generic fallback rather than
        // throwing (keeps conversation listing working in misconfigured/test envs).
        if (!this.jwtSecret) {
            for (const id of unique) {
                result.set(id, { userId: id, displayName: 'Zeitra Member', avatarUrl: null });
            }
            return result;
        }

        const token = this.mintInternalToken();
        const resolved = await Promise.all(unique.map((id) => this.fetchPeer(id, token)));
        for (const peer of resolved) {
            result.set(peer.userId, peer);
        }
        return result;
    }

    private async fetchPeer(peerId: string, token: string): Promise<ConversationPeer> {
        const url = `${this.userServiceUrl}/v1/users/internal/profile/${encodeURIComponent(peerId)}`;
        const fallback: ConversationPeer = { userId: peerId, displayName: 'Zeitra Member', avatarUrl: null };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), INTERNAL_REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
                signal: controller.signal,
            });
            if (!res.ok) {
                logger.debug({ peerId, status: res.status }, 'Peer profile lookup non-OK; using fallback');
                return fallback;
            }
            const profile = (await res.json()) as { userId?: string; displayName?: string | null; avatarUrl?: string | null };
            return {
                userId: profile.userId ?? peerId,
                displayName: profile.displayName?.trim() || 'Zeitra Member',
                avatarUrl: profile.avatarUrl ?? null,
            };
        } catch (err) {
            logger.warn({ err, peerId }, 'Failed to resolve peer profile; using fallback');
            return fallback;
        } finally {
            clearTimeout(timer);
        }
    }

}
