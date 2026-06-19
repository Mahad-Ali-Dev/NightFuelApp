import React, { useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, FlatList, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// item 5 owns community.ts — this item only IMPORTS follow/social helpers + getLeaderboard.
import { getLeaderboard, followUser, unfollowUser, getUserSocial } from '@/api/community';
import { EmptyState, Avatar } from '@/components/ui';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { useAuthStore } from '@/store/authStore';

// Enriched leaderboard row shape (item 3 enriches the API):
// { userId, xp, level, displayName, avatarUrl }. Older payloads may still carry
// score/name/userName, so we read those defensively at the call sites.
interface LeaderRowData {
    userId: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    name?: string | null;
    userName?: string | null;
    xp?: number;
    score?: number;
    level?: number;
    rank?: number | null;
}

// Fixed list-row height so FlatList can compute getItemLayout without measuring.
const ROW_HEIGHT = 64;

const displayNameOf = (row: LeaderRowData) =>
    row.displayName || row.userName || row.name || 'Athlete';
const scoreOf = (row: LeaderRowData) => row.score ?? row.xp ?? 0;

export default function LeaderboardScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // The authenticated user's id — used to suppress the Follow control on the
    // current user's own row. Falls back to myScore.userId (below) if the auth
    // store hasn't hydrated yet.
    const authUserId = useAuthStore((s) => s.user?.id);

    // ── Queries ─────────────────────────────────────────────────────────────
    const { data: leaderboardData, isLoading } = useQuery({
        queryKey: ['community-leaderboard'],
        queryFn: () => getLeaderboard(50),
    });

    const rows: LeaderRowData[] = leaderboardData?.leaderboard ?? [];
    const myScore: LeaderRowData | undefined = leaderboardData?.myScore;
    const myId = authUserId ?? myScore?.userId;

    // List rows are everyone below the top-3 podium. Slicing the stable query
    // array yields a new array instance but preserves the inner row references,
    // so virtualization can still skip unchanged rows (list-performance-function-references).
    const listRows = rows.slice(3);

    // Hoisted, stable refs — no per-render closures in renderItem
    // (list-performance-callbacks / list-performance-function-references).
    const keyExtractor = useCallback((row: LeaderRowData) => row.userId, []);

    const renderItem = useCallback(
        ({ item, index }: { item: LeaderRowData; index: number }) => (
            <LeaderRow
                userId={item.userId}
                name={displayNameOf(item)}
                avatarUrl={item.avatarUrl}
                score={scoreOf(item)}
                rank={index + 4}
                isSelf={!!myId && item.userId === myId}
            />
        ),
        [myId],
    );

    // Fixed-height rows → constant-time scroll math, no async measurement.
    const getItemLayout = useCallback(
        (_data: ArrayLike<LeaderRowData> | null | undefined, index: number) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
        }),
        [],
    );

    const renderPodium = useCallback(() => {
        const top3 = rows.slice(0, 3);
        if (top3.length === 0) return null;
        return (
            <View style={styles.podiumContainer}>
                {top3.map((row, idx) => (
                    <PodiumItem
                        key={row.userId}
                        userId={row.userId}
                        name={displayNameOf(row)}
                        avatarUrl={row.avatarUrl}
                        score={scoreOf(row)}
                        rank={idx + 1}
                        isSelf={!!myId && row.userId === myId}
                    />
                ))}
            </View>
        );
    }, [rows, myId]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Leaderboard</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent.cyan} />
                </View>
            ) : !rows.length ? (
                <EmptyState
                    icon="podium-outline"
                    title="No rankings yet"
                    subtitle="Earn XP by logging workouts, sleep, and challenge progress to climb the leaderboard."
                />
            ) : (
                <FlatList
                    data={listRows}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    getItemLayout={getItemLayout}
                    ListHeaderComponent={renderPodium}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    windowSize={11}
                />
            )}

            {/* My Rank Footer — fixed overlay, not part of the virtualized list */}
            {!isLoading && myScore && (
                <View style={[styles.myRankBar, { backgroundColor: colors.background.secondary, borderTopColor: colors.border.default, paddingBottom: insets.bottom + 12 }]}>
                    <LeaderRow
                        userId={myScore.userId}
                        name={displayNameOf(myScore)}
                        avatarUrl={myScore.avatarUrl}
                        score={scoreOf(myScore)}
                        rank={myScore.rank ?? null}
                        isSelf
                    />
                </View>
            )}
        </View>
    );
}

