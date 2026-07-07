import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addComment, likePost, unlikePost, getComments, getPostById, Comment, Post } from '@/api/community';
import { safeImageUri } from '@/lib/imageUrl';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Skeleton, EmptyState, Avatar } from '@/components/ui';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { formatDistanceToNow } from 'date-fns';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

// Likes that read as a "milestone" — crossing one of these UP earns a tiny
// peak-end celebration (sparkle + halo). Kept local: a detail screen is a
// natural place to celebrate a like crossing a round number, the closest this
// surface gets to the brief's PEAK moments without a server-side `kind`/badge.
const LIKE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const isLikeMilestone = (n: number) => LIKE_MILESTONES.includes(n);

export default function PostDetailScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { postId } = useLocalSearchParams<{ postId: string }>();

    const [commentText, setCommentText] = useState('');
    // Optimistic like state — the detail screen is the most-engaged surface, so
    // the like must be a real, instant peak interaction here (not an inert pill).
    const [liked, setLiked] = useState(false);

    // ── Peak-end: a tiny sparkle/halo when a like crosses a round milestone. ──
    const sparkle = useSharedValue(0); // 0 → idle, drives sparkle scale/opacity
    const heartPulse = useSharedValue(1); // pressed-feel bounce on the heart glyph
    const sparkleStyle = useAnimatedStyle(() => ({
        opacity: sparkle.value,
        transform: [{ scale: 0.6 + sparkle.value * 0.9 }],
    }));
    const heartPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: heartPulse.value }],
    }));
    const celebrate = () => {
        sparkle.value = 0;
        sparkle.value = withSequence(
            withTiming(1, { duration: 220 }),
            withTiming(0, { duration: 520 }),
        );
    };

    // ── Queries ─────────────────────────────────────────────────────────────
    // Fetch the post directly by id so deep links and older posts (not in the
    // cached feed window) still resolve instead of spinning forever.
    const { data: post, isLoading: isLoadingPost, isError: isPostError, refetch: refetchPost } = useQuery({
        queryKey: ['post', postId],
        queryFn: () => getPostById(postId),
        enabled: !!postId,
    });

    // Seed the heart from the server's per-viewer `liked` once the post resolves
    // (and after every refetch), so a post the viewer already liked shows a filled
    // heart on open instead of starting empty. The optimistic onMutate also writes
    // `liked` into the cache, so this stays consistent through a toggle.
    useEffect(() => {
        if (post) setLiked(!!post.liked);
    }, [post?.liked]);

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
            // Invalidate the post snapshot too so the reaction pill's comment
            // count can't read stale (N) while the section header reads fresh
            // (N+1) — both now ultimately resolve from one source.
            queryClient.invalidateQueries({ queryKey: ['post', postId] });
            refetchComments();
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to post comment');
        }
    });

    // Real like TOGGLE. Like when not yet liked, unlike (count drops) on the
    // second tap — calling the matching endpoint based on the current state. We
    // mirror it locally: flip `liked`, nudge the cached post.likes by ±1, write
    // the new `liked` into the cache (so the post-load effect stays consistent),
    // and on a crossing-up to a round number fire the peak celebration. On error
    // we roll the optimistic state back so the pill never lies after a failed tap.
    const likeMutation = useMutation({
        mutationFn: () => (liked ? unlikePost(postId) : likePost(postId)),
        onMutate: () => {
            const prevPost = queryClient.getQueryData<Post>(['post', postId]);
            const prevLiked = liked;
            const willLike = !prevLiked;
            setLiked(willLike);
            heartPulse.value = withSequence(
                withSpring(willLike ? 1.28 : 0.9, { damping: 6, stiffness: 320 }),
                withSpring(1, { damping: 12, stiffness: 260 }),
            );
            if (prevPost) {
                const nextLikes = Math.max(0, prevPost.likes + (willLike ? 1 : -1));
                queryClient.setQueryData<Post>(['post', postId], { ...prevPost, likes: nextLikes, liked: willLike });
                if (willLike && isLikeMilestone(nextLikes)) {
                    celebrate();
                }
            }
            return { prevPost, prevLiked };
        },
        onError: (err: any, _vars, ctx) => {
            if (ctx?.prevPost) queryClient.setQueryData(['post', postId], ctx.prevPost);
            setLiked(ctx?.prevLiked ?? false);
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community-feed'] });
            queryClient.invalidateQueries({ queryKey: ['post', postId] });
        },
    });

    // ── Shared header (back chevron + title), reused across all three states so
    // the chrome never shifts between loading / error / loaded. ──────────────
    const Header = (
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border.default }]}>
            <TouchableOpacity
                activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={[styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
            >
                <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[typography.h3, { color: colors.text.primary }]}>Post</Text>
            <View style={{ width: 44 }} />
        </View>
    );

    if (isLoadingPost) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {Header}
                <View style={styles.postContent}>
                    <View style={[styles.postCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.authorRow}>
                            <Skeleton width={44} height={44} radius={22} />
                            <View style={{ marginLeft: 12 }}>
                                <Skeleton width={140} height={16} radius={4} />
                                <Skeleton width={90} height={12} radius={4} style={{ marginTop: 6 }} />
                            </View>
                        </View>
                        <View style={{ marginTop: 18 }}>
                            <Skeleton width="100%" height={16} radius={4} />
                            <Skeleton width="92%" height={16} radius={4} style={{ marginTop: 10 }} />
                            <Skeleton width="60%" height={16} radius={4} style={{ marginTop: 10 }} />
                        </View>
                        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
                        <Skeleton width={180} height={44} radius={14} />
                    </View>
                </View>
            </View>
        );
    }

    if (isPostError || !post) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {Header}
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

    const postAvatar = safeImageUri(post.author?.avatarUrl);
    const postImage = safeImageUri(post.imageUrl);
    const commentCount = comments.length;
    // One source of truth for the comment count shown in BOTH the reaction pill
    // and the section header: the freshly-fetched list once it has loaded, with
    // the server snapshot only as a pre-load placeholder. This is what keeps the
    // pill from reading a stale N while the header reads N+1.
    const pillCommentCount = commentsLoading ? post.commentsCount : commentCount;
    const canSend = !!commentText.trim() && !commentMutation.isPending;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            <StatusBar style="light" />
            {Header}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Original Post — the hero social card */}
                <Animated.View entering={FadeInDown.duration(420).springify().damping(18)} style={styles.postContent}>
                    <View style={[styles.postCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.authorRow}>
                            <Avatar uri={postAvatar} name={post.author?.name} size={44} />
                            <View style={{ marginLeft: 12, flex: 1 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>
                                    {post.author?.name || 'User'}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]}>
                                    {formatDistanceToNow(new Date(post.createdAt))} ago
                                </Text>
                            </View>
                        </View>

                        <Text style={[styles.postBody, { color: colors.text.primary }]}>
                            {post.content}
                        </Text>

                        {postImage ? (
                            <Image
                                source={{ uri: postImage }}
                                style={[styles.postImg, { borderRadius: borderRadius.xl, backgroundColor: colors.background.tertiary }]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                        ) : null}

                        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                        {/* Reactions — value dominates label (Condensed numerals).
                            Lime stays reserved for the single send CTA; the LIKE
                            is the core lightweight interaction here, so it's a real
                            toggle and reads RED when active (likes are red across
                            every social app), comments stay cyan. */}
                        <View style={styles.statsRow}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: liked }}
                                accessibilityLabel={`${liked ? 'Unlike' : 'Like'} post, ${post.likes} likes`}
                                onPress={() => likeMutation.mutate()}
                                style={[
                                    styles.statPill,
                                    styles.likePill,
                                    { backgroundColor: withAlpha(colors.accent.red, liked ? 0.16 : 0.1) },
                                ]}
                            >
                                <Animated.View style={heartPulseStyle}>
                                    <Ionicons
                                        name={liked ? 'heart' : 'heart-outline'}
                                        size={18}
                                        color={liked ? colors.accent.red : colors.accent.redLight}
                                    />
                                </Animated.View>
                                {/* Peak-end sparkle — only paints on a milestone crossing. */}
                                <Animated.View pointerEvents="none" style={[styles.sparkle, sparkleStyle]}>
                                    <Ionicons name="sparkles" size={22} color={colors.accent.amber} />
                                </Animated.View>
                                <Text style={[styles.pillCount, { color: colors.text.primary, marginLeft: 8 }]}>{post.likes}</Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary, marginLeft: 6 }]}>LIKES</Text>
                            </TouchableOpacity>
                            <View style={[styles.statPill, { backgroundColor: withAlpha(colors.accent.cyan, 0.1) }]}>
                                <Ionicons name="chatbubble" size={14} color={colors.accent.cyan} />
                                <Text style={[styles.pillCount, { color: colors.text.primary, marginLeft: 8 }]}>{pillCommentCount}</Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary, marginLeft: 6 }]}>COMMENTS</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* Comments thread */}
                <View style={[styles.commentsSection, { backgroundColor: colors.background.secondary, borderTopColor: colors.border.default }]}>
                    <View style={styles.commentsHeader}>
                        <Text style={[typography.statSmall, { color: colors.text.primary }]}>
                            {commentsLoading ? '' : commentCount}
                        </Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: commentsLoading ? 0 : 8 }]}>
                            {commentCount === 1 ? 'COMMENT' : 'COMMENTS'}
                        </Text>
                    </View>
                    {/* Mutually-exclusive comments states (ternary-null only, never `x && …`
                        — an empty comment list / 0 count is falsy-renderable):
                        loading → comment-row skeletons; error → retryable EmptyState (NOT
                        the "No comments yet" copy); resolved-empty → "No comments yet";
                        else → the real comment rows. */}
                    {commentsLoading ? (
                        <View accessibilityRole="progressbar" accessibilityLabel="Loading comments">
                            {[0, 1, 2].map((i) => (
                                <View key={i} style={[styles.commentItem, { borderBottomColor: colors.border.default }]}>
                                    <Skeleton width={36} height={36} radius={18} />
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
                        comments.map((c: Comment, i: number) => {
                            const cAvatar = safeImageUri(c.author?.avatarUrl);
                            return (
                                <Animated.View
                                    key={c.id}
                                    entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(360).springify().damping(18)}
                                    style={[styles.commentItem, { borderBottomColor: colors.border.default }]}
                                >
                                    <Avatar uri={cAvatar} name={c.author?.name} size={36} />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <View style={styles.commentMetaRow}>
                                            <Text style={[typography.bodyMedium, { color: colors.text.primary }]} numberOfLines={1}>{c.author?.name || 'User'}</Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>{formatDistanceToNow(new Date(c.createdAt))} ago</Text>
                                        </View>
                                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>{c.text}</Text>
                                    </View>
                                </Animated.View>
                            );
                        })
                    )}
                </View>
            </ScrollView>

            {/* Comment composer — pinned in the thumb zone, above the safe area */}
            <View style={[styles.inputBar, { backgroundColor: colors.background.primary, borderTopColor: colors.border.default, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
                <TextInput
                    style={[styles.commentInput, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: 24 }]}
                    placeholder="Reply to this post..."
                    placeholderTextColor={colors.text.tertiary}
                    accessibilityLabel="Write a comment"
                    value={commentText}
                    onChangeText={setCommentText}
                    maxLength={1000}
                    multiline
                />
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Send message"
                    accessibilityState={{ disabled: !canSend }}
                    style={[styles.sendBtn, { opacity: canSend ? 1 : 0.5 }, canSend ? shadows.glow(colors.accent.coral) : null]}
                    onPress={() => commentMutation.mutate(commentText.trim())}
                    disabled={!canSend}
                    activeOpacity={0.9}
                >
                    <LinearGradient
                        colors={colors.gradients.coral}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.sendBtnGradient}
                    >
                        {commentMutation.isPending ? (
                            <ActivityIndicator size="small" color={colors.text.inverse} />
                        ) : (
                            <Ionicons name="arrow-up" size={20} color={colors.text.inverse} />
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    postContent: { paddingHorizontal: 20, paddingTop: 20 },
    postCard: { borderRadius: 24, borderWidth: 1, padding: 20 },
    authorRow: { flexDirection: 'row', alignItems: 'center' },
    postBody: { fontFamily: 'Barlow_400Regular', fontSize: 17, lineHeight: 26, marginTop: 18 },
    postImg: { width: '100%', height: 300, marginTop: 18 },
    divider: { height: 1, marginVertical: 18 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
    // The likes pill is an interactive control → clear the 44pt minimum height
    // without leaning on hitSlop, and host the absolutely-positioned sparkle.
    likePill: { minHeight: 44, position: 'relative' },
    sparkle: { position: 'absolute', left: 8, top: -10 },
    // Pill counts in Barlow Condensed (the header's stat language) at 20 so the
    // VALUE reads tall/athletic and clearly outweighs the 11pt overline label.
    pillCount: { fontFamily: 'BarlowCondensed_600SemiBold', fontSize: 20, lineHeight: 24 },
    commentsSection: { padding: 20, marginTop: 16, borderTopWidth: 8 },
    commentsHeader: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
    commentItem: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1 },
    commentMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    emptyComments: { paddingVertical: 16 },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    commentInput: { flex: 1, minHeight: 48, maxHeight: 110, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, fontFamily: 'Barlow_400Regular', fontSize: 15 },
    sendBtn: { width: 48, height: 48, borderRadius: 24, marginLeft: 12, overflow: 'hidden' },
    sendBtnGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
