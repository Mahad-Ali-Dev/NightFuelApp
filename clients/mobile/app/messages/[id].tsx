import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMessages, sendMessage, startConversation, createSocketConnection } from '@/api/chat';
import type { Socket } from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';

export default function UnifiedChatScreen() {
    const { colors, typography, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { id: targetId } = useLocalSearchParams<{ id: string }>(); // This could be user ID or conversation ID.
    const router = useRouter();
    const queryClient = useQueryClient();
    const flatListRef = useRef<FlatList>(null);

    const [inputText, setInputText] = useState('');
    const [socket, setSocket] = useState<Socket | null>(null);

    // 1. Resolve or start conversation with the target
    const { data: conversation, isLoading: startingConv, isError: convError, refetch: refetchConv } = useQuery({
        queryKey: ['conversation', targetId],
        queryFn: () => startConversation(targetId as string),
    });

    const conversationId = conversation?.id;

    // 2. Load messages for the resolved conversation
    const { data: messages, isLoading: loadingMessages, isError: messagesError, refetch: refetchMessages } = useQuery({
        queryKey: ['messages', conversationId],
        queryFn: () => getMessages(conversationId!),
        enabled: !!conversationId,
    });

    // 3. Mutation for sending sync messages
    const sendMutation = useMutation({
        mutationFn: (text: string) => sendMessage(conversationId!, text),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
    });

    // 4. Socket.IO Realtime handling
    useEffect(() => {
        let activeSocket: Socket | null = null;
        if (conversationId) {
            createSocketConnection().then((s) => {
                activeSocket = s;
                setSocket(s);

                s.on('connect', () => {
                    // No need to explicitly join, authentication via header connects us
                });

                s.on('newMessage', (msg: any) => {
                    // Invalidate query to pull the latest when socket gives a new message
                    // Or manually append. We'll invalidate for purity.
                    if (msg.conversationId === conversationId) {
                        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
                        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
                    }
                });
            }).catch(console.error);
        }

        return () => {
            if (activeSocket) {
                activeSocket.disconnect();
            }
        };
    }, [conversationId, queryClient]);


    const handleSend = () => {
        if (!inputText.trim() || !conversationId) return;
        const textToEmit = inputText;
        setInputText('');

        // Optimistically we could add it to cache, but calling mutation is easy
        sendMutation.mutate(textToEmit);

        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const renderMessage = useCallback(({ item }: { item: any }) => {
        // Find if it was sent by the current user
        // The backend returns an `isOwn` boolean for us on GET /messages.
        // For optimistically sent messages (via WS or mutation), we might need a fallback.
        const isMe = item.isOwn ?? (item.senderId !== targetId);

        const timeStamp = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isMe) {
            return (
                <View style={[styles.bubbleRow, styles.myRow]}>
                    <LinearGradient
                        colors={colors.gradients.coral}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.bubble, shadows.glow(colors.accent.pink)]}
                    >
                        <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22 }]}>
                            {item.text}
                        </Text>
                        <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.7), fontSize: 10, marginTop: 6, alignSelf: 'flex-end' }]}>
                            {timeStamp}
                        </Text>
                    </LinearGradient>
                </View>
            );
        }

        return (
            <View style={[styles.bubbleRow, styles.theirRow]}>
                <View style={[styles.bubble, { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default }]}>
                    <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22 }]}>
                        {item.text}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, marginTop: 6, alignSelf: 'flex-end' }]}>
                        {timeStamp}
                    </Text>
                </View>
            </View>
        );
    }, [colors, typography, shadows, targetId]);

    const keyExtractor = useCallback((item: any) => item.id, []);

    const isLoading = startingConv || loadingMessages;
    const isError = convError || messagesError;

    return (
        <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    {isLoading ? <ActivityIndicator size="small" color={colors.accent.purple} /> : <View style={[styles.onlineDot, { backgroundColor: colors.success }, shadows.glow(colors.success)]} />}
                    <Text style={[typography.subtitle, { color: colors.text.primary }]}>Chat</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

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
                    style={{ flex: 1 }}
                    icon="cloud-offline-outline"
                    title="Couldn't load this chat"
                    subtitle="Something went wrong loading the conversation. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => (convError ? refetchConv() : refetchMessages())}
                />
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages || []}
                    renderItem={renderMessage}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={11}
                />
            )}

            {/* Input Bar */}
            <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <TextInput
                    style={[styles.textInput, { backgroundColor: colors.background.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.text.tertiary}
                    value={inputText}
                    onChangeText={setInputText}
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                />
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Send message"
                    onPress={handleSend}
                    style={[styles.sendBtn, inputText.trim() ? shadows.glow(colors.accent.coral) : undefined]}
                    disabled={!inputText.trim()}
                    activeOpacity={0.85}
                >
                    {inputText.trim() ? (
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.sendBtnInner}
                        >
                            <Ionicons name="send" size={20} color={colors.text.primary} />
                        </LinearGradient>
                    ) : (
                        <View style={[styles.sendBtnInner, { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default }]}>
                            <Ionicons name="send" size={20} color={colors.text.tertiary} />
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

function MessageBubbleSkeleton({ align, width }: { align: 'left' | 'right'; width: number | string }) {
    return (
        <View style={[styles.bubbleRow, align === 'right' ? styles.myRow : styles.theirRow]}>
            <Skeleton width={width as any} height={48} radius={22} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    skeletonList: { flex: 1, padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 64, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    onlineDot: { width: 8, height: 8, borderRadius: 4 },
    bubbleRow: { marginBottom: 16 },
    myRow: { alignItems: 'flex-end' },
    theirRow: { alignItems: 'flex-start' },
    bubble: { maxWidth: '80%', padding: 14, borderRadius: 22 },
    inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    textInput: { flex: 1, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, marginLeft: 10 },
    sendBtnInner: { flex: 1, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
