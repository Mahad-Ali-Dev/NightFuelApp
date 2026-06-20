import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addComment, getComments, getPostById, Post, Comment } from '@/api/community';
import { colors as themeColors } from '@/theme/colors';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Card, Button, Skeleton, EmptyState } from '@/components/ui';
import { shadows } from '@/theme';
import { formatDistanceToNow } from 'date-fns';

export default function PostDetailScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { postId } = useLocalSearchParams<{ postId: string }>();

    const [commentText, setCommentText] = useState('');

    // ── Queries ─────────────────────────────────────────────────────────────
    // Fetch the post directly by id so deep links and older posts (not in the
    // cached feed window) still resolve instead of spinning forever.
    const { data: post, isLoading: isLoadingPost, isError: isPostError, refetch: refetchPost } = useQuery({
        queryKey: ['post', postId],
        queryFn: () => getPostById(postId),
        enabled: !!postId,
    });

    // Fetch real comments. We pull isLoading/isError too so the comments section
    // has the same honest three-state treatment as the post itself — otherwise a
    // still-loading or failed getComments() silently falls through to the
    // "No comments yet" empty state, dressing an error up as an honest empty thread.
    const {
        data: comments = [],
        isLoading: commentsLoading,
        isError: commentsError,
        refetch: refetchComments,
    } = useQuery({
        queryKey: ['post-comments', postId],
        queryFn: () => getComments(postId),
        enabled: !!postId,
    });

    const commentMutation = useMutation({
        mutationFn: (text: string) => addComment(postId, text),
        onSuccess: () => {
            setCommentText('');
            queryClient.invalidateQueries({ queryKey: ['community-feed'] });
            refetchComments();
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to post comment');
        }
    });

    if (isLoadingPost) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Post</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.postContent}>
                    <View style={styles.authorRow}>
                        <Skeleton width={32} height={32} radius={16} />
                        <View style={{ marginLeft: 12 }}>
                            <Skeleton width={120} height={14} radius={4} />
                            <Skeleton width={80} height={11} radius={4} style={{ marginTop: 6 }} />
                        </View>
                    </View>
                    <View style={{ marginVertical: 20 }}>
                        <Skeleton width="100%" height={16} radius={4} />
                        <Skeleton width="92%" height={16} radius={4} style={{ marginTop: 10 }} />
                        <Skeleton width="60%" height={16} radius={4} style={{ marginTop: 10 }} />
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
                    <Skeleton width={160} height={12} radius={4} />
                </View>
            </View>
        );
    }

    if (isPostError || !post) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Post</Text>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState
                    icon={isPostError ? 'cloud-offline-outline' : 'alert-circle-outline'}
                    title={isPostError ? "Couldn't load this post" : 'Post not found'}
                    subtitle={
                        isPostError
                            ? 'Something went wrong fetching this post. Check your connection and try again.'
                            : 'This post may have been removed or is no longer available.'
                    }
                    actionLabel={isPostError ? 'Try Again' : 'Go Back'}
                    onAction={isPostError ? () => refetchPost() : () => router.back()}
                    style={{ flex: 1 }}
                />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Post</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Original Post */}
                <View style={styles.postContent}>
                    <View style={styles.authorRow}>
                        <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                            {safeImageUri(post.author?.avatarUrl) ? (
                                <Image source={{ uri: safeImageUri(post.author?.avatarUrl) }} style={{ width: '100%', height: '100%', borderRadius: 16 }} cachePolicy="memory-disk" transition={200} />
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

                    <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 20, fontSize: 16, lineHeight: 24 }]}>
                        {post.content}
                    </Text>

                    {safeImageUri(post.imageUrl) && (
                        <Image source={{ uri: safeImageUri(post.imageUrl) }} style={[styles.postImg, { borderRadius: borderRadius.xl }]} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                    )}

                    <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                    <View style={styles.interactionStats}>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                            <Text style={[typography.statTiny, { color: colors.text.primary }]}>{post.likes}</Text> Likes  •  <Text style={[typography.statTiny, { color: colors.text.primary }]}>{post.commentsCount}</Text> Comments
                        </Text>
                    </View>
                </View>

                {/* Comments List */}
                <View style={[styles.commentsSection, { backgroundColor: colors.background.secondary, borderTopColor: colors.border.default }]}>
                    <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 20 }]}>COMMENTS</Text>
                    {/* Mutually-exclusive comments states (ternary-null only, never `x && …`
                        — an empty comment list / 0 count is falsy-renderable):
                        loading → comment-row skeletons; error → retryable EmptyState (NOT
                        the "No comments yet" copy); resolved-empty → "No comments yet";
                        else → the real comment rows. */}
                    {commentsLoading ? (
                        <View accessibilityRole="progressbar" accessibilityLabel="Loading comments">
                            {[0, 1, 2].map((i) => (
                                <View key={i} style={[styles.commentItem, { borderBottomColor: colors.border.default }]}>
                                    <Skeleton width={32} height={32} radius={16} />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Skeleton width={120} height={12} radius={4} />
                                        <Skeleton width="80%" height={14} radius={4} style={{ marginTop: 8 }} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : commentsError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load comments"
                            subtitle="Something went wrong fetching the replies. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => refetchComments()}
                            style={styles.emptyComments}
                        />
                    ) : comments.length === 0 ? (
                        <EmptyState
                            icon="chatbubble-ellipses-outline"
                            title="No comments yet"
                            subtitle="Be the first to reply and start the conversation."
                            style={styles.emptyComments}
                        />
                    ) : (
                        comments.map((c: Comment) => (
                            <View key={c.id} style={[styles.commentItem, { borderBottomColor: colors.border.default }]}>
                                <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                                    {safeImageUri(c.author?.avatarUrl) ? (
                                        <Image source={{ uri: safeImageUri(c.author?.avatarUrl) }} style={{ width: '100%', height: '100%', borderRadius: 16 }} cachePolicy="memory-disk" transition={200} />
                                    ) : (
                                        <Ionicons name="person" size={14} color={colors.text.tertiary} />
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>{c.author?.name || 'User'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 11 }]}>{formatDistanceToNow(new Date(c.createdAt))} ago</Text>
                                    </View>
                                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>{c.text}</Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Comment Input Bar */}
            <View style={[styles.inputBar, { borderTopColor: colors.border.default, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
                <TextInput
                    style={[styles.commentInput, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderRadius: 25 }]}
                    placeholder="Reply to this post..."
                    placeholderTextColor={colors.text.tertiary}
                    value={commentText}
                    onChangeText={setCommentText}
                    multiline
                />
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Send message"
                    style={[styles.sendBtn, { opacity: commentText.trim() ? 1 : 0.5 }, commentText.trim() ? shadows.glow(colors.accent.coral) : null]}
                    onPress={() => commentMutation.mutate(commentText)}
                    disabled={commentMutation.isPending || !commentText.trim()}
                    activeOpacity={0.9}
                >
                    <LinearGradient
                        colors={colors.gradients.coral}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.sendBtnGradient}
                    >
                        <Ionicons name="send" size={18} color={colors.text.primary} />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    postContent: { padding: 20 },
    authorRow: { flexDirection: 'row', alignItems: 'center' },
    avatarMini: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    postImg: { width: '100%', height: 300, marginBottom: 20 },
    divider: { height: 1, marginVertical: 20 },
    interactionStats: {},
    commentsSection: { padding: 20, borderTopWidth: 8 },
    commentItem: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1 },
    emptyComments: { paddingVertical: 0 },
    inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, backgroundColor: themeColors.background.primary },
    commentInput: { flex: 1, minHeight: 44, maxHeight: 100, paddingHorizontal: 20, paddingVertical: 10, fontSize: 15 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, marginLeft: 12, overflow: 'hidden' },
    sendBtnGradient: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
