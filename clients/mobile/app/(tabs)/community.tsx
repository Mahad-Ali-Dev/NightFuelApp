import React, { useState, useMemo, useCallback } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, RefreshControl, ImageBackground, Share } from 'react-native';
import { BlurView } from 'expo-blur';
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

/** Safe relative-time formatter — guards against missing/invalid `createdAt`
 * so a single bad timestamp can't throw "Invalid time value" and blank the feed. */
function timeAgo(createdAt?: string): string {
    if (!createdAt) return 'Just now';
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return 'Just now';
    return `${formatDistanceToNow(d)} ago`;
}

export default function CommunityTab() {
    const { colors, typography, borderRadius, shadows } = useTheme();
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
                style={{ width: 160, borderRadius: borderRadius['2xl'], overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                onPress={() => router.push('/(community)/challenges' as any)}
            >
                <BlurView
                    tint="dark"
                    intensity={40}
                    style={[styles.challCard, { width: '100%', borderWidth: 0 }]}
                >
                    <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.emerald, 0.14) }]}>
                        <Ionicons name="flash" size={20} color={colors.accent.emerald} />
                    </View>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 12 }]} numberOfLines={1}>{chall.title}</Text>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{chall.participants} participating</Text>
                </BlurView>
            </TouchableOpacity>
        )),
        [challenges, borderRadius, colors, typography, router]
    );

    return (
        <ImageBackground
            blurRadius={5}
            source={{ uri: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&auto=format&fit=crop&q=80' }}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.35 }}
        >
            <LinearGradient
                colors={[withAlpha(colors.background.primary, 0.85), colors.background.primary]}
                style={StyleSheet.absoluteFillObject}
            />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Community</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Leaderboard" onPress={() => router.push('/(community)/leaderboard' as any)}>
                        <Ionicons name="podium-outline" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Messages" style={{ marginLeft: 20 }} onPress={() => router.push('/messages/' as any)}>
                        <Ionicons name="chatbubbles-outline" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.cyan} />}
            >
                {/* Active Challenges Strip */}
                {challenges && challenges.length > 0 && (
                    <View style={styles.challengeSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>ACTIVE CHALLENGES</Text>
                            <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="See all challenges" onPress={() => router.push('/(community)/challenges' as any)}>
                                <Text style={[typography.overline, { color: colors.accent.cyan }]}>SEE ALL</Text>
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
                    style={{ marginHorizontal: 20, marginBottom: 24, borderRadius: borderRadius['2xl'], overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                    onPress={() => router.push('/(modals)/create-post' as any)}
                >
                    <BlurView
                        tint="dark"
                        intensity={40}
                        style={[styles.postInputBtn, { marginHorizontal: 0, marginBottom: 0, borderWidth: 0 }]}
                    >
                        <View style={[styles.avatarMini, { backgroundColor: withAlpha(colors.background.tertiary, 0.5) }]}>
                            <Ionicons name="person" size={16} color={colors.text.tertiary} />
                        </View>
                        <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 16 }]}>What's on your mind?</Text>
                        <Ionicons name="image-outline" size={20} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />
                    </BlurView>
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

            {/* Fab for Posting */}
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add"
                style={[styles.fab, shadows.glow(colors.accent.coral)]}
                onPress={() => router.push('/(modals)/create-post' as any)}
                activeOpacity={0.9}
            >
                <LinearGradient
                    colors={colors.gradients.coral}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.fabGradient}
                >
                    <Ionicons name="add" size={32} color={colors.text.primary} />
                </LinearGradient>
            </TouchableOpacity>
        </ImageBackground>
    );
}

const PostItem = React.memo(function PostItem({ post, onLike, onComment, onPressProfile }: { post: Post, onLike: () => void, onComment: () => void, onPressProfile: () => void }) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <View style={{ borderRadius: borderRadius['2xl'], overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1), marginBottom: 16 }}>
            <BlurView
                tint="dark"
                intensity={40}
                style={[styles.postCard, { marginBottom: 0, borderWidth: 0 }]}
            >
                <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`View ${post.author?.name || 'User'}'s profile`} style={styles.postHeader} onPress={onPressProfile}>
                    <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                        {post.author?.avatarUrl ? (
                            <Image source={{ uri: post.author.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 16 }} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <Ionicons name="person" size={16} color={colors.text.tertiary} />
                        )}
                    </View>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{post.author?.name || 'User'}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                            {timeAgo(post.createdAt)}
                        </Text>
                    </View>
                </TouchableOpacity>

                <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 16, lineHeight: 22 }]}>
                    {post.content}
                </Text>

                {post.imageUrl && (
                    <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.xl }]} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                )}

                <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Like, ${post.likes} likes`} style={styles.actionItem} onPress={onLike}>
                        <Ionicons name="heart-outline" size={20} color={colors.text.secondary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]}>{post.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Comment, ${post.commentsCount} comments`} style={styles.actionItem} onPress={onComment}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.secondary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: 'bold' }]}>{post.commentsCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Share"
                        style={styles.actionItem}
                        onPress={async () => {
                            try {
                                const author = post.author?.name || 'A NightFuel member';
                                await Share.share({
                                    message: `${author} on NightFuel:\n\n"${post.content}"`,
                                });
                            } catch {
                                // Share sheet dismissed or unavailable — no action needed.
                            }
                        }}
                    >
                        <Ionicons name="share-social-outline" size={18} color={colors.text.secondary} />
                    </TouchableOpacity>
                </View>
            </BlurView>
        </View>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    challengeSection: { marginTop: 24, marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    challCard: { width: 150, padding: 16, borderWidth: 1 },
    challIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    postInputBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 16, borderWidth: 1, marginBottom: 24 },
    avatarMini: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    emptyFeed: { alignItems: 'center', padding: 40 },
    postCard: { padding: 16, marginBottom: 16, borderWidth: 1 },
    postHeader: { flexDirection: 'row', alignItems: 'center' },
    postImg: { width: '100%', height: 220, marginBottom: 12 },
    postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, gap: 24 },
    actionItem: { flexDirection: 'row', alignItems: 'center' },
    fab: { position: 'absolute', bottom: 30, right: 20, width: 64, height: 64, borderRadius: 32, overflow: 'hidden' },
    fabGradient: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
});
