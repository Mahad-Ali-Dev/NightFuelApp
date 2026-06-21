import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    KeyboardAvoidingView, Platform, ActivityIndicator, Linking,
} from 'react-native';
import Reanimated, {
    useSharedValue, useDerivedValue, useAnimatedStyle,
    withRepeat, withTiming, interpolate, Easing, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard, CtaButton } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRiaMessages, sendRiaMessage, type RiaMessage } from '@/api/chat';
import { streamChat } from '@/api/ai';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/api/client';
import { withAlpha } from '@/theme/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { sanitizeAiInput } from '@/lib/aiSafety';
import { linkify, type LinkifySpan } from '@/lib/linkify';
import { useRateLimit } from '@/hooks/useRateLimit';
import { captureException } from '@/lib/sentry';
import { getVoiceAdapter } from '@/lib/voice';
import { VOICE_ERROR_MESSAGES, type VoiceErrorCode, type VoiceListenState } from '@/lib/voice.types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Message {
    id: string;
    sender: 'ai' | 'user';
    text: string;
    timestamp: Date;
    streaming?: boolean;
}

/**
 * The Ria daily-AI-quota signal (SOCIAL/quota contract owned by chat-service).
 * `POST /v1/chat/ria/send` replies 429 `{ error:'ai_quota_exceeded', limit,
 * plan, resetsAt }` once the user is at/over their daily cap (counted since UTC
 * midnight: free 5 / pro 20). The success payload (RiaSendResult) carries no
 * count, so the live "N left today" indicator is derived client-side from a
 * per-day local tally reconciled to the authoritative `limit` the moment a 429
 * arrives; the exhausted state then shows the `resetsAt` window.
 */
interface QuotaState {
    /** Authoritative daily cap once known (from a 429); else the plan default. */
    limit: number;
    plan: 'free' | 'pro';
    /** Next UTC-midnight ISO reset, set from a 429 body. */
    resetsAt: string | null;
    /** True after a 429 ai_quota_exceeded until the local UTC day rolls over. */
    exhausted: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
    'Why am I tired today?',
    'Give me a quick 15-min workout',
    'How does my sleep look?',
    'What should I eat before my shift?',
];

const TYPING_SPEED_MS = 18;

// Cap how many message bubbles the ScrollView renders at once. `messages` state
// stays the full ground truth (state-ground-truth) — we only bound the RENDERED
// window so a very long conversation never mounts hundreds of bubbles and janks.
// We always keep the TAIL (the newest message is never dropped); older turns
// scroll out of the rendered window but remain in state and in the DB history.
const MAX_RENDERED_MESSAGES = 80;

// Plan → default daily Ria cap, mirroring chat-service's AI_FREE_DAILY (5) /
// AI_PRO_DAILY (20) fallbacks. Used ONLY to render the "N left today" hint
// before any 429 has taught us the authoritative `limit`; a 429 always wins.
const PLAN_DEFAULT_LIMIT: Record<QuotaState['plan'], number> = { free: 5, pro: 20 };

// ── Quota helpers (pure — unit-tested in __tests__/screens/ai-coach.quota.test.ts) ─

/** UTC day key (YYYY-MM-DD) — the boundary chat-service counts the quota against. */
export function utcDayKey(d: Date = new Date()): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Recognise the chat-service daily-quota 429 from a thrown axios error and pull
 * its typed body. Returns null for any other error so the caller falls through
 * to the generic "hit a snag" notice. Defensive about shape: only a 429 whose
 * body `error` is exactly 'ai_quota_exceeded' counts.
 */
export function parseQuotaError(error: any): { limit: number; plan: 'free' | 'pro'; resetsAt: string } | null {
    const status = error?.response?.status;
    const body = error?.response?.data;
    if (status !== 429 || !body || body.error !== 'ai_quota_exceeded') return null;
    const plan: 'free' | 'pro' = body.plan === 'pro' ? 'pro' : 'free';
    const limit = Number.isFinite(body.limit) ? Number(body.limit) : PLAN_DEFAULT_LIMIT[plan];
    const resetsAt = typeof body.resetsAt === 'string' ? body.resetsAt : '';
    return { limit, plan, resetsAt };
}

/**
 * Remaining daily Ria messages for the indicator. `limit` is the cap (plan
 * default until a 429 reconciles it); `usedToday` is the local tally of
 * user-authored sends since the current UTC day began. Never negative.
 */
export function remainingToday(limit: number, usedToday: number): number {
    return Math.max(0, limit - usedToday);
}

/**
 * A short, human reset window from a resetsAt ISO (e.g. "in 3h", "in 12m",
 * "soon"). Falls back to a generic phrase when the timestamp is missing/past.
 */
