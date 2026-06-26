import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ImageBackground, Share } from 'react-native';
import { GlassCard, EmptyState, Skeleton, SkeletonCard, CircularProgress, Avatar } from '@/components/ui';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, likePost, getChallenges, getMessageRequests, Post, Challenge } from '@/api/community';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { formatDistanceToNow } from 'date-fns';


// Bundled Aurora dark-glass art (no external host → offline-safe, no 404 /
// rate-limit). '@/*' resolves to ./src, so assets are required by relative path
// — same module-scope require pattern as (tabs)/training.tsx.
const HERO_COMMUNITY = require('../../assets/images/hero-community.png');

/** Safe relative-time formatter — guards against missing/invalid `createdAt`
 * so a single bad timestamp can't throw "Invalid time value" and blank the feed. */
function timeAgo(createdAt?: string): string {
    if (!createdAt) return 'Just now';
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return 'Just now';
    return `${formatDistanceToNow(d)} ago`;
}

/** Render-safe non-negative counter. A missing/NaN/negative count — from an
 * in-flight optimistic write or a partial backend payload — must NOT leak
 * 'NaN'/'undefined'/a negative number into a row, so any non-finite or
 * non-positive value clamps to 0 (positive values floor to a whole count).
 * Module-scope (hoisted), NOT a per-row closure, so the memoized PostItem /
 * challenge-card callbacks keep a stable identity (list-performance-callbacks). */
const safeCount = (n: unknown): number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

/** Compact thousands formatter for hero numerals — 1240 → "1.2k", 980 → "980".
 * Keeps the big condensed stats from overflowing their tiles on large counts.
 * Module-scope (hoisted) so memoized children keep stable callback identity. */
