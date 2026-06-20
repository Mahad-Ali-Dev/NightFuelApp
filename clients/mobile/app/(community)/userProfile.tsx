import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPublicProfile } from '@/api/users';
import { getUserPosts, getUserSocial, followUser, unfollowUser, Post, UserSocial } from '@/api/community';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState, CtaButton } from '@/components/ui';
import { StatusBar } from 'expo-status-bar';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

// LIST-PERFORMANCE — one memoized post row at module scope.
//
// react-native-skills applied:
//   • list-performance-item-memo / Pass Primitives: the row takes ONLY primitives
//     (id/content/imageUrl/createdAt) + ONE stable callback `onOpen`, so React.memo's
//     shallow compare is effective and the row skips re-render when its post is
//     unchanged (e.g. while the parent re-renders for a follow toggle).
//   • list-performance-callbacks / list-performance-function-references: the parent
//     passes a SINGLE hoisted `onOpen` instance to every row (no new closure per row
//     per render); the row re-binds it to its own id via a local useCallback keyed on
//     [onOpen, id].
//   • list-performance-inline-objects: theme-derived style is read via useTheme INSIDE
//     the memoized row (not passed down as a churning prop), and static layout lives in
//     the hoisted StyleSheet — the parent allocates no per-row style/object.
//
// Rendered output is byte-identical to the previous inline `posts.map(...)` Card; the
// only behavioural addition is the row tap → onOpen(id) (the canonical post-open nav,
// matching app/(community)/index.tsx's `router.push('/(community)/${post.id}')`).
type PostRowProps = {
    id: string;
    content: string;
    imageUrl?: string;
    createdAt: string;
    onOpen: (postId: string) => void;
};

const PostRow = React.memo(function PostRow({ id, content, imageUrl, createdAt, onOpen }: PostRowProps) {
    const { colors, typography, borderRadius } = useTheme();
    const handlePress = useCallback(() => onOpen(id), [onOpen, id]);

    return (
        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" onPress={handlePress}>
            <Card variant="glass" style={[styles.postCard, { borderColor: colors.border.default, borderRadius: borderRadius['2xl'] }]}>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 12, lineHeight: 22 }]}>
                    {content}
                </Text>
                {!!imageUrl && (
                    <Image source={{ uri: imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.lg }]} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                )}
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    {formatDistanceToNow(new Date(createdAt))} ago
                </Text>
            </Card>
        </TouchableOpacity>
    );
});

