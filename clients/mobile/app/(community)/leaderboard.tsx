import React, { useCallback, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown,
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// item 5 owns community.ts — this item only IMPORTS follow/social helpers + getLeaderboard.
import { getLeaderboard, followUser, unfollowUser, getUserSocial } from '@/api/community';
import { EmptyState, Skeleton, GlassCard } from '@/components/ui';
// Leaderboard-scoped avatar: ink-on-lime fallback (never white-on-lime). Wraps
// the shared <Avatar> for photos; only the photo-less initials differ.
import { LeaderAvatar } from '@/components/LeaderAvatar';
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
const ROW_HEIGHT = 72;

// Cool near-white "silver" for the 2nd-place medal ring + rank badge. The theme
// has no silver token, and text.secondary (#9BA3B4) reads as a muddy grey
// hairline on the deep #0A0C12 bg — too weak to register as a medal. This bright
// cool silver makes the gold > silver > bronze hierarchy actually read.
const SILVER = '#D9DEE8';

// Presentational scope selector. The backend exposes ONE global, all-time
// ranking (getLeaderboard(limit) — no period/scope params), so only "All-Time"
// maps to a real query. Rather than paint the other tabs as live filters that
// silently do nothing (a phantom weekly/monthly board), Week & Month are marked
// `enabled: false` and render as visibly disabled "soon" chips. "All-Time" is
// the one truthful, selectable state — so it never lies about what it fetches.
const PERIODS = [
    { id: 'Week', enabled: false },
    { id: 'Month', enabled: false },
    { id: 'All-Time', enabled: true },
] as const;
type Period = (typeof PERIODS)[number]['id'];

const displayNameOf = (row: LeaderRowData) =>
    row.displayName || row.userName || row.name || 'Athlete';
const scoreOf = (row: LeaderRowData) => row.score ?? row.xp ?? 0;

export default function LeaderboardScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Local-only period label (see PERIODS note). Defaults to the truthful state.
    const [period, setPeriod] = useState<Period>('All-Time');

    // The authenticated user's id — used to suppress the Follow control on the
    // current user's own row. Falls back to myScore.userId (below) if the auth
    // store hasn't hydrated yet.
    const authUserId = useAuthStore((s) => s.user?.id);

    // ── Queries ─────────────────────────────────────────────────────────────
    // `isError`/`refetch` drive the honest retryable error state below — a failed
    // fetch must surface a retry rather than falling through to the "No rankings
    // yet" empty state (an empty list reads as "nobody has ranked" when the
    // request actually failed). The cache stays the single source of truth, so we
    // never mirror the error flag into local state (react-state-fallback).
    const { data: leaderboardData, isLoading, isError, refetch } = useQuery({
        queryKey: ['community-leaderboard'],
        queryFn: () => getLeaderboard(50),
    });

    const rows: LeaderRowData[] = leaderboardData?.leaderboard ?? [];
    const myScore: LeaderRowData | undefined = leaderboardData?.myScore;
    const myId = authUserId ?? myScore?.userId;

    // "You" must appear EXACTLY once. The sticky My-Rank footer renders the self
    // row whenever `myScore` exists (below), so when it will, drop the self row
    // out of the scrolling list — otherwise a 4th+-place user sees their own lime
    // glass card scroll past AND pinned at the bottom (the duplicate-self bug).
    // With the self row kept out of the list, every list row is a plain
    // ROW_HEIGHT TouchableOpacity (no GlassCard border), so getItemLayout's flat
    // ROW_HEIGHT stays pixel-exact and scroll offset math can't drift.
    //
    // Slicing the stable query array yields a new instance but preserves inner
    // row references, so virtualization still skips unchanged rows
    // (list-performance-function-references).
    const listRows = rows
        .slice(3)
        .filter((r) => !(myScore && myId && r.userId === myId));

    // True 1-based rank by userId, taken from the ORIGINAL board order. The list
    // index can no longer stand in for rank: filtering the self row out of the
    // middle would otherwise shift every following row up by one (showing the
    // wrong place). Looking rank up by id keeps each athlete's real position.
    const rankByUserId = useMemo(() => {
        const m = new Map<string, number>();
        rows.forEach((r, i) => m.set(r.userId, i + 1));
        return m;
    }, [rows]);

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
                rank={rankByUserId.get(item.userId) ?? index + 4}
                isSelf={!!myId && item.userId === myId}
                // Stagger only the first screenful so deep scrolls stay snappy.
                index={index}
            />
        ),
        [myId, rankByUserId],
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

    const renderHeader = useCallback(() => {
        const top3 = rows.slice(0, 3);
        // Podium order: 2nd (left) · 1st (center, raised) · 3rd (right) — the
        // classic stepped silhouette. Guard each slot so a 1- or 2-person board
        // still renders without holes.
        const champion = top3[0];
        const second = top3[1];
        const third = top3[2];
        if (!champion) return <View style={{ height: 8 }} />;
        return (
            <View>
                <Animated.View entering={FadeInDown.springify().damping(18).mass(0.9).delay(60)} style={styles.podiumContainer}>
                    {second ? (
                        <PodiumItem
                            userId={second.userId}
                            name={displayNameOf(second)}
                            avatarUrl={second.avatarUrl}
                            score={scoreOf(second)}
                            rank={2}
                            isSelf={!!myId && second.userId === myId}
                        />
                    ) : <View style={styles.podiumItem} />}

                    <PodiumItem
                        userId={champion.userId}
                        name={displayNameOf(champion)}
                        avatarUrl={champion.avatarUrl}
                        score={scoreOf(champion)}
                        rank={1}
                        isSelf={!!myId && champion.userId === myId}
                    />

                    {third ? (
                        <PodiumItem
                            userId={third.userId}
                            name={displayNameOf(third)}
                            avatarUrl={third.avatarUrl}
                            score={scoreOf(third)}
                            rank={3}
                            isSelf={!!myId && third.userId === myId}
                        />
                    ) : <View style={styles.podiumItem} />}
                </Animated.View>

                {listRows.length > 0 && (
                    <Animated.View entering={FadeIn.delay(220)} style={styles.listLabelRow}>
                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>The Pack</Text>
                        <View style={[styles.labelRule, { backgroundColor: colors.border.default }]} />
                    </Animated.View>
                )}
            </View>
        );
    }, [rows, listRows.length, myId, colors, typography]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={[typography.overline, { color: colors.accent.coral }]}>RANKINGS</Text>
                    <Text style={[typography.h1, { color: colors.text.primary, marginTop: 2 }]}>Leaderboard</Text>
                </View>
                <View style={styles.trophyChip}>
                    <Ionicons name="trophy" size={18} color={colors.accent.amber} />
                </View>
            </View>

            {/* Period scope chips — see PERIODS. Only "All-Time" is a real query, so
                it's the one selectable chip; Week/Month render disabled with a
                "Soon" tag so they don't masquerade as live filters. The active
                chip uses a LOW-OPACITY lime TINT + lime hairline + lime text (NOT
                a solid lime fill) — solid lime stays reserved for the self row /
                champion, keeping lime as the scarce 10% accent. */}
            <Animated.View entering={FadeInDown.springify().damping(20).delay(40)} style={styles.chipRow}>
                {PERIODS.map((p) => {
                    const active = p.id === period;
                    const disabled = !p.enabled;
                    return (
                        <TouchableOpacity
                            key={p.id}
                            activeOpacity={disabled ? 1 : 0.85}
                            disabled={disabled}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active, disabled }}
                            accessibilityLabel={
                                disabled ? `${p.id} rankings, coming soon` : `${p.id} rankings`
                            }
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            onPress={() => p.enabled && setPeriod(p.id)}
                            style={[
                                styles.chip,
                                active
                                    ? { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.5) }
                                    : disabled
                                        ? { backgroundColor: withAlpha(colors.text.primary, 0.03), borderColor: colors.border.default, opacity: 0.55 }
                                        : { backgroundColor: withAlpha(colors.text.primary, 0.04), borderColor: colors.border.default },
                            ]}
                        >
                            <Text
                                style={[
                                    typography.captionMedium,
                                    {
                                        fontWeight: '700',
                                        color: active
                                            ? colors.accent.coral
                                            : disabled
                                                ? colors.text.tertiary
                                                : colors.text.secondary,
                                    },
                                ]}
                            >
                                {p.id}
                            </Text>
                            {disabled && (
                                <Text style={[styles.chipSoon, typography.overline, { color: colors.text.tertiary }]}>
                                    Soon
                                </Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </Animated.View>

            {isLoading ? (
                // Honest loading scaffold mirroring the loaded layout — a podium row
                // (three circular avatar placeholders, the centre one taller like the
                // rank-1 slot) followed by a handful of ROW_HEIGHT list-row skeletons
                // (rank + avatar + name). Not a bare spinner, so the screen doesn't
                // "pop" when data arrives.
                <View style={styles.skeletonContent}>
                    <View style={styles.podiumContainer}>
                        {[72, 88, 72].map((size, i) => (
                            <View key={i} style={[styles.podiumItem, i === 1 && { marginTop: -24 }]}>
                                <Skeleton width={size} height={size} radius={size / 2} />
                                <Skeleton width={64} height={14} radius={borderRadius.sm} style={{ marginTop: 12 }} />
                                <Skeleton width={44} height={11} radius={borderRadius.sm} style={{ marginTop: 6 }} />
                            </View>
                        ))}
                    </View>
                    {Array.from({ length: 7 }).map((_, i) => (
                        <View key={i} style={styles.skeletonRow}>
                            <Skeleton width={22} height={20} radius={borderRadius.sm} />
                            <Skeleton width={40} height={40} radius={20} style={{ marginLeft: 12 }} />
                            <Skeleton width={140} height={14} radius={borderRadius.sm} style={{ marginLeft: 12 }} />
                        </View>
                    ))}
                </View>
            ) : isError ? (
                // Honest retryable error — a failed fetch would otherwise fall through
                // to the "No rankings yet" empty layout, which misreads as "nobody has
                // ranked yet". The retry refetches the leaderboard query.
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load the leaderboard"
                    subtitle="Something went wrong fetching the rankings. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                    style={styles.stateFill}
                />
            ) : !rows.length ? (
                <EmptyState
                    icon="podium-outline"
                    title="No rankings yet"
                    subtitle="Earn XP by tracking workouts, sleep, and challenge progress to climb the leaderboard."
                    actionLabel="Track a workout"
                    onAction={() => router.push('/(tabs)/training' as any)}
                    style={styles.stateFill}
                />
            ) : (
                <FlatList
                    data={listRows}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    getItemLayout={getItemLayout}
                    ListHeaderComponent={renderHeader}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    windowSize={11}
                />
            )}

            {/* My Rank Footer — fixed overlay, not part of the virtualized list.
                The sticky positioning + safe-area paddingBottom live on this outer
                wrapper; the visible "my rank" card surface is the self LeaderRow
                below (isSelf), which renders inside a GlassCard with a lime glow.
                A faint top hairline + soft scrim separate the floating card from
                the last scrolling row so it reads as floating ABOVE the content —
                important on short non-notched devices where insets.bottom is 0 and
                the card would otherwise touch the last row. */}
            {!isLoading && myScore && (
                <Animated.View
                    entering={FadeInDown.springify().damping(20).mass(0.9).delay(260)}
                    style={[styles.myRankBar, { paddingBottom: insets.bottom + 12 }]}
                >
                    <View
                        pointerEvents="none"
                        style={[
                            styles.myRankScrim,
                            { backgroundColor: withAlpha(colors.background.primary, 0.0), borderTopColor: withAlpha(colors.text.primary, 0.08) },
                        ]}
                    />
                    <LeaderRow
                        userId={myScore.userId}
                        name={displayNameOf(myScore)}
                        avatarUrl={myScore.avatarUrl}
                        score={scoreOf(myScore)}
                        rank={myScore.rank ?? null}
                        isSelf
                    />
                </Animated.View>
            )}
        </View>
    );
}

// ── Per-row Follow control ────────────────────────────────────────────────────
// Compact pill that reads its own follow state from the social endpoint and
// toggles optimistically. Primitive `userId` prop keeps memo() shallow-compare
// effective (list-performance-item-memo). Never rendered for the current user.
const FollowButton = React.memo(function FollowButton({ userId, name, compact }: { userId: string; name: string; compact?: boolean }) {
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

    // Compact (podium) variant is an icon-only circular pill; the list variant
    // keeps the labelled pill. Both share the same lime-restraint treatment:
    // a faint coral tint when "Follow", a neutral hairline once "Following".
    if (compact) {
        return (
            <TouchableOpacity
                testID={`follow-btn-${userId}`}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: isFollowing }}
                accessibilityLabel={`${isFollowing ? 'Unfollow' : 'Follow'} ${name}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => toggle.mutate()}
                style={[
                    styles.followIconBtn,
                    isFollowing
                        ? { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.light }
                        : { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.45) },
                ]}
            >
                <Ionicons
                    name={isFollowing ? 'checkmark' : 'add'}
                    size={16}
                    color={isFollowing ? colors.text.secondary : colors.accent.coral}
                />
            </TouchableOpacity>
        );
    }

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
    const { colors, typography, borderRadius } = useTheme();
    const router = useRouter();
    const isFirst = rank === 1;
    // Gold / silver / bronze. Champion = brand amber (gold); 2nd = a BRIGHT cool
    // silver (SILVER #D9DEE8 — text.secondary #9BA3B4 read as a muddy grey
    // hairline on the deep bg); 3rd = warm bronze (orange). Bright silver lets
    // the gold > silver > bronze hierarchy actually register.
    const medalColor = rank === 1 ? colors.accent.amber : rank === 2 ? SILVER : colors.accent.orange;
    const avatarUri = safeImageUri(avatarUrl);
    const size = isFirst ? 92 : 76;
    // The podium plinth heights step down 1 > 2 > 3 for the classic silhouette.
    const plinthHeight = isFirst ? 72 : rank === 2 ? 56 : 44;

    // ── Champion peak-end flourish (rank 1 only) ────────────────────────────
    // A small, tasteful winner moment: a spring scale-POP on entrance, then a
    // slow breathing GLOW pulse on the gold ring. Transform + shadowOpacity only
    // (GPU-friendly, no layout). Runners-up get none of this, so the eye lands
    // on the champion last & loudest. Hooks are declared unconditionally (rules
    // of hooks); the animations simply never start for 2nd/3rd.
    const pop = useSharedValue(isFirst ? 0.82 : 1);
    const glow = useSharedValue(0);
    React.useEffect(() => {
        if (!isFirst) return;
        // Land the pop AFTER the podium's FadeInDown (delay ~60–200ms) so the
        // champion visibly settles last.
        pop.value = withDelay(
            260,
            withSequence(
                withTiming(1.06, { duration: 220, easing: Easing.out(Easing.back(1.6)) }),
                withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
            ),
        );
        glow.value = withDelay(
            440,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
                    withTiming(0.25, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
                ),
                -1,
                false,
            ),
        );
    }, [isFirst, pop, glow]);

    const championAvatarStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pop.value }],
        // Pulse the gold halo between a soft and a brighter glow.
        shadowOpacity: 0.16 + glow.value * 0.22,
        shadowRadius: 9 + glow.value * 7,
    }));

    // The sparkle just twinkles (opacity) on the glow cadence — no scale, so it
    // doesn't fight the ring's pop.
    const sparkleStyle = useAnimatedStyle(() => ({
        opacity: 0.45 + glow.value * 0.55,
    }));

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile, rank ${rank}${isFirst ? ', leader' : ''}${isSelf ? ', this is you' : ''}`}
            onPress={() => router.push(`/(community)/userProfile?userId=${userId}` as any)}
            style={[styles.podiumItem, !isFirst && { marginTop: 16 }]}
        >
            {/* Champion crown — a small peak-moment flourish above rank 1 only.
                Purely decorative (rank is already spoken in the row label), so
                hide it from screen readers. */}
            {isFirst && (
                <Ionicons
                    name="ribbon"
                    size={20}
                    color={colors.accent.amber}
                    style={styles.crown}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                />
            )}

            <Animated.View
                style={[
                    styles.avatarPodium,
                    { width: size, height: size, borderRadius: size / 2, borderColor: medalColor },
                    isFirst && shadows.glow(colors.accent.amber),
                    isFirst && championAvatarStyle,
                ]}
            >
                <LeaderAvatar uri={avatarUri} name={name} size={size - 6} />
                {/* Sparkle accent on the champion — a tiny gold twinkle that rides
                    the glow pulse. Decorative, hidden from SR. */}
                {isFirst && (
                    <Animated.View style={[styles.sparkle, sparkleStyle]} pointerEvents="none">
                        <Ionicons
                            name="sparkles"
                            size={16}
                            color={colors.accent.amber}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        />
                    </Animated.View>
                )}
                <View style={[styles.rankBadge, { backgroundColor: medalColor, borderColor: colors.background.primary }]}>
                    <Text style={[typography.captionMedium, { fontWeight: '700', color: colors.text.inverse }]}>{rank}</Text>
                </View>
            </Animated.View>

            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 14 }]} numberOfLines={1}>
                {name}{isSelf ? ' (You)' : ''}
            </Text>

            {/* VALUE dominates its label: big condensed score over a muted "XP". */}
            <Text style={[typography.statSmall, { color: isFirst ? colors.accent.amber : colors.text.primary, marginTop: 2 }]} numberOfLines={1}>
                {score.toLocaleString()}
            </Text>
            <Text style={[typography.overline, { color: colors.text.tertiary }]}>XP</Text>

            {/* Stepped plinth — the "podium" the brief asks for. Champion plinth is
                tinted in brand amber; the runners-up read as neutral glass risers. */}
            <View
                style={[
                    styles.plinth,
                    {
                        height: plinthHeight,
                        borderTopLeftRadius: borderRadius.md,
                        borderTopRightRadius: borderRadius.md,
                        backgroundColor: isFirst ? withAlpha(colors.accent.amber, 0.14) : withAlpha(colors.text.primary, 0.05),
                        borderColor: isFirst ? withAlpha(colors.accent.amber, 0.35) : colors.border.default,
                    },
                ]}
            >
                {!isSelf ? (
                    <FollowButton userId={userId} name={name} compact />
                ) : (
                    <View
                        style={[styles.youDot, { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderColor: withAlpha(colors.accent.coral, 0.5) }]}
                        accessibilityRole="image"
                        accessibilityLabel="This is you"
                    >
                        <Ionicons name="person" size={14} color={colors.accent.coral} importantForAccessibility="no" />
                    </View>
                )}
            </View>
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
    index?: number;
}