export function formatResetWindow(resetsAt: string | null, now: Date = new Date()): string {
    if (!resetsAt) return 'after midnight UTC';
    const ms = new Date(resetsAt).getTime() - now.getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 'soon';
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(mins / 60);
    return `in ${hrs}h`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AICoachScreen() {
    const { colors, typography } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);
    const queryClient = useQueryClient();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasLoaded, setHasLoaded] = useState(false);
    // True while a token-by-token stream is in flight (separate from the
    // sendRiaMessage fallback mutation's isPending).
    const [isStreaming, setIsStreaming] = useState(false);
    // Abort handle for the active stream; called on unmount / new send.
    const streamStopRef = useRef<(() => void) | null>(null);

    // Daily-quota UX state. `usedToday` is the local count of user-authored
    // sends since the tracked UTC day began; it reconciles to the authoritative
    // `limit` once a 429 arrives. Rolls over when the UTC day key changes.
    const [quota, setQuota] = useState<QuotaState>({ limit: PLAN_DEFAULT_LIMIT.free, plan: 'free', resetsAt: null, exhausted: false });
    const usedTodayRef = useRef<{ day: string; count: number }>({ day: utcDayKey(), count: 0 });
    const [usedToday, setUsedToday] = useState(0);

    /** Increment today's send tally, rolling the counter on a UTC day change. */
    const recordSend = useCallback(() => {
        const today = utcDayKey();
        if (usedTodayRef.current.day !== today) {
            usedTodayRef.current = { day: today, count: 0 };
            // A new UTC day clears any prior exhausted lock.
            setQuota((q) => (q.exhausted ? { ...q, exhausted: false } : q));
        }
        usedTodayRef.current.count += 1;
        setUsedToday(usedTodayRef.current.count);
    }, []);

    // Client-side rate limit (UX guard; chat-service enforces the real limit).
    const rateLimit = useRateLimit({ max: 10, windowMs: 60_000 });

    // ── Voice ("talk to Ria") — OPT-IN, default OFF ──────────────────────────
    //
    // The voice adapter is the ground truth for whether on-device STT/TTS exist
    // (false in Expo Go / the jest gate; true behind an EAS dev build with the
    // native packages). When unavailable the mic shows an honest disabled
    // "needs dev build" state and the text chat is completely unchanged.
    const voice = useRef(getVoiceAdapter()).current;
    const sttAvailable = voice.isSTTAvailable();
    const ttsAvailable = voice.isTTSAvailable();
    // STT listening state machine (drives the mic button appearance).
    const [listenState, setListenState] = useState<VoiceListenState>(
        sttAvailable ? 'idle' : 'unavailable',
    );
    // "Ria speaks replies" toggle — OFF by default; only meaningful if TTS exists.
    const [speakReplies, setSpeakReplies] = useState(false);
    // Stable ref to sendMessage so the async voice handlers (defined before
    // sendMessage) can invoke the latest closure without a dependency cycle.
    const sendMessageRef = useRef<(text: string) => void>(() => undefined);
    // Stable ref to speakReply so the mutation onSuccess (defined before
    // speakReply) can speak the completed non-streamed reply.
    const speakRef = useRef<(text: string) => void>(() => undefined);

    // ── Load persistent history from DB ────────────────────────────────────
    const historyQuery = useQuery({
        queryKey: ['ria-messages'],
        queryFn: () => getRiaMessages(50),
        enabled: !!user,
    });

    useEffect(() => {
        if (historyQuery.data && !hasLoaded) {
            setHasLoaded(true);
            if (historyQuery.data.length > 0) {
                const dbMsgs: Message[] = historyQuery.data.map((m: RiaMessage) => ({
                    id: m.id,
                    sender: m.sender,
                    text: m.text,
                    timestamp: new Date(m.createdAt),
                }));
                setMessages(dbMsgs);
                // Seed today's tally from history so the indicator is accurate
                // on reopen: count user-authored messages dated today (UTC).
                const today = utcDayKey();
                const sentToday = historyQuery.data.filter(
                    (m: RiaMessage) => m.sender === 'user' && utcDayKey(new Date(m.createdAt)) === today,
                ).length;
                usedTodayRef.current = { day: today, count: sentToday };
                setUsedToday(sentToday);
            } else {
                setMessages([{
                    id: 'init',
                    sender: 'ai',
                    text: `Hi ${user?.name?.split(' ')[0] || 'there'}! 👋 I'm Ria, your Zeitra AI Coach. I'm here to help you optimize your nutrition, sleep, and training around your shift schedule. What's on your mind?`,
                    timestamp: new Date(),
                }]);
            }
        }
    }, [historyQuery.data, hasLoaded, user]);

    // Abort any in-flight stream when the screen unmounts.
    useEffect(() => () => { streamStopRef.current?.(); }, []);

    // ── User status for AI context ──────────────────────────────────────────
    const { data: userStatus } = useQuery({
        queryKey: ['userStatus'],
        queryFn: async () => {
            const res = await apiClient.get('/v1/users/me/status');
            // TanStack Query forbids returning `undefined` — coalesce to null so a
            // missing/empty status payload doesn't surface a red "data cannot be
            // undefined" error toast across the app.
            return res.data?.data ?? res.data ?? null;
        },
        enabled: !!user,
    });

    // ── Streaming text effect ───────────────────────────────────────────────
    const streamText = useCallback((fullText: string, messageId: string) => {
        let idx = 0;
        const interval = setInterval(() => {
            idx += 2;
            setMessages(prev => prev.map(m =>
                m.id === messageId
                    ? { ...m, text: fullText.slice(0, idx), streaming: idx < fullText.length }
                    : m
            ));
            if (idx >= fullText.length) {
                clearInterval(interval);
                setMessages(prev => prev.map(m =>
                    m.id === messageId ? { ...m, streaming: false } : m
                ));
            }
        }, TYPING_SPEED_MS);
    }, []);

    // ── Send message mutation (non-streaming fallback path) ──────────────────
    const mutation = useMutation({
        mutationFn: (text: string) => sendRiaMessage(text, userStatus
            ? { fatigueScore: userStatus.fatigueScore, adherenceRate: userStatus.adherenceRate }
            : {}
        ),
        onError: (error: any) => {
            // Daily-quota 429 from chat-service: switch the composer into the
            // "limit reached — Upgrade" state instead of a generic snag notice.
            const q = parseQuotaError(error);
            if (q) {
                setQuota({ limit: q.limit, plan: q.plan, resetsAt: q.resetsAt, exhausted: true });
                // Reconcile the local tally to the authoritative cap so the
                // indicator reads "0 left today" immediately.
                usedTodayRef.current = { day: utcDayKey(), count: Math.max(usedTodayRef.current.count, q.limit) };
                setUsedToday(usedTodayRef.current.count);
                return;
            }
            const errText = error?.response?.data?.message ?? error?.message ?? 'Something went wrong.';
            setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                sender: 'ai',
                text: `Sorry, I hit a snag: ${errText}`,
                timestamp: new Date(),
            }]);
        },
        onSuccess: (result) => {
            const aiMsgId = `ai-stream-${Date.now()}`;
            setMessages(prev => [...prev, {
                id: aiMsgId,
                sender: 'ai',
                text: '',
                timestamp: new Date(),
                streaming: true,
            }]);
            setTimeout(() => streamText(result.reply, aiMsgId), 50);
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
            queryClient.invalidateQueries({ queryKey: ['ria-messages'] });
            // Voice: speak the completed reply if the user enabled it. We speak
            // the full reply text up front (the on-screen typing effect is purely
            // visual) so the audio isn't chopped by the per-character animation.
            speakRef.current(result.reply);
        },
    });

    /** Append a local-only AI notice (not persisted to the Ria history). */
    const pushNotice = (text: string) => {
        setMessages(prev => [...prev, {
            id: `notice-${Date.now()}`,
            sender: 'ai',
            text,
            timestamp: new Date(),
        }]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);
    };

    /**
     * Speak Ria's completed reply aloud, IF the user enabled "Ria speaks
     * replies" and TTS is available. No-op otherwise (the adapter's no-op speak
     * still calls onDone, so this is always safe to call from a stream-complete
     * handler). Called from BOTH reply-completion paths (stream onDone + the
     * non-streaming mutation onSuccess) so voice replies work on either route.
     */
    const speakReply = useCallback((text: string) => {
        if (!speakReplies || !ttsAvailable) return;
        const trimmed = text.trim();
        if (!trimmed) return;
        voice.speak(trimmed);
    }, [speakReplies, ttsAvailable, voice]);
    // Keep the ref pointed at the latest speakReply for the mutation onSuccess.
    speakRef.current = speakReply;

    /** AI context payload mirrored from the non-streaming sendRiaMessage path. */
    const buildContext = useCallback((): Record<string, unknown> => (
        userStatus
            ? { fatigueScore: userStatus.fatigueScore, adherenceRate: userStatus.adherenceRate }
            : {}
    ), [userStatus]);

    /**
     * Transparent fallback to the EXISTING non-streaming sendRiaMessage path.
     * Used whenever streamChat fails for any reason (network, parse, non-200,
     * unsupported). Removes the half-filled streaming bubble (if any) first so
     * the fallback mutation renders its own bubble exactly like today.
     */
    const runFallback = useCallback((safeText: string, streamingBubbleId: string | null) => {
        setIsStreaming(false);
        streamStopRef.current = null;
        if (streamingBubbleId) {
            setMessages(prev => prev.filter(m => m.id !== streamingBubbleId));
        }
        // mutation.onSuccess streams the full reply with the canned typing
        // effect; onError shows the snag (or flips to the quota state on 429).
        mutation.mutate(safeText);
    }, [mutation]);

    /**
     * Primary send path: stream the reply token-by-token into a live assistant
     * bubble via streamChat. On ANY stream error, fall back to sendRiaMessage
     * so behaviour never regresses.
     */
    const startStream = useCallback((safeText: string) => {
        // History = conversation so far. Map to role/content.
        const history = messages.map(m => ({
            role: m.sender === 'ai' ? 'assistant' : 'user',
            content: m.text,
        }));

        const aiMsgId = `ai-stream-${Date.now()}`;
        let gotFirstToken = false;
        let settled = false; // guard: only one of done/error/fallback wins
        // Accumulate the streamed reply locally so onDone has the FULL text
        // synchronously (reading it back out of a setState updater is unreliable).
        // Used to speak the completed reply when "Ria speaks replies" is on.
        let accumulated = '';

        // Append the empty assistant bubble.
        setMessages(prev => [...prev, {
            id: aiMsgId,
            sender: 'ai',
            text: '',
            timestamp: new Date(),
            streaming: true,
        }]);
        setIsStreaming(true);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

        const stop = streamChat(
            { userId: user?.id ?? '', message: safeText, history, context: buildContext() },
            {
                onToken: (delta) => {
                    if (settled) return;
                    if (!gotFirstToken) gotFirstToken = true;
                    accumulated += delta;
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { ...m, text: m.text + delta, streaming: true } : m
                    ));
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 30);
                },
                onDone: () => {
                    if (settled) return;
                    settled = true;
                    setIsStreaming(false);
                    streamStopRef.current = null;
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { ...m, streaming: false } : m
                    ));
                    // Reconcile with the server-persisted copy.
                    queryClient.invalidateQueries({ queryKey: ['ria-messages'] });
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 60);
                    // Voice: speak the completed reply if the user enabled it. Use
                    // the locally-accumulated text (full, synchronous) and the ref
                    // (always the latest speakReply) so a toggle change after this
                    // stream started is still honoured.
                    speakRef.current(accumulated);
                },
                onError: (_msg, partial) => {
                    if (settled) return;
                    settled = true;
                    // If we already streamed a usable reply, keep it rather than
                    // discarding the user's tokens; just finalize the bubble.
                    if (gotFirstToken && partial.trim().length > 0) {
                        setIsStreaming(false);
                        streamStopRef.current = null;
                        setMessages(prev => prev.map(m =>
                            m.id === aiMsgId ? { ...m, streaming: false } : m
                        ));
                        queryClient.invalidateQueries({ queryKey: ['ria-messages'] });
                        return;
                    }
                    // Nothing usable streamed → transparent fallback (the fallback
                    // mutation surfaces a quota 429 as the upgrade state).
                    runFallback(safeText, aiMsgId);
                },
            },
        );
        streamStopRef.current = stop;
    }, [messages, user, buildContext, queryClient, runFallback]);

    const sendMessage = (text: string) => {
        const trimmed = text.trim();
        // Block while the daily quota is exhausted, or either path is busy.
        if (!trimmed || mutation.isPending || isStreaming || quota.exhausted) return;

        // Barge-in: a new turn always silences any reply Ria is currently
        // speaking (Speech.stop via the adapter). Safe no-op when TTS is off.
        voice.stopSpeaking();

        // 1. Client-side rate limit — give immediate feedback instead of a
        //    delayed 429 from the server.
        if (!rateLimit.canCall()) {
            pushNotice(`You're sending messages quickly — give me a moment and try again in ${rateLimit.retryAfterSec}s.`);
            return;
        }

        // 2. Sanitize: strip control/invisible chars, cap length, flag injection
        //    attempts. The server is still the authoritative gate.
        const safe = sanitizeAiInput(trimmed);
        if (safe.rejected) {
            pushNotice("I didn't catch that — could you type your question again?");
            return;
        }
        if (safe.flags.length > 0) {
            // Soft signal only — never log the message text itself.
            captureException(new Error('ai_input_flagged'), { flags: safe.flags, modified: safe.modified });
        }

        rateLimit.recordCall();
        recordSend();
        setInput('');
        // Show what the user typed; send the sanitized text.
        setMessages(prev => [...prev, {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: trimmed,
            timestamp: new Date(),
        }]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);

        // Primary: token-by-token stream. Falls back to sendRiaMessage on error.
        startStream(safe.text);
    };
    // Keep the ref pointed at the latest sendMessage so async voice handlers
    // (started before this closure) invoke the current implementation.
    sendMessageRef.current = sendMessage;

    // ── Voice control handlers ───────────────────────────────────────────────

    /**
     * Tap-to-talk. First tap (idle) requests permission if needed, then starts a
     * listening session. Tapping again while listening commits the utterance
     * (stop → final). Interim transcripts stream live into the input; the final
     * transcript is sent via the existing sendMessage. All failures fall back to
     * text via an inline notice — the recogniser never throws here.
     */
    const handleMicPress = useCallback(async () => {
        if (!sttAvailable) return; // disabled "needs dev build" state — inert tap.
        if (quota.exhausted || mutation.isPending || isStreaming) return;

        // Commit if we're mid-utterance.
        if (listenState === 'listening' || listenState === 'starting') {
            voice.stop();
            return;
        }

        // Barge-in: stop any reply currently being spoken before a new turn.
        voice.stopSpeaking();
        setListenState('starting');

        const granted = await voice.requestPermission();
        if (!granted) {
            setListenState(sttAvailable ? 'idle' : 'unavailable');
            pushNotice(VOICE_ERROR_MESSAGES['not-allowed']);
            return;
        }

        voice.startListening({
            onStart: () => setListenState('listening'),
            onTranscript: (t) => {
                // Live interim transcript previewed in the composer as the user
                // speaks; the committed final is handled by onFinal.
                if (!t.isFinal) setInput(t.text);
            },
            onFinal: (finalText) => {
                setListenState('idle');
                setInput('');
                const text = finalText.trim();
                if (text) sendMessageRef.current(text);
            },
            onError: (code: VoiceErrorCode, message) => {
                setListenState('idle');
                pushNotice(message || VOICE_ERROR_MESSAGES[code]);
            },
            onEnd: () => {
                // Settle back to idle if no final/error already did (defensive).
                setListenState((s) => (s === 'listening' || s === 'starting' ? 'idle' : s));
            },
        });
    }, [sttAvailable, quota.exhausted, mutation.isPending, isStreaming, listenState, voice]);

    /** Toggle "Ria speaks replies". Turning it OFF also silences any current speech. */
    const handleToggleSpeak = useCallback(() => {
        setSpeakReplies((prev) => {
            const next = !prev;
            if (!next) voice.stopSpeaking();
            return next;
        });
    }, [voice]);

    // Stop listening + speaking when the screen unmounts.
    useEffect(() => () => { voice.abort(); voice.stopSpeaking(); }, [voice]);

    // Bounded render window — the last N bubbles only. `messages` remains the
    // full ground truth (history + the live tail); we just cap what mounts so a
    // long conversation can't render unboundedly. The newest message is always
    // inside this slice. slice() keeps the inner Message references stable.
    const renderedMessages = messages.length > MAX_RENDERED_MESSAGES
        ? messages.slice(messages.length - MAX_RENDERED_MESSAGES)
        : messages;

    const isTyping = mutation.isPending || isStreaming;
    // Only show the standalone "thinking" dots while we have no live assistant
    // text yet. Once tokens land in the streaming bubble (which has its own
    // cursor), the separate dots indicator would be redundant.
    const showThinkingDots = isTyping && !messages.some(m => m.streaming && m.text.length > 0);

    const remaining = remainingToday(quota.limit, usedToday);
    // Render the "N left today" hint once history has loaded (so the tally is
    // seeded) and we're not in the exhausted state (which shows its own banner).
    const showQuotaHint = hasLoaded && !quota.exhausted;

    // Honest history-load failure: when the persisted-history fetch errors and
    // we have NOT yet loaded a transcript, surface a retryable inline error
    // instead of a perpetual spinner (or a misleading seeded greeting). Once a
    // refetch succeeds the success effect flips `hasLoaded`, so this branch
    // self-clears. `isLoading` is false while `isError` is true, so the loading
    // affordance and this error branch are mutually exclusive.
    const historyError = historyQuery.isError && !hasLoaded;

    const sendDisabled = mutation.isPending || isStreaming || !input.trim() || quota.exhausted;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" translucent backgroundColor="transparent" />

            {/* Glass header — full-bleed GlassCard (radius 0); only the bottom
                hairline reads on-screen (side hairlines sit at the screen edge).
                The clipping View adds the explicit bottom divider. */}
            <View style={[styles.headerClip, { borderBottomColor: colors.border.light }]}>
                <GlassCard radius={0} intensity={40} tint="dark" style={styles.glassEdge}>
                    <View style={styles.header}>
                        <GestureDetector gesture={Gesture.Tap().onEnd(() => { router.back(); })}>
                            <View
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={styles.headerIconBtn}
                            >
                                <Ionicons name="close" size={28} color={colors.text.primary} />
                            </View>
                        </GestureDetector>

                        <View style={styles.headerCenter}>
                            <LinearGradient
                                colors={colors.gradients.purple}
                                style={[styles.riaAvatar, shadows.glow(colors.accent.purple)]}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name="sparkles" size={18} color={colors.text.primary} />
                            </LinearGradient>
                            <View style={{ marginLeft: 10 }}>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 17, fontWeight: '800' }]}>
                                    Coach Ria
                                </Text>
                                <View style={styles.statusBadge}>
                                    <View style={[styles.statusDot, { backgroundColor: isTyping ? colors.accent.amber : colors.accent.emerald }]} />
                                    <Text
                                        style={[typography.caption, { color: isTyping ? colors.accent.amber : colors.accent.emerald, fontWeight: 'bold', fontSize: 11 }]}
                                        maxFontSizeMultiplier={1.3}
                                    >
                                        {isTyping ? 'Thinking...' : 'AI Coach · Online'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Right slot: the "N left today" quota pill, or a spacer. */}
                        {showQuotaHint ? (
                            <View
                                style={[styles.quotaPill, {
                                    borderColor: withAlpha(remaining > 0 ? colors.accent.purpleLight : colors.accent.amber, 0.5),
                                    backgroundColor: withAlpha(remaining > 0 ? colors.accent.purple : colors.accent.amber, 0.14),
                                }]}
                                accessibilityRole="text"
                                accessibilityLabel={`${remaining} AI messages left today`}
                            >
                                <Text
                                    style={[typography.caption, { color: remaining > 0 ? colors.accent.purpleLight : colors.accent.amberLight, fontWeight: '800', fontSize: 11 }]}
                                    maxFontSizeMultiplier={1.3}
                                    numberOfLines={1}
                                >
                                    {remaining} left today
                                </Text>
                            </View>
                        ) : (
                            <View style={{ width: 40 }} />
                        )}
                    </View>
                </GlassCard>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginBottom: 24, fontWeight: 'bold' }]}>
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
                    </Text>

                    {historyQuery.isLoading && !hasLoaded ? (
                        <View style={{ alignItems: 'center', paddingTop: 40 }}>
                            <ActivityIndicator color={colors.accent.purpleLight} />
                        </View>
                    ) : null}

                    {/* Honest, retryable history-load error — replaces the spinner
                        when the fetch FAILS so the screen never spins forever (and
                        never shows the seeded greeting on a failed load). Retry
                        refires the SAME ['ria-messages'] query via refetch(); a
                        success then flips hasLoaded and this branch disappears.
                        Ternary-null, never `&&`, so an empty/0 value can't render
                        bare (rendering-no-falsy-and). */}
                    {historyError ? (
                        <GlassCard radius={20} glow={colors.accent.coral} style={styles.errorCard}>
                            <View style={styles.errorInner}>
                                <View style={[styles.errorIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.16) }]}>
                                    <Ionicons name="cloud-offline-outline" size={22} color={colors.accent.coralLight} />
                                </View>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' }]}>
                                    Couldn't load your conversation
                                </Text>
                                <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 6, lineHeight: 20 }]} maxFontSizeMultiplier={1.4}>
                                    Check your connection and try again.
                                </Text>
                                <RetryButton colors={colors} typography={typography} onPress={() => historyQuery.refetch()} />
                            </View>
                        </GlassCard>
                    ) : null}

                    {/* Bounded render window: only the last MAX_RENDERED_MESSAGES
                        bubbles mount, but `messages` keeps the full transcript so
                        the newest turn is ALWAYS shown. slice() makes a new array
                        whose inner Message refs are unchanged, so React's keyed
                        reconciliation still skips unchanged bubbles. */}
                    {renderedMessages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} colors={colors} typography={typography} />
                    ))}

                    {/* Typing indicator (hidden once live tokens are streaming) */}
                    {showThinkingDots && (
                        <View style={[styles.thinkingBubble, {
                            backgroundColor: colors.background.quaternary,
                            borderColor: withAlpha(colors.accent.purple, 0.35),
                        }, shadows.glow(colors.accent.purple), { shadowOpacity: 0.18 }]}>
                            <View style={styles.aiHeader}>
                                <Text style={[typography.caption, { color: colors.accent.purpleLight, fontWeight: 'bold', fontSize: 10, letterSpacing: 0.5 }]} maxFontSizeMultiplier={1.3}>RIA</Text>
                            </View>
                            <TypingDots color={colors.accent.purpleLight} />
                        </View>
                    )}

                    {/* Daily-limit reached → clean upgrade state (CtaButton). */}
                    {quota.exhausted && (
                        <GlassCard radius={20} glow={colors.accent.coral} style={styles.upgradeCard}>
                            <View style={styles.upgradeInner}>
                                <View style={[styles.upgradeIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.16) }]}>
                                    <Ionicons name="flash" size={22} color={colors.accent.coralLight} />
                                </View>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' }]}>
                                    Daily AI limit reached
                                </Text>
                                <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 6, lineHeight: 20 }]} maxFontSizeMultiplier={1.4}>
                                    You've used all {quota.limit} of today's {quota.plan === 'pro' ? 'Pro ' : ''}Ria messages. Resets {formatResetWindow(quota.resetsAt)}.
                                </Text>
                                <CtaButton
                                    label="Upgrade for more"
                                    icon="rocket"
                                    size="md"
                                    onPress={() => router.push('/(modals)/premium')}
                                    accessibilityLabel="Upgrade for more AI messages"
                                    style={styles.upgradeCta}
                                />
                            </View>
                        </GlassCard>
                    )}

                    {/* Quick Suggestions — hidden while the history-load error is
                        showing (no empty-conversation prompts under an error). */}
                    {messages.length <= 2 && !isTyping && !quota.exhausted && !historyError && (
                        <View style={{ marginTop: 24 }}>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 12, fontWeight: 'bold', letterSpacing: 0.5 }]}>
                                QUICK QUESTIONS
                            </Text>
                            <View style={styles.suggestionsContainer}>
                                {DEFAULT_SUGGESTIONS.map((sug) => (
                                    <SuggestionChip key={sug} label={sug} colors={colors} typography={typography} onPress={() => sendMessage(sug)} />
                                ))}
                            </View>
                        </View>
                    )}
                </ScrollView>

                {/* Glass input bar — full-bleed GlassCard (radius 0); only the top
                    hairline reads on-screen. The clipping View owns the top
                    divider + the bottom safe-area pad. Pinned to the keyboard. */}
                <View style={[styles.inputClip, {
                    borderTopColor: colors.border.light,
                    paddingBottom: Math.max(insets.bottom, 16),
                }]}>
                    <GlassCard radius={0} intensity={40} tint="dark" style={styles.glassEdge}>
                        {quota.exhausted ? (
                            // Composer locked: a single clear upgrade CTA replaces the
                            // input row so it's obvious why sending is unavailable.
                            <View style={styles.lockedComposer}>
                                <CtaButton
                                    label="Daily AI limit reached — Upgrade"
                                    icon="lock-open"
                                    size="md"
                                    onPress={() => router.push('/(modals)/premium')}
                                    accessibilityLabel="Daily AI limit reached. Upgrade for more messages."
                                    style={{ flex: 1 }}
                                />
                            </View>
                        ) : (
                            <>
                                {/* Voice opt-in bar: a "Ria speaks replies" (TTS)
                                    toggle. Voice is OFF by default and the text
                                    chat below is unchanged when it's unused. When
                                    neither engine exists (Expo Go / no dev build)
                                    we show an honest "needs dev build" hint and no
                                    toggle, so we never imply a feature we can't run. */}
                                {(sttAvailable || ttsAvailable) ? (
                                    <View style={styles.voiceBar}>
                                        {ttsAvailable ? (
                                            <SpeakToggle
                                                on={speakReplies}
                                                colors={colors}
                                                typography={typography}
                                                onPress={handleToggleSpeak}
                                            />
                                        ) : <View />}
                                        {listenState === 'listening' ? (
                                            <Text
                                                style={[typography.caption, { color: colors.accent.purpleLight, fontWeight: '800', fontSize: 11 }]}
                                                maxFontSizeMultiplier={1.3}
                                                accessibilityLiveRegion="polite"
                                            >
                                                Listening…
                                            </Text>
                                        ) : null}
                                    </View>
                                ) : (
                                    <View style={styles.voiceBar}>
                                        <Text
                                            style={[typography.caption, { color: colors.text.tertiary, fontSize: 11 }]}
                                            maxFontSizeMultiplier={1.3}
                                            accessibilityRole="text"
                                        >
                                            Voice needs a dev build
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.inputArea}>
                                    {/* Mic (tap-to-talk). Disabled/honest when STT is
                                        unavailable; active/glowing while listening. */}
                                    <MicButton
                                        state={sttAvailable ? listenState : 'unavailable'}
                                        disabled={!sttAvailable || isTyping}
                                        colors={colors}
                                        onPress={handleMicPress}
                                    />

                                    <TextInput
                                        style={[styles.textInput, {
                                            color: colors.text.primary,
                                            backgroundColor: colors.background.tertiary,
                                            borderColor: input.trim() ? withAlpha(colors.accent.purple, 0.5) : colors.border.default,
                                        }]}
                                        placeholder={listenState === 'listening' ? 'Listening… speak to Ria' : 'Ask Ria about your shift protocol...'}
                                        placeholderTextColor={colors.text.tertiary}
                                        value={input}
                                        onChangeText={setInput}
                                        multiline
                                        maxLength={500}
                                        returnKeyType="send"
                                        blurOnSubmit={false}
                                        editable={!isTyping}
                                    />

                                    <SendButton
                                        enabled={!sendDisabled}
                                        busy={isTyping}
                                        colors={colors}
                                        onPress={() => sendMessage(input)}
                                    />
                                </View>
                            </>
                        )}
                    </GlassCard>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Typing dots (glowing, reanimated) ───────────────────────────────────────────
//
// One shared clock (`progress`, the ground truth: a 0→1 loop per
// state-ground-truth) drives all three dots; each DERIVES its opacity + glow
// scale from the clock plus a phase offset via useDerivedValue
// (animation-derived-value). We read/write the shared value with .get()/.set()
// (react-compiler-reanimated-shared-values) and animate only opacity + transform
// scale (animation-gpu-properties) — never layout props.

function TypingDots({ color }: { color: string }) {
    const progress = useSharedValue(0);
    useEffect(() => {
        progress.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false));
    }, [progress]);
    return (
        <View style={styles.dotsRow} importantForAccessibility="no">
            <TypingDot progress={progress} phase={0} color={color} />
            <TypingDot progress={progress} phase={0.33} color={color} />
            <TypingDot progress={progress} phase={0.66} color={color} />
        </View>
    );
}

