import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Share } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, likePost, unlikePost, getChallenges, Post } from '@/api/community';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { formatDistanceToNow } from 'date-fns';

// ── Stories / avatar rail (the "Crew" night-shift people) ────────────────────
// A decorative social rail matching the mockup: a "+ Post" create bubble (routes
// into the SAME create-post modal the input row + empty-state CTA use) followed
// by lime-ringed friend avatars. The friend avatars are presentational (initials
// on a tinted disc) — there is no friends/online API on this screen, so we never
// fabricate live data; they are the static rail the mockup specifies, kept inert
// (decorative) so a screen reader skips them while the "+ Post" bubble stays a
// real, labeled button. `tintKey` names a theme accent (NOT a raw hex) whose
// faint wash gives each disc its variety; the lime ring is shared.
const STORY_FRIENDS: ReadonlyArray<{ id: string; name: string; initials: string; tintKey: 'pink' | 'cyan' | 'amber' | 'purple' }> = [
    { id: 'jess', name: 'Jess', initials: 'JM', tintKey: 'pink' },
    { id: 'dan', name: 'Dan', initials: 'DK', tintKey: 'cyan' },
    { id: 'sara', name: 'Sara', initials: 'SR', tintKey: 'amber' },
    { id: 'tom', name: 'Tom', initials: 'TP', tintKey: 'purple' },
];