// ── Per-row Follow control ────────────────────────────────────────────────────
// Compact pill that reads its own follow state from the social endpoint and
// toggles optimistically. Primitive `userId` prop keeps memo() shallow-compare
// effective (list-performance-item-memo). Never rendered for the current user.
const FollowButton = React.memo(function FollowButton({ userId, name }: { userId: string; name: string }) {
    const { colors, typography } = useTheme();
    const queryClient = useQueryClient();
    const socialKey = ['user-social', userId] as const;

    const { data: social } = useQuery({
        queryKey: socialKey,
        queryFn: () => getUserSocial(userId),
        // Recycled rows reuse cache; avoids re-hitting the endpoint on every scroll.
        staleTime: 60_000,
    });

    const isFollowing = !!social?.isFollowing;

    const toggle = useMutation({
        mutationFn: () => (isFollowing ? unfollowUser(userId) : followUser(userId)),
        // Optimistic flip of the cached social state; roll back on error.
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: socialKey });
            const prev = queryClient.getQueryData<{ isFollowing: boolean; followers: number; following: number }>(socialKey);
            queryClient.setQueryData(socialKey, (old: any) => {
                const base = old ?? { isFollowing: false, followers: 0, following: 0 };
                const nextFollowing = !base.isFollowing;
                return {
                    ...base,
                    isFollowing: nextFollowing,
                    followers: Math.max(0, (base.followers ?? 0) + (nextFollowing ? 1 : -1)),
                };
            });
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev !== undefined) queryClient.setQueryData(socialKey, ctx.prev);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: socialKey });
        },
    });

    return (
        <TouchableOpacity
            testID={`follow-btn-${userId}`}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: isFollowing }}
            accessibilityLabel={`${isFollowing ? 'Unfollow' : 'Follow'} ${name}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => toggle.mutate()}
            style={[
                styles.followBtn,
                isFollowing
                    ? { backgroundColor: 'transparent', borderColor: colors.border.light }
                    : { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.45) },
            ]}
        >
            {isFollowing ? (
                <Ionicons name="checkmark" size={14} color={colors.text.secondary} />
            ) : (
                <Ionicons name="add" size={14} color={colors.accent.coral} />
            )}
            <Text
                style={[typography.caption, { fontWeight: '700', marginLeft: 3, color: isFollowing ? colors.text.secondary : colors.accent.coral }]}
                numberOfLines={1}
            >
                {isFollowing ? 'Following' : 'Follow'}
            </Text>
        </TouchableOpacity>
    );
});

// ── Podium item (top 3) ─────────────────────────────────────────────────────
interface PodiumItemProps {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    score: number;
    rank: number;
    isSelf: boolean;
}

const PodiumItem = React.memo(function PodiumItem({ userId, name, avatarUrl, score, rank, isSelf }: PodiumItemProps) {
    const { colors, typography } = useTheme();
    const router = useRouter();
    const isFirst = rank === 1;
    const medalColor = rank === 1 ? colors.accent.amber : rank === 2 ? colors.text.secondary : colors.accent.orange;
    const avatarUri = safeImageUri(avatarUrl);
    const size = isFirst ? 80 : 72;
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile, rank ${rank}`}
            onPress={() => router.push(`/(community)/userProfile?userId=${userId}` as any)}
            style={[styles.podiumItem, isFirst && { marginTop: -20 }]}
        >
            <View style={[styles.avatarPodium, { width: size, height: size, borderRadius: size / 2, borderColor: medalColor }, isFirst && shadows.glow(colors.accent.amber)]}>
                <Avatar uri={avatarUri} name={name} size={size - 6} />
                <View style={[styles.rankBadge, { backgroundColor: medalColor, borderColor: colors.background.primary }]}>
                    <Text style={[typography.captionMedium, { color: colors.text.inverse }]}>{rank}</Text>
                </View>
            </View>
            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 12 }]} numberOfLines={1}>{name}</Text>
            <Text style={[typography.statTiny, { color: colors.accent.cyan, marginTop: 2 }]}>{score.toLocaleString()} pts</Text>
            {!isSelf && (
                <View style={{ marginTop: 8 }}>
                    <FollowButton userId={userId} name={name} />
                </View>
            )}
        </TouchableOpacity>
    );
});

// ── List row (rank 4+, and the "My Rank" footer) ─────────────────────────────
interface LeaderRowProps {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    score: number;
    rank?: number | null;
    isSelf?: boolean;
}

const LeaderRow = React.memo(function LeaderRow({ userId, name, avatarUrl, score, rank, isSelf }: LeaderRowProps) {
    const { colors, typography, borderRadius } = useTheme();
    const router = useRouter();
    const avatarUri = safeImageUri(avatarUrl);
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile${rank != null ? `, rank ${rank}` : ''}`}
            onPress={() => router.push(`/(community)/userProfile?userId=${userId}` as any)}
            style={[styles.leaderRow, isSelf && { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderRadius: borderRadius.lg, borderWidth: 1, borderColor: withAlpha(colors.accent.cyan, 0.3) }]}
        >
            <Text style={[typography.statTiny, { color: colors.text.secondary, width: 30, textAlign: 'center' }]}>{rank != null ? rank : '–'}</Text>
            <Avatar uri={avatarUri} name={name} size={32} style={{ marginLeft: 4 }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: isSelf ? 'bold' : 'normal' }]} numberOfLines={1}>{name}{isSelf ? ' (You)' : ''}</Text>
            </View>
            {!isSelf && <FollowButton userId={userId} name={name} />}
            <Text style={[typography.statTiny, { color: colors.accent.cyan, marginLeft: 12 }]}>{score.toLocaleString()}</Text>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { paddingBottom: 140 },
    podiumContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', paddingVertical: 40, paddingHorizontal: 10 },
    podiumItem: { alignItems: 'center', flex: 1 },
    avatarPodium: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    rankBadge: { position: 'absolute', bottom: -5, right: -5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    leaderRow: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, paddingHorizontal: 20 },
    followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1 },
    myRankBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 0, paddingTop: 12, borderTopWidth: 1 },
});