function TypingDot({ progress, phase, color }: { progress: ReturnType<typeof useSharedValue<number>>; phase: number; color: string }) {
    // Triangle wave 0→1→0 across the cycle, offset by the dot's phase.
    const wave = useDerivedValue(() => {
        const t = (progress.get() + phase) % 1;
        return interpolate(t, [0, 0.5, 1], [0, 1, 0]);
    });
    const dotStyle = useAnimatedStyle(() => ({
        // Opacity 0.35 → 1 (visible at rest, full at peak) + a gentle 1 → 1.35
        // scale so the dot "glows"/pulses (GPU-only: opacity + transform).
        opacity: interpolate(wave.get(), [0, 1], [0.35, 1]),
        transform: [{ scale: interpolate(wave.get(), [0, 1], [1, 1.35]) }],
    }));
    return (
        <Reanimated.View style={[styles.typingDot, { backgroundColor: color }, shadows.glow(color), dotStyle]} />
    );
}

// ── Suggestion chip (animated press, gesture-driven) ─────────────────────────────
//
// Press feedback via GestureDetector + a shared press state (0/1) derived to a
// scale (animation-gesture-detector-press). runOnJS bridges the tap to onPress.

function SuggestionChip({ label, colors, typography, onPress }: { label: string; colors: any; typography: any; onPress: () => void }) {
    const pressed = useSharedValue(0);
    const tap = Gesture.Tap()
        .onBegin(() => { pressed.set(withTiming(1, { duration: 90 })); })
        .onFinalize(() => { pressed.set(withTiming(0, { duration: 120 })); })
        .onEnd(() => { runOnJS(onPress)(); });
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.96]) }],
        opacity: interpolate(pressed.get(), [0, 1], [1, 0.85]),
    }));
    return (
        <GestureDetector gesture={tap}>
            <Reanimated.View
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[styles.suggestionChip, {
                    borderColor: withAlpha(colors.accent.purpleLight, 0.55),
                    backgroundColor: withAlpha(colors.accent.purple, 0.14),
                }, animStyle]}
            >
                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '700' }]} maxFontSizeMultiplier={1.3}>{label}</Text>
            </Reanimated.View>
        </GestureDetector>
    );
}

