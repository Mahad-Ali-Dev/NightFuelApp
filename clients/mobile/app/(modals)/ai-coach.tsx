import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    Platform, ActivityIndicator, Linking, Keyboard, Image,
} from 'react-native';
import Reanimated, {
    useSharedValue, useDerivedValue, useAnimatedStyle,
    withRepeat, withTiming, interpolate, Easing, runOnJS,
    FadeInDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard, CtaButton, KeyboardAvoidingWrapper } from '@/components/ui';
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

// Ria's avatar — the Zeitra app mark in a lime-ringed circle, used in the header
// identity row and on each Ria bubble (mirrors the messaging look of a real
// coach DM). Required once at module scope so Metro bundles it a single time.
const RIA_AVATAR = require('../../assets/images/logo_app.png');

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
    // Handle for the non-streaming fallback typing-effect interval (streamText).
    // Stored in a ref so it can be cleared on unmount AND at the start of a new
    // turn — otherwise the timer would survive unmount and setState after the
    // screen is gone (setState-after-unmount).
    const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // Stable adapter instance for the lifetime of the screen. getVoiceAdapter()
    // is memoised (one probe per session), but holding it in a ref means `voice`
    // is the SAME object on every render: the mic handlers below close over it,
    // and a fresh/rebuilt instance per render risked calling a method on a stale
    // adapter. `voice` is always a full VoiceAdapter, so every method the mic
    // path calls (requestPermission / startListening / stop / stopSpeaking /
    // speak / abort) is guaranteed to exist — no "undefined is not a function".
    const voiceRef = useRef(getVoiceAdapter());
    const voice = voiceRef.current;
    const sttAvailable = voice.isSTTAvailable();
    const ttsAvailable = voice.isTTSAvailable();
    // STT listening state machine (drives the mic button appearance).
    const [listenState, setListenState] = useState<VoiceListenState>(
        sttAvailable ? 'idle' : 'unavailable',
    );
    // "Ria speaks replies" toggle — OFF by default; only meaningful if TTS exists.
    const [speakReplies, setSpeakReplies] = useState(false);
    // Stable ref to sendMessage so the async voice handlers (defined before
    // sendMessage) can invoke the latest closure without a dependency cycle. The
    // initial value is a correctly-typed (text: string) => void no-op so the ref
    // is callable even if the mic fires a final transcript before the first
    // render commits sendMessage into it — calling it is a safe no-op, never a
    // crash.
    const sendMessageRef = useRef<(text: string) => void>((_text) => {});
    // Stable ref to speakReply so the mutation onSuccess (defined before
    // speakReply) can speak the completed non-streamed reply. Same callable
    // no-op default for the same reason.
    const speakRef = useRef<(text: string) => void>((_text) => {});

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

    // Abort any in-flight stream AND stop the fallback typing-effect interval
    // when the screen unmounts, so no timer survives to setState after unmount.
    useEffect(() => () => {
        streamStopRef.current?.();
        if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
        }
    }, []);

    // Keep the latest message visible when the keyboard opens. The transcript
    // resizes above the keyboard (KeyboardAvoidingWrapper) but its content size
    // doesn't change, so onContentSizeChange won't fire — scroll to the tail
    // explicitly so the newest bubble + the composer sit just above the keys.
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const sub = Keyboard.addListener(showEvt, () => {
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);
        });
        return () => sub.remove();
    }, []);

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
        // Clear any prior typing interval so a new turn never leaves two timers
        // racing (and so the ref always points at the live one).
        if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
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
                typingIntervalRef.current = null;
                setMessages(prev => prev.map(m =>
                    m.id === messageId ? { ...m, streaming: false } : m
                ));
            }
        }, TYPING_SPEED_MS);
        typingIntervalRef.current = interval;
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

    const sendMessage = useCallback((text: string) => {
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
    }, [mutation.isPending, isStreaming, quota.exhausted, voice, rateLimit, recordSend, startStream]);
    // Keep the ref pointed at the latest sendMessage so async voice handlers
    // (started before this closure, e.g. the mic's onFinal) invoke the current
    // implementation. The mic reads sendMessageRef.current INSIDE its onFinal
    // callback, so it always calls the freshest closure even though the listening
    // session was started on an earlier render.
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

    /**
     * "Add this meal" — open the existing add-meal flow when the user taps the
     * inline chip under one of Ria's meal suggestions. Routes to the SAME
     * /(meals)/log-meal surface the Nutrition hub uses for its add-meal actions,
     * so the chip plugs into the real flow (no new screen, no fabricated data).
     */
    const handleAddMeal = useCallback(() => {
        router.push('/(meals)/log-meal' as any);
    }, [router]);

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
                                <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
                            </View>
                        </GestureDetector>

                        {/* Ria identity: the Zeitra app mark in a lime-ringed circle
                            (a real-coach DM look), her name, and a lime presence row
                            "online · your coach". A live dot rides the thinking state. */}
                        <View style={styles.riaAvatarWrap}>
                            <View style={[styles.riaAvatar, { borderColor: withAlpha(colors.accent.lime, 0.55) }]}>
                                <Image source={RIA_AVATAR} style={styles.riaAvatarImg} resizeMode="cover" />
                            </View>
                            <View style={[styles.presenceDot, {
                                backgroundColor: isTyping ? colors.accent.amber : colors.accent.lime,
                                borderColor: colors.background.primary,
                            }]} />
                        </View>
                        <View style={styles.headerTitleCol}>
                            <Text
                                style={[typography.h3, { color: colors.text.primary, fontSize: 18, lineHeight: 22 }]}
                                maxFontSizeMultiplier={1.3}
                                numberOfLines={1}
                            >
                                Ria
                            </Text>
                            <View style={styles.statusBadge}>
                                <View style={[styles.statusDot, { backgroundColor: isTyping ? colors.accent.amber : colors.accent.lime }]} />
                                <Text
                                    style={[typography.caption, { color: isTyping ? colors.accent.amberLight : colors.accent.lime, fontWeight: '600', fontSize: 11, letterSpacing: 0.2 }]}
                                    maxFontSizeMultiplier={1.3}
                                    accessibilityLiveRegion="polite"
                                    numberOfLines={1}
                                >
                                    {isTyping ? 'thinking…' : 'online · your coach'}
                                </Text>
                            </View>
                        </View>

                        {/* Right slot: the "N left today" quota pill (value-dominant —
                            the count reads big, "LEFT" small) followed by the overflow
                            menu dots from the mockup. The pill is hidden until history
                            loads / outside the exhausted banner. */}
                        {showQuotaHint ? (
                            <View
                                style={[styles.quotaPill, {
                                    borderColor: withAlpha(remaining > 0 ? colors.accent.lime : colors.accent.amber, 0.5),
                                    backgroundColor: withAlpha(remaining > 0 ? colors.accent.lime : colors.accent.amber, 0.14),
                                }]}
                                accessibilityRole="text"
                                accessibilityLabel={`${remaining} AI messages left today`}
                            >
                                <Text
                                    style={[typography.statSmall, { color: remaining > 0 ? colors.accent.limeLight : colors.accent.amberLight, fontSize: 16, lineHeight: 18 }]}
                                    maxFontSizeMultiplier={1.3}
                                    numberOfLines={1}
                                >
                                    {remaining}
                                </Text>
                                <Text
                                    style={[typography.caption, { color: remaining > 0 ? withAlpha(colors.accent.limeLight, 0.85) : colors.accent.amberLight, fontWeight: '700', fontSize: 9, letterSpacing: 0.4 }]}
                                    maxFontSizeMultiplier={1.3}
                                    numberOfLines={1}
                                >
                                    LEFT
                                </Text>
                            </View>
                        ) : null}
                        <View
                            accessibilityRole="image"
                            accessibilityLabel="Conversation options"
                            style={styles.headerMenuBtn}
                        >
                            <Ionicons name="ellipsis-vertical" size={20} color={colors.text.secondary} />
                        </View>
                    </View>
                </GlassCard>
            </View>

            <KeyboardAvoidingWrapper style={{ flex: 1 }}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Date divider — a centered hairline chip, not a bare label. */}
                    <View style={styles.dateDivider}>
                        <View style={[styles.dateLine, { backgroundColor: colors.border.default }]} />
                        <Text
                            style={[typography.caption, { color: colors.text.tertiary, fontWeight: '700', fontSize: 10, letterSpacing: 1 }]}
                            maxFontSizeMultiplier={1.3}
                        >
                            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
                        </Text>
                        <View style={[styles.dateLine, { backgroundColor: colors.border.default }]} />
                    </View>

                    {historyQuery.isLoading && !hasLoaded ? (
                        <View style={styles.loadingWrap}>
                            <View style={[styles.loadingOrb, { borderColor: withAlpha(colors.accent.lime, 0.5) }, shadows.glow(colors.accent.lime)]}>
                                <Image source={RIA_AVATAR} style={styles.loadingOrbImg} resizeMode="cover" />
                            </View>
                            <ActivityIndicator color={colors.accent.limeLight} style={{ marginTop: 16 }} />
                            <Text
                                style={[typography.caption, { color: colors.text.tertiary, marginTop: 10, fontSize: 12 }]}
                                maxFontSizeMultiplier={1.3}
                            >
                                Loading your conversation…
                            </Text>
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
                        // Failure/offline state glows DANGER red (not brand lime): a
                        // failed load must not read as success-adjacent. Lime stays
                        // reserved for the upgrade/upsell card below, where it's correct.
                        <GlassCard radius={20} glow={colors.accent.red} style={styles.errorCard}>
                            <View style={styles.errorInner}>
                                <View style={[styles.errorIcon, { backgroundColor: withAlpha(colors.accent.red, 0.16) }]}>
                                    <Ionicons name="cloud-offline-outline" size={22} color={colors.accent.redLight} />
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
                        <MessageBubble key={msg.id} msg={msg} colors={colors} typography={typography} onAddMeal={handleAddMeal} />
                    ))}

                    {/* Typing indicator (hidden once live tokens are streaming) —
                        a Ria avatar disc + her dark-glass bubble carrying the dots,
                        mirroring a live "from them" message in the mockup. */}
                    {showThinkingDots && (
                        <View style={styles.thinkingRow}>
                            <View style={[styles.riaAvatarSmall, { borderColor: withAlpha(colors.accent.lime, 0.4) }]}>
                                <Image source={RIA_AVATAR} style={styles.riaAvatarSmallImg} resizeMode="cover" />
                            </View>
                            <View style={[styles.thinkingBubble, {
                                backgroundColor: colors.background.tertiary,
                                borderColor: colors.border.default,
                            }]}>
                                <TypingDots color={colors.accent.lime} />
                            </View>
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

                    {/* Welcome / empty-conversation prompts — hidden while the
                        history-load error is showing (no prompts under an error).
                        Shown when the transcript is just Ria's greeting: a "starter
                        questions" rail that doubles as the screen's empty-state CTA
                        so the chat is never a blank wall waiting for the first tap. */}
                    {messages.length <= 1 && !isTyping && !quota.exhausted && !historyError && (
                        <Reanimated.View entering={FadeInDown.delay(120).springify().damping(18)} style={styles.suggestBlock}>
                            <View style={styles.suggestHeader}>
                                <View style={[styles.suggestSparkle, {
                                    backgroundColor: withAlpha(colors.accent.lime, 0.16),
                                    borderColor: withAlpha(colors.accent.lime, 0.4),
                                }]}>
                                    <Ionicons name="sparkles" size={13} color={colors.accent.lime} />
                                </View>
                                <Text
                                    style={[typography.overline, { color: colors.text.secondary }]}
                                    maxFontSizeMultiplier={1.3}
                                >
                                    Ask me anything
                                </Text>
                            </View>
                            <View style={styles.suggestionsContainer}>
                                {DEFAULT_SUGGESTIONS.map((sug, i) => (
                                    <SuggestionChip key={sug} label={sug} index={i} colors={colors} typography={typography} onPress={() => sendMessage(sug)} />
                                ))}
                            </View>
                        </Reanimated.View>
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
                                                style={[typography.caption, { color: colors.accent.limeLight, fontWeight: '800', fontSize: 11 }]}
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
                                            backgroundColor: colors.background.secondary,
                                            // Lime focus tint both while composing AND
                                            // while listening (the whole composer reads
                                            // in the one brand accent — the mockup look).
                                            borderColor: listenState === 'listening'
                                                ? withAlpha(colors.accent.lime, 0.55)
                                                : input.trim()
                                                    ? withAlpha(colors.accent.lime, 0.5)
                                                    : colors.border.default,
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
            </KeyboardAvoidingWrapper>
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

function SuggestionChip({ label, index = 0, colors, typography, onPress }: { label: string; index?: number; colors: any; typography: any; onPress: () => void }) {
    const pressed = useSharedValue(0);
    const tap = Gesture.Tap()
        .onBegin(() => { pressed.set(withTiming(1, { duration: 90 })); })
        .onFinalize(() => { pressed.set(withTiming(0, { duration: 120 })); })
        .onEnd(() => { runOnJS(onPress)(); });
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.94]) }],
        opacity: interpolate(pressed.get(), [0, 1], [1, 0.8]),
    }));
    // Starter-prompt pills — neutral dark glass chips (mockup): a quiet surface +
    // hairline so they read as suggestions, never competing with the one lime CTA.
    return (
        <GestureDetector gesture={tap}>
            <Reanimated.View
                entering={FadeInDown.delay(160 + index * 45).springify().damping(18)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[styles.suggestionChip, {
                    borderColor: colors.border.default,
                    backgroundColor: colors.background.tertiary,
                }, animStyle]}
            >
                <Text style={[typography.bodySm, { color: colors.text.secondary, fontWeight: '600', fontSize: 12 }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>{label}</Text>
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
    // The ONE full-lime primary action on the screen (60/30/10's 10%). When
    // enabled it carries the brand lime CTA gradient with an INK glyph (never
    // white on lime); disabled it falls back to a muted glass disc.
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
                        backgroundColor: enabled ? 'transparent' : colors.background.tertiary,
                        borderWidth: 1,
                        borderColor: enabled ? withAlpha(colors.accent.coralLight, 0.6) : colors.border.default,
                    },
                    enabled ? shadows.glow(colors.accent.coral) : null,
                    animStyle,
                ]}
            >
                {enabled ? (
                    <LinearGradient
                        colors={colors.gradients.coralCta}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                ) : null}
                {busy ? (
                    <ActivityIndicator size="small" color={enabled ? colors.text.inverse : colors.text.primary} />
                ) : (
                    <Ionicons name="arrow-up" size={20} color={enabled ? colors.text.inverse : colors.text.tertiary} />
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
                        backgroundColor: active ? withAlpha(colors.accent.lime, 0.18) : colors.background.tertiary,
                        borderWidth: 1,
                        borderColor: active
                            ? withAlpha(colors.accent.lime, 0.6)
                            : colors.border.default,
                        opacity: unavailable ? 0.45 : 1,
                    },
                    active ? shadows.glow(colors.accent.lime) : null,
                    animStyle,
                ]}
            >
                <Ionicons
                    name={unavailable ? 'mic-off' : 'mic'}
                    size={20}
                    color={active ? colors.accent.limeLight : (unavailable ? colors.text.tertiary : colors.text.secondary)}
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
                    borderColor: on ? withAlpha(colors.accent.lime, 0.6) : colors.border.default,
                    backgroundColor: on ? withAlpha(colors.accent.lime, 0.16) : 'transparent',
                }, animStyle]}
            >
                <Ionicons
                    name={on ? 'volume-high' : 'volume-mute'}
                    size={14}
                    color={on ? colors.accent.limeLight : colors.text.tertiary}
                />
                <Text
                    style={[typography.caption, { color: on ? colors.accent.limeLight : colors.text.tertiary, fontWeight: '700', fontSize: 11 }]}
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
                    borderColor: withAlpha(colors.accent.lime, 0.6),
                    backgroundColor: withAlpha(colors.accent.lime, 0.14),
                }, animStyle]}
            >
                <Ionicons name="refresh" size={16} color={colors.accent.limeLight} />
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

