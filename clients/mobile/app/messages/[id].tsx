import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Platform, ActivityIndicator, Keyboard } from 'react-native';
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing, FadeInDown, FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getMessages,
    startConversation,
    getConversations,
    getChatRequests,
    acceptChatRequest,
    declineChatRequest,
    markRead,
    createSocketConnection,
    sendMessage,
    emitTyping,
    type ChatMessage,
    type RequestState,
    type NotificationNewPayload,
} from '@/api/chat';
import type { Socket } from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Skeleton, EmptyState, GlassCard, CtaButton, Avatar, KeyboardAvoidingWrapper } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { ChatBubble, type ChatBubbleStatus } from '@/components/chat/ChatBubble';
import { useAuth } from '@/hooks/useAuth';
import { withAlpha } from '@/theme/utils';

// A transcript row as held in the React-Query cache. Extends the server
// ChatMessage with the client-only optimistic fields. The list is the single
// ground truth (per react-state-minimize / state-ground-truth) — optimistic
// sends are UPSERTED here and reconciled by id, never tracked in parallel state.
interface UIMessage extends ChatMessage {
    /** Own-bubble delivery state. Absent for peer rows. */
    status?: ChatBubbleStatus;
    /** True while this row is a not-yet-acked optimistic local bubble. */
    optimistic?: boolean;
}

// A flattened render row for the transcript FlatList. The cache list of
// UIMessages is projected (in one memo) into a stream of these so the list can
// interleave day separators with bubbles WITHOUT mutating the ground-truth
// cache: a 'sep' row is purely presentational, a 'msg' row carries the message
// plus the two run-position flags the redesign needs (avatar only on the last
// bubble of a peer run; tighter spacing within a run).
type Row =
    | { kind: 'sep'; id: string; label: string }
    | { kind: 'msg'; id: string; message: UIMessage; isMe: boolean; showAvatar: boolean; runStart: boolean };

const TYPING_IDLE_MS = 1500; // fire typing_stop after this much keyboard silence

/**
 * Format a bubble's createdAt to a short local time, hoisted to module scope so
 * it isn't re-created per render (js-hoist-intl). GUARDED: a missing or malformed
 * ISO string yields '' (never 'Invalid Date'), so a bad row degrades to a blank
 * timestamp rather than leaking the literal string into the bubble.
 */