// ── Send button (animated press + clear enabled/disabled state) ──────────────────

function SendButton({ enabled, busy, colors, onPress }: { enabled: boolean; busy: boolean; colors: any; onPress: () => void }) {
    const pressed = useSharedValue(0);
    const tap = Gesture.Tap()
        .enabled(enabled)
        .onBegin(() => { pressed.set(withTiming(1, { duration: 80 })); })
        .onFinalize(() => { pressed.set(withTiming(0, { duration: 120 })); })
        .onEnd(() => { runOnJS(onPress)(); });
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.92]) }],
    }));
    return (
        <GestureDetector gesture={tap}>
            <Reanimated.View
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !enabled }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[
                    styles.sendBtn,
                    {
                        backgroundColor: enabled ? colors.accent.purple : colors.background.tertiary,
                        borderWidth: 1,
                        borderColor: enabled ? withAlpha(colors.accent.purpleLight, 0.6) : colors.border.default,
                    },
                    enabled ? shadows.glow(colors.accent.purple) : null,
                    animStyle,
                ]}
            >
                {busy ? (
                    <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                    <Ionicons name="arrow-up" size={20} color={enabled ? colors.text.primary : colors.text.tertiary} />
                )}
            </Reanimated.View>
        </GestureDetector>
    );
}