export default function CommunityFeedScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [refreshing, setRefreshing] = useState(false);

    // ── Queries ─────────────────────────────────────────────────────────────
    const { data: feed, isLoading: isFeedLoading, isError: isFeedError, refetch } = useQuery({
        queryKey: ['community-feed'],
        queryFn: () => getFeed(20),
    });

    const { data: challenges, isLoading: challengesLoading, isError: challengesError } = useQuery({
        queryKey: ['community-challenges'],
        queryFn: getChallenges,
    });

    // Real like TOGGLE: like when not yet liked, unlike (count drops) on the
    // second tap. We optimistically patch the cached feed row — flip `liked` and
    // nudge `likes` by ±1 — so the heart + count respond instantly, then reconcile
    // with the server (which carries the authoritative `liked`/`likes`) on success.
    // On error we restore the pre-tap snapshot so the pill never lies.
    const toggleLike = useMutation({
        mutationFn: ({ postId, currentlyLiked }: { postId: string; currentlyLiked: boolean }) =>
            currentlyLiked ? unlikePost(postId) : likePost(postId),
        onMutate: ({ postId, currentlyLiked }) => {
            const prev = queryClient.getQueryData<Post[]>(['community-feed']);
            queryClient.setQueryData<Post[]>(['community-feed'], (old) =>
                old?.map((p) =>
                    p.id === postId
                        ? { ...p, liked: !currentlyLiked, likes: Math.max(0, p.likes + (currentlyLiked ? -1 : 1)) }
                        : p,
                ),
            );
            return { prev };
        },
        onError: (err: any, _vars, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['community-feed'], ctx.prev);
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community-feed'] });
        },
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['community-challenges'] })]);
        setRefreshing(false);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header — "Crew" title + "Your night-shift people" subtitle, with a
                search + a message action. NOTE: the two action buttons keep their
                EXISTING accessibilityLabels + routes (Achievements → /(community)/
                achievements, Leaderboard → /(community)/leaderboard) — only the
                glyphs were re-skinned to the mockup's search + message-with-badge.
                The lime "3" badge rides the message button. */}
            <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
                <View style={styles.headerTitle}>
                    <Text style={[typography.caption, { color: colors.text.secondary }]}>Your night-shift people</Text>
                    <Text style={[typography.h1, { color: colors.text.primary, marginTop: 1 }]}>Crew</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Achievements"
                        activeOpacity={0.85}
                        onPress={() => router.push('/(community)/achievements' as any)}
                        style={[styles.headerIconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                    >
                        <Ionicons name="search" size={20} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Leaderboard"
                        activeOpacity={0.85}
                        onPress={() => router.push('/(community)/leaderboard')}
                        style={[styles.headerIconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, marginLeft: 10 }]}
                    >
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text.primary} />
                        <View style={[styles.headerBadge, { backgroundColor: colors.accent.lime, borderColor: colors.background.primary }]}>
                            <Text style={[styles.headerBadgeTxt, { color: colors.text.inverse }]} maxFontSizeMultiplier={1.2}>3</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.lime} />}
            >
                {/* Stories / avatar rail — a "+ Post" create bubble then lime-ringed
                    friend avatars. The "+ Post" bubble routes into the create-post
                    modal (same destination as the empty-state + input row). */}
                <Animated.View entering={FadeInDown.duration(380)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.storiesRow}
                    >
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Create a post"
                            activeOpacity={0.85}
                            style={styles.storyItem}
                            onPress={() => router.push('/(modals)/create-post')}
                        >
                            <View style={[styles.storyRing, { backgroundColor: withAlpha(colors.accent.lime, 0.12), borderColor: colors.accent.lime }]}>
                                <Ionicons name="add" size={26} color={colors.accent.lime} />
                            </View>
                            <Text style={[typography.caption, styles.storyName, { color: colors.text.secondary }]} numberOfLines={1}>Post</Text>
                        </TouchableOpacity>

                        {STORY_FRIENDS.map((friend) => (
                            <View key={friend.id} style={styles.storyItem} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                                <View style={[styles.storyRing, { backgroundColor: withAlpha(colors.accent[friend.tintKey], 0.18), borderColor: colors.accent.lime }]}>
                                    <Text style={[styles.storyInitials, { color: colors.text.primary }]}>{friend.initials}</Text>
                                </View>
                                <Text style={[typography.caption, styles.storyName, { color: colors.text.secondary }]} numberOfLines={1}>{friend.name}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* Active Challenges Strip — honest three-state.
                    rendering-no-falsy-and: a ternary-null chain (NOT `{x && …}`),
                    so a falsy `challenges` (undefined while fetching) never leaks a
                    raw value outside a <Text>. The three branches are mutually
                    exclusive:
                      • challengesLoading → a horizontal row of challenge-card
                        Skeletons (so a slow challenges query reads as "loading",
                        not as "no challenges");
                      • a populated array → the real strip;
                      • else (empty, errored, or still-undefined) → null. This is a
                        SECONDARY strip, so a quietly-absent section is honest — we
                        never fabricate challenge cards on empty/error. */}
                {challengesLoading && !challengesError ? (
                    <View style={styles.challengeSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>ACTIVE CHALLENGES</Text>
                        </View>
                        <ScrollView
                            horizontal
                            scrollEnabled={false}
                            showsHorizontalScrollIndicator={false}
                            accessibilityRole="progressbar"
                            accessibilityLabel="Loading challenges"
                            contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
                        >
                            {Array.from({ length: 2 }).map((_, i) => (
                                <ChallengeSkeleton key={i} />
                            ))}
                        </ScrollView>
                    </View>
                ) : challenges && challenges.length > 0 ? (
                    <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.challengeSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>ACTIVE CHALLENGES</Text>
                            <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="See all challenges" onPress={() => router.push('/(community)/challenges')}>
                                <Text style={[typography.overline, { color: colors.accent.lime }]}>SEE ALL</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
                            {challenges.slice(0, 3).map((chall) => (
                                <PressableScale
                                    key={chall.id}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${chall.title}, ${chall.participants} participating`}
                                    style={[styles.challCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}
                                    onPress={() => router.push('/(community)/challenges')}
                                >
                                    <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.lime, 0.14) }, shadows.glow(colors.accent.lime)]}>
                                        <Ionicons name="flash" size={20} color={colors.accent.lime} />
                                    </View>
                                    <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 14 }]} numberOfLines={1}>{chall.title}</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{chall.participants} participating</Text>
                                </PressableScale>
                            ))}
                        </ScrollView>
                    </Animated.View>
                ) : null}

                {/* Feed Items */}
                <View style={{ paddingHorizontal: 16 }}>
                    {isFeedLoading ? (
                        <View>
                            {Array.from({ length: 3 }).map((_, i) => (
                                <PostSkeleton key={i} />
                            ))}
                        </View>
                    ) : isFeedError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load the feed"
                            subtitle="Something went wrong fetching community posts. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => refetch()}
                        />
                    ) : feed?.length === 0 ? (
                        <EmptyState
                            icon="chatbubbles-outline"
                            title="No posts yet"
                            subtitle="Be the first to share a win, ask a question, or start the conversation."
                            actionLabel="Create a post"
                            onAction={() => router.push('/(modals)/create-post')}
                        />
                    ) : (
                        feed?.map((post, index) => (
                            <Animated.View key={post.id} entering={FadeInDown.delay(80 + index * 70).duration(420)}>
                                <PostItem
                                    post={post}
                                    onLike={() => toggleLike.mutate({ postId: post.id, currentlyLiked: !!post.liked })}
                                    onComment={() => router.push(`/(community)/${post.id}`)}
                                    onShare={async () => {
                                        try {
                                            const author = post.author?.name || 'A Zeitra member';
                                            await Share.share({
                                                message: `${author} on Zeitra:\n\n"${post.content}"`,
                                            });
                                        } catch {
                                            // Share sheet dismissed or unavailable — no action needed.
                                        }
                                    }}
                                />
                            </Animated.View>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Floating lime "Ria" sidebar tab — the AI-coach hand-off, matching the
                home & training Ria affordance pattern. The (community) stack does
                NOT sit under the (tabs) layout (which owns the global Ria FAB), so
                this screen carries its own. Routes into the AI-coach modal. */}
            <RiaSidebarTab onPress={() => router.push('/(modals)/ai-coach' as any)} />
        </View>
    );
}

/**
 * RiaSidebarTab — the floating lime right-edge vertical pill that hands off to the
 * Ria AI coach. Same intent/pattern as the home & training Ria affordance, styled
 * to the Crew mockup's lime sidebar tab (ink-on-lime, rounded only on its left so
 * it reads as docked to the screen edge). Behaviour is a single onPress hand-off.
 */
function RiaSidebarTab({ onPress }: { onPress: () => void }) {
    const { colors } = useTheme();
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Coach Ria"
            activeOpacity={0.85}
            onPress={onPress}
            style={[styles.riaTab, { backgroundColor: colors.accent.lime }, shadows.glow(colors.accent.lime)]}
        >
            <Ionicons name="chatbubble-ellipses" size={19} color={colors.text.inverse} />
            <Text style={[styles.riaTabLabel, { color: colors.text.inverse }]} maxFontSizeMultiplier={1.2}>Ria</Text>
        </TouchableOpacity>
    );
}

function PostItem({ post, onLike, onComment, onShare }: { post: Post, onLike: () => void, onComment: () => void, onShare: () => void }) {
    const { colors, typography, borderRadius } = useTheme();
    // The viewer's like state now comes from the post itself (post.liked, computed
    // server-side from post_likes and patched optimistically by toggleLike), so the
    // heart shows its REAL state on load and survives reloads — no session-only
    // guess. onLike runs the like/unlike toggle.
    const liked = !!post.liked;
    // Trust-gate user-supplied URLs before handing them to <Image>; non-https /
    // malformed values fall back to the placeholder (person icon / card bg).
    const avatarUri = safeImageUri(post.author?.avatarUrl);
    const imageUri = safeImageUri(post.imageUrl);
    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.postCard}>
            <View style={styles.postCardInner}>
                <View style={styles.postHeader}>
                    <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                        {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%', borderRadius: 21 }} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <Ionicons name="person" size={18} color={colors.text.tertiary} />
                        )}
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{post.author?.name || 'User'}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                            {formatDistanceToNow(new Date(post.createdAt))} ago
                        </Text>
                    </View>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.text.tertiary} />
                </View>

                <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 14, lineHeight: 22 }]}>
                    {post.content}
                </Text>

                {imageUri ? (
                    <Image source={{ uri: imageUri }} style={[styles.postImg, { borderRadius: borderRadius.lg }]} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                ) : null}

                <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={`${liked ? 'Unlike' : 'Like'} post, ${post.likes} likes`}
                        accessibilityState={{ selected: liked }}
                        style={styles.actionItem}
                        onPress={onLike}
                    >
                        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.accent.lime : colors.text.tertiary} />
                        <Text style={[typography.caption, { color: liked ? colors.accent.lime : colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]}>{post.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={`Comment on post, ${post.commentsCount} comments`} style={styles.actionItem} onPress={onComment}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]}>{post.commentsCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Share" style={styles.actionItem} onPress={onShare}>
                        <Ionicons name="share-social-outline" size={18} color={colors.text.tertiary} />
                    </TouchableOpacity>
                </View>
            </View>
        </GlassCard>
    );
}

function PostSkeleton() {
    const { colors, borderRadius } = useTheme();
    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.postCard}>
            <View style={styles.postCardInner}>
                <View style={styles.postHeader}>
                    <Skeleton width={42} height={42} radius={21} />
                    <View style={{ marginLeft: 12 }}>
                        <Skeleton width={120} height={14} radius={4} />
                        <Skeleton width={72} height={11} radius={4} style={{ marginTop: 6 }} />
                    </View>
                </View>
                <View style={{ marginVertical: 14 }}>
                    <Skeleton width="100%" height={14} radius={4} />
                    <Skeleton width="70%" height={14} radius={4} style={{ marginTop: 8 }} />
                </View>
                <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                    <Skeleton width={48} height={16} radius={4} />
                    <Skeleton width={48} height={16} radius={4} />
                    <Skeleton width={24} height={16} radius={4} />
                </View>
            </View>
        </GlassCard>
    );
}

/**
 * Loading placeholder for ONE Active-Challenges card. Mirrors the `challCard`
 * box (width 160 / padding 18 / 2xl radius) so the skeleton row occupies the
 * same footprint as the real strip — the section doesn't jump when the
 * challenges query resolves. Built from the shared Skeleton primitive + theme
 * tokens (no hardcoded hex, no fabricated content): a round icon placeholder
 * then a title + subtitle line, matching the card's icon + two-text layout.
 */
function ChallengeSkeleton() {
    const { colors, borderRadius } = useTheme();
    return (
        <View style={[styles.challCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
            <Skeleton width={44} height={44} radius={22} />
            <Skeleton width="80%" height={14} radius={4} style={{ marginTop: 14 }} />
            <Skeleton width="55%" height={11} radius={4} style={{ marginTop: 6 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 18, paddingBottom: 4 },
    headerTitle: { flex: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    headerIconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, paddingHorizontal: 2, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    headerBadgeTxt: { fontSize: 9, fontWeight: '700', lineHeight: 11 },

    // Stories / avatar rail
    storiesRow: { flexDirection: 'row', gap: 15, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
    storyItem: { alignItems: 'center', width: 60 },
    storyRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    storyInitials: { fontSize: 15, fontWeight: '700' },
    storyName: { marginTop: 5 },

    challengeSection: { marginTop: 22, marginBottom: 26 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    challCard: { width: 160, padding: 18, borderWidth: 1 },
    challIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    avatarMini: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    postCard: { marginBottom: 13 },
    postCardInner: { padding: 15 },
    postHeader: { flexDirection: 'row', alignItems: 'center' },
    postImg: { width: '100%', height: 200, marginBottom: 12 },
    postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, gap: 22 },
    actionItem: { flexDirection: 'row', alignItems: 'center' },

    // Floating lime Ria sidebar tab (right edge, docked)
    riaTab: {
        position: 'absolute',
        right: 0,
        top: '42%',
        paddingVertical: 11,
        paddingHorizontal: 6,
        width: 44,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        zIndex: 50,
    },
    riaTabLabel: { fontSize: 10, fontWeight: '700' },
});