// Clock-time matcher (hoisted — built once, never per render). Matches a 1–2
// digit hour, a colon, and a 2-digit minute as a whole token (e.g. "23:00",
// "9:41", "02:00"), with word boundaries so it never bites into a longer
// number run. Global so split() emits the matched times as their own pieces.
const TIME_RE = /\b\d{1,2}:\d{2}\b/g;

/**
 * Render one plain-text fragment with clock times (e.g. "23:00", "02:00") lifted
 * into a lime, bold <Text> so a shift-worker's protocol times pop in Ria's
 * advice (mockup parity). Pure presentation: the surrounding prose is untouched
 * and the bubble's combined a11y label still reads the RAW msg.text (so screen
 * readers hear the times in context). Returns a single string when the fragment
 * has no time (cheap, and keeps `getByText(plainText)` matching a lone Text node).
 */
function renderTimeHighlighted(text: string, keyPrefix: string, timeColor: string): React.ReactNode {
    // Fast path: no time token → return the raw string so a time-free bubble
    // still renders as ONE matchable text node (test + perf friendly).
    TIME_RE.lastIndex = 0;
    if (!TIME_RE.test(text)) return text;

    // split() with a capturing group keeps the delimiters (the times) in the
    // output array, alternating prose / time / prose / time / …
    const parts = text.split(/(\b\d{1,2}:\d{2}\b)/g);
    return parts.map((part, i) => {
        if (part === '') return null; // never render an empty string bare
        // Odd indices are the captured time tokens → lime + bold.
        const isTime = i % 2 === 1;
        return isTime ? (
            <Text key={`${keyPrefix}-tm-${i}`} style={{ color: timeColor, fontWeight: '700' }}>
                {part}
            </Text>
        ) : (
            <Text key={`${keyPrefix}-tx-${i}`}>{part}</Text>
        );
    });
}