// ── Mic button (tap-to-talk; honest disabled / active states) ────────────────────
//
// Tap-to-talk control next to the composer. It DERIVES its appearance from the
// voice state machine (the adapter's ground truth, surfaced as `state`):
//   - 'unavailable' → muted "mic-off" glyph, non-pressable, a11y "needs dev build".
//   - 'idle'        → outlined mic, pressable (starts listening).
//   - 'starting' / 'listening' → filled + glowing mic; pressing commits (stop).
// Press feedback uses the screen's GestureDetector + shared-value idiom; only a
// disabled/active tap is gated (the gesture is .enabled(!disabled)).

function MicButton({ state, disabled, colors, onPress }: { state: VoiceListenState; disabled: boolean; colors: any; onPress: () => void }) {
    const pressed = useSharedValue(0);
    const active = state === 'listening' || state === 'starting';
    const unavailable = state === 'unavailable';
    const tap = Gesture.Tap()
        .enabled(!disabled)
        .onBegin(() => { pressed.set(withTiming(1, { duration: 80 })); })
        .onFinalize(() => { pressed.set(withTiming(0, { duration: 120 })); })
        .onEnd(() => { runOnJS(onPress)(); });
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.92]) }],
    }));
    const label = unavailable
        ? 'Voice input unavailable — needs a dev build'
        : active
            ? 'Stop listening and send'
            : 'Talk to Ria';
    return (
        <GestureDetector gesture={tap}>
            <Reanimated.View
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled, busy: active }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="mic-button"
                style={[
                    styles.micBtn,
                    {
                        backgroundColor: active ? colors.accent.purple : colors.background.tertiary,
                        borderWidth: 1,
                        borderColor: active
                            ? withAlpha(colors.accent.purpleLight, 0.6)
                            : colors.border.default,
                        opacity: unavailable ? 0.45 : 1,
                    },
                    active ? shadows.glow(colors.accent.purple) : null,
                    animStyle,
                ]}
            >
                <Ionicons
                    name={unavailable ? 'mic-off' : 'mic'}
                    size={20}
                    color={active ? colors.text.primary : (unavailable ? colors.text.tertiary : colors.accent.purpleLight)}
                />
            </Reanimated.View>
        </GestureDetector>
    );
}

