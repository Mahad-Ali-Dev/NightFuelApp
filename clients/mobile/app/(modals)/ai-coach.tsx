import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    TouchableOpacity, KeyboardAvoidingView, Platform,
    ActivityIndicator, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRiaMessages, sendRiaMessage, type RiaMessage } from '@/api/chat';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/api/client';
import { withAlpha } from '@/theme/utils';
import { LinearGradient } from 'expo-linear-gradient';

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

    // ── User status for AI context ──────────────────────────────────────────
    const { data: userStatus } = useQuery({
        queryKey: ['userStatus'],
        queryFn: async () => {
            const res = await apiClient.get('/v1/users/me/status');
            return res.data?.data;
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

    const sendMessage = (text: string) => {
        if (!text.trim() || mutation.isPending) return;
        setMessages(prev => [...prev, {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: text.trim(),
            timestamp: new Date(),
        }]);
        setInput('');
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);
        mutation.mutate(text.trim());
    };

    const isTyping = mutation.isPending;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <LinearGradient
                        colors={['#7C3AED', '#A855F7']}
                        style={styles.riaAvatar}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <Ionicons name="sparkles" size={18} color="#fff" />
                    </LinearGradient>
                    <View style={{ marginLeft: 10 }}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 17, fontWeight: '800' }]}>
                            Coach Ria
                        </Text>
                        <View style={styles.statusBadge}>
                            <View style={[styles.statusDot, { backgroundColor: isTyping ? '#F59E0B' : '#10B981' }]} />
                            <Text style={[typography.caption, { color: isTyping ? '#F59E0B' : '#10B981', fontWeight: 'bold', fontSize: 11 }]}>
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
                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginBottom: 24, fontWeight: 'bold' }]}>
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

                    {/* Typing indicator */}
                    {isTyping && (
                        <View style={[styles.aiBubble, { backgroundColor: colors.background.tertiary, marginBottom: 14 }]}>
                            <View style={styles.aiHeader}>
                                <Text style={[typography.caption, { color: '#A855F7', fontWeight: 'bold', fontSize: 10 }]}>RIA</Text>
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
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 12, fontWeight: 'bold', letterSpacing: 0.5 }]}>
                                QUICK QUESTIONS
                            </Text>
                            <View style={styles.suggestionsContainer}>
                                {DEFAULT_SUGGESTIONS.map((sug, i) => (
                                    <TouchableOpacity
                                        key={i}
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

                    <TouchableOpacity
                        style={[styles.sendBtn, {
                            backgroundColor: input.trim() ? '#A855F7' : colors.background.tertiary,
                            opacity: mutation.isPending ? 0.5 : 1,
                        }]}
                        onPress={() => sendMessage(input)}
                        disabled={mutation.isPending || !input.trim()}
                    >
                        <Ionicons
                            name="arrow-up"
                            size={20}
                            color={input.trim() ? '#fff' : colors.text.tertiary}
                        />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, colors, typography }: { msg: Message; colors: any; typography: any }) {
    const isAI = msg.sender === 'ai';
    return (
        <View style={[
            styles.messageRow,
            isAI ? { justifyContent: 'flex-start' } : { justifyContent: 'flex-end' },
        ]}>
            {isAI && (
                <LinearGradient
                    colors={['#7C3AED', '#A855F7']}
                    style={styles.riaAvatarSmall}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                    <Ionicons name="sparkles" size={12} color="#fff" />
                </LinearGradient>
            )}
            <View style={[
                styles.messageBubble,
                isAI
                    ? [styles.aiBubble, { backgroundColor: colors.background.tertiary }]
                    : [styles.userBubble, { backgroundColor: '#7C3AED' }],
            ]}>
                {isAI && (
                    <View style={styles.aiHeader}>
                        <Text style={[typography.caption, { color: '#A855F7', fontWeight: 'bold', fontSize: 10, letterSpacing: 0.5 }]}>RIA</Text>
                        {msg.streaming && <View style={styles.streamingDot} />}
                    </View>
                )}
                <Text style={[typography.body, {
                    color: isAI ? colors.text.primary : '#fff',
                    lineHeight: 22,
                }]}>
                    {msg.text}
                    {msg.streaming && <Text style={{ color: '#A855F7' }}>▌</Text>}
                </Text>
                <Text style={[typography.caption, {
                    color: isAI ? colors.text.tertiary : 'rgba(255,255,255,0.5)',
                    fontSize: 10,
                    marginTop: 6,
                    textAlign: isAI ? 'left' : 'right',
                }]}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        </View>
    );
}

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
        backgroundColor: '#A855F7',
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
        fontFamily: 'Inter',
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
