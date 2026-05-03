import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    ActivityIndicator, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, addComment, getComments, getPostById, Post, Comment } from '@/api/community';
import { colors as themeColors } from '@/theme/colors';
import { withAlpha } from '@/theme/utils';
import { Image } from 'expo-image';
import { Card, Button } from '@/components/ui';
import { formatDistanceToNow } from 'date-fns';

export default function PostDetailScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { postId } = useLocalSearchParams<{ postId: string }>();

    const [commentText, setCommentText] = useState('');

    // ── Queries ─────────────────────────────────────────────────────────────
    // Note: Reusing getFeed or implementing getPostById if available. 
    // For now, finding in cached feed or fetching.
    const { data: feedData } = useQuery({
        queryKey: ['community-feed'],
        queryFn: () => getFeed(50),
    });

    const post = feedData?.find(p => p.id === postId);

    // Fetch real comments
    const { data: comments = [], refetch: refetchComments } = useQuery({
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

    if (!post) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Post</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Original Post */}
                <View style={styles.postContent}>
                    <View style={styles.authorRow}>
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
                    </View>

                    <Text style={[typography.body, { color: colors.text.secondary, marginVertical: 20, fontSize: 16, lineHeight: 24 }]}>
                        {post.content}
                    </Text>

                    {post.imageUrl && (
                        <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.xl }]} contentFit="cover" />
                    )}

                    <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                    <View style={styles.interactionStats}>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                            <Text style={{ color: colors.text.primary, fontWeight: 'bold' }}>{post.likes}</Text> Likes  •  <Text style={{ color: colors.text.primary, fontWeight: 'bold' }}>{post.commentsCount}</Text> Comments
                        </Text>
                    </View>
                </View>

                {/* Comments List */}
                <View style={[styles.commentsSection, { borderTopColor: withAlpha(themeColors.text.primary, 0.02) }]}>
                    <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold', marginBottom: 20 }]}>COMMENTS</Text>
                    {comments.length === 0 ? (
                        <View style={styles.emptyComments}>
                            <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.border.default} />
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 12 }]}>Be the first to reply</Text>
                        </View>
                    ) : (
                        comments.map((c: Comment) => (
                            <View key={c.id} style={[styles.commentItem, { borderBottomColor: colors.border.default }]}>
                                <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                                    {c.author?.avatarUrl ? (
                                        <Image source={{ uri: c.author.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 16 }} />
                                    ) : (
                                        <Ionicons name="person" size={14} color={colors.text.tertiary} />
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>{c.author?.name || 'User'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 11 }]}>{formatDistanceToNow(new Date(c.createdAt))} ago</Text>
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
                <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: colors.accent.cyan, opacity: commentText.trim() ? 1 : 0.5 }]}
                    onPress={() => commentMutation.mutate(commentText)}
                    disabled={commentMutation.isPending || !commentText.trim()}
                >
                    <Ionicons name="send" size={18} color="#0D1117" />
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
    emptyComments: { alignItems: 'center', paddingVertical: 40 },
    inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, backgroundColor: themeColors.background.primary },
    commentInput: { flex: 1, minHeight: 44, maxHeight: 100, paddingHorizontal: 20, paddingVertical: 10, fontSize: 15 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
});