// ── "Ria speaks replies" toggle (TTS opt-in) ─────────────────────────────────────
//
// A small bordered pill that flips the speak-replies preference. OFF by default;
// only rendered when TTS is available. Press idiom matches the rest of the screen.

function SpeakToggle({ on, colors, typography, onPress }: { on: boolean; colors: any; typography: any; onPress: () => void }) {
    const pressed = useSharedValue(0);
    const tap = Gesture.Tap()
        .onBegin(() => { pressed.set(withTiming(1, { duration: 90 })); })
        .onFinalize(() => { pressed.set(withTiming(0, { duration: 120 })); })
        .onEnd(() => { runOnJS(onPress)(); });
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.96]) }],
        opacity: interpolate(pressed.get(), [0, 1], [1, 0.85]),
    }));
    return (
        <GestureDetector gesture={tap}>
            <Reanimated.View
                accessibilityRole="switch"
                accessibilityLabel="Ria speaks replies"
                accessibilityState={{ checked: on }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="speak-toggle"
                style={[styles.speakToggle, {
                    borderColor: on ? withAlpha(colors.accent.purpleLight, 0.6) : colors.border.default,
                    backgroundColor: on ? withAlpha(colors.accent.purple, 0.16) : 'transparent',
                }, animStyle]}
            >
                <Ionicons
                    name={on ? 'volume-high' : 'volume-mute'}
                    size={14}
                    color={on ? colors.accent.purpleLight : colors.text.tertiary}
                />
                <Text
                    style={[typography.caption, { color: on ? colors.accent.purpleLight : colors.text.tertiary, fontWeight: '700', fontSize: 11 }]}
                    maxFontSizeMultiplier={1.3}
                >
                    Ria speaks replies
                </Text>
            </Reanimated.View>
        </GestureDetector>
    );
}