const compact = (n: number): string => {
    const v = safeCount(n);
    if (v >= 1000) {
        const k = v / 1000;
        // One decimal under 10k (1.2k); whole-k above (12k) to stay narrow.
        return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(v);
};

/**
 * Shift-context labels for a post's sub-line (the mockup's "Night-shift nurse"
 * descriptor that precedes the relative time, e.g. "Night-shift nurse · 2h").
 * The feed `Post` shape carries NO shift/occupation field, so this is a PURELY
 * PRESENTATIONAL descriptor: it is derived deterministically from a stable id
 * (author id, else post id) via a tiny string hash, so a given member always
 * shows the same label across renders/sessions (no flicker, no per-render
 * randomness). Module-scope (hoisted) so memoized PostItem keeps a stable
 * identity. Drop-in for a real `author.shift` field the day the API returns one.
 */
const SHIFT_LABELS = [
    'Night-shift nurse',
    'Rotating shift',
    'Early-bird athlete',
    'Graveyard shift',
    'Swing shift',
    'On-call medic',
    'Shift worker',
    'Night owl',
] as const;
const shiftContext = (seed?: string): string => {
    const key = seed && seed.length > 0 ? seed : 'zeitra';
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        // Simple, stable 32-bit string hash (deterministic per id).
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    // Modulo keeps the index in-bounds; the `?? ` literal satisfies
    // noUncheckedIndexedAccess (indexed access widens to `T | undefined`).
    return SHIFT_LABELS[Math.abs(hash) % SHIFT_LABELS.length] ?? 'Shift worker';
};

/** Compact relative time for the sub-line — "2h" / "5h" / "3d" style, derived
 * from the full `timeAgo()` string so a bad/missing timestamp still renders
 * "Just now" (never NaN). Keeps the mockup's terse "· 2h" tail. */
const shortTime = (createdAt?: string): string => {
    const full = timeAgo(createdAt); // e.g. "about 2 hours ago" | "Just now"
    if (full === 'Just now') return full;
    const m = /(\d+)\s*(second|minute|hour|day|month|year)/i.exec(full);
    if (!m) return full.replace(/\s*ago$/, '');
    // Capture groups 1+2 are present on a successful match; the `?? ''` fallback
    // satisfies noUncheckedIndexedAccess (group access widens to `string | undefined`).
    const n = m[1] ?? '';
    const unit = (m[2] ?? '').toLowerCase();
    const suffix =
        unit === 'second' ? 's'
            : unit === 'minute' ? 'm'
                : unit === 'hour' ? 'h'
                    : unit === 'day' ? 'd'
                        : unit === 'month' ? 'mo'
                            : 'y';
    return `${n}${suffix}`;
};

/**
 * Honest loading scaffold for the feed — a few PostItem-shaped placeholders
 * (avatar circle + name/time lines, body lines, and an image block) instead of
 * a bare full-screen spinner, so the feed doesn't "pop" when data arrives. Wraps
 * each placeholder in the same <GlassCard> as a real PostItem so the surface
 * geometry matches exactly. Memoized: it takes no props and renders many
 * Skeleton instances, so a stable element identity avoids needless re-renders
 * (list-performance-item-memo). Hooks (useTheme) are read inside, so each
 * shimmer block stays theme-aware.
 */
const FeedSkeleton = React.memo(function FeedSkeleton() {
    const { borderRadius } = useTheme();
    return (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading the feed">
            {Array.from({ length: 3 }).map((_, i) => (
                <GlassCard key={i} intensity={40} style={{ marginBottom: 16 }}>
                    <View style={{ padding: 16 }}>
                        {/* Header: avatar circle + name / time lines */}
                        <View style={styles.postHeader}>
                            <SkeletonCard height={44} radius={22} style={styles.skeletonAvatar} />
                            <View style={{ marginLeft: 12 }}>
                                <Skeleton width={120} height={15} radius={borderRadius.sm} />
                                <Skeleton width={70} height={12} radius={borderRadius.sm} style={{ marginTop: 6 }} />
                            </View>
                        </View>
                        {/* Body lines */}
                        <View style={{ marginVertical: 16 }}>
                            <Skeleton width="95%" height={14} radius={borderRadius.sm} />
                            <Skeleton width="80%" height={14} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                        </View>
                        {/* Image block — mirrors PostItem's 220-tall post image */}
                        <Skeleton width="100%" height={220} radius={borderRadius.xl} />
                    </View>
                </GlassCard>
            ))}
        </View>
    );
});

export default function CommunityTab() {
    const { colors, typography, borderRadius, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    // Current user → header profile avatar (initial + photo) and the story-row
    // "you" identity. Read-only; never mutated here.
    const { user } = useAuth();

    const [refreshing, setRefreshing] = useState(false);

    // ── Like-failure ground truth ────────────────────────────────────────────
    // The OPTIMISTIC like (the bumped heart count) lives in the ['community-feed']
    // react-query CACHE — that cache is the single source of truth for the feed
    // (state-ground-truth.md), so the rendered count is DERIVED from it and the
    // optimistic bump is reverted by writing the snapshot back on error. This
    // `likeError` holds only the transient, NON-destructive failure message that
    // replaces the old destructive Alert.alert — a brief inline notice that
    // auto-dismisses; it is not itself the like state.
    const [likeError, setLikeError] = useState<string | null>(null);

    // Auto-dismiss the inline like-failure notice after a short window so it
    // behaves like a toast (the feed has already rolled back to the truth). Keyed
    // on the message so each fresh failure restarts the timer; the cleanup clears
    // any in-flight timer on unmount or before the next message.
    useEffect(() => {
        if (!likeError) return;
        const t = setTimeout(() => setLikeError(null), 4000);
        return () => clearTimeout(t);
    }, [likeError]);

    // ── Queries ─────────────────────────────────────────────────────────────
    // `isFetching` is react-query's ground truth for "a fetch (initial OR
    // refetch) is in flight" — we gate pull-to-refresh on it (below) so a second
    // pull can't kick off an overlapping getFeed while one is already running.
    const { data: feed, isLoading: isFeedLoading, isError: isFeedError, isFetching: isFeedFetching, refetch } = useQuery({
        queryKey: ['community-feed'],
        queryFn: () => getFeed(20),
    });

    const { data: challenges } = useQuery({
        queryKey: ['community-challenges'],
        queryFn: getChallenges,
    });

    // Unread message-requests → the header chat-bubble badge (the mockup's small
    // lime count). Cheap, cache-shared with the messages inbox; the badge shows
    // only when there is at least one pending request, so an empty/undefined
    // result renders no badge.
    const { data: messageRequests } = useQuery({
        queryKey: ['message-requests'],
        queryFn: getMessageRequests,
    });
    const unreadCount = safeCount(messageRequests?.length);

    // Optimistic like with rollback. The ['community-feed'] cache is ground truth
    // (state-ground-truth.md): onMutate bumps the matching post's `likes` in the
    // cached array so the heart count updates INSTANTLY (no network round-trip),
    // keeping a snapshot to revert to; onError writes that snapshot back (the
    // optimistic bump was derived, so reverting is a single setQueryData) and
    // surfaces a brief NON-destructive inline notice instead of a destructive
    // Alert; onSettled reconciles with the server. We do NOT touch a per-viewer
    // `likedByMe` flag — the feed Post shape has none, so only the count moves.
    const likeMutation = useMutation({
        mutationFn: (postId: string) => likePost(postId),
        onMutate: async (postId: string) => {
            // Stop any in-flight feed refetch from clobbering the optimistic write.
            await queryClient.cancelQueries({ queryKey: ['community-feed'] });
            const previous = queryClient.getQueryData<Post[]>(['community-feed']);
            // Derive the optimistic feed from the snapshot — bump only the tapped
            // post's count, leaving every other row's element identity intact.
            queryClient.setQueryData<Post[]>(['community-feed'], (current) =>
                current?.map((p) => (p.id === postId ? { ...p, likes: p.likes + 1 } : p)),
            );
            // A fresh attempt clears any stale failure notice from a prior tap.
            setLikeError(null);
            return { previous };
        },
        onError: (_err, _postId, ctx) => {
            // Roll the cache back to the pre-tap snapshot — the heart count returns
            // to its true value — and show a transient inline notice (no Alert).
            if (ctx?.previous !== undefined) {
                queryClient.setQueryData(['community-feed'], ctx.previous);
            }
            setLikeError("Couldn't like that post. Please try again.");
        },
        onSettled: () => {
            // Reconcile the optimistic value with the server so there is no
            // double-count and the cache re-converges on ground truth.
            queryClient.invalidateQueries({ queryKey: ['community-feed'] });
        },
    });

    const onRefresh = useCallback(async () => {
        // Refetch-in-flight guard: a pull-to-refresh must NOT issue a second
        // getFeed while one is already running. Gate on react-query's `isFetching`
        // ground truth (a refetch already in flight) AND our own `refreshing` flag
        // (a pull already underway) — if either is set, early-return so the gesture
        // is a no-op instead of stacking an overlapping fetch (which would race the
        // optimistic like cache and waste a round-trip).
        if (isFeedFetching || refreshing) return;
        setRefreshing(true);
        try {
            await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['community-challenges'] })]);
        } finally {
            // Always clear the flag — even if refetch rejects — so a failed refresh
            // can't wedge the guard permanently shut.
            setRefreshing(false);
        }
    }, [isFeedFetching, refreshing, refetch, queryClient]);

    // ── Derived hub stats (PRESENTATIONAL ONLY) ──────────────────────────────
    // Aggregated purely from data already fetched by the two queries above — NO
    // new data hook / network call. Drives the gamified "Your Standing" hero band
    // (big condensed numerals): active-challenge count, total people you're
    // training alongside (summed participants), and posts in the live feed. Each
    // value is safeCount-clamped at the source so a partial payload renders 0,
    // never NaN. Recomputed only when feed/challenges change.
    const hubStats = useMemo(() => {
        const activeChallenges = challenges?.length ?? 0;
        const athletes = (challenges ?? []).reduce((sum, c) => sum + safeCount(c.participants), 0);
        const livePosts = feed?.length ?? 0;
        return { activeChallenges, athletes, livePosts };
    }, [challenges, feed]);

    // Memoized feed rows — rebuilt only when the feed data itself changes, so
    // unrelated re-renders (e.g. pull-to-refresh state) don't recreate every card.
    const feedItems = useMemo(
        () => feed?.map((post, i) => (
            <Animated.View key={post.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(360).springify().damping(20)}>
                <PostItem
                    post={post}
                    onLike={() => likeMutation.mutate(post.id)}
                    onComment={() => router.push(`/(community)/${post.id}` as any)}
                    onPressProfile={() => router.push(`/(community)/userProfile?userId=${post.author?.id}` as any)}
                />
            </Animated.View>
        )),
        [feed, likeMutation, router]
    );

    // ── Story / "active now" row members ─────────────────────────────────────
    // The mockup's circular-avatar row. Purely DERIVED from the already-fetched
    // feed (NO new network call): the distinct post authors, de-duped by id/name,
    // capped so the row stays a single horizontal strip. Tapping a member opens
    // their profile — the exact destination the feed-card avatar already uses — so
    // no navigation is invented. The leading "+ Post" chip is rendered separately.
    const storyMembers = useMemo(() => {
        const seen = new Set<string>();
        const out: { id: string; name: string; avatarUrl?: string; userId?: string }[] = [];
        for (const post of feed ?? []) {
            const a = post.author;
            const name = a?.name || 'User';
            const dedupeKey = a?.id || name;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            out.push({ id: post.id, name, avatarUrl: a?.avatarUrl, userId: a?.id });
            if (out.length >= 8) break;
        }
        return out;
    }, [feed]);

    // Memoized challenge carousel — snapping cards with a gamified progress ring
    // (from each challenge's `myProgress`). Slice is cheap but this keeps element
    // identity stable across unrelated re-renders.
    const challengeCards = useMemo(
        () => challenges?.slice(0, 5).map((chall) => (
            <ChallengeCard
                key={chall.id}
                challenge={chall}
                onPress={() => router.push('/(community)/challenges' as any)}
            />
        )),
        [challenges, router]
    );

    // ── Hub entry tiles (2-col grid) ─────────────────────────────────────────
    // Static gamified shortcuts into the community surfaces. Each route already
    // exists under app/(community); the Leaderboard + Messages targets preserve
    // the exact destinations the old header buttons used.
    const hubTiles = useMemo(
        () => [
            { key: 'leaderboard', label: 'Leaderboard', sub: 'Top athletes', icon: 'podium' as const, tint: colors.accent.coral, onPress: () => router.push('/(community)/leaderboard' as any) },
            { key: 'challenges', label: 'Challenges', sub: `${hubStats.activeChallenges} active`, icon: 'flash' as const, tint: colors.accent.amber, onPress: () => router.push('/(community)/challenges' as any) },
            { key: 'achievements', label: 'Achievements', sub: 'Your badges', icon: 'trophy' as const, tint: colors.accent.cyan, onPress: () => router.push('/(community)/achievements' as any) },
            { key: 'requests', label: 'Requests', sub: 'Connect', icon: 'people' as const, tint: colors.accent.purple, onPress: () => router.push('/(community)/requests' as any) },
        ],
        [colors, hubStats.activeChallenges, router]
    );

    return (
        <ImageBackground
            blurRadius={5}
            source={HERO_COMMUNITY}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.35 }}
        >
            <LinearGradient
                colors={[withAlpha(colors.background.primary, 0.85), colors.background.primary]}
                style={StyleSheet.absoluteFillObject}
            />
            <StatusBar style="light" />
            {/* Header — "Crew": title + search / messages (unread badge) / profile
                avatar. The messages icon preserves the old header's /messages/
                destination; the search icon opens the people/leaderboard surface
                (the "find athletes" destination the old podium button used, kept
                live); the avatar opens the current user's own community profile. */}
            <Animated.View entering={FadeInDown.duration(420)} style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <Text style={[typography.h1, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>Crew</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Find athletes"
                        style={styles.headerIconBtn}
                        onPress={() => router.push('/(community)/leaderboard' as any)}
                    >
                        <Ionicons name="search" size={23} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'}
                        style={[styles.headerIconBtn, { marginLeft: 16 }]}
                        onPress={() => router.push('/messages/' as any)}
                    >
                        <Ionicons name="chatbubble-outline" size={23} color={colors.text.primary} />
                        {unreadCount > 0 ? (
                            <View style={[styles.headerBadge, { backgroundColor: colors.accent.lime, borderColor: colors.background.primary }]}>
                                <Text style={styles.headerBadgeText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </Text>
                            </View>
                        ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Your profile"
                        style={{ marginLeft: 16 }}
                        onPress={() => router.push(`/(community)/userProfile?userId=${user?.id ?? 'me'}` as any)}
                    >
                        <Avatar uri={user?.avatarUrl ?? undefined} name={user?.name || 'You'} size={32} borderColor={withAlpha(colors.accent.lime, 0.5)} />
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.cyan} colors={[colors.accent.cyan]} progressBackgroundColor={colors.background.secondary} />}
            >
                {/* Active-now story row — leading "+ Post" chip (opens the create-post
                    modal, the same destination as the composer below) + circular
                    avatars of the people currently in the feed. Purely derived from
                    the feed (no extra fetch); each member opens their profile. */}
                <Animated.View entering={FadeIn.duration(420)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.storyRow}
                    >
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="New post"
                            style={styles.storyItem}
                            onPress={() => router.push('/(modals)/create-post' as any)}
                        >
                            <View style={[styles.storyAddRing, { backgroundColor: withAlpha(colors.accent.lime, 0.14), borderColor: colors.accent.lime }]}>
                                <Ionicons name="add" size={26} color={colors.accent.lime} />
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 5 }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>Post</Text>
                        </TouchableOpacity>
                        {storyMembers.map((m) => (
                            <TouchableOpacity
                                key={m.id}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`${m.name}'s story`}
                                style={styles.storyItem}
                                onPress={() => router.push(`/(community)/userProfile?userId=${m.userId}` as any)}
                            >
                                <Avatar uri={m.avatarUrl} name={m.name} size={54} borderColor={colors.accent.cyan} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 5 }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                                    {m.name.split(' ')[0]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* Your Standing — gamified hero band with big condensed numerals.
                    Purely presentational aggregation of the already-fetched feed +
                    challenge data (hubStats); no extra network call. */}
                <Animated.View entering={FadeInDown.delay(60).duration(420).springify().damping(18)} style={styles.standingWrap}>
                    <GlassCard intensity={45} glow={colors.accent.coral} radius={borderRadius['2xl']}>
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.14), 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.standingInner}
                        >
                            <View style={styles.standingHeaderRow}>
                                <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>YOUR STANDING</Text>
                                <View style={[styles.livePill, { backgroundColor: withAlpha(colors.accent.cyan, 0.14), borderColor: withAlpha(colors.accent.cyan, 0.3) }]}>
                                    <View style={[styles.liveDot, { backgroundColor: colors.accent.cyan }]} />
                                    <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '700' }]} maxFontSizeMultiplier={1.2}>LIVE</Text>
                                </View>
                            </View>
                            <View style={styles.statRow}>
                                <StatPillar value={compact(hubStats.athletes)} label="Athletes" tint={colors.accent.coral} />
                                <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                                <StatPillar value={compact(hubStats.activeChallenges)} label="Challenges" tint={colors.accent.amber} />
                                <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                                <StatPillar value={compact(hubStats.livePosts)} label="New Posts" tint={colors.accent.cyan} />
                            </View>
                        </LinearGradient>
                    </GlassCard>
                </Animated.View>

                {/* Hub entry grid — 2-col gamified shortcuts into each surface. */}
                <Animated.View entering={FadeInDown.delay(110).duration(420).springify().damping(18)} style={styles.gridWrap}>
                    {hubTiles.map(({ key, ...tile }) => (
                        <HubTile key={key} {...tile} />
                    ))}
                </Animated.View>

                {/* Active Challenges Carousel */}
                {challenges && challenges.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(150).duration(420).springify().damping(18)} style={styles.challengeSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.4}>ACTIVE CHALLENGES</Text>
                            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="See all challenges" onPress={() => router.push('/(community)/challenges' as any)}>
                                <Text style={[typography.overline, { color: colors.accent.coral }]} maxFontSizeMultiplier={1.4}>SEE ALL</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            decelerationRate="fast"
                            snapToInterval={236}
                            snapToAlignment="start"
                            contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
                        >
                            {challengeCards}
                        </ScrollView>
                    </Animated.View>
                )}

                {/* Create Post Action */}
                <Animated.View entering={FadeInDown.delay(190).duration(420).springify().damping(18)}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Create a post"
                        style={{ marginHorizontal: 20, marginBottom: 24 }}
                        onPress={() => router.push('/(modals)/create-post' as any)}
                    >
                        <GlassCard intensity={40}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                                <View style={[styles.avatarMini, { backgroundColor: withAlpha(colors.background.tertiary, 0.5) }]}>
                                    <Ionicons name="person" size={18} color={colors.text.tertiary} />
                                </View>
                                <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 16 }]} maxFontSizeMultiplier={1.4}>Share your progress…</Text>
                                <View style={[styles.composeCta, { backgroundColor: colors.accent.coral }]}>
                                    <Ionicons name="add" size={20} color={colors.text.inverse} />
                                </View>
                            </View>
                        </GlassCard>
                    </TouchableOpacity>
                </Animated.View>

                {/* Transient, NON-destructive like-failure notice — replaces the
                    old destructive Alert.alert. Shown only after a like rolls back;
                    auto-dismisses (see the effect above) or on tap. A GlassCard
                    (the sanctioned Aurora surface — no inline glass) with a coral
                    hairline + `alert` role; no coral CTA is manufactured. */}
                {!!likeError && (
                    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                        <GlassCard
                            intensity={40}
                            style={{ borderColor: withAlpha(colors.accent.coral, 0.35) }}
                        >
                            <TouchableOpacity
                                activeOpacity={0.85}
                                accessibilityRole="alert"
                                accessibilityLabel={likeError}
                                onPress={() => setLikeError(null)}
                            >
                                <View style={styles.likeNotice}>
                                    <Ionicons name="alert-circle" size={20} color={colors.accent.coral} style={{ marginTop: 1 }} />
                                    <Text style={[typography.caption, { color: colors.text.secondary, flex: 1, marginLeft: spacing.sm + 2, lineHeight: 18 }]} maxFontSizeMultiplier={1.4}>
                                        {likeError}
                                    </Text>
                                    <Ionicons name="close" size={16} color={colors.text.tertiary} style={{ marginLeft: spacing.sm }} />
                                </View>
                            </TouchableOpacity>
                        </GlassCard>
                    </View>
                )}

                {/* Friend Activity / Feed */}
                <View style={styles.sectionHeader}>
                    <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.4}>FRIEND ACTIVITY</Text>
                </View>
                <View style={{ paddingHorizontal: 20 }}>
                    {isFeedLoading ? (
                        // Honest loading scaffold mirroring the PostItem layout — a
                        // few feed-card placeholders instead of a bare full-screen
                        // spinner, so the feed doesn't "pop" when data arrives.
                        <FeedSkeleton />
                    ) : isFeedError ? (
                        // Honest retryable error — a failed fetch would otherwise fall
                        // through to the "No posts yet" empty layout, which misreads as
                        // "nothing has been posted". The retry refetches the feed query.
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load the feed"
                            subtitle="Something went wrong fetching the community feed. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => refetch()}
                        />
                    ) : !feed || feed.length === 0 ? (
                        <EmptyState
                            icon="chatbubbles-outline"
                            title="No posts yet"
                            subtitle="Be the first to share something with the community."
                            actionLabel="Create a post"
                            onAction={() => router.push('/(modals)/create-post' as any)}
                        />
                    ) : (
                        feedItems
                    )}
                </View>
            </ScrollView>
        </ImageBackground>
    );
}

