import React, { useState, useMemo, useCallback } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, RefreshControl, ImageBackground, Share } from 'react-native';
import { GlassCard } from '@/components/ui';
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
import { Card } from '@/components/ui/Card';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

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

export default function CommunityTab() {
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

    const { data: challenges } = useQuery({
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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['community-challenges'] })]);
        setRefreshing(false);
    }, [refetch, queryClient]);

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
                accessibilityLabel={`${chall.title}, ${chall.participants} participating`}
                style={{ width: 160 }}
                onPress={() => router.push('/(community)/challenges' as any)}
            >
                <GlassCard intensity={40}>
                    <View style={{ width: '100%', padding: 16 }}>
                        <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.emerald, 0.14) }]}>
                            <Ionicons name="flash" size={20} color={colors.accent.emerald} />
                        </View>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 12 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{chall.title}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]} maxFontSizeMultiplier={1.4}>{chall.participants} participating</Text>
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

                {/* Feed Items */}
                <View style={{ paddingHorizontal: 20 }}>
                    {isFeedLoading ? (
                        <ActivityIndicator size="large" color={colors.accent.cyan} style={{ marginTop: 40 }} />
                    ) : isFeedError ? (
                        <View style={styles.emptyFeed}>
                            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center' }]}>Couldn't load the feed. Pull down to retry.</Text>
                        </View>
                    ) : !feed || feed.length === 0 ? (
                        <View style={styles.emptyFeed}>
                            <Text style={[typography.body, { color: colors.text.secondary }]}>No posts yet. Start the conversation!</Text>
                        </View>
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

                {post.imageUrl && (
                    <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.xl }]} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel="Post image" />
                )}

                <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={`Like, ${post.likes} likes`} style={styles.actionItem} onPress={onLike}>
                        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.accent.coral : colors.text.secondary} />
                        <Text style={[typography.caption, { color: liked ? colors.accent.coral : colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.4}>{post.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Comment, ${post.commentsCount} comments`} style={styles.actionItem} onPress={onComment}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.secondary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]} maxFontSizeMultiplier={1.4}>{post.commentsCount}</Text>
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
    emptyFeed: { alignItems: 'center', padding: 40 },
    postHeader: { flexDirection: 'row', alignItems: 'center' },
    postImg: { width: '100%', height: 220, marginBottom: 12 },
    postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, gap: 24 },
    actionItem: { flexDirection: 'row', alignItems: 'center' },
});
