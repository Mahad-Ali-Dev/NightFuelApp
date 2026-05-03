import React, { useState, useRef, useEffect } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMessages, sendMessage, startConversation, createSocketConnection } from '@/api/chat';
import type { Socket } from 'socket.io-client';

export default function UnifiedChatScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const { id: targetId } = useLocalSearchParams<{ id: string }>(); // This could be user ID or conversation ID.
    const router = useRouter();
    const queryClient = useQueryClient();
    const flatListRef = useRef<FlatList>(null);

    const [inputText, setInputText] = useState('');
    const [socket, setSocket] = useState<Socket | null>(null);

    // 1. Resolve or start conversation with the target
    const { data: conversation, isLoading: startingConv } = useQuery({
        queryKey: ['conversation', targetId],
        queryFn: () => startConversation(targetId as string),
    });

    const conversationId = conversation?.id;

    // 2. Load messages for the resolved conversation
    const { data: messages, isLoading: loadingMessages } = useQuery({
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

    const renderMessage = ({ item }: { item: any }) => {
        // Find if it was sent by the current user
        // The backend returns an `isOwn` boolean for us on GET /messages.
        // For optimistically sent messages (via WS or mutation), we might need a fallback.
        const isMe = item.isOwn ?? (item.senderId !== targetId);

        return (
            <View style={[styles.bubbleRow, isMe ? styles.myRow : styles.theirRow]}>
                <View style={[styles.bubble, isMe ? { backgroundColor: colors.accent.purple } : { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default }]}>
                    <Text style={[typography.body, { color: isMe ? '#FFFFFF' : colors.text.primary, lineHeight: 22 }]}>
                        {item.text}
                    </Text>
                    <Text style={[typography.caption, { color: isMe ? '#FFFFFF80' : colors.text.tertiary, fontSize: 10, marginTop: 6, alignSelf: 'flex-end' }]}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    const isLoading = startingConv || loadingMessages;

    return (
        <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    {isLoading ? <ActivityIndicator size="small" color={colors.accent.purple} /> : <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />}
                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16 }]}>Chat</Text>
                </View>
                <TouchableOpacity style={{ padding: 4 }}>
                    <Ionicons name="call" size={20} color={colors.accent.purple} />
                </TouchableOpacity>
            </View>

            {/* Messages */}
            {isLoading ? (
                <View style={{ flex: 1 }} />
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages || []}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                />
            )}

            {/* Input Bar */}
            <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <TouchableOpacity style={[styles.attachBtn, { backgroundColor: colors.background.secondary }]}>
                    <Ionicons name="add" size={24} color={colors.text.secondary} />
                </TouchableOpacity>
                <TextInput
                    style={[styles.textInput, { backgroundColor: colors.background.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.text.tertiary}
                    value={inputText}
                    onChangeText={setInputText}
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                />
                <TouchableOpacity
                    onPress={handleSend}
                    style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.accent.purple : colors.background.secondary }]}
                    disabled={!inputText.trim()}
                >
                    <Ionicons name="send" size={20} color={inputText.trim() ? '#FFFFFF' : colors.text.tertiary} />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 56, borderBottomWidth: 1 },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    onlineDot: { width: 8, height: 8, borderRadius: 4 },
    bubbleRow: { marginBottom: 16 },
    myRow: { alignItems: 'flex-end' },
    theirRow: { alignItems: 'flex-start' },
    bubble: { maxWidth: '80%', padding: 14, borderRadius: 20 },
    inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    attachBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    textInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, borderWidth: 1 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});