export default function UserProfileScreen() {
    const { userId } = useLocalSearchParams<{ userId: string }>();
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: profileResp, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useQuery({
        queryKey: ['public-profile', userId],
        queryFn: () => getPublicProfile(userId || ''),
        enabled: !!userId,
    });

    const profile = profileResp?.data?.data || profileResp?.data;

    const { data: posts, isLoading: postsLoading, isError: postsError, refetch: refetchPosts } = useQuery({
        queryKey: ['user-posts', userId],
        queryFn: () => getUserPosts(userId || ''),
        enabled: !!userId,
    });

    // Follow-graph state (SOCIAL API CONTRACT): { isFollowing, followers, following }.
    const { data: social } = useQuery({
        queryKey: ['user-social', userId],
        queryFn: () => getUserSocial(userId || ''),
        enabled: !!userId,
    });

    // Optimistic override — state is USER INTENT only (react-state-fallback):
    // `undefined` means "the user hasn't toggled this session", so the displayed
    // values fall back to the server `social` reactively (a refetch updates them).
    // Once the user taps, their optimistic choice persists until the next refetch.
    const [override, setOverride] = useState<{ isFollowing: boolean; followers: number } | undefined>(undefined);
    const isFollowing = override?.isFollowing ?? social?.isFollowing ?? false;
    const followers = override?.followers ?? social?.followers ?? 0;
    const following = social?.following ?? 0;

    const followMutation = useMutation({
        mutationFn: (next: boolean) => (next ? followUser(userId || '') : unfollowUser(userId || '')),
        onError: () => {
            // Roll back to the server truth (drop the optimistic override).
            setOverride(undefined);
        },
    });

    const onToggleFollow = useCallback(() => {
        const base: UserSocial = social ?? { isFollowing, followers, following };
        const next = !isFollowing;
        // Optimistically flip + inc/dec the follower count from the current truth.
        setOverride({ isFollowing: next, followers: Math.max(0, (base.followers ?? 0) + (next ? 1 : -1)) });
        followMutation.mutate(next);
    }, [social, isFollowing, followers, following, followMutation]);

    // ONE hoisted press handler shared by every PostRow (list-performance-callbacks /
    // list-performance-function-references): rows invoke onOpen(post.id) — no new
    // closure is allocated per row per render. Opens the post detail at the canonical
    // /(community)/<id> route (same target as the community feed's comment tap).
    const openPost = useCallback((postId: string) => {
        router.push(`/(community)/${postId}` as any);
    }, [router]);

    // Private + not-yet-following → show name/avatar only, lock the rest.
    const isLocked = !!profile?.isPrivate && !isFollowing;

    if (profileLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 8 }}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={[styles.profileSection, { borderBottomColor: colors.border.default }]}>
                    <Skeleton width={80} height={80} radius={40} />
                    <Skeleton width={180} height={26} radius={6} style={{ marginTop: 16 }} />
                    <Skeleton width={220} height={14} radius={4} style={{ marginTop: 12 }} />
                    <View style={styles.statsRow}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <View key={i} style={styles.statBox}>
                                <Skeleton width={36} height={22} radius={6} />
                                <Skeleton width={48} height={11} radius={4} style={{ marginTop: 6 }} />
                            </View>
                        ))}
                    </View>
                    <Skeleton width="60%" height={48} radius={24} style={{ marginTop: 24 }} />
                </View>
            </View>
        );
    }

    if (profileError || !profile) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 8 }}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState
                    icon={profileError ? 'cloud-offline-outline' : 'person-outline'}
                    title={profileError ? "Couldn't load profile" : 'User not found'}
                    subtitle={
                        profileError
                            ? "Something went wrong fetching this member's profile. Check your connection and try again."
                            : "This member's profile may have been removed or is no longer available."
                    }
                    actionLabel={profileError ? 'Try Again' : 'Go Back'}
                    onAction={profileError ? () => refetchProfile() : () => router.back()}
                    style={{ flex: 1 }}
                />
            </View>
        );
    }

    const displayName = (profile as any).displayName ?? ([(profile as any).firstName, (profile as any).lastName].filter(Boolean).join(' ') || 'Athlete');

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 8 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Profile Info */}
                <View style={[styles.profileSection, { borderBottomColor: colors.border.default }]}>
                    <View style={[styles.avatarLarge, { backgroundColor: colors.background.tertiary, borderColor: withAlpha(colors.accent.coral, 0.4) }, shadows.glow(colors.accent.coral)]}>
                        {profile.avatarUrl ? (
                            <Image source={{ uri: profile.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 40 }} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <Ionicons name="person" size={40} color={colors.text.tertiary} />
                        )}
                    </View>

                    <Text style={[typography.display, { color: colors.text.primary, marginTop: 16, fontSize: 28 }]}>{displayName}</Text>
                    {!isLocked && profile.bio ? (
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8, marginHorizontal: 20 }]}>
                            {profile.bio}
                        </Text>
                    ) : null}

                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{isLocked ? '—' : (posts?.length || 0)}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Posts</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{followers}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Followers</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{following}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Following</Text>
                        </View>
                    </View>

                    <View style={styles.actionRow}>
                        <CtaButton
                            label={isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                            icon={isFollowing ? 'checkmark' : 'person-add'}
                            accessibilityLabel={isFollowing ? 'Unfollow this member' : 'Follow this member'}
                            onPress={onToggleFollow}
                            style={styles.actionBtn}
                        />
                        <CtaButton
                            label="MESSAGE"
                            icon="chatbubble-ellipses"
                            accessibilityLabel="Message this member"
                            onPress={() => router.push(`/messages/${userId}` as any)}
                            style={styles.actionBtn}
                        />
                    </View>
                </View>

                {/* Posts — or a clean locked state for a private, not-yet-followed account */}
                {isLocked ? (
                    <View style={styles.lockedSection}>
                        <View
                            style={[
                                styles.lockCircle,
                                { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) },
                            ]}
                        >
                            <Ionicons name="lock-closed" size={40} color={colors.accent.coral} />
                        </View>
                        <Text style={[typography.h3, { color: colors.text.primary, marginTop: 20, textAlign: 'center' }]}>This account is private</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8, textAlign: 'center', maxWidth: 280 }]}>
                            Follow this member to see their posts and activity.
                        </Text>
                        <CtaButton
                            label={isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                            icon={isFollowing ? 'checkmark' : 'person-add'}
                            accessibilityLabel={isFollowing ? 'Unfollow this member' : 'Follow this member'}
                            onPress={onToggleFollow}
                            style={styles.lockedFollowBtn}
                        />
                    </View>
                ) : (
                    <View style={{ padding: 20 }}>
                        <Text style={[typography.h2, { color: colors.text.primary, marginBottom: 16 }]}>Posts</Text>

                        {postsLoading ? (
                            <View>
                                {Array.from({ length: 2 }).map((_, i) => (
                                    <Card key={i} variant="glass" style={[styles.postCard, { borderColor: colors.border.default, borderRadius: borderRadius['2xl'] }]}>
                                        <Skeleton width="100%" height={14} radius={4} />
                                        <Skeleton width="80%" height={14} radius={4} style={{ marginTop: 8 }} />
                                        <Skeleton width={100} height={11} radius={4} style={{ marginTop: 16 }} />
                                    </Card>
                                ))}
                            </View>
                        ) : postsError ? (
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load posts"
                                subtitle="Something went wrong fetching these posts. Check your connection and try again."
                                actionLabel="Try Again"
                                onAction={() => refetchPosts()}
                            />
                        ) : posts?.length === 0 ? (
                            <EmptyState
                                icon="document-text-outline"
                                title="No posts yet"
                                subtitle="This member hasn't shared anything with the community yet."
                            />
                        ) : (
                            // Stable key=post.id (NOT array index — list-performance-item-memo);
                            // pass only primitives + the single hoisted `openPost` so React.memo
                            // can skip unchanged rows. No per-row object/style is allocated here.
                            posts?.map((post: Post) => (
                                <PostRow
                                    key={post.id}
                                    id={post.id}
                                    content={post.content}
                                    imageUrl={post.imageUrl}
                                    createdAt={post.createdAt}
                                    onOpen={openPost}
                                />
                            ))
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 16, borderBottomWidth: 1 },
    profileSection: { alignItems: 'center', paddingVertical: 32, borderBottomWidth: 1 },
    avatarLarge: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginTop: 24, paddingHorizontal: 20 },
    statBox: { alignItems: 'center' },
    actionRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 24, paddingHorizontal: 20 },
    actionBtn: { flex: 1, maxWidth: 200, borderRadius: 24 },
    lockedSection: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    lockCircle: { width: 96, height: 96, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    lockedFollowBtn: { marginTop: 28, width: '60%', borderRadius: 24 },
    postCard: { padding: 18, marginBottom: 16, borderWidth: 1 },
    postImg: { width: '100%', height: 200, marginBottom: 12 },
});
