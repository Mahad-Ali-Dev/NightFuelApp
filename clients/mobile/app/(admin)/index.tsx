import React from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStats, getUsers, toggleBanUser } from '@/api/admin';
import { Card } from '@/components/ui/Card';
import { formatDistanceToNow } from 'date-fns';

export default function AdminDashboardScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: getStats,
    });

    const { data: users, isLoading: isUsersLoading, refetch: refetchUsers } = useQuery({
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

    if (isStatsLoading || isUsersLoading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    const isLoading = isStatsLoading || isUsersLoading;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginLeft: 16 }]}>Admin Dashboard</Text>
            </View>

            <ScrollView
                contentContainerStyle={{ padding: spacing.lg }}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.accent.cyan} />}
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
                </View>

                {/* User List */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16 }}>
                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Recent Users</Text>
                    <TouchableOpacity>
                        <Ionicons name="search" size={20} color={colors.text.secondary} />
                    </TouchableOpacity>
                </View>

                {users?.map((u) => (
                    <Card key={u.id} style={[styles.userRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.userInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16 }]}>{u.displayName}</Text>
                                <View style={[styles.badge, { backgroundColor: u.tier === 'PRO' ? colors.accent.cyan + '20' : colors.background.tertiary }]}>
                                    <Text style={[typography.caption, { color: u.tier === 'PRO' ? colors.accent.cyan : colors.text.secondary }]}>{u.tier}</Text>
                                </View>
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                Active {formatDistanceToNow(new Date(u.lastActiveAt), { addSuffix: true })}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                Joined {new Date(u.createdAt).toLocaleDateString()}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.banBtn, { backgroundColor: u.status === 'BANNED' ? colors.error + '20' : colors.background.tertiary }]}
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
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statCard: {
        width: '48%',
        padding: 16,
        borderWidth: 1,
        borderRadius: 16,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderRadius: 12,
    },
    userInfo: {
        flex: 1,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    banBtn: {
        padding: 10,
        borderRadius: 8,
        marginLeft: 12,
    }
});