/**
 * Map linkify() spans to nested <Text>. Plain spans render as text (with clock
 * times lifted to lime via renderTimeHighlighted); link spans render as an
 * underlined, accent-coloured <Text> with an onPress. A stable key per index
 * keeps reconciliation cheap. Falsy/empty values are never rendered bare
 * (rendering-no-falsy-and) — every value lands inside <Text>.
 *
 * `timeColor` is the lime highlight applied ONLY to plain prose; a URL is never
 * re-coloured (linkify already owns the link colour), and because time-splitting
 * runs over the already-linkified TEXT spans, a URL like "https://x.com:8080" is
 * inside a link span and so is left fully intact.
 */
function renderLinkifiedSpans(spans: LinkifySpan[], linkColor: string, timeColor: string): React.ReactNode {
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
        // Plain text span — rendered as nested <Text> (sits legally inside the
        // parent <Text>) with clock times highlighted in lime.
        return <Text key={`t-${i}`}>{renderTimeHighlighted(span.value, `t-${i}`, timeColor)}</Text>;
    });
}

// Meal-suggestion detector (hoisted). True only when a Ria reply is clearly
// recommending FOOD to eat — it must mention an eating verb/meal word AND a
// concrete food/macro signal, so generic advice ("get some morning light",
// "a reply") never trips it. Drives the inline "Add this meal" chip below the
// bubble (mockup). Pure + cheap; runs once per Ria bubble in render.
const MEAL_VERB_RE = /\b(eat|meal|snack|bowl|breakfast|lunch|dinner|pre-?(?:shift|workout)|post-?(?:shift|workout))\b/i;
const MEAL_FOOD_RE = /\b(kcal|cal(?:orie)?s?|protein|carbs?|chicken|rice|oats|eggs?|salad|shake|yog[hu]rt|banana|nuts?)\b/i;

