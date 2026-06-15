import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPublicProfile } from '@/api/users';
import { getUserPosts, Post } from '@/api/community';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

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

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
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

                    <Text style={[typography.display, { color: colors.text.primary, marginTop: 16, fontSize: 28 }]}>{(profile as any).displayName ?? ([(profile as any).firstName, (profile as any).lastName].filter(Boolean).join(' ') || 'NightFuel Member')}</Text>
                    {profile.bio && (
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8, marginHorizontal: 20 }]}>
                            {profile.bio}
                        </Text>
                    )}

                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{posts?.length || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Posts</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{profile?.followersCount || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Followers</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{profile?.followingCount || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Following</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Message this member"
                        style={[styles.messageBtn, shadows.glow(colors.accent.coral)]}
                        onPress={() => router.push(`/messages/${userId}` as any)}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.messageBtnGradient}
                        >
                            <Ionicons name="chatbubble-ellipses" size={20} color={colors.text.primary} />
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginLeft: 8 }]}>MESSAGE</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* Posts */}
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
                        posts?.map((post: Post) => (
                            <Card key={post.id} variant="glass" style={[styles.postCard, { borderColor: colors.border.default, borderRadius: borderRadius['2xl'] }]}>
                                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 12, lineHeight: 22 }]}>
                                    {post.content}
                                </Text>
                                {post.imageUrl && (
                                    <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.lg }]} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                )}
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                    {formatDistanceToNow(new Date(post.createdAt))} ago
                                </Text>
                            </Card>
                        ))
                    )}
                </View>
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
    messageBtn: { marginTop: 24, width: '60%', borderRadius: 24, overflow: 'hidden' },
    messageBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 32 },
    postCard: { padding: 18, marginBottom: 16, borderWidth: 1 },
    postImg: { width: '100%', height: 200, marginBottom: 12 },
});
