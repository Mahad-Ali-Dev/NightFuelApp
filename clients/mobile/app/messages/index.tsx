import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton, EmptyState, Avatar } from '@/components/ui';
import { getConversations, type Conversation } from '@/api/chat';
import { formatDistanceToNow } from 'date-fns';
import { withAlpha } from '@/theme/utils';

export default function MessagesListScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: conversations, isLoading, isError, refetch } = useQuery({
        queryKey: ['conversations'],
        queryFn: getConversations,
    });

    const keyExtractor = useCallback((item: Conversation) => item.id, []);

    const renderItem = useCallback(({ item }: { item: Conversation }) => {
        // Prefer the CONTRACT peer descriptor (GET conversations returns
        // requestState + peer {userId, displayName, avatarUrl}). Fall back to the
        // legacy target-id resolution so an older payload shape never crashes the
        // list with `.slice` of undefined.
        const anyItem = item as Conversation & Record<string, any>;
        const peer = item.peer;
        const targetId = String(peer?.userId ?? anyItem?.targetId ?? anyItem?.targetUserId ?? anyItem?.otherUserId ?? anyItem?.userId ?? item?.id ?? '');
        const name = peer?.displayName ?? (targetId ? `User ${targetId.slice(0, 4)}` : '—');
        const isPending = item.requestState === 'pending';
        const updated = item?.updatedAt ? new Date(item.updatedAt) : null;
        const timeAgo = updated && !isNaN(updated.getTime()) ? `${formatDistanceToNow(updated)} ago` : '';
        return (
            <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${name}`}
                style={[styles.chatRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                onPress={() => { if (targetId) router.push(`/messages/${targetId}` as any); }}
            >
                <Avatar uri={peer?.avatarUrl ?? undefined} name={peer?.displayName} size={50} borderColor={withAlpha(colors.accent.purple, 0.3)} />
                <View style={styles.chatInfo}>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{name}</Text>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={1}>
                        {isPending ? 'Message request — tap to review' : 'Tap to view chat history…'}
                    </Text>
                </View>
                {isPending ? (
                    <View style={[styles.requestBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.4) }]}>
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', fontSize: 10 }]}>Request</Text>
                    </View>
                ) : (
                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                        {timeAgo}
                    </Text>
                )}
            </TouchableOpacity>
        );
    }, [colors, typography, router]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Messages</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* List */}
            {isLoading ? (
                <View style={{ padding: 16 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <ChatRowSkeleton key={i} />
                    ))}
                </View>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load messages"
                    subtitle="Something went wrong fetching your conversations. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : !conversations || conversations.length === 0 ? (
                <EmptyState
                    icon="chatbubbles-outline"
                    title="No messages yet"
                    subtitle="Start a conversation from someone's profile and it'll show up here."
                />
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={renderItem}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={11}
                />
            )}
        </View>
    );
}

function ChatRowSkeleton() {
    const { colors, borderRadius } = useTheme();
    return (
        <View style={[styles.chatRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <Skeleton width={50} height={50} radius={25} />
            <View style={styles.chatInfo}>
                <Skeleton width="45%" height={14} radius={borderRadius.sm} />
                <Skeleton width="75%" height={11} radius={borderRadius.sm} style={{ marginTop: 8 }} />
            </View>
            <Skeleton width={36} height={11} radius={borderRadius.sm} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 64, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    chatRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 12 },
    chatInfo: { flex: 1, marginLeft: 16, marginRight: 12 },
    requestBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
});