function isMealSuggestion(text: string): boolean {
    if (!text) return false;
    return MEAL_VERB_RE.test(text) && MEAL_FOOD_RE.test(text);
}

// ── "Add this meal" action chip (inline, under a Ria meal suggestion) ─────────────
//
// A lime-tinted, ink-glyph pill that takes the user to the add-meal flow when Ria
// suggests something to eat (mockup). NOT a CtaButton/coral-gradient fill (this is
// a contextual inline affordance, not the screen's primary CTA — and the
// inline-CTA guard reserves the gradient for CtaButton); it's the screen's
// established tinted-View + GestureDetector press idiom, animating only transform
// scale + opacity (GPU-only). `onPress` is a stable callback from the parent.

function AddMealChip({ colors, typography, onPress }: { colors: any; typography: any; onPress: () => void }) {
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
        <View style={styles.addMealRow}>
            <GestureDetector gesture={tap}>
                <Reanimated.View
                    accessibilityRole="button"
                    accessibilityLabel="Add this meal"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.addMealChip, {
                        borderColor: withAlpha(colors.accent.lime, 0.5),
                        backgroundColor: withAlpha(colors.accent.lime, 0.16),
                    }, animStyle]}
                >
                    <Ionicons name="add-circle-outline" size={16} color={colors.accent.limeLight} />
                    <Text
                        style={[typography.caption, { color: colors.accent.limeLight, fontWeight: '700', fontSize: 12.5 }]}
                        maxFontSizeMultiplier={1.3}
                    >
                        Add this meal
                    </Text>
                </Reanimated.View>
            </GestureDetector>
        </View>
    );
}

