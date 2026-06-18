import React, { useCallback } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, FlatList, Platform } from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAll, markRead, Notification } from '@/api/notifications';
import { EmptyState, Skeleton } from '@/components/ui';

export default function NotificationsScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: notifications, isLoading, isError, refetch } = useQuery({
        queryKey: ['notifications'],
        queryFn: getAll,
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => markRead(id),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
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
                accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`}
                style={[styles.notificationCard, { backgroundColor: item.read ? colors.background.primary : colors.background.secondary, borderBottomColor: colors.border.default }]}
                onPress={() => !item.read && markReadMutation.mutate(item.id)}
            >
                <View style={[styles.iconBox, { backgroundColor: withAlpha(iconConfig.color, 0.14), borderColor: withAlpha(iconConfig.color, 0.28) }]}>
                    <Ionicons name={iconConfig.name as any} size={24} color={iconConfig.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: item.read ? '500' : '700', flex: 1 }]}>
                            {item.title}
                        </Text>
                        {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.accent.coral }]} />}
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
});