// ── Retry button (bordered, animated press — history-load error state) ───────────
//
// A bordered, icon+label pill that re-fires the history fetch. Deliberately NOT a
// coral CtaButton fill — this is a recoverable inline error, not the screen's
// primary CTA (the only CtaButton on this screen is the quota→Upgrade action), and
// the inline-CTA guard reserves the coral gradient for CtaButton. Press feedback
// uses GestureDetector + a Reanimated shared value (the screen's press idiom; no
// legacy Touchable — ui-pressable), animating only transform scale + opacity
// (GPU-only). `onPress` is passed once from the parent (a stable refetch closure),
// so no per-render callback is created (list-performance-callbacks).

function RetryButton({ colors, typography, onPress }: { colors: any; typography: any; onPress: () => void }) {
    const pressed = useSharedValue(0);
    const tap = Gesture.Tap()
        .onBegin(() => { pressed.set(withTiming(1, { duration: 90 })); })
        .onFinalize(() => { pressed.set(withTiming(0, { duration: 120 })); })
        .onEnd(() => { runOnJS(onPress)(); });
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.96]) }],
        opacity: interpolate(pressed.get(), [0, 1], [1, 0.85]),
    }));
    return (
        <GestureDetector gesture={tap}>
            <Reanimated.View
                accessibilityRole="button"
                accessibilityLabel="Retry loading your conversation"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.retryBtn, {
                    borderColor: withAlpha(colors.accent.purpleLight, 0.6),
                    backgroundColor: withAlpha(colors.accent.purple, 0.14),
                }, animStyle]}
            >
                <Ionicons name="refresh" size={16} color={colors.accent.purpleLight} />
                <Text style={[typography.body, { color: colors.text.primary, fontWeight: '800', fontSize: 14 }]} maxFontSizeMultiplier={1.3}>
                    Retry
                </Text>
            </Reanimated.View>
        </GestureDetector>
    );
}

// ── Message Bubble ────────────────────────────────────────────────────────────
//
// Bubble text is run through linkify() so real URLs become tappable. The spans
// are rendered as NESTED <Text> inside the bubble's parent <Text>
// (rendering-text-in-text-component) — a link span gets an onPress that opens
// the URL. The span→element mapper is a STABLE module-scope function (no
// per-row closure created in render — list-performance-callbacks); it takes the
// link colour as an argument so it stays hoisted while still theming correctly.

/** Open a tapped link's href. Hoisted so it isn't recreated per span/row. */
function openLink(href: string): void {
    // Linking.openURL can reject (e.g. no handler / malformed); never throw into
    // render. We don't surface a toast here — an inert tap is acceptable UX.
    Linking.openURL(href).catch(() => undefined);
}

/**
 * Map linkify() spans to nested <Text>. Plain spans render as text; link spans
 * render as an underlined, accent-coloured <Text> with an onPress. A stable
 * key per index keeps reconciliation cheap. Falsy/empty values are never
 * rendered bare (rendering-no-falsy-and) — every value lands inside <Text>.
 */
function renderLinkifiedSpans(spans: LinkifySpan[], linkColor: string): React.ReactNode {
    return spans.map((span, i) => {
        if (span.type === 'link') {
            return (
                <Text
                    key={`l-${i}`}
                    style={{ color: linkColor, textDecorationLine: 'underline', fontWeight: '700' }}
                    onPress={() => openLink(span.href)}
                    accessibilityRole="link"
                >
                    {span.value}
                </Text>
            );
        }
        // Plain text span — rendered as a nested <Text> so it sits legally inside
        // the parent <Text> alongside any link spans.
        return <Text key={`t-${i}`}>{span.value}</Text>;
    });
}