const formatBubbleTime = (iso: string): string => {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * A human day-separator label for a bubble's calendar day — "Today" / "Yesterday"
 * / a localized date. Module-scope + guarded for the same reasons as
 * formatBubbleTime: a bad ISO degrades to '' so the separator simply doesn't render.
 */
const formatDayLabel = (iso: string): string => {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dayMs = 86_400_000;
    const diff = Math.round((startOf(today) - startOf(d)) / dayMs);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

/** Stable calendar-day key (YYYY-MM-DD in local time) for grouping bubbles. */
const dayKey = (iso: string): string => {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * BUG #2: resolve a HUMAN sender name for a message — never the raw senderId.
 * Preference order:
 *   1. own row                         → 'You'
 *   2. backend-resolved m.senderName   → use it verbatim
 *   3. sender is the known peer (by id), or no senderId at all → the peer's name
 *   4. last resort                     → 'Coach Ria' (the default coach thread)
 * Resilient by construction: an absent senderName degrades to the peer name, and
 * an unknown sender never leaks its id into the UI. Hoisted to module scope (no
 * per-render allocation) and pure, so renderMessage can depend on primitives only.
 */
function resolveSenderName(
    m: { senderId?: string; senderName?: string },
    isMe: boolean,
    peerUserId?: string,
    peerName?: string,
): string {
    if (isMe) return 'You';
    if (m.senderName && m.senderName.trim().length > 0) return m.senderName;
    // The sender is the conversation peer (matched by id, or there's no id to
    // distinguish in a 1:1) → use the peer's resolved display name.
    if (!m.senderId || !peerUserId || m.senderId === peerUserId) {
        return peerName ?? 'Coach Ria';
    }
    // A different, unresolved sender (e.g. a future group thread): fall back to the
    // peer/coach name rather than ever showing the opaque senderId.
    return peerName ?? 'Coach Ria';
}

export default function UnifiedChatScreen() {
    const { colors, typography, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { id: targetId } = useLocalSearchParams<{ id: string }>(); // user ID or conversation ID
    const router = useRouter();
    const queryClient = useQueryClient();
    const flatListRef = useRef<FlatList<Row>>(null);
    const { user } = useAuth();
    const myUserId = user?.id;

    const [inputText, setInputText] = useState('');
    const [socket, setSocket] = useState<Socket | null>(null);
    // Whether the realtime socket is actually CONNECTED (not just created). Drives
    // adaptive polling: live socket → poll slowly (safety net); socket down → poll
    // fast. Starts false so we fail-safe to fast polling if it never confirms.
    const [socketLive, setSocketLive] = useState(false);
    const [peerTyping, setPeerTyping] = useState(false);
    // Whether I (locally) accepted a pending request this session — lets the
    // composer unlock instantly on Accept without waiting for a refetch round-trip.
    const [locallyAccepted, setLocallyAccepted] = useState(false);

    // Idle timer for debounced typing_stop, and a flag for whether we've already
    // emitted typing_start (so we don't spam a frame on every keystroke). Refs —
    // these are imperative timers, not render inputs (react-state-minimize).
    const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typingActiveRef = useRef(false);
    const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 1. Resolve or start the conversation with the target.
    const { data: conversation, isLoading: startingConv, isError: convError, refetch: refetchConv } = useQuery({
        queryKey: ['conversation', targetId],
        queryFn: () => startConversation(targetId as string),
    });

    const conversationId = conversation?.id;

    // 2. Load messages for the resolved conversation.
    const { data: messages, isLoading: loadingMessages, isError: messagesError, refetch: refetchMessages } = useQuery<UIMessage[]>({
        queryKey: ['messages', conversationId],
        queryFn: () => getMessages(conversationId!) as Promise<UIMessage[]>,
        enabled: !!conversationId,
        // Real-time fallback: poll the open thread + refetch on focus so new (peer)
        // messages arrive even when the WebSocket can't connect. Adaptive — when the
        // socket IS live it delivers messages instantly, so we drop to a 15s safety
        // net instead of hammering the API every 4s.
        refetchInterval: socketLive ? 15000 : 4000,
        refetchOnWindowFocus: true,
    });

    // 3. Conversation metadata (peer + requestState). GET conversations returns
    // requestState + the peer {userId, displayName, avatarUrl} per the SOCIAL API
    // CONTRACT; we pluck this conversation's entry. Light staleTime so it doesn't
    // refetch on every focus while the chat is open.
    const { data: conversations } = useQuery({
        queryKey: ['conversations'],
        queryFn: getConversations,
        staleTime: 60 * 1000,
    });

    // 4. Incoming pending requests — if THIS conversation is here, I am the
    // recipient (and should see the Accept/Decline banner).
    const { data: incomingRequests } = useQuery({
        queryKey: ['chat-requests'],
        queryFn: getChatRequests,
        staleTime: 60 * 1000,
    });

    const meta = useMemo(
        () => conversations?.find((c) => c.id === conversationId),
        [conversations, conversationId],
    );
    const peer = meta?.peer;
    const peerUserId = peer?.userId ?? (targetId as string | undefined);
    // Stable peer-name primitive — used both for the speaker-qualified bubble a11y
    // label and the typing-indicator live-region label, so renderMessage can depend
    // on a string (not the `peer` object identity).
    const peerName = peer?.displayName;
    const peerAvatarUrl = peer?.avatarUrl ?? undefined;
    const requestState: RequestState = meta?.requestState ?? 'accepted';

    const isRecipientOfRequest = useMemo(
        () => !!conversationId && !!incomingRequests?.some((r) => r.id === conversationId),
        [incomingRequests, conversationId],
    );

    // Derived (not stored): a pending request blocks the composer when I'm the
    // requester (after my single message) or when I'm the recipient who hasn't
    // accepted yet. Accept flips `locallyAccepted` for an instant unlock.
    const isPendingRequest = requestState === 'pending' && !locallyAccepted;
    const isRequester = isPendingRequest && !isRecipientOfRequest;
    const isRecipientPending = isPendingRequest && isRecipientOfRequest;
    // Requester may send EXACTLY ONE message: once any of my messages exist, lock.
    const requesterHasSent = useMemo(
        () => isRequester && !!messages?.some((m) => (m.isOwn ?? m.senderId === myUserId)),
        [isRequester, messages, myUserId],
    );
    const composerDisabled = isRecipientPending || requesterHasSent;

    // ── Cache helpers — UPSERT, never refetch (state-ground-truth) ────────────
    const upsertMessage = useCallback(
        (incoming: UIMessage) => {
            if (!conversationId) return;
            queryClient.setQueryData<UIMessage[]>(['messages', conversationId], (old) => {
                const list = old ?? [];
                const idx = list.findIndex((m) => m.id === incoming.id);
                if (idx === -1) return [...list, incoming];
                // De-dupe by id: merge so a server row keeps any optimistic status
                // we don't want to clobber unless the incoming row supplies one.
                const next = list.slice();
                next[idx] = { ...list[idx], ...incoming };
                return next;
            });
        },
        [conversationId, queryClient],
    );

    // Replace a temp optimistic row (tmpId) with the server row, flipping status.
    const reconcileSent = useCallback(
        (tmpId: string, serverMsg: ChatMessage) => {
            if (!conversationId) return;
            queryClient.setQueryData<UIMessage[]>(['messages', conversationId], (old) => {
                const list = old ?? [];
                // If the server row already arrived by id, drop the temp twin.
                const withoutTmp = list.filter((m) => m.id !== tmpId);
                const idx = withoutTmp.findIndex((m) => m.id === serverMsg.id);
                const reconciled: UIMessage = { ...serverMsg, isOwn: true, status: 'sent', optimistic: false };
                if (idx === -1) return [...withoutTmp, reconciled];
                const next = withoutTmp.slice();
                next[idx] = { ...withoutTmp[idx], ...reconciled };
                return next;
            });
        },
        [conversationId, queryClient],
    );

    const markFailed = useCallback(
        (tmpId: string) => {
            if (!conversationId) return;
            queryClient.setQueryData<UIMessage[]>(['messages', conversationId], (old) =>
                (old ?? []).map((m) => (m.id === tmpId ? { ...m, status: 'failed' as const } : m)),
            );
        },
        [conversationId, queryClient],
    );

    // Flip own bubbles to 'read' when the peer reads the conversation.
    const applyReadReceipt = useCallback(() => {
        if (!conversationId) return;
        queryClient.setQueryData<UIMessage[]>(['messages', conversationId], (old) =>
            (old ?? []).map((m) =>
                (m.isOwn ?? m.senderId === myUserId) && (m.status === 'sent' || m.status === 'sending')
                    ? { ...m, status: 'read' as const }
                    : m,
            ),
        );
    }, [conversationId, queryClient, myUserId]);

    // ── Socket.IO realtime handling ───────────────────────────────────────────
    useEffect(() => {
        let activeSocket: Socket | null = null;
        let cancelled = false;
        if (conversationId) {
            createSocketConnection()
                .then((s: Socket) => {
                    if (cancelled) { s.disconnect(); return; }
                    activeSocket = s;
                    setSocket(s);
                    // Track live connection for adaptive polling (see socketLive).
                    // 'connect'/'disconnect' are reserved socket.io events; if the
                    // decorated socket never emits them, socketLive stays false and
                    // we keep fast-polling — safe either way.
                    setSocketLive(!!(s as any).connected);
                    s.on('connect', () => setSocketLive(true));
                    s.on('disconnect', () => setSocketLive(false));

                    // new_message: a server row. OWN-message acks are reconciled by
                    // the per-send one-shot handler in doSend (temp → real id), so
                    // here we only UPSERT incoming PEER rows, de-duped by id — NO
                    // full-list refetch/invalidate. (A duplicate frame for the same
                    // id is harmless: upsert merges in place.)
                    s.on('newMessage', (msg: ChatMessage) => {
                        if (!msg || msg.conversationId !== conversationId) return;
                        if (msg.senderId === myUserId) return; // own ack handled by doSend
                        upsertMessage({ ...msg, isOwn: false, optimistic: false });
                        requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
                        // BUG #2: an incoming direct message must surface as an Unread
                        // signal app-wide. socket.io-client (notification-service's
                        // transport) is stubbed in this app, so the chat WS frame is the
                        // concrete "incoming DM" event — refresh the persisted
                        // notifications (drives the unread badge) and the inbox
                        // conversations (per-thread unread dot). Best-effort; non-fatal.
                        queryClient.invalidateQueries({ queryKey: ['notifications'] });
                        queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    });

                    // BUG #2: also listen on the notification:new channel directly, in
                    // case the backend forwards notification-service frames over this
                    // socket. We only react to chat-message notifications (or those
                    // targeting THIS conversation) and just refresh the Unread state —
                    // resilient to a missing/partial payload.
                    s.on('notification:new', (n: NotificationNewPayload) => {
                        const convId = n?.data?.conversationId;
                        if (convId && convId !== conversationId) {
                            // A notification for a DIFFERENT conversation still bumps the
                            // global unread badge, but not this thread's inbox row focus.
                            queryClient.invalidateQueries({ queryKey: ['notifications'] });
                            return;
                        }
                        queryClient.invalidateQueries({ queryKey: ['notifications'] });
                        queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    });

                    s.on('typing_start', (payload: { conversationId?: string; senderId?: string }) => {
                        if (payload?.conversationId && payload.conversationId !== conversationId) return;
                        if (payload?.senderId && payload.senderId === myUserId) return; // ignore self
                        setPeerTyping(true);
                        // Safety auto-clear in case a stop frame is dropped.
                        if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
                        peerTypingTimerRef.current = setTimeout(() => setPeerTyping(false), TYPING_IDLE_MS * 3);
                    });

                    s.on('typing_stop', (payload: { conversationId?: string; senderId?: string }) => {
                        if (payload?.conversationId && payload.conversationId !== conversationId) return;
                        setPeerTyping(false);
                    });

                    s.on('message_read', (payload: { conversationId?: string }) => {
                        if (payload?.conversationId && payload.conversationId !== conversationId) return;
                        applyReadReceipt();
                    });
                })
                .catch(console.error);
        }

        return () => {
            cancelled = true;
            setSocketLive(false);
            if (activeSocket) activeSocket.disconnect();
            if (peerTypingTimerRef.current) { clearTimeout(peerTypingTimerRef.current); peerTypingTimerRef.current = null; }
        };
    }, [conversationId, myUserId, upsertMessage, applyReadReceipt, queryClient]);

    // ── Mark read on open / when new peer messages land ───────────────────────
    // Best-effort: tells the backend (and, via broadcast, the peer) we've read up
    // to here. We only POST when the LATEST peer message id changes (tracked in a
    // ref) so an own-message upsert — which mutates `messages` — doesn't re-fire
    // a redundant read. Fire-and-forget; a failure is non-fatal.
    const lastReadPeerIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!conversationId || isPendingRequest || !messages?.length) return;
        let latestPeerId: string | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m && !(m.isOwn ?? m.senderId === myUserId)) { latestPeerId = m.id; break; }
        }
        if (latestPeerId && latestPeerId !== lastReadPeerIdRef.current) {
            lastReadPeerIdRef.current = latestPeerId;
            markRead(conversationId).catch(() => { /* non-fatal */ });
        }
    }, [conversationId, messages, myUserId, isPendingRequest]);

    // ── Typing emit (debounced) ───────────────────────────────────────────────
    const stopTyping = useCallback(() => {
        if (typingActiveRef.current && socket && conversationId) {
            emitTyping(socket, conversationId, false);
        }
        typingActiveRef.current = false;
        if (typingIdleRef.current) { clearTimeout(typingIdleRef.current); typingIdleRef.current = null; }
    }, [socket, conversationId]);

    const handleChangeText = useCallback(
        (text: string) => {
            setInputText(text);
            if (!socket || !conversationId || composerDisabled) return;
            if (text.length === 0) { stopTyping(); return; }
            if (!typingActiveRef.current) {
                typingActiveRef.current = true;
                emitTyping(socket, conversationId, true);
            }
            // Restart the idle countdown — typing_stop fires after silence.
            if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
            typingIdleRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
        },
        [socket, conversationId, composerDisabled, stopTyping],
    );

    // Clear timers on unmount.
    useEffect(() => () => { if (typingIdleRef.current) clearTimeout(typingIdleRef.current); }, []);

    // Keep the newest bubble visible when the keyboard opens. The transcript
    // resizes above the keyboard (KeyboardAvoidingWrapper), but that does NOT
    // change the list's content size, so onContentSizeChange won't fire — pin the
    // tail to the keyboard frame explicitly so the latest message + the composer
    // sit just above the keys instead of scrolling out of view.
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const sub = Keyboard.addListener(showEvt, () => {
            requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
        });
        return () => sub.remove();
    }, []);

    // ── Send (optimistic) ─────────────────────────────────────────────────────
    const doSend = useCallback(
        (text: string) => {
            if (!conversationId) return;
            const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const optimistic: UIMessage = {
                id: tmpId,
                conversationId,
                senderId: myUserId ?? 'me',
                text,
                createdAt: new Date().toISOString(),
                isOwn: true,
                status: 'sending',
                optimistic: true,
            };
            upsertMessage(optimistic);
            requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));

            // Send over REST — reliable whether or not the WebSocket connected (it
            // usually doesn't through the dev gateway). The 201 returns the saved
            // row, which reconciles the optimistic bubble {tmpId,'sending'} →
            // {realId,'sent'}. The socket, when live, just delivers the PEER's
            // messages in real time; we no longer wait on a WS ack for our own send
            // (which falsely marked every message 'failed' when the socket was down).
            sendMessage(conversationId, text)
                .then((saved) => { reconcileSent(tmpId, saved as ChatMessage); })
                .catch(() => { markFailed(tmpId); });
        },
        [conversationId, myUserId, upsertMessage, reconcileSent, markFailed],
    );

    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text || !conversationId || composerDisabled) return;
        setInputText('');
        stopTyping();
        doSend(text);
    }, [inputText, conversationId, composerDisabled, stopTyping, doSend]);

    const handleRetry = useCallback(
        (id: string) => {
            const list = queryClient.getQueryData<UIMessage[]>(['messages', conversationId ?? '']);
            const failed = list?.find((m) => m.id === id);
            if (!failed) return;
            // Drop the failed row and resend its text as a fresh optimistic bubble.
            queryClient.setQueryData<UIMessage[]>(['messages', conversationId ?? ''], (old) =>
                (old ?? []).filter((m) => m.id !== id),
            );
            doSend(failed.text);
        },
        [conversationId, queryClient, doSend],
    );

    // ── Request accept / decline ──────────────────────────────────────────────
    const handleAccept = useCallback(async () => {
        if (!conversationId) return;
        setLocallyAccepted(true); // instant composer unlock
        try {
            await acceptChatRequest(conversationId);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['chat-requests'] });
        } catch (err: any) {
            setLocallyAccepted(false); // roll back the optimistic unlock
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not accept the request');
        }
    }, [conversationId, queryClient]);

    const handleDecline = useCallback(async () => {
        if (!conversationId) return;
        try {
            await declineChatRequest(conversationId);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['chat-requests'] });
            router.back();
        } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not decline the request');
        }
    }, [conversationId, queryClient, router]);

    const openPeerProfile = useCallback(() => {
        if (!peerUserId) return;
        router.push(`/(community)/userProfile?userId=${peerUserId}` as any);
    }, [router, peerUserId]);

    // ── Project the cache list → render rows (day separators + run flags) ──────
    // Single memo: walk the ground-truth message list once and emit a 'sep' row
    // at each calendar-day boundary, then a 'msg' row per message carrying the two
    // presentational flags the redesign reads. The cache is never mutated; this is
    // a pure projection recomputed only when `messages`/`myUserId` change.
    const rows = useMemo<Row[]>(() => {
        const list = messages ?? [];
        const out: Row[] = [];
        let prevDay = '';
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (!m) continue;
            const isMe = m.isOwn ?? m.senderId === myUserId;
            const dk = dayKey(m.createdAt);
            if (dk && dk !== prevDay) {
                const label = formatDayLabel(m.createdAt);
                if (label) out.push({ kind: 'sep', id: `sep-${dk}-${m.id}`, label });
                prevDay = dk;
            }
            const prev = list[i - 1];
            const next = list[i + 1];
            const prevIsMe = prev ? (prev.isOwn ?? prev.senderId === myUserId) : null;
            const nextIsMe = next ? (next.isOwn ?? next.senderId === myUserId) : null;
            const prevSameDay = prev ? dayKey(prev.createdAt) === dk : false;
            const nextSameDay = next ? dayKey(next.createdAt) === dk : false;
            // First bubble of a same-speaker run (within the day) gets extra top gap.
            const runStart = !prev || prevIsMe !== isMe || !prevSameDay;
            // Peer avatar shows only on the LAST bubble of a peer run — anchors the
            // run to its author without repeating the avatar on every line.
            const runEnd = !next || nextIsMe !== isMe || !nextSameDay;
            const showAvatar = !isMe && runEnd;
            out.push({ kind: 'msg', id: m.id, message: m, isMe, showAvatar, runStart });
        }
        return out;
    }, [messages, myUserId]);

    // ── List render (hoisted; stable refs — list-performance-* skills) ─────────
    const renderMessage = useCallback(
        ({ item }: { item: Row }) => {
            if (item.kind === 'sep') {
                return <DaySeparator label={item.label} />;
            }
            const m = item.message;
            const isMe = item.isMe;
            const timeStamp = formatBubbleTime(m.createdAt);
            // BUG #2: resolve a human sender name — NEVER a raw senderId. Order of
            // preference: 'You' for own rows → the backend-resolved m.senderName →
            // the conversation peer's name (when the sender is the known peer or the
            // sender id is absent) → a neutral 'Coach Ria' fallback. This keeps the
            // label correct for a real peer (not always 'Coach Ria') and never leaks
            // an opaque id even if senderName is missing.
            const resolvedSenderName = resolveSenderName(m, isMe, peerUserId, peerName);
            // Speaker-qualified label so a screen reader can tell 'You' from the
            // peer — passed as a single primitive so the memoized bubble's stable-ref
            // contract holds (list-performance-inline-objects).
            const speaker = isMe ? 'You' : resolvedSenderName;
            // Show a per-bubble sender name on PEER rows only when the message carries
            // its own resolved name that differs from the conversation peer header
            // (e.g. a future group/multi-sender thread) — in a 1:1 the header already
            // names the peer, so we don't repeat it on every bubble.
            const bubbleSenderName =
                !isMe && m.senderName && m.senderName !== peerName ? m.senderName : undefined;
            const bubble = (
                <ChatBubble
                    id={m.id}
                    text={m.text}
                    isOwn={isMe}
                    timestamp={timeStamp}
                    senderName={bubbleSenderName}
                    status={isMe ? m.status : undefined}
                    onRetry={handleRetry}
                    accessibilityLabel={`${speaker}: ${m.text}`}
                />
            );
            // Own bubbles right-align on their own. Peer bubbles get an avatar
            // gutter (filled only on the last bubble of the run) so the thread
            // reads like a real conversation — people are AVATARS, not bare text.
            if (isMe) {
                return <View style={item.runStart ? styles.runStart : undefined}>{bubble}</View>;
            }
            return (
                <View style={[styles.peerLine, item.runStart && styles.runStart]}>
                    <View style={styles.avatarGutter}>
                        {item.showAvatar ? (
                            <Avatar uri={peerAvatarUrl} name={peerName} size={28} />
                        ) : null}
                    </View>
                    <View style={styles.peerBubbleWrap}>{bubble}</View>
                </View>
            );
        },
        [peerName, peerUserId, peerAvatarUrl, handleRetry],
    );

    const keyExtractor = useCallback((item: Row) => item.id, []);

    const isLoading = startingConv || loadingMessages;
    const isError = convError || messagesError;
    const displayName = peerName ?? 'Chat';
    // The peer's spoken name for the typing live-region (Coach Ria in the AI thread).
    const typingSpeaker = peerName ?? 'Coach Ria';

    return (
        <KeyboardAvoidingWrapper style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header — tappable peer (avatar + name) → userProfile */}
            <Animated.View entering={FadeInDown.duration(360)} style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </PressableScale>
                <PressableScale
                    style={styles.headerCenter}
                    disabled={!peerUserId}
                    accessibilityRole="button"
                    accessibilityLabel={peer?.displayName ? `View ${peer.displayName}'s profile` : 'Conversation'}
                    onPress={openPeerProfile}
                >
                    <View>
                        <Avatar uri={peer?.avatarUrl ?? undefined} name={peer?.displayName} size={40} borderColor={colors.border.default} />
                        {/* Presence pip — lime, matching the "online" status + the DM mockup. */}
                        {!isLoading && !peerTyping ? (
                            <View style={[styles.presencePip, { backgroundColor: colors.accent.coral, borderColor: colors.background.primary }, shadows.glow(colors.accent.coral)]} />
                        ) : null}
                    </View>
                    <View style={styles.headerText}>
                        <Text style={[typography.subtitle, { color: colors.text.primary }]} numberOfLines={1}>{displayName}</Text>
                        {isLoading ? (
                            <ActivityIndicator size="small" color={colors.accent.purple} style={styles.headerSpinner} />
                        ) : peerTyping ? (
                            <Text
                                // Peer is Coach Ria — typing uses the AI/coach hue (purple),
                                // not lime. Lime stays reserved for the one Send CTA; the
                                // header's accent is the cyan presence pip.
                                style={[typography.caption, { color: colors.accent.purpleLight }]}
                                accessibilityLiveRegion="polite"
                                accessibilityLabel={`${typingSpeaker} is typing`}
                            >
                                typing…
                            </Text>
                        ) : (
                            // Online status — a lime presence dot + label, matching the
                            // DM mockup (lime is the brand presence accent here).
                            <View style={styles.statusRow}>
                                <View style={[styles.statusDot, { backgroundColor: colors.accent.coral }]} />
                                <Text style={[typography.caption, { color: colors.accent.coral }]}>online</Text>
                            </View>
                        )}
                    </View>
                </PressableScale>
                {/* Call affordance — opens the peer's profile (no in-app calling),
                    so the icon stays functional and never dead-ends. */}
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={peer?.displayName ? `View ${peer.displayName}'s profile` : 'View profile'}
                    activeOpacity={0.85}
                    disabled={!peerUserId}
                    onPress={openPeerProfile}
                    style={styles.headerCallBtn}
                >
                    <Ionicons name="call-outline" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
            </Animated.View>

            {/* Request banner (recipient) — Accept / Decline in a GlassCard */}
            {isRecipientPending && !isLoading ? (
                <Animated.View entering={FadeInDown.duration(360).delay(60)}>
                    <GlassCard style={styles.banner} radius={20}>
                        <View style={styles.bannerInner}>
                            <View style={styles.bannerHead}>
                                {/* Gating/caution moment → amber, not lime. Lime stays exclusively on the Accept CTA below. */}
                                <View style={[styles.bannerIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.12), borderColor: withAlpha(colors.accent.amber, 0.24) }]}>
                                    <Ionicons name="hand-left-outline" size={18} color={colors.accent.amber} />
                                </View>
                                <View style={styles.bannerHeadText}>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>Message request</Text>
                                    <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]}>
                                        {peer?.displayName ? `${peer.displayName} wants to chat with you.` : 'Someone wants to chat with you.'} Accept to reply.
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.bannerActions}>
                                <PressableScale
                                    onPress={handleDecline}
                                    accessibilityRole="button"
                                    accessibilityLabel="Decline request"
                                    style={[styles.declineBtn, { borderColor: colors.border.light }]}
                                >
                                    <Text style={[typography.bodySm, { color: colors.text.secondary, fontWeight: '700' }]}>Decline</Text>
                                </PressableScale>
                                <CtaButton label="Accept" icon="checkmark" size="sm" onPress={handleAccept} accessibilityLabel="Accept request" style={styles.acceptBtn} />
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>
            ) : null}

            {/* Messages */}
            {isLoading ? (
                <View style={styles.skeletonList}>
                    <MessageBubbleSkeleton align="left" width="62%" />
                    <MessageBubbleSkeleton align="right" width="48%" />
                    <MessageBubbleSkeleton align="left" width="70%" />
                    <MessageBubbleSkeleton align="right" width="55%" />
                    <MessageBubbleSkeleton align="left" width="40%" />
                </View>
            ) : isError ? (
                <EmptyState
                    style={styles.flex1}
                    icon="cloud-offline-outline"
                    title="Couldn't load this chat"
                    subtitle="Something went wrong loading the conversation. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => (convError ? refetchConv() : refetchMessages())}
                />
            ) : !messages || messages.length === 0 ? (
                <Animated.View entering={FadeIn.duration(400)} style={styles.flex1}>
                    <EmptyState
                        style={styles.flex1}
                        icon="chatbubbles-outline"
                        title={isRecipientPending ? 'Reply to start chatting' : peerName ? `Say hi to ${peerName}` : 'No messages yet'}
                        subtitle={isRecipientPending ? 'Accept the request above to start chatting.' : 'Break the ice — your first message starts the conversation.'}
                    />
                </Animated.View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={rows}
                    renderItem={renderMessage}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.listContent}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    initialNumToRender={12}
                    maxToRenderPerBatch={10}
                    windowSize={11}
                    removeClippedSubviews={Platform.OS === 'android'}
                    ListFooterComponent={peerTyping ? <TypingRow speaker={typingSpeaker} avatarUrl={peerAvatarUrl} name={peerName} /> : null}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            )}

            {/* Requester locked notice */}
            {requesterHasSent ? (
                <View style={[styles.lockNotice, { borderTopColor: colors.border.default, backgroundColor: colors.background.primary, paddingBottom: insets.bottom + 12 }]}>
                    <View style={[styles.lockIcon, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="lock-closed-outline" size={15} color={colors.text.tertiary} />
                    </View>
                    <Text style={[typography.caption, { color: colors.text.tertiary, flex: 1 }]}>
                        Request sent — they must accept to continue.
                    </Text>
                </View>
            ) : (
                /* Input Bar */
                (() => {
                    // Single source of truth for the Send affordance — the SAME guard
                    // handleSend enforces (empty/whitespace-only input OR a locked
                    // composer). Derived here so the `disabled` prop, the glow, the
                    // fill ternary, AND the honest accessibilityState/label can never
                    // drift apart. `!sendDisabled` is the exact De Morgan twin of the
                    // prior `inputText.trim() && !composerDisabled`, so the rendered
                    // behaviour is unchanged.
                    const sendDisabled = !inputText.trim() || composerDisabled;
                    return (
                        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                            {/* Leading "+" — a decorative composer affordance from the
                                mockup. No attachment feature exists yet, so it is
                                non-interactive and hidden from assistive tech rather
                                than promising an action it can't fulfil. */}
                            <View style={styles.inputPlus} importantForAccessibility="no" accessibilityElementsHidden>
                                <Ionicons name="add" size={26} color={colors.text.tertiary} />
                            </View>
                            <View style={[styles.inputFieldWrap, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                <TextInput
                                    // Composer joins the Barlow type system (typography.body)
                                    // so the field matches the message bubbles (15/22).
                                    style={[typography.body, styles.textInput, { color: colors.text.primary }]}
                                    placeholder={isRecipientPending ? 'Accept the request to reply…' : 'Message…'}
                                    placeholderTextColor={colors.text.tertiary}
                                    value={inputText}
                                    onChangeText={handleChangeText}
                                    onSubmitEditing={handleSend}
                                    editable={!composerDisabled}
                                    returnKeyType="send"
                                    multiline
                                    maxLength={4000}
                                />
                            </View>
                            <TouchableOpacity
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                // Honest label + state: a screen reader announces the
                                // disabled affordance, and the label tells WHY there's
                                // nothing to send yet (mirrors the hardened Ria composer).
                                accessibilityLabel={sendDisabled ? 'Send message, disabled' : 'Send message'}
                                accessibilityState={{ disabled: sendDisabled }}
                                onPress={handleSend}
                                style={[styles.sendBtn, sendDisabled ? undefined : shadows.glow(colors.accent.coral)]}
                                disabled={sendDisabled}
                                activeOpacity={0.85}
                            >
                                {sendDisabled ? (
                                    <View style={[styles.sendBtnInner, { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default }]}>
                                        <Ionicons name="arrow-up" size={20} color={colors.text.tertiary} />
                                    </View>
                                ) : (
                                    <LinearGradient
                                        // The one lime CTA on this screen uses the SAME darker
                                        // coralCta fill as Button/CtaButton/ChatBubble app-wide
                                        // (not the brighter hero coral) for byte-identical contrast.
                                        colors={colors.gradients.coralCta}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.sendBtnInner}
                                    >
                                        <Ionicons name="arrow-up" size={20} color={colors.text.inverse} />
                                    </LinearGradient>
                                )}
                            </TouchableOpacity>
                        </View>
                    );
                })()
            )}
        </KeyboardAvoidingWrapper>
    );
}

/**
 * DaySeparator — a centered, low-emphasis date pill marking a calendar-day
 * boundary in the transcript ("Today" / "Yesterday" / a date). Purely
 * presentational; the label is computed in the row projection. Hairline rules
 * flank the pill so it reads as a divider without shouting.
 */
function DaySeparator({ label }: { label: string }) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.daySep} accessibilityRole="text" accessibilityLabel={label}>
            <View style={[styles.dayRule, { backgroundColor: colors.border.default }]} />
            <View style={[styles.dayPill, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>{label}</Text>
            </View>
            <View style={[styles.dayRule, { backgroundColor: colors.border.default }]} />
        </View>
    );
}