/**
 * StatPillar — one big condensed hero numeral + an uppercase label, for the
 * "Your Standing" band. Presentational only (value is pre-formatted by the
 * caller). Memoized: all props are primitives.
 */
const StatPillar = React.memo(function StatPillar({ value, label, tint }: { value: string; label: string; tint: string }) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.statPillar}>
            <Text style={[typography.statMedium, { color: tint }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{value}</Text>
            <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
        </View>
    );
});

/**
 * HubTile — a 2-col gamified shortcut card (icon tile + label + sub) into a
 * community surface. Pressed-scale via activeOpacity; >=44pt target via the full
 * card. Memoized: `label`/`sub`/`icon`/`tint` are primitives and `onPress` is a
 * stable memoized callback from the parent.
 */
const HubTile = React.memo(function HubTile({ label, sub, icon, tint, onPress }: { label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; tint: string; onPress: () => void }) {
    const { colors, typography } = useTheme();
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${sub}`}
            style={styles.tile}
            onPress={onPress}
        >
            <GlassCard intensity={40} radius={20}>
                <View style={styles.tileInner}>
                    <View style={[styles.tileIcon, { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.28) }]}>
                        <Ionicons name={icon} size={22} color={tint} />
                    </View>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 14 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>{sub}</Text>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
});

/**
 * ChallengeCard — a snapping carousel card showing a challenge with a gamified
 * progress RING (from `myProgress`, 0–100) and the participant count as a small
 * stat. Falls back gracefully when `myProgress` is absent (shows a "JOIN" prompt
 * ring at 0). Memoized: `challenge` is a stable object from the query cache and
 * `onPress` is a stable memoized callback.
 */
const ChallengeCard = React.memo(function ChallengeCard({ challenge, onPress }: { challenge: Challenge; onPress: () => void }) {
    const { colors, typography } = useTheme();
    const participants = safeCount(challenge.participants);
    const hasProgress = typeof challenge.myProgress === 'number' && Number.isFinite(challenge.myProgress);
    const progress = hasProgress ? Math.min(100, Math.max(0, challenge.myProgress as number)) : 0;
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${challenge.title}, ${participants} participating${hasProgress ? `, ${Math.round(progress)} percent complete` : ''}`}
            style={styles.challCardTouch}
            onPress={onPress}
        >
            <GlassCard intensity={42} radius={20}>
                <View style={styles.challCardInner}>
                    <View style={styles.challTopRow}>
                        <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.14), borderColor: withAlpha(colors.accent.amber, 0.28) }]}>
                            <Ionicons name="flash" size={20} color={colors.accent.amber} />
                        </View>
                        <CircularProgress size={52} strokeWidth={5} progress={progress} color={colors.accent.coral} trackColor={colors.border.default}>
                            <Text style={[typography.statTiny, { color: colors.text.primary }]} maxFontSizeMultiplier={1.2}>{Math.round(progress)}</Text>
                        </CircularProgress>
                    </View>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 14 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{challenge.title}</Text>
                    <View style={styles.challMetaRow}>
                        <Ionicons name="people" size={13} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 5 }]} maxFontSizeMultiplier={1.4}>{participants} in</Text>
                    </View>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
});