const MessageBubble = React.memo(function MessageBubble({ msg, colors, typography, onAddMeal }: { msg: Message; colors: any; typography: any; onAddMeal: () => void }) {
    const isAI = msg.sender === 'ai';
    // Link colour is the brand lime on both bubbles (the mockup emphasises inline
    // detail in lime); the brighter lime reads cleanly on the dark Ria glass and
    // on the user's lime-tint surface alike.
    const linkColor = isAI ? colors.accent.lime : colors.accent.limeLight;
    // Clock-time highlight: lime ONLY in Ria's (AI) bubbles so protocol times
    // ("23:00", "02:00") pop against the dark glass (mockup). The user bubble is
    // already a lime-on-lime tint, so re-colouring its times would be invisible —
    // we pass its own text colour there (a visual no-op) to keep the prose uniform.
    const timeColor = isAI ? colors.accent.lime : colors.accent.limeLight;
    // Compute the spans once so we can both render them and detect tappable links.
    const spans = linkify(msg.text);
    const hasLinks = spans.some((s) => s.type === 'link');
    // a11y: when a bubble contains tappable link spans, we must NOT collapse the
    // row into ONE screen-reader node (`accessible`) — doing so swallows the
    // nested link <Text> roles + tap actions, so a VoiceOver/TalkBack user could
    // never activate a URL Ria sends. In that case we drop the row-level
    // `accessible`/combined label and let each <Text> (incl. the link spans) be
    // its own focusable node. With NO links we keep the tidy single-node bubble
    // with a combined "Ria/You: …" label. The polite live region (for streaming
    // replies) is applied either way.
    const rowAccessibilityProps = hasLinks
        ? {}
        : { accessible: true, accessibilityRole: 'text' as const, accessibilityLabel: `${isAI ? 'Ria' : 'You'}: ${msg.text}` };
    // Show the inline "Add this meal" chip under a SETTLED Ria bubble that is
    // clearly suggesting food (not while it's still streaming). Presentational
    // affordance only — it never alters the bubble itself or its a11y label.
    const showAddMeal = isAI && !msg.streaming && isMealSuggestion(msg.text);
    const row = (
        <Reanimated.View
            entering={FadeInDown.springify().damping(20).mass(0.6)}
            style={[
                styles.messageRow,
                isAI ? { justifyContent: 'flex-start' } : { justifyContent: 'flex-end' },
                // Drop the row's own bottom gap when the chip follows it so the chip
                // hugs the bubble (the row+chip column owns the spacing instead).
                showAddMeal ? { marginBottom: 0 } : null,
            ]}
            {...rowAccessibilityProps}
            accessibilityLiveRegion={msg.streaming ? 'polite' : 'none'}
        >
            {isAI && (
                <View style={[styles.riaAvatarSmall, { borderColor: withAlpha(colors.accent.lime, 0.4) }]}>
                    <Image source={RIA_AVATAR} style={styles.riaAvatarSmallImg} resizeMode="cover" />
                </View>
            )}
            <View style={[
                styles.messageBubble,
                isAI
                    // Ria bubble = dark glass (elevated surface + a subtle hairline),
                    // with a TIGHT bottom-left corner — the messaging-app "from them"
                    // shape in the mockup. A faint streaming dot rides the live reply.
                    ? [styles.aiBubble, {
                        backgroundColor: colors.background.tertiary,
                        borderWidth: 1,
                        borderColor: colors.border.default,
                    }]
                    // User bubble = restrained LIME tint (60/30/10: lime is the
                    // accent, used here as a low-opacity tinted glass — NOT a full
                    // lime fill, which is reserved for the one primary Send action),
                    // right-aligned with a TIGHT bottom-right corner.
                    : [styles.userBubble, {
                        backgroundColor: withAlpha(colors.accent.lime, 0.14),
                        borderWidth: 1,
                        borderColor: withAlpha(colors.accent.lime, 0.32),
                    }],
            ]}>
                <Text style={[typography.body, {
                    color: isAI ? colors.text.primary : colors.accent.limeLight,
                    fontSize: 14,
                    lineHeight: 21,
                }]}>
                    {renderLinkifiedSpans(spans, linkColor, timeColor)}
                    {msg.streaming ? <StreamingCursor color={colors.accent.lime} /> : null}
                </Text>
                <View style={[styles.bubbleMeta, { justifyContent: isAI ? 'flex-start' : 'flex-end' }]}>
                    {isAI && msg.streaming ? <StreamingCursorDot color={colors.accent.lime} /> : null}
                    <Text
                        style={[typography.caption, {
                            color: isAI ? colors.text.tertiary : withAlpha(colors.accent.limeLight, 0.7),
                            fontSize: 10,
                        }]}
                        maxFontSizeMultiplier={1.3}
                        importantForAccessibility="no"
                    >
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        </Reanimated.View>
    );

    // No chip → the bubble row is returned exactly as before (zero structural
    // change for the common case). With a chip, the row + chip share a column
    // wrapper (no a11y props on it, so the row stays the single labelled node and
    // the bubble count is unchanged).
    if (!showAddMeal) return row;
    return (
        <View style={styles.bubbleGroup}>
            {row}
            <AddMealChip colors={colors} typography={typography} onPress={onAddMeal} />
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
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    headerIconBtn: {
        width: 30,
        height: 44,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    // Overflow menu dots (mockup right-edge). Decorative parity affordance — the
    // chevron/back stays the functional navigation control.
    headerMenuBtn: {
        width: 30,
        height: 44,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    headerTitleCol: {
        marginLeft: 11,
        flex: 1,
        minWidth: 0,
    },
    riaAvatarWrap: {
        marginLeft: 4,
    },
    // The avatar is now an IMAGE disc (Zeitra app mark) with a lime hairline ring,
    // matching the messaging-app coach identity in the mockup.
    riaAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1.5,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    riaAvatarImg: {
        width: '100%',
        height: '100%',
    },
    // Live presence dot riding the avatar's corner (online / thinking).
    presenceDot: {
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: 11,
        height: 11,
        borderRadius: 6,
        borderWidth: 2,
    },
    // Per-bubble Ria avatar: the app-mark image disc with a faint lime ring,
    // sitting at the foot of each Ria bubble (messaging-app coach look).
    riaAvatarSmall: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        overflow: 'hidden',
        marginRight: 8,
        alignSelf: 'flex-end',
        marginBottom: 2,
    },
    riaAvatarSmallImg: {
        width: '100%',
        height: '100%',
    },
    // Footer row inside a bubble: timestamp (+ a streaming dot on a live Ria reply).
    bubbleMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 5,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 2,
    },
    // Small lime presence dot leading the "online · your coach" row (mockup).
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    quotaPill: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: 13,
        borderWidth: 1,
        maxWidth: 96,
    },
    // Centered date divider — hairline | LABEL | hairline.
    dateDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 22,
    },
    dateLine: {
        height: 1,
        width: 28,
        borderRadius: 1,
    },
    // First-load affordance: a glowing Ria orb over a spinner + caption.
    loadingWrap: {
        alignItems: 'center',
        paddingTop: 48,
    },
    loadingOrb: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingOrbImg: {
        width: '100%',
        height: '100%',
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 14,
    },
    messageBubble: {
        maxWidth: '80%',
        paddingHorizontal: 13,
        paddingVertical: 11,
        borderRadius: 16,
    },
    // Tight tail corners (5px) — the messaging-bubble shape from the mockup.
    aiBubble: { borderBottomLeftRadius: 5 },
    userBubble: { borderBottomRightRadius: 5 },
    // Column wrapper holding a Ria bubble row + its inline "Add this meal" chip.
    // Owns the bottom gap the row normally carries (the row drops it when chipped).
    bubbleGroup: { marginBottom: 14 },
    // Chip row sits under the bubble, indented past the Ria avatar (mockup parity).
    addMealRow: { flexDirection: 'row', paddingLeft: 34, marginTop: 7 },
    // Lime-tinted, ink-glyph pill (NOT a coral CTA fill) — inline contextual action.
    addMealChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    // "Thinking" row (no live text yet) — a Ria avatar + her dark-glass bubble
    // carrying the dots, flattened bottom-left tail corner like a real Ria bubble.
    thinkingRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 14,
    },
    thinkingBubble: {
        maxWidth: '80%',
        paddingHorizontal: 13,
        paddingVertical: 12,
        borderRadius: 16,
        borderBottomLeftRadius: 5,
        borderWidth: 1,
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
    // Welcome / empty-conversation prompt rail.
    suggestBlock: {
        marginTop: 20,
    },
    suggestHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    suggestSparkle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    suggestionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 9,
    },
    // Rounded neutral pill (mockup chip rail). Single-line label, generous tap area.
    suggestionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        minHeight: 40,
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
        overflow: 'hidden',
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
