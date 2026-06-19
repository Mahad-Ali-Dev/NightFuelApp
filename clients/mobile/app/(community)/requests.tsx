import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton, EmptyState, GlassCard, CtaButton, Avatar } from '@/components/ui';
import { getMessageRequests, acceptRequest, declineRequest, type MessageRequest } from '@/api/community';
import { withAlpha } from '@/theme/utils';

const REQUESTS_KEY = ['chat-requests'] as const;

/**
 * Incoming message-requests inbox (SOCIAL API CONTRACT — Instagram-DM style).
 * A pending 1:1 conversation is a request: the recipient (me) sees the peer here
 * and can Accept (unlocks the chat for both) or Decline. Acting on a row removes
 * it from the list immediately (optimistic) — the cache is the single ground
 * truth, so there is no parallel "dismissed" state (react-state-minimize).
 */
export default function MessageRequestsScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: requests, isLoading, isError, refetch } = useQuery({
        queryKey: REQUESTS_KEY,
        queryFn: getMessageRequests,
    });

    // Remove a row from the cache by conversation id. Used as the optimistic
    // update for both Accept and Decline (state-ground-truth: the cache list IS
    // the source of truth — we never mirror it into component state).
    const removeRow = useCallback(
        (conversationId: string) => {
            queryClient.setQueryData<MessageRequest[]>(REQUESTS_KEY, (old) =>
                (old ?? []).filter((r) => r.id !== conversationId),
            );
        },
        [queryClient],
    );

    const acceptMutation = useMutation({
        mutationFn: (conversationId: string) => acceptRequest(conversationId),
        // On error, refetch so a failed accept doesn't silently drop the row.
        onError: () => { refetch(); },
    });

    const declineMutation = useMutation({
        mutationFn: (conversationId: string) => declineRequest(conversationId),
        onError: () => { refetch(); },
    });

    // Single callback instances created at the list root and called by each row
    // with its own id (list-performance-callbacks). Accept also opens the now-
    // unlocked conversation so the recipient can reply right away.
    const onAccept = useCallback(
        (conversationId: string, peerUserId?: string) => {
            removeRow(conversationId);
            acceptMutation.mutate(conversationId);
            if (peerUserId) router.push(`/messages/${peerUserId}` as any);
        },
        [removeRow, acceptMutation, router],
    );

    const onDecline = useCallback(
        (conversationId: string) => {
            removeRow(conversationId);
            declineMutation.mutate(conversationId);
        },
        [removeRow, declineMutation],
    );

    const keyExtractor = useCallback((item: MessageRequest) => item.id, []);

    const renderItem = useCallback(
        ({ item }: { item: MessageRequest }) => (
            <RequestRow item={item} onAccept={onAccept} onDecline={onDecline} />
        ),
        [onAccept, onDecline],
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    activeOpacity={0.85}
                    onPress={() => router.back()}
                    style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Requests</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* List */}
            {isLoading ? (
                <View style={{ padding: 16 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <RequestRowSkeleton key={i} />
                    ))}
                </View>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load requests"
                    subtitle="Something went wrong fetching your message requests. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                    style={{ flex: 1 }}
                />
            ) : !requests || requests.length === 0 ? (
                <EmptyState
                    icon="mail-open-outline"
                    title="No message requests"
                    subtitle="When someone you don't follow messages you, their request will appear here for you to accept or decline."
                    style={{ flex: 1 }}
                />
            ) : (
                <FlatList
                    data={requests}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
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

interface RequestRowProps {
    item: MessageRequest;
    onAccept: (conversationId: string, peerUserId?: string) => void;
    onDecline: (conversationId: string) => void;
}

/**
 * A single request row: peer avatar + display name, Accept / Decline. Memoized so
 * the FlatList skips unchanged rows when one is acted on. The peer descriptor is
 * read off the CONTRACT `peer` field; values are derived in-row so the parent
 * never reparents the list (list-performance-function-references).
 */
const RequestRow = React.memo(function RequestRow({ item, onAccept, onDecline }: RequestRowProps) {
    const { colors, typography } = useTheme();
    const peer = item.peer;
    const name = peer?.displayName ?? (peer?.userId ? `User ${peer.userId.slice(0, 4)}` : 'Athlete');

    const handleAccept = useCallback(() => onAccept(item.id, peer?.userId), [onAccept, item.id, peer?.userId]);
    const handleDecline = useCallback(() => onDecline(item.id), [onDecline, item.id]);

    return (
        <GlassCard style={styles.rowCard}>
            <View style={styles.rowInner}>
                <View style={styles.rowTop}>
                    <Avatar uri={peer?.avatarUrl ?? undefined} name={peer?.displayName} size={48} borderColor={withAlpha(colors.accent.purple, 0.3)} />
                    <View style={styles.rowInfo}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{name}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={1}>
                            wants to send you a message
                        </Text>
                    </View>
                </View>

                <View style={styles.rowActions}>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Decline message request from ${name}`}
                        activeOpacity={0.85}
                        onPress={handleDecline}
                        style={[styles.declineBtn, { borderColor: colors.border.light }]}
                    >
                        <Text style={[typography.subhead, { color: colors.text.secondary, fontWeight: '700' }]}>Decline</Text>
                    </TouchableOpacity>
                    <CtaButton
                        label="Accept"
                        size="sm"
                        accessibilityLabel={`Accept message request from ${name}`}
                        onPress={handleAccept}
                        style={styles.acceptBtn}
                    />
                </View>
            </View>
        </GlassCard>
    );
});

function RequestRowSkeleton() {
    const { borderRadius } = useTheme();
    return (
        <GlassCard style={styles.rowCard}>
            <View style={styles.rowInner}>
                <View style={styles.rowTop}>
                    <Skeleton width={48} height={48} radius={24} />
                    <View style={styles.rowInfo}>
                        <Skeleton width="50%" height={14} radius={borderRadius.sm} />
                        <Skeleton width="70%" height={11} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                    </View>
                </View>
                <View style={styles.rowActions}>
                    <Skeleton width={96} height={40} radius={borderRadius.lg} />
                    <Skeleton width={96} height={40} radius={borderRadius.lg} style={{ marginLeft: 12 }} />
                </View>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 64, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    rowCard: { marginBottom: 12 },
    rowInner: { padding: 16 },
    rowTop: { flexDirection: 'row', alignItems: 'center' },
    rowInfo: { flex: 1, marginLeft: 14 },
    rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 16 },
    declineBtn: { minHeight: 40, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    acceptBtn: { minWidth: 96, borderRadius: 14 },
});