const LeaderRow = React.memo(function LeaderRow({ userId, name, avatarUrl, score, rank, isSelf, index }: LeaderRowProps) {
    const { colors, typography, borderRadius } = useTheme();
    const router = useRouter();
    const avatarUri = safeImageUri(avatarUrl);

    // The tappable row body — identical for every row. The fixed-height layout
    // (styles.leaderRow → height: ROW_HEIGHT) is what FlatList's getItemLayout
    // pins, so it stays on the TouchableOpacity in BOTH branches and is never
    // wrapped in anything that adds vertical margin.
    const row = (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile${rank != null ? `, rank ${rank}` : ''}${isSelf ? ', this is you' : ''}`}
            onPress={() => router.push(`/(community)/userProfile?userId=${userId}` as any)}
            style={styles.leaderRow}
        >
            {/* Rank reads as a big condensed numeral; the self row tints it lime. */}
            <Text
                style={[
                    typography.statSmall,
                    { color: isSelf ? colors.accent.coral : colors.text.tertiary, width: 34, textAlign: 'center' },
                ]}
            >
                {rank != null ? rank : '–'}
            </Text>
            <LeaderAvatar uri={avatarUri} name={name} size={40} style={{ marginLeft: 6 }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: isSelf ? 'bold' : '600' }]} numberOfLines={1}>
                    {name}{isSelf ? ' (You)' : ''}
                </Text>
                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]} numberOfLines={1}>
                    {score.toLocaleString()} XP
                </Text>
            </View>
            {!isSelf && <FollowButton userId={userId} name={name} />}
            {/* VALUE dominates: big condensed score trails the row, label lives
                under the name so the number stays the loudest thing on the right. */}
            <Text style={[typography.statSmall, { color: isSelf ? colors.accent.coral : colors.accent.cyan, marginLeft: 12 }]}>
                {score.toLocaleString()}
            </Text>
        </TouchableOpacity>
    );

    // The self row reads as a tinted highlight card ("this is you"). That card
    // surface is now the Aurora GlassCard: its frosted fill replaces the old
    // withAlpha background, while the LIME-tinted hairline (passed via style,
    // which the primitive spreads last so it overrides the default border) + a
    // soft lime glow mark the self-row identity — the one place lime owns a row.
    // The inner row keeps its fixed ROW_HEIGHT so getItemLayout stays exact even
    // when the self row appears inside the virtualized list.
    if (isSelf) {
        return (
            <GlassCard
                testID={`leader-row-card-${userId}`}
                radius={borderRadius.lg}
                glow={colors.accent.coral}
                style={{ borderColor: withAlpha(colors.accent.coral, 0.4) }}
            >
                {row}
            </GlassCard>
        );
    }

    // Staggered entrance for the first screenful of pack rows; rows past the
    // initial window render immediately (no delay) so deep scrolls stay smooth.
    if (index != null && index < 10) {
        return (
            <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(240 + index * 40)}>
                {row}
            </Animated.View>
        );
    }

    return row;
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    headerTitleWrap: { flex: 1, marginLeft: 8 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    trophyChip: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    // Period segmented control. Only "All-Time" is live; Week/Month show a small
    // "Soon" tag under the label, so the chip stacks its two lines vertically.
    chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
    chip: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1 },
    // Tiny "Soon" tag for the disabled (coming-soon) period chips.
    chipSoon: { fontSize: 8, lineHeight: 10, letterSpacing: 1, marginTop: 1, opacity: 0.85 },
    // Fills the area below the header so the error / empty EmptyState centers in the
    // remaining space rather than hugging the top.
    stateFill: { flex: 1 },
    // Loading scaffold: same horizontal rhythm as the loaded list (podium block +
    // ROW_HEIGHT rows), padded so the placeholders line up with the real rows.
    skeletonContent: { flex: 1 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, paddingHorizontal: 20 },
    listContent: { paddingBottom: 150 },
    // Podium block — runners-up flank a raised champion. align flex-end so the
    // stepped plinths share a common baseline.
    podiumContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingTop: 24, paddingBottom: 8, paddingHorizontal: 12 },
    podiumItem: { alignItems: 'center', flex: 1 },
    crown: { marginBottom: 4 },
    avatarPodium: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    // Champion-only gold twinkle, pinned to the ring's top-left corner.
    sparkle: { position: 'absolute', top: -4, left: -4 },
    rankBadge: { position: 'absolute', bottom: -6, right: -6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    // Stepped riser under each podium athlete; holds the follow / "you" affordance.
    plinth: { alignSelf: 'stretch', marginTop: 12, marginHorizontal: 6, borderWidth: 1, borderBottomWidth: 0, alignItems: 'center', paddingTop: 12 },
    youDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    // Section label between podium and the pack.
    listLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    labelRule: { flex: 1, height: 1 },
    leaderRow: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, paddingHorizontal: 20 },
    followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1 },
    followIconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    // Sticky "my rank" overlay wrapper — positioning + safe-area padding only.
    // The visible card surface is the self LeaderRow's GlassCard (it owns the
    // fill + hairline), so this wrapper carries no fill/border; the horizontal
    // padding insets that glass card from the screen edges.
    myRankBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12 },
    // Faint top hairline above the floating My-Rank card so it reads as floating
    // above the scroll content (esp. on short, non-notched devices). Full-width,
    // edge-to-edge, sitting just above the inset glass card.
    myRankScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
