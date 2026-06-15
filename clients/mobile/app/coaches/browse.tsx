import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme';
import { Card, Skeleton, EmptyState } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getCoachDirectory } from '@/api/chat';
import { useRouter } from 'expo-router';
import { withAlpha } from '@/theme/utils';

export default function CoachesBrowseScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: coaches, isLoading, isError, refetch } = useQuery({
        queryKey: ['coach-directory'],
        queryFn: getCoachDirectory,
    });

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={styles.header}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Find a Coach</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['8xl'] }}>
                    <Skeleton width="90%" height={14} radius={borderRadius.sm} />
                    <Skeleton width="70%" height={14} radius={borderRadius.sm} style={{ marginTop: spacing.sm, marginBottom: spacing['2xl'] }} />
                    {Array.from({ length: 4 }).map((_, i) => (
                        <CoachCardSkeleton key={i} />
                    ))}
                </ScrollView>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load coaches"
                    subtitle="Something went wrong fetching the coach directory. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : !coaches || coaches.length === 0 ? (
                <EmptyState
                    icon="search-outline"
                    title="No coaches available"
                    subtitle="There are no coaches in the directory right now. Pull to refresh or check back soon."
                    actionLabel="Refresh"
                    onAction={() => refetch()}
                />
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['8xl'] }}>
                    <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                        Connect with specialized coaches to optimize your performance, nutrition, and shift work transitions.
                    </Text>

                    {coaches?.map((coach: any) => (
                        <Card key={coach.id} variant="glass" style={styles.coachCard}>
                            <View style={styles.coachHeader}>
                                <View style={[styles.avatar, { borderColor: withAlpha(colors.accent.cyan, 0.5), backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                    {coach.avatarUrl ? (
                                        <Image source={{ uri: coach.avatarUrl }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                    ) : (
                                        <Text style={[typography.h2, { color: colors.accent.cyan }]}>{(coach.name || 'C')[0]}</Text>
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subtitle, { color: colors.text.primary }]}>{coach.name}</Text>
                                    <Text style={[typography.captionMedium, { color: colors.accent.cyan, marginTop: 4 }]}>{coach.speciality}</Text>
                                    <View style={styles.statsRow}>
                                        <Ionicons name="star" size={14} color={colors.accent.amber} />
                                        <Text style={[typography.captionMedium, { color: colors.text.primary, marginLeft: 4 }]}>{coach.rating?.toFixed(1) || '5.0'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>• {coach.clients || 0} active clients</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', marginTop: 20 }}>
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel={`Message ${coach.name}`}
                                    style={[styles.actionBtn, { flex: 1, backgroundColor: colors.accent.cyan, borderColor: colors.accent.cyan }, shadows.glow(colors.accent.cyan)]}
                                    onPress={() => router.push(`/messages/${coach.id}` as any)}
                                    activeOpacity={0.9}
                                >
                                    <Ionicons name="chatbubble-outline" size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                                    <Text style={[typography.subhead, { color: colors.text.inverse, fontWeight: '700' }]}>Message</Text>
                                </TouchableOpacity>
                            </View>
                        </Card>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function CoachCardSkeleton() {
    const { colors, borderRadius } = useTheme();
    return (
        <Card variant="glass" style={styles.coachCard}>
            <View style={styles.coachHeader}>
                <Skeleton width={64} height={64} radius={32} />
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <Skeleton width="55%" height={16} radius={borderRadius.sm} />
                    <Skeleton width="40%" height={12} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                    <Skeleton width="70%" height={12} radius={borderRadius.sm} style={{ marginTop: 10 }} />
                </View>
            </View>
            <Skeleton width="100%" height={44} radius={22} style={{ marginTop: 20 }} />
        </Card>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    coachCard: { padding: 20, marginBottom: 16 },
    coachHeader: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 32 },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    actionBtn: { flexDirection: 'row', height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