const MessageBubble = React.memo(function MessageBubble({ msg, colors, typography }: { msg: Message; colors: any; typography: any }) {
    const isAI = msg.sender === 'ai';
    return (
        <View
            style={[
                styles.messageRow,
                isAI ? { justifyContent: 'flex-start' } : { justifyContent: 'flex-end' },
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${isAI ? 'Ria' : 'You'}: ${msg.text}`}
            accessibilityLiveRegion={msg.streaming ? 'polite' : 'none'}
        >
            {isAI && (
                <LinearGradient
                    colors={colors.gradients.purple}
                    style={[styles.riaAvatarSmall, shadows.glow(colors.accent.purple), { shadowOpacity: 0.25 }]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                    <Ionicons name="sparkles" size={12} color={colors.text.primary} />
                </LinearGradient>
            )}
            <View style={[
                styles.messageBubble,
                isAI
                    ? [styles.aiBubble, {
                        // Higher-contrast Ria bubble: elevated fill + a brighter
                        // purple glass hairline + a soft purple glow.
                        backgroundColor: colors.background.quaternary,
                        borderWidth: 1,
                        borderColor: withAlpha(colors.accent.purple, 0.38),
                    }, shadows.glow(colors.accent.purple), { shadowOpacity: 0.18 }]
                    : [styles.userBubble, { backgroundColor: colors.accent.purple }, shadows.glow(colors.accent.purple), { shadowOpacity: 0.22 }],
            ]}>
                {isAI && (
                    <View style={styles.aiHeader}>
                        <Text style={[typography.caption, { color: colors.accent.purpleLight, fontWeight: 'bold', fontSize: 10, letterSpacing: 0.5 }]} maxFontSizeMultiplier={1.3}>RIA</Text>
                        {msg.streaming && <StreamingCursorDot color={colors.accent.purpleLight} />}
                    </View>
                )}
                <Text style={[typography.body, {
                    color: colors.text.primary,
                    lineHeight: 22,
                }]}>
                    {renderLinkifiedSpans(linkify(msg.text), colors.accent.purpleLight)}
                    {msg.streaming ? <StreamingCursor color={colors.accent.purpleLight} /> : null}
                </Text>
                <Text
                    style={[typography.caption, {
                        color: isAI ? colors.text.tertiary : withAlpha(colors.text.primary, 0.75),
                        fontSize: 10,
                        marginTop: 6,
                        textAlign: isAI ? 'left' : 'right',
                    }]}
                    maxFontSizeMultiplier={1.3}
                    importantForAccessibility="no"
                >
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        </View>
    );
});

// ── Streaming-cursor pulse (reanimated) ──────────────────────────────────────────
//
// A subtle blinking "▌" caret + a small header dot that pulse while tokens are
// streaming. Both DERIVE opacity from one shared clock (animation-derived-value),
// use .get()/.set() (react-compiler-reanimated-shared-values), and animate only
// opacity (+ a tiny scale on the dot) — GPU props only (animation-gpu-properties).

function useBlinkClock() {
    const clock = useSharedValue(0);
    useEffect(() => {
        clock.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true));
    }, [clock]);
    return clock;
}

function StreamingCursor({ color }: { color: string }) {
    const clock = useBlinkClock();
    const style = useAnimatedStyle(() => ({ opacity: interpolate(clock.get(), [0, 1], [0.2, 1]) }));
    return (
        <Reanimated.Text style={[{ color, fontWeight: '700' }, style]} importantForAccessibility="no">▌</Reanimated.Text>
    );
}

function StreamingCursorDot({ color }: { color: string }) {
    const clock = useBlinkClock();
    const style = useAnimatedStyle(() => ({
        opacity: interpolate(clock.get(), [0, 1], [0.3, 1]),
        transform: [{ scale: interpolate(clock.get(), [0, 1], [0.85, 1.15]) }],
    }));
    return (
        <Reanimated.View style={[styles.streamingDot, { backgroundColor: color }, shadows.glow(color), style]} importantForAccessibility="no" />
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    // Clipping wrapper for the frosted header: owns the bottom hairline + radius
    // clipping so the full-bleed GlassCard frosts only the bottom edge.
    headerClip: {
        overflow: 'hidden',
        borderBottomWidth: 1,
    },
    // The GlassCard wrapper, when full-bleed at radius 0, would still draw its own
    // hairline on all sides; we zero its border so only the clipping View's
    // explicit top/bottom divider shows (no doubled hairline).
    glassEdge: {
        borderWidth: 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerIconBtn: {
        width: 40,
        height: 44,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    riaAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    riaAvatarSmall: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        alignSelf: 'flex-end',
        marginBottom: 4,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    quotaPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        maxWidth: 96,
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 14,
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 14,
        borderRadius: 18,
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 6,
    },
    aiBubble: { borderBottomLeftRadius: 4 },
    userBubble: { borderBottomRightRadius: 4 },
    // Standalone "thinking" bubble (no live text yet) — mirrors a Ria AI bubble:
    // elevated fill, brighter purple glass hairline, flattened tail corner.
    thinkingBubble: {
        alignSelf: 'flex-start',
        maxWidth: '80%',
        padding: 14,
        borderRadius: 18,
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        marginBottom: 14,
    },
    streamingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 6,
        paddingVertical: 4,
        alignItems: 'center',
    },
    typingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    suggestionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    suggestionChip: {
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 20,
        borderWidth: 1,
        minHeight: 44,
        justifyContent: 'center',
    },
    // Upgrade card shown inline in the scroll when the daily quota is exhausted.
    upgradeCard: {
        marginTop: 8,
        marginBottom: 8,
    },
    upgradeInner: {
        padding: 20,
        alignItems: 'center',
    },
    upgradeIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    upgradeCta: {
        marginTop: 16,
        alignSelf: 'stretch',
    },
    // Inline history-load error card (mirrors the upgrade card's footprint) shown
    // in the scroll when the persisted-history fetch fails.
    errorCard: {
        marginTop: 8,
        marginBottom: 8,
    },
    errorInner: {
        padding: 20,
        alignItems: 'center',
    },
    errorIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Bordered Retry pill (NOT a coral CTA fill) — keeps the 44pt touch target.
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        minHeight: 44,
        paddingHorizontal: 22,
        borderRadius: 14,
        borderWidth: 1,
    },
    // Clipping wrapper for the frosted input bar: owns the top hairline + the
    // bottom safe-area pad; the full-bleed GlassCard (inside) owns the frost.
    inputClip: {
        overflow: 'hidden',
        borderTopWidth: 1,
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 12,
        gap: 10,
    },
    lockedComposer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingTop: 12,
    },
    textInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        fontFamily: themeTypography.body.fontFamily,
        fontSize: 15,
        borderWidth: 1,
        marginBottom: 6,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    // Voice opt-in bar above the composer: the "Ria speaks replies" toggle (and
    // a "Listening…" hint / "needs dev build" honest fallback).
    voiceBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 10,
        minHeight: 28,
    },
    // Mic button — same 44pt touch target as the send button.
    micBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    speakToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        borderWidth: 1,
        minHeight: 32,
    },
});