/**
 * TypingRow — the lightweight "peer is typing" indicator (three pulsing dots).
 * The animation is driven by ONE shared value (`progress`, the ground truth: a
 * 0→1 looping clock per state-ground-truth) and each dot DERIVES its opacity via
 * useDerivedValue with a phase offset (animation-derived-value). We read/write
 * the shared value with .get()/.set() for React-Compiler compatibility
 * (react-compiler-reanimated-shared-values).
 *
 * Lives in a POLITE live region with a descriptive label so a screen reader
 * announces "<speaker> is typing" without yanking focus — the three dots alone
 * are purely decorative and would otherwise be silent. The peer avatar sits in
 * the same gutter as a peer bubble so the indicator aligns with the thread.
 */
function TypingRow({ speaker = 'Coach Ria', avatarUrl, name }: { speaker?: string; avatarUrl?: string; name?: string }) {
    const { colors } = useTheme();
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false));
    }, [progress]);

    return (
        <View
            style={styles.peerLine}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${speaker} is typing`}
        >
            <View style={styles.avatarGutter}>
                <Avatar uri={avatarUrl} name={name} size={28} />
            </View>
            <Animated.View entering={FadeIn.duration(200)} style={[styles.typingBubble, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                <TypingDot progress={progress} phase={0} color={colors.text.secondary} />
                <TypingDot progress={progress} phase={0.33} color={colors.text.secondary} />
                <TypingDot progress={progress} phase={0.66} color={colors.text.secondary} />
            </Animated.View>
        </View>
    );
}

function TypingDot({ progress, phase, color }: { progress: ReturnType<typeof useSharedValue<number>>; phase: number; color: string }) {
    // Each dot's opacity is DERIVED from the shared clock + its phase offset.
    const opacity = useDerivedValue(() => {
        const t = (progress.get() + phase) % 1;
        // Triangle wave 0.3 → 1 → 0.3 across the cycle.
        return interpolate(t, [0, 0.5, 1], [0.3, 1, 0.3]);
    });
    const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
    return <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle]} />;
}

function MessageBubbleSkeleton({ align, width }: { align: 'left' | 'right'; width: number | string }) {
    return (
        <View style={[styles.row, align === 'right' ? styles.ownRow : styles.otherRow]}>
            <Skeleton width={width as any} height={48} radius={22} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex1: { flex: 1 },
    skeletonList: { flex: 1, padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 68, borderBottomWidth: 1, gap: 12 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerCallBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerText: { flex: 1 },
    headerSpinner: { alignSelf: 'flex-start', marginTop: 2 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    presencePip: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
    listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    row: { marginBottom: 16 },
    ownRow: { alignItems: 'flex-end' },
    otherRow: { alignItems: 'flex-start' },
    runStart: { marginTop: 6 },
    // A peer line: avatar gutter + the bubble. The ChatBubble keeps its own row
    // alignment; we wrap it so the avatar anchors the bottom of a peer run.
    peerLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    avatarGutter: { width: 28, alignSelf: 'flex-end', marginBottom: 16 },
    peerBubbleWrap: { flex: 1 },
    // Day separator: centered pill flanked by hairline rules.
    daySep: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 14, paddingHorizontal: 4 },
    dayRule: { flex: 1, height: StyleSheet.hairlineWidth },
    dayPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    banner: { marginHorizontal: 16, marginTop: 12 },
    bannerInner: { padding: 16 },
    bannerHead: { flexDirection: 'row', gap: 12 },
    bannerIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    bannerHeadText: { flex: 1 },
    bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    declineBtn: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    acceptBtn: { flex: 1 },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, gap: 8 },
    inputPlus: { width: 36, height: 48, alignItems: 'center', justifyContent: 'center' },
    inputFieldWrap: { flex: 1, borderRadius: 24, borderWidth: 1, paddingHorizontal: 6, justifyContent: 'center', minHeight: 48, maxHeight: 132 },
    // fontSize/lineHeight come from typography.body (applied inline) so the field matches the bubbles.
    textInput: { paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8 },
    sendBtn: { width: 48, height: 48, borderRadius: 24 },
    sendBtnInner: { flex: 1, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    lockNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 14, borderTopWidth: 1 },
    lockIcon: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 22, borderWidth: 1, borderBottomLeftRadius: 8, marginBottom: 16 },
    typingDot: { width: 7, height: 7, borderRadius: 4 },
});
