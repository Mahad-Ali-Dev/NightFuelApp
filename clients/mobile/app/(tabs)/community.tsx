import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ImageBackground, Share } from 'react-native';
import { GlassCard, EmptyState, Skeleton, SkeletonCard } from '@/components/ui';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, likePost, getChallenges, Post } from '@/api/community';
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
                            <SkeletonCard height={32} radius={16} style={styles.skeletonAvatar} />
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

    // Memoized feed rows — rebuilt only when the feed data itself changes, so
    // unrelated re-renders (e.g. pull-to-refresh state) don't recreate every card.
    const feedItems = useMemo(
        () => feed?.map((post) => (
            <PostItem
                key={post.id}
                post={post}
                onLike={() => likeMutation.mutate(post.id)}
                onComment={() => router.push(`/(community)/${post.id}` as any)}
                onPressProfile={() => router.push(`/(community)/userProfile?userId=${post.author?.id}` as any)}
            />
        )),
        [feed, likeMutation, router]
    );

    // Memoized challenge strip — slice is cheap but this keeps element identity
    // stable across unrelated re-renders.
    const challengeCards = useMemo(
        () => challenges?.slice(0, 3).map((chall) => (
            <TouchableOpacity
                key={chall.id}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${chall.title}, ${safeCount(chall.participants)} participating`}
                style={{ width: 160 }}
                onPress={() => router.push('/(community)/challenges' as any)}
            >
                <GlassCard intensity={40}>
                    <View style={{ width: '100%', padding: 16 }}>
                        <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.emerald, 0.14) }]}>
                            <Ionicons name="flash" size={20} color={colors.accent.emerald} />
                        </View>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 12 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{chall.title}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]} maxFontSizeMultiplier={1.4}>{safeCount(chall.participants)} participating</Text>
                    </View>
                </GlassCard>
            </TouchableOpacity>
        )),
        [challenges, borderRadius, colors, typography, router]
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
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <Text style={[typography.h2, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>Community</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Leaderboard"
                        style={[styles.headerBtn, { borderColor: withAlpha(colors.text.primary, 0.1), backgroundColor: withAlpha(colors.background.tertiary, 0.5) }]}
                        onPress={() => router.push('/(community)/leaderboard' as any)}
                    >
                        <Ionicons name="podium-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Messages"
                        style={[styles.headerBtn, { marginLeft: 12, borderColor: withAlpha(colors.text.primary, 0.1), backgroundColor: withAlpha(colors.background.tertiary, 0.5) }]}
                        onPress={() => router.push('/messages/' as any)}
                    >
                        <Ionicons name="chatbubbles-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.cyan} colors={[colors.accent.cyan]} progressBackgroundColor={colors.background.secondary} />}
            >
                {/* Active Challenges Strip */}
                {challenges && challenges.length > 0 && (
                    <View style={styles.challengeSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.4}>ACTIVE CHALLENGES</Text>
                            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="See all challenges" onPress={() => router.push('/(community)/challenges' as any)}>
                                <Text style={[typography.overline, { color: colors.accent.cyan }]} maxFontSizeMultiplier={1.4}>SEE ALL</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
                            {challengeCards}
                        </ScrollView>
                    </View>
                )}

                {/* Create Post Action */}
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
                                <Ionicons name="person" size={16} color={colors.text.tertiary} />
                            </View>
                            <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 16 }]} maxFontSizeMultiplier={1.4}>What's on your mind?</Text>
                            <Ionicons name="image-outline" size={20} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />
                        </View>
                    </GlassCard>
                </TouchableOpacity>

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

                {/* Feed Items */}
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
                    <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                        {post.author?.avatarUrl ? (
                            <Image source={{ uri: post.author.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 16 }} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <Ionicons name="person" size={16} color={colors.text.tertiary} />
                        )}
                    </View>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.3}>{post.author?.name || 'User'}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.4}>
                            {timeAgo(post.createdAt)}
                        </Text>
                    </View>
                </TouchableOpacity>

                <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 16, lineHeight: 22 }]} maxFontSizeMultiplier={1.5}>
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
                        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.accent.coral : colors.text.secondary} />
                        <Text style={[typography.caption, { color: liked ? colors.accent.coral : colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.4}>{likeCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Comment, ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`} style={styles.actionItem} onPress={onComment}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.secondary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.4}>{commentCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Share"
                        style={styles.actionItem}
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    headerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    challengeSection: { marginTop: 24, marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    challIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    avatarMini: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    // Constrains the avatar SkeletonCard to the 32×32 avatarMini circle (it
    // defaults to full width + a bottom margin) so the loading scaffold lines up
    // with the loaded PostItem header.
    skeletonAvatar: { width: 32, marginBottom: 0 },
    // Inline like-failure notice row (rendered inside a GlassCard — replaces the
    // old destructive Alert). Token-driven; no coral-CTA gradient / inline glass.
    likeNotice: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    postHeader: { flexDirection: 'row', alignItems: 'center' },
    postImg: { width: '100%', height: 220, marginBottom: 12 },
    postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, gap: 24 },
    actionItem: { flexDirection: 'row', alignItems: 'center' },
});
