import React from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStats, getUsers, toggleBanUser } from '@/api/admin';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
import { spacing as sp, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { formatDistanceToNow } from 'date-fns';

export default function AdminDashboardScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: stats, isLoading: isStatsLoading, isError: isStatsError, isFetching: isFetchingStats, refetch: refetchStats } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: getStats,
    });

    const { data: users, isLoading: isUsersLoading, isError: isUsersError, isFetching: isFetchingUsers, refetch: refetchUsers } = useQuery({
        queryKey: ['admin-users'],
        queryFn: () => getUsers(undefined, 20),
    });

    const toggleBanMutation = useMutation({
        mutationFn: toggleBanUser,
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        }
    });

    const handleRefresh = () => {
        refetchStats();
        refetchUsers();
    };

    const header = (
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
            <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginLeft: spacing.lg }]}>Admin Dashboard</Text>
        </View>
    );

    if (isStatsLoading || isUsersLoading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                {header}
                <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>
                    <Skeleton width={140} height={22} style={{ marginBottom: spacing.md }} />
                    <View style={styles.statsGrid}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonCard key={i} height={120} radius={borderRadius.xl} style={{ width: '48%', marginBottom: 0 }} />
                        ))}
                    </View>
                    <Skeleton width={140} height={22} style={{ marginTop: spacing['3xl'], marginBottom: spacing.lg }} />
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonCard key={i} height={88} radius={borderRadius.lg} style={{ marginBottom: spacing.md }} />
                    ))}
                </ScrollView>
            </View>
        );
    }

    if (isStatsError || isUsersError) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                {header}
                <View style={styles.center}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load the dashboard"
                        subtitle="Something went wrong fetching admin data. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={handleRefresh}
                    />
                </View>
            </View>
        );
    }

    // Pull-to-refresh: reflect the actual refetch state (isLoading is always
    // false here — the initial-load case early-returns above).
    const isRefreshing = isFetchingStats || isFetchingUsers;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {header}

            <ScrollView
                contentContainerStyle={{ padding: spacing.lg }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accent.cyan} />}
            >
                {/* Stats Grid */}
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginBottom: 12 }]}>Platform Stats</Text>
                <View style={styles.statsGrid}>
                    <Card style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="people" size={24} color={colors.accent.cyan} />
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 8 }]}>{stats?.totalUsers || 0}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Total Users</Text>
                    </Card>
                    <Card style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="flash" size={24} color={colors.accent.coral} />
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 8 }]}>{stats?.activeToday || 0}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Active Today</Text>
                    </Card>
                    <Card style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="trending-up" size={24} color={colors.success} />
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 8 }]}>{stats?.newUsersThisWeek || 0}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>New This Week</Text>
                    </Card>
                    <Card style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="star" size={24} color={colors.accent.coral} />
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 8 }]}>{stats?.premiumUsers || 0}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Premium</Text>
                    </Card>
                    <Card style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="ribbon" size={24} color={colors.accent.lime} />
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 8 }]}>{stats?.coaches ?? 0}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                            Coaches{stats?.availableCoaches != null ? ` · ${stats.availableCoaches} live` : ''}
                        </Text>
                    </Card>
                    <Card style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="ban" size={24} color={colors.warning} />
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 8 }]}>{stats?.bannedUsers ?? 0}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Banned</Text>
                    </Card>
                </View>

                {/* Coach applications review queue */}
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(admin)/coaches' as any)} accessibilityRole="button" accessibilityLabel="Review coach applications" style={{ marginTop: spacing.lg }}>
                    <Card style={[styles.actionRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="ribbon" size={20} color={colors.accent.lime} />
                        <Text style={[typography.body, { color: colors.text.primary, flex: 1, marginLeft: 12 }]}>Coach applications</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                    </Card>
                </TouchableOpacity>

                {/* User List */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing['3xl'], marginBottom: spacing.lg }}>
                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Recent Users</Text>
                </View>

                {users && users.length === 0 ? (
                    <EmptyState
                        icon="people-outline"
                        title="No users yet"
                        subtitle="New members will appear here as they join the platform."
                    />
                ) : null}

                {users?.map((u) => (
                    <Card key={u.id} style={[styles.userRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.userInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16 }]}>{u.displayName}</Text>
                                <View style={[styles.badge, { backgroundColor: u.tier === 'PRO' ? withAlpha(colors.accent.cyan, 0.125) : colors.background.tertiary }]}>
                                    <Text style={[typography.caption, { color: u.tier === 'PRO' ? colors.accent.cyan : colors.text.secondary }]}>{u.tier}</Text>
                                </View>
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                Active {formatDistanceToNow(new Date(u.lastActiveAt), { addSuffix: true })}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                Joined {new Date(u.createdAt).toLocaleDateString()}
                            </Text>
                        </View>
                        <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Toggle user ban"
                            style={[styles.banBtn, { backgroundColor: u.status === 'BANNED' ? withAlpha(colors.error, 0.125) : colors.background.tertiary }]}
                            onPress={() => toggleBanMutation.mutate(u.userId)}
                            disabled={toggleBanMutation.isPending}
                        >
                            <Ionicons name={u.status === 'BANNED' ? "close-circle" : "shield-checkmark"} size={20} color={u.status === 'BANNED' ? colors.error : colors.text.secondary} />
                        </TouchableOpacity>
                    </Card>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: sp.xl,
        paddingVertical: sp.lg,
        borderBottomWidth: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: sp.md,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: sp.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    statCard: {
        width: '48%',
        padding: sp.lg,
        borderWidth: 1,
        borderRadius: br.xl,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: sp.lg,
        marginBottom: sp.md,
        borderWidth: 1,
        borderRadius: br.lg,
    },
    userInfo: {
        flex: 1,
    },
    badge: {
        paddingHorizontal: sp.xs + 2,
        paddingVertical: sp.xxs,
        borderRadius: br.sm,
        marginLeft: sp.sm,
    },
    banBtn: {
        padding: sp.sm + 2,
        borderRadius: br.md,
        marginLeft: sp.md,
    }
});
