import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPublicProfile } from '@/api/users';
import { getUserPosts, Post } from '@/api/community';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Card } from '@/components/ui/Card';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

export default function UserProfileScreen() {
    const { userId } = useLocalSearchParams<{ userId: string }>();
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: profileResp, isLoading: profileLoading } = useQuery({
        queryKey: ['public-profile', userId],
        queryFn: () => getPublicProfile(userId || ''),
        enabled: !!userId,
    });

    const profile = profileResp?.data?.data || profileResp?.data;

    const { data: posts, isLoading: postsLoading } = useQuery({
        queryKey: ['user-posts', userId],
        queryFn: () => getUserPosts(userId || ''),
        enabled: !!userId,
    });

    if (profileLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    if (!profile) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[typography.heading, { color: colors.text.primary }]}>User not found</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
                    <Text style={{ color: colors.accent.cyan }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Profile Info */}
                <View style={styles.profileSection}>
                    <View style={[styles.avatarLarge, { backgroundColor: colors.background.tertiary }]}>
                        {profile.avatarUrl ? (
                            <Image source={{ uri: profile.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 40 }} />
                        ) : (
                            <Ionicons name="person" size={40} color={colors.text.tertiary} />
                        )}
                    </View>

                    <Text style={[typography.display, { color: colors.text.primary, marginTop: 16, fontSize: 28 }]}>{profile.firstName} {profile.lastName}</Text>
                    {profile.bio && (
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8, marginHorizontal: 20 }]}>
                            {profile.bio}
                        </Text>
                    )}

                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Text style={[typography.heading, { color: colors.text.primary }]}>{posts?.length || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>Posts</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[typography.heading, { color: colors.text.primary }]}>{profile?.followersCount || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>Followers</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[typography.heading, { color: colors.text.primary }]}>{profile?.followingCount || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>Following</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.messageBtn, { backgroundColor: colors.accent.cyan }]}
                        onPress={() => router.push(`/messages/${userId}` as any)}
                    >
                        <Ionicons name="chatbubble-ellipses" size={20} color="#000" />
                        <Text style={[typography.subhead, { color: '#000', fontWeight: 'bold', marginLeft: 8 }]}>MESSAGE</Text>
                    </TouchableOpacity>
                </View>

                {/* Posts */}
                <View style={{ padding: 20 }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 16 }]}>Posts</Text>

                    {postsLoading ? (
                        <ActivityIndicator color={colors.accent.cyan} />
                    ) : posts?.length === 0 ? (
                        <Text style={[typography.body, { color: colors.text.tertiary, textAlign: 'center', marginTop: 20 }]}>No posts yet.</Text>
                    ) : (
                        posts?.map((post: Post) => (
                            <Card key={post.id} style={[styles.postCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 12, lineHeight: 22 }]}>
                                    {post.content}
                                </Text>
                                {post.imageUrl && (
                                    <Image source={{ uri: post.imageUrl }} style={[styles.postImg, { borderRadius: borderRadius.lg }]} contentFit="cover" />
                                )}
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>
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
    profileSection: { alignItems: 'center', paddingVertical: 32, borderBottomWidth: 1, borderBottomColor: '#222' },
    avatarLarge: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginTop: 24, paddingHorizontal: 20 },
    statBox: { alignItems: 'center' },
    messageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 24, marginTop: 24, width: '60%' },
    postCard: { padding: 16, marginBottom: 16, borderWidth: 1 },
    postImg: { width: '100%', height: 200, marginBottom: 12 },
});
