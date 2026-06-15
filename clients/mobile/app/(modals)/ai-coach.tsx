import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    TouchableOpacity, KeyboardAvoidingView, Platform,
    ActivityIndicator, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRiaMessages, sendRiaMessage, type RiaMessage } from '@/api/chat';
import { streamChat } from '@/api/ai';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/api/client';
import { withAlpha } from '@/theme/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { sanitizeAiInput } from '@/lib/aiSafety';
import { useRateLimit } from '@/hooks/useRateLimit';
import { captureException } from '@/lib/sentry';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Message {
    id: string;
    sender: 'ai' | 'user';
    text: string;
    timestamp: Date;
    streaming?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
    'Why am I tired today?',
    'Give me a quick 15-min workout',
    'How does my sleep look?',
    'What should I eat before my shift?',
];

const TYPING_SPEED_MS = 18;

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AICoachScreen() {
    const { colors, typography, spacing } = useTheme();
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

    // Client-side rate limit (UX guard; ai-pipeline enforces the real limit).
    const rateLimit = useRateLimit({ max: 10, windowMs: 60_000 });

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
            } else {
                setMessages([{
                    id: 'init',
                    sender: 'ai',
                    text: `Hi ${user?.name?.split(' ')[0] || 'there'}! 👋 I'm Ria, your NightFuel AI Coach. I'm here to help you optimize your nutrition, sleep, and training around your shift schedule. What's on your mind?`,
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

    // ── Animated dots for typing indicator ─────────────────────────────────
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    const startDotAnimation = useCallback(() => {
        const pulse = (dot: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
                ])
            );
        Animated.parallel([pulse(dot1, 0), pulse(dot2, 200), pulse(dot3, 400)]).start();
    }, [dot1, dot2, dot3]);

    const stopDotAnimation = useCallback(() => {
        dot1.stopAnimation(); dot2.stopAnimation(); dot3.stopAnimation();
        dot1.setValue(0); dot2.setValue(0); dot3.setValue(0);
    }, [dot1, dot2, dot3]);

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

    // ── Send message mutation ───────────────────────────────────────────────
    const mutation = useMutation({
        mutationFn: (text: string) => sendRiaMessage(text, userStatus
            ? { fatigueScore: userStatus.fatigueScore, adherenceRate: userStatus.adherenceRate }
            : {}
        ),
        onMutate: () => { startDotAnimation(); },
        onError: (error: any) => {
            stopDotAnimation();
            const errText = error?.response?.data?.message ?? error?.message ?? 'Something went wrong.';
            setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                sender: 'ai',
                text: `Sorry, I hit a snag: ${errText}`,
                timestamp: new Date(),
            }]);
        },
        onSuccess: (result) => {
            stopDotAnimation();
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
        // mutation.onMutate starts the dot animation; onSuccess streams the
        // full reply with the canned typing effect; onError shows the snag.
        mutation.mutate(safeText);
    }, [mutation]);

    /**
     * Primary send path: stream the reply token-by-token into a live assistant
     * bubble via streamChat. On ANY stream error, fall back to sendRiaMessage
     * so behaviour never regresses.
     */
    const startStream = useCallback((safeText: string) => {
        // History = conversation so far (exclude transient notices is not
        // needed; server tolerates the running transcript). Map to role/content.
        const history = messages.map(m => ({
            role: m.sender === 'ai' ? 'assistant' : 'user',
            content: m.text,
        }));

        const aiMsgId = `ai-stream-${Date.now()}`;
        let gotFirstToken = false;
        let settled = false; // guard: only one of done/error/fallback wins

        // Append the empty assistant bubble + start the thinking dots.
        setMessages(prev => [...prev, {
            id: aiMsgId,
            sender: 'ai',
            text: '',
            timestamp: new Date(),
            streaming: true,
        }]);
        setIsStreaming(true);
        startDotAnimation();
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

        const stop = streamChat(
            { userId: user?.id ?? '', message: safeText, history, context: buildContext() },
            {
                onToken: (delta) => {
                    if (settled) return;
                    if (!gotFirstToken) {
                        gotFirstToken = true;
                        // First token arrived — drop the dots, the bubble now
                        // shows live text with its own cursor.
                        stopDotAnimation();
                    }
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { ...m, text: m.text + delta, streaming: true } : m
                    ));
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 30);
                },
                onDone: () => {
                    if (settled) return;
                    settled = true;
                    stopDotAnimation();
                    setIsStreaming(false);
                    streamStopRef.current = null;
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId ? { ...m, streaming: false } : m
                    ));
                    // Reconcile with the server-persisted copy.
                    queryClient.invalidateQueries({ queryKey: ['ria-messages'] });
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 60);
                },
                onError: (_msg, partial) => {
                    if (settled) return;
                    settled = true;
                    stopDotAnimation();
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
                    // Nothing usable streamed → transparent fallback.
                    runFallback(safeText, aiMsgId);
                },
            },
        );
        streamStopRef.current = stop;
    }, [messages, user, buildContext, startDotAnimation, stopDotAnimation, queryClient, runFallback]);

    const sendMessage = (text: string) => {
        const trimmed = text.trim();
        // Block while either the stream or the fallback mutation is busy.
        if (!trimmed || mutation.isPending || isStreaming) return;

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

    const isTyping = mutation.isPending || isStreaming;
    // Only show the standalone "thinking" dots while we have no live assistant
    // text yet. Once tokens land in the streaming bubble (which has its own
    // cursor), the separate dots indicator would be redundant.
    const showThinkingDots = isTyping && !messages.some(m => m.streaming && m.text.length > 0);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>

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
                            <Text style={[typography.caption, { color: isTyping ? colors.accent.amber : colors.accent.emerald, fontWeight: 'bold', fontSize: 11 }]}>
                                {isTyping ? 'Thinking...' : 'AI Coach · Online'}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={{ width: 40 }} />
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
                >
                    <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginBottom: 24, fontWeight: 'bold' }]}>
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
                    </Text>

                    {historyQuery.isLoading && !hasLoaded && (
                        <View style={{ alignItems: 'center', paddingTop: 40 }}>
                            <ActivityIndicator color={colors.accent.cyan} />
                        </View>
                    )}

                    {messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} colors={colors} typography={typography} />
                    ))}

                    {/* Typing indicator (hidden once live tokens are streaming) */}
                    {showThinkingDots && (
                        <View style={[styles.aiBubble, { backgroundColor: colors.background.tertiary, marginBottom: 14 }]}>
                            <View style={styles.aiHeader}>
                                <Text style={[typography.caption, { color: colors.accent.purpleLight, fontWeight: 'bold', fontSize: 10 }]}>RIA</Text>
                            </View>
                            <View style={styles.dotsRow}>
                                {[dot1, dot2, dot3].map((dot, i) => (
                                    <Animated.View
                                        key={i}
                                        style={[styles.typingDot, {
                                            backgroundColor: colors.text.tertiary,
                                            opacity: dot,
                                            transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
                                        }]}
                                    />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Quick Suggestions */}
                    {messages.length <= 2 && !isTyping && (
                        <View style={{ marginTop: 24 }}>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 12, fontWeight: 'bold', letterSpacing: 0.5 }]}>
                                QUICK QUESTIONS
                            </Text>
                            <View style={styles.suggestionsContainer}>
                                {DEFAULT_SUGGESTIONS.map((sug, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        activeOpacity={0.85}
                                        accessibilityRole="button"
                                        accessibilityLabel={sug}
                                        onPress={() => sendMessage(sug)}
                                        style={[styles.suggestionChip, {
                                            borderColor: withAlpha(colors.accent.cyan, 0.4),
                                            backgroundColor: withAlpha(colors.accent.cyan, 0.06),
                                        }]}
                                    >
                                        <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: '600' }]}>{sug}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </ScrollView>

                {/* Input Area */}
                <View style={[styles.inputArea, {
                    borderTopColor: colors.border.default,
                    backgroundColor: colors.background.secondary,
                    paddingBottom: Math.max(insets.bottom, 16),
                }]}>
                    <TextInput
                        style={[styles.textInput, {
                            color: colors.text.primary,
                            backgroundColor: colors.background.tertiary,
                            borderColor: colors.border.default,
                        }]}
                        placeholder="Ask Ria about your shift protocol..."
                        placeholderTextColor={colors.text.tertiary}
                        value={input}
                        onChangeText={setInput}
                        multiline
                        maxLength={500}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />

                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Send"
                        style={[styles.sendBtn, {
                            backgroundColor: input.trim() ? colors.accent.purple : colors.background.tertiary,
                            opacity: (mutation.isPending || isStreaming) ? 0.5 : 1,
                        }, input.trim() && shadows.glow(colors.accent.purple)]}
                        onPress={() => sendMessage(input)}
                        disabled={mutation.isPending || isStreaming || !input.trim()}
                    >
                        <Ionicons
                            name="arrow-up"
                            size={20}
                            color={input.trim() ? colors.text.primary : colors.text.tertiary}
                        />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({ msg, colors, typography }: { msg: Message; colors: any; typography: any }) {
    const isAI = msg.sender === 'ai';
    return (
        <View style={[
            styles.messageRow,
            isAI ? { justifyContent: 'flex-start' } : { justifyContent: 'flex-end' },
        ]}>
            {isAI && (
                <LinearGradient
                    colors={colors.gradients.purple}
                    style={styles.riaAvatarSmall}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                    <Ionicons name="sparkles" size={12} color={colors.text.primary} />
                </LinearGradient>
            )}
            <View style={[
                styles.messageBubble,
                isAI
                    ? [styles.aiBubble, { backgroundColor: colors.background.tertiary }]
                    : [styles.userBubble, { backgroundColor: colors.accent.purple }],
            ]}>
                {isAI && (
                    <View style={styles.aiHeader}>
                        <Text style={[typography.caption, { color: colors.accent.purpleLight, fontWeight: 'bold', fontSize: 10, letterSpacing: 0.5 }]}>RIA</Text>
                        {msg.streaming && <View style={[styles.streamingDot, { backgroundColor: colors.accent.purpleLight }]} />}
                    </View>
                )}
                <Text style={[typography.body, {
                    color: isAI ? colors.text.primary : colors.text.primary,
                    lineHeight: 22,
                }]}>
                    {msg.text}
                    {msg.streaming && <Text style={{ color: colors.accent.purpleLight }}>▌</Text>}
                </Text>
                <Text style={[typography.caption, {
                    color: isAI ? colors.text.tertiary : withAlpha(colors.text.primary, 0.5),
                    fontSize: 10,
                    marginTop: 6,
                    textAlign: isAI ? 'left' : 'right',
                }]}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        </View>
    );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
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
    streamingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 5,
        paddingVertical: 4,
    },
    typingDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    suggestionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    suggestionChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        gap: 10,
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
});
