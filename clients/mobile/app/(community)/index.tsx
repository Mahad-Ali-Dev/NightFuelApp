import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Dimensions, RefreshControl, Share } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, likePost, getChallenges, Post } from '@/api/community';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Button, Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

export default function CommunityFeedScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
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

    const likeMutation = useMutation({
        mutationFn: (postId: string) => likePost(postId),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community-feed'] });
        }
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['community-challenges'] })]);
        setRefreshing(false);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <Text style={[typography.h1, { color: colors.text.primary }]}>Community</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Achievements"
                        activeOpacity={0.85}
                        onPress={() => router.push('/(community)/achievements' as any)}
                        style={[styles.headerIconBtn, { backgroundColor: withAlpha(colors.accent.amber, 0.12), marginRight: 12 }]}
                    >
                        <Ionicons name="trophy-outline" size={22} color={colors.accent.amber} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Leaderboard"
                        activeOpacity={0.85}
                        onPress={() => router.push('/(community)/leaderboard')}
                        style={[styles.headerIconBtn, { backgroundColor: colors.background.tertiary }]}
                    >
                        <Ionicons name="podium-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.cyan} />}
            >
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
                    <View style={styles.challengeSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>ACTIVE CHALLENGES</Text>
                            <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="See all challenges" onPress={() => router.push('/(community)/challenges')}>
                                <Text style={[typography.overline, { color: colors.accent.cyan }]}>SEE ALL</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
                            {challenges.slice(0, 3).map((chall) => (
                                <TouchableOpacity
                                    key={chall.id}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${chall.title}, ${chall.participants} participating`}
                                    style={[styles.challCard, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}
                                    onPress={() => router.push('/(community)/challenges')}
                                    activeOpacity={0.85}
                                >
                                    <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.emerald, 0.12) }, shadows.glow(colors.accent.emerald)]}>
                                        <Ionicons name="flash" size={20} color={colors.accent.emerald} />
                                    </View>
                                    <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 14 }]} numberOfLines={1}>{chall.title}</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{chall.participants} participating</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                {/* Create Post Action */}
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Create a post"
                    style={[styles.postInputBtn, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}
                    onPress={() => router.push('/(modals)/create-post')}
                    activeOpacity={0.85}
                >
                    <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                        <Ionicons name="person" size={16} color={colors.text.tertiary} />
                    </View>
                    <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 16 }]}>What's on your mind?</Text>
                    <Ionicons name="image-outline" size={20} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* Feed Items */}
                <View style={{ paddingHorizontal: 20 }}>
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
                        feed?.map((post) => (
                            <PostItem
                                key={post.id}
                                post={post}
                                onLike={() => likeMutation.mutate(post.id)}
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
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

function PostItem({ post, onLike, onComment, onShare }: { post: Post, onLike: () => void, onComment: () => void, onShare: () => void }) {
    const { colors, typography, borderRadius } = useTheme();
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
                            <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%', borderRadius: 16 }} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <Ionicons name="person" size={16} color={colors.text.tertiary} />
                        )}
                    </View>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{post.author?.name || 'User'}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                            {formatDistanceToNow(new Date(post.createdAt))} ago
                        </Text>
                    </View>
                </View>

                <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 16, lineHeight: 22 }]}>
                    {post.content}
                </Text>

                {imageUri ? (
                    <Image source={{ uri: imageUri }} style={[styles.postImg, { borderRadius: borderRadius.lg }]} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                ) : null}

                <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Like post, ${post.likes} likes`} style={styles.actionItem} onPress={onLike}>
                        <Ionicons name="heart-outline" size={20} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]}>{post.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Comment on post, ${post.commentsCount} comments`} style={styles.actionItem} onPress={onComment}>
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
                    <Skeleton width={32} height={32} radius={16} />
                    <View style={{ marginLeft: 12 }}>
                        <Skeleton width={120} height={14} radius={4} />
                        <Skeleton width={72} height={11} radius={4} style={{ marginTop: 6 }} />
                    </View>
                </View>
                <View style={{ marginVertical: 16 }}>
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
        <View style={[styles.challCard, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
            <Skeleton width={44} height={44} radius={22} />
            <Skeleton width="80%" height={14} radius={4} style={{ marginTop: 14 }} />
            <Skeleton width="55%" height={11} radius={4} style={{ marginTop: 6 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    headerIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    challengeSection: { marginTop: 28, marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    challCard: { width: 160, padding: 18, borderWidth: 1 },
    challIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    postInputBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 18, borderWidth: 1, marginBottom: 24 },
    avatarMini: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    postCard: { marginBottom: 16 },
    postCardInner: { padding: 18 },
    postHeader: { flexDirection: 'row', alignItems: 'center' },
    postImg: { width: '100%', height: 220, marginBottom: 12 },
    postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, gap: 24 },
    actionItem: { flexDirection: 'row', alignItems: 'center' },
});