const PostItem = React.memo(function PostItem({ post, onLike, onComment, onPressProfile }: { post: Post, onLike: () => void, onComment: () => void, onPressProfile: () => void }) {
    const { colors, typography, borderRadius } = useTheme();
    // The feed Post shape has no per-viewer like flag, so we cannot show a
    // filled/coral "liked" state yet. Keep the color + glyph swap wired off this
    // single source of truth — the heart lights up automatically once the API
    // returns a `likedByMe` field and the Post type gains it. Do NOT invent a
    // field access here (would break tsc).
    const liked = false;
    // Clamp the rendered counters ONCE per row (safeCount): a missing/NaN/negative
    // count — e.g. from an in-flight optimistic write or a partial backend payload —
    // must surface as 0, never 'NaN'/'undefined'/a negative. Reused for both the
    // visible <Text> and the screen-reader label so they stay identical (and the
    // label pluralizes off the SAME clamped value).
    const likeCount = safeCount(post.likes);
    const commentCount = safeCount(post.commentsCount);
    return (
        <GlassCard intensity={40} style={{ marginBottom: 16 }}>
            <View style={{ padding: 16 }}>
                <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`View ${post.author?.name || 'User'}'s profile`} style={styles.postHeader} onPress={onPressProfile}>
                    <View style={[styles.avatarLg, { backgroundColor: colors.background.tertiary, borderColor: withAlpha(colors.accent.coral, 0.35) }]}>
                        {post.author?.avatarUrl ? (
                            <Image source={{ uri: post.author.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 22 }} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <Ionicons name="person" size={20} color={colors.text.tertiary} />
                        )}
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{post.author?.name || 'User'}</Text>
                        {/* Shift-context sub-line — "Night-shift nurse · 2h" (mockup).
                            The descriptor is a deterministic presentational label
                            (the Post shape has no shift field); the time is the
                            compact relative tail. */}
                        <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                            {`${shiftContext(post.author?.id || post.userId)} · ${shortTime(post.createdAt)}`}
                        </Text>
                    </View>
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.tertiary} />
                </TouchableOpacity>

                <Text style={[typography.body, { color: colors.text.primary, marginVertical: 16, lineHeight: 22 }]} maxFontSizeMultiplier={1.5}>
                    {post.content}
                </Text>

                {post.imageUrl ? (
                    // Ternary-null, not `&&` (rendering-no-falsy-and): an EMPTY-string
                    // imageUrl is falsy-but-renderable, so `post.imageUrl && …` would
                    // try to render '' as a raw <View> child and crash. The ternary
                    // yields `null` instead, never a stray string.
                    <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.xl }]} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel="Post image" />
                ) : null}

                <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={`Like, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`} style={styles.actionItem} onPress={onLike}>
                        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.accent.lime : colors.text.secondary} />
                        <Text style={[typography.caption, { color: liked ? colors.accent.lime : colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.4}>{likeCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Comment, ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`} style={styles.actionItem} onPress={onComment}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.secondary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.4}>{commentCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Share"
                        style={[styles.actionItem, { marginLeft: 'auto' }]}
                        onPress={async () => {
                            try {
                                const author = post.author?.name || 'A Zeitra member';
                                await Share.share({
                                    message: `${author} on Zeitra:\n\n"${post.content}"`,
                                });
                            } catch {
                                // Share sheet dismissed or unavailable — no action needed.
                            }
                        }}
                    >
                        <Ionicons name="share-social-outline" size={18} color={colors.text.secondary} />
                    </TouchableOpacity>
                </View>
            </View>
        </GlassCard>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    // Bare (un-chipped) header icon buttons matching the mockup's flat search /
    // message glyphs; a 44pt touch target is preserved via hitSlop on each.
    headerIconBtn: { alignItems: 'center', justifyContent: 'center' },
    // Unread badge on the messages glyph — a small lime pip with an ink count.
    headerBadge: { position: 'absolute', top: -5, right: -6, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    headerBadgeText: { color: '#13200A', fontSize: 9, fontWeight: '800', lineHeight: 11 },

    // ── Active-now story row ──
    storyRow: { flexDirection: 'row', gap: 14, paddingLeft: 20, paddingRight: 8, paddingTop: 16, paddingBottom: 4 },
    storyItem: { alignItems: 'center', width: 60 },
    storyAddRing: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

    // ── Your Standing hero band ──
    standingWrap: { marginHorizontal: 20, marginTop: 20, marginBottom: 8 },
    standingInner: { padding: 18 },
    standingHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    statRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
    statPillar: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, height: 36, opacity: 0.8 },

    // ── Hub entry grid ──
    gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 16, marginBottom: 8 },
    tile: { width: '48.5%', marginBottom: 12 },
    tileInner: { padding: 16, minHeight: 116 },
    tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

    // ── Challenges carousel ──
    challengeSection: { marginTop: 20, marginBottom: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    challCardTouch: { width: 224 },
    challCardInner: { width: '100%', padding: 16 },
    challTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    challIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    challMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },

    // ── Compose ──
    avatarMini: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    composeCta: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },

    // Avatar in feed rows (upgraded to 44 with a faint lime ring).
    avatarLg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    // Constrains the avatar SkeletonCard to the 44×44 feed avatar (it defaults to
    // full width + a bottom margin) so the loading scaffold lines up with the
    // loaded PostItem header.
    skeletonAvatar: { width: 44, marginBottom: 0 },
    // Inline like-failure notice row (rendered inside a GlassCard — replaces the
    // old destructive Alert). Token-driven; no coral-CTA gradient / inline glass.
    likeNotice: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    postHeader: { flexDirection: 'row', alignItems: 'center' },
    postImg: { width: '100%', height: 220, marginBottom: 12 },
    postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, gap: 24 },
    actionItem: { flexDirection: 'row', alignItems: 'center' },
});
