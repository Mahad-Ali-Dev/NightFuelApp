import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Dimensions, RefreshControl } from 'react-native';

import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, likePost, getChallenges, Post } from '@/api/community';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Card, Button } from '@/components/ui';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

export default function CommunityFeedScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [refreshing, setRefreshing] = useState(false);

    // ── Queries ─────────────────────────────────────────────────────────────
    const { data: feed, isLoading: isFeedLoading, refetch } = useQuery({
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

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['community-challenges'] })]);
        setRefreshing(false);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 22 }]}>Community</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={() => router.push('/(community)/achievements' as any)} style={{ marginRight: 20 }}>
                        <Ionicons name="trophy-outline" size={24} color={colors.accent.amber} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/(community)/leaderboard')}>
                        <Ionicons name="podium-outline" size={24} color={colors.text.primary} />
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
                            <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold' }]}>ACTIVE CHALLENGES</Text>
                            <TouchableOpacity onPress={() => router.push('/(community)/challenges')}>
                                <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: 'bold' }]}>SEE ALL</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
                            {challenges.slice(0, 3).map((chall) => (
                                <TouchableOpacity
                                    key={chall.id}
                                    style={[styles.challCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}
                                    onPress={() => router.push('/(community)/challenges')}
                                >
                                    <View style={[styles.challIcon, { backgroundColor: `${colors.accent.emerald}15` }]}>
                                        <Ionicons name="flash" size={20} color={colors.accent.emerald} />
                                    </View>
                                    <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginTop: 12 }]} numberOfLines={1}>{chall.title}</Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>{chall.participants} participating</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Create Post Action */}
                <TouchableOpacity
                    style={[styles.postInputBtn, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}
                    onPress={() => router.push('/(modals)/create-post')}
                >
                    <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                        <Ionicons name="person" size={16} color={colors.text.tertiary} />
                    </View>
                    <Text style={[typography.body, { color: colors.text.tertiary, marginLeft: 16 }]}>What's on your mind?</Text>
                    <Ionicons name="image-outline" size={20} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* Feed Items */}
                <View style={{ paddingHorizontal: 20 }}>
                    {isFeedLoading ? (
                        <ActivityIndicator size="large" color={colors.accent.cyan} style={{ marginTop: 40 }} />
                    ) : feed?.length === 0 ? (
                        <View style={styles.emptyFeed}>
                            <Text style={[typography.body, { color: colors.text.tertiary }]}>No posts yet. Start the conversation!</Text>
                        </View>
                    ) : (
                        feed?.map((post) => (
                            <PostItem
                                key={post.id}
                                post={post}
                                onLike={() => likeMutation.mutate(post.id)}
                                onComment={() => router.push(`/(community)/${post.id}`)}
                            />
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Fab for Posting */}
            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.accent.cyan }]}
                onPress={() => router.push('/(modals)/create-post')}
            >
                <Ionicons name="add" size={32} color="#0D1117" />
            </TouchableOpacity>
        </View>
    );
}

function PostItem({ post, onLike, onComment }: { post: Post, onLike: () => void, onComment: () => void }) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <Card style={[styles.postCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
            <View style={styles.postHeader}>
                <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                    {post.author?.avatarUrl ? (
                        <Image source={{ uri: post.author.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 16 }} />
                    ) : (
                        <Ionicons name="person" size={16} color={colors.text.tertiary} />
                    )}
                </View>
                <View style={{ marginLeft: 12 }}>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{post.author?.name || 'User'}</Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                        {formatDistanceToNow(new Date(post.createdAt))} ago
                    </Text>
                </View>
                <TouchableOpacity style={{ marginLeft: 'auto' }}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
            </View>

            <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 16, lineHeight: 22 }]}>
                {post.content}
            </Text>

            {post.imageUrl && (
                <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.lg }]} contentFit="cover" />
            )}

            <View style={[styles.postActions, { borderTopColor: colors.border.default }]}>
                <TouchableOpacity style={styles.actionItem} onPress={onLike}>
                    <Ionicons name="heart-outline" size={20} color={colors.text.tertiary} />
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6, fontWeight: 'bold' }]}>{post.likes}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem} onPress={onComment}>
                    <Ionicons name="chatbubble-outline" size={18} color={colors.text.tertiary} />
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6, fontWeight: 'bold' }]}>{post.commentsCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem}>
                    <Ionicons name="share-social-outline" size={18} color={colors.text.tertiary} />
                </TouchableOpacity>
            </View>
        </Card>
    );
}

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
    fab: { position: 'absolute', bottom: 160, right: 20, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#00D4AA', shadowOpacity: 0.3, shadowRadius: 10 },
});
