import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, FlatList, Platform } from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAll, markRead, Notification } from '@/api/notifications';
import { EmptyState, Skeleton, GlassCard } from '@/components/ui';

export default function NotificationsScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Holds the id of the row whose mark-read FAILED — genuine error state (the
    // real outcome of the mutation), null = no failure. We surface the failure
    // INLINE (a GlassCard the screen reader announces via role="alert" + a polite
    // live region) instead of an imperative system dialog, matching the
    // inline-notice pattern notification-preferences.tsx already ships. The banner
    // JSX is derived from this; the Retry re-invokes mutate(markReadError.id) — a
    // genuine retry of the failed id, never a fabricated success.
    const [markReadError, setMarkReadError] = useState<{ id: string } | null>(null);

    const { data: notifications, isLoading, isError, refetch } = useQuery({
        queryKey: ['notifications'],
        queryFn: getAll,
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => markRead(id),
        onError: (_err, id) => { setMarkReadError({ id }); },
        onSuccess: () => {
            setMarkReadError(null);
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
    });

    const getIconForType = useCallback((type: string) => {
        switch (type) {
            case 'workout': return { name: 'barbell', color: colors.accent.cyan };
            case 'meal': return { name: 'restaurant', color: colors.accent.coral };
            case 'social': return { name: 'people', color: colors.accent.purple };
            case 'system': return { name: 'information-circle', color: colors.accent.amber };
            default: return { name: 'notifications', color: colors.text.secondary };
        }
    }, [colors]);

    const renderItem = useCallback(({ item }: { item: Notification }) => {
        const iconConfig = getIconForType(item.type);
        return (
            <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${item.isRead ? '' : 'Unread. '}${item.title}. ${item.body}`}
                style={[styles.notificationCard, { backgroundColor: item.isRead ? colors.background.primary : colors.background.secondary, borderBottomColor: colors.border.default }]}
                onPress={() => !item.isRead && markReadMutation.mutate(item.id)}
            >
                <View style={[styles.iconBox, { backgroundColor: withAlpha(iconConfig.color, 0.14), borderColor: withAlpha(iconConfig.color, 0.28) }]}>
                    <Ionicons name={iconConfig.name as any} size={24} color={iconConfig.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: item.isRead ? '500' : '700', flex: 1 }]}>
                            {item.title}
                        </Text>
                        {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.accent.coral }]} />}
                    </View>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={2}>
                        {item.body}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>
                        {item.createdAt && !isNaN(new Date(item.createdAt).getTime())
                            ? new Date(item.createdAt).toLocaleDateString()
                            : ''}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }, [getIconForType, colors, typography, markReadMutation]);

    const keyExtractor = useCallback((item: Notification) => item.id, []);

    // Loading placeholder shaped like a real notification row (icon + text lines).
    const renderSkeletonRow = (key: number) => (
        <View key={key} style={[styles.notificationCard, { borderBottomColor: colors.border.default }]}>
            <Skeleton width={48} height={48} radius={24} />
            <View style={{ flex: 1, marginLeft: 16 }}>
                <Skeleton width="55%" height={16} radius={br.sm} />
                <Skeleton width="90%" height={14} radius={br.sm} style={{ marginTop: 8 }} />
                <Skeleton width="30%" height={12} radius={br.sm} style={{ marginTop: 10 }} />
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Notifications</Text>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Refresh" onPress={() => refetch()}>
                    <Ionicons name="refresh" size={24} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={{ paddingTop: spacing.sm }}>
                    {[0, 1, 2, 3, 4, 5].map(renderSkeletonRow)}
                </View>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load notifications"
                    subtitle="Something went wrong fetching your notifications. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : (
                <>
                    {/* Inline mark-read failure surface (replaces the old imperative
                        system dialog on markReadMutation.onError). Rendered with an
                        explicit ternary-null per rules/rendering-no-falsy-and.md — markReadError
                        is { id } | null, never a falsy 0/"" that could leak into the
                        JSX tree. As a GlassCard from @/components/ui (no inline glass),
                        it carries accessibilityRole="alert" + a polite live region on
                        its inner content View so a screen reader announces the failure.
                        The Retry Pressable is a SIBLING (independently focusable) and
                        re-invokes markReadMutation.mutate(markReadError.id) — the
                        genuine retry of the failed id, never a fabricated success.
                        Mirrors notification-preferences.tsx's statusCard recipe. */}
                    {markReadError ? (
                        <GlassCard radius={br.lg} style={styles.statusCard} testID="mark-read-error">
                            <View style={styles.statusRow}>
                                <View
                                    style={styles.statusContent}
                                    accessible
                                    accessibilityRole="alert"
                                    accessibilityLiveRegion="polite"
                                    accessibilityLabel="Couldn't mark as read"
                                >
                                    <Ionicons name="alert-circle" size={20} color={colors.accent.coral} />
                                    <Text style={[typography.subhead, styles.statusText, { color: colors.text.primary }]}>
                                        Couldn't mark as read
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => markReadMutation.mutate(markReadError.id)}
                                    disabled={markReadMutation.isPending}
                                    accessibilityRole="button"
                                    accessibilityLabel="Retry"
                                    accessibilityState={{ disabled: markReadMutation.isPending, busy: markReadMutation.isPending }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={({ pressed }) => [
                                        styles.retryBtn,
                                        {
                                            borderColor: withAlpha(colors.accent.coral, 0.4),
                                            backgroundColor: withAlpha(colors.accent.coral, pressed ? 0.16 : 0.08),
                                        },
                                    ]}
                                    testID="mark-read-error-retry"
                                >
                                    <Ionicons name="refresh-outline" size={15} color={colors.accent.coral} />
                                    <Text style={[typography.caption, styles.retryLabel, { color: colors.accent.coral }]}>
                                        Retry
                                    </Text>
                                </Pressable>
                            </View>
                        </GlassCard>
                    ) : null}

                    <FlatList
                        data={notifications || []}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
                        removeClippedSubviews={Platform.OS === 'android'}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={11}
                        ListEmptyComponent={
                            <EmptyState
                                icon="notifications-off-outline"
                                title="No notifications yet"
                                subtitle="You're all caught up. New workout, meal, and coach alerts will show up here."
                            />
                        }
                    />
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1 },
    notificationCard: { flexDirection: 'row', padding: spacing.xl, borderBottomWidth: 1 },
    iconBox: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.sm, marginTop: spacing.xs },
    // Inline mark-read failure surface (GlassCard wrapper margins; the GlassCard
    // owns the frosted fill + hairline border + radius). Mirrors the statusCard
    // recipe in notification-preferences.tsx.
    statusCard: {
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
    },
    // The announced alert content (icon + copy). Flexes to fill the row so the
    // trailing Retry sibling sits flush right.
    statusContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        flex: 1,
        marginLeft: spacing.md,
        fontWeight: '600',
        lineHeight: 19,
    },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginLeft: spacing.sm,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    retryLabel: {
        fontWeight: '700',
    },
});
