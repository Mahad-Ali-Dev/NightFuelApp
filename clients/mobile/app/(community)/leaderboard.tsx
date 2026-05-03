import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/api/community';
import { Card } from '@/components/ui';

export default function LeaderboardScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // ── Queries ─────────────────────────────────────────────────────────────
    const { data: leaderboardData, isLoading } = useQuery({
        queryKey: ['community-leaderboard'],
        queryFn: () => getLeaderboard(50),
    });

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Leaderboard</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent.cyan} />
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    {/* Top 3 Podium */}
                    <View style={styles.podiumContainer}>
                        {leaderboardData?.leaderboard?.slice(0, 3).map((user, idx) => (
                            <PodiumItem key={user.userId} user={user} rank={idx + 1} />
                        ))}
                    </View>

                    {/* Full List */}
                    <View style={styles.listSection}>
                        {leaderboardData?.leaderboard?.slice(3).map((user, idx) => (
                            <LeaderRow key={user.userId} user={user} rank={idx + 4} />
                        ))}
                    </View>

                    {/* My Rank Footer */}
                    {leaderboardData?.myScore && (
                        <View style={[styles.myRankBar, { backgroundColor: colors.background.secondary, borderTopColor: colors.border.default, paddingBottom: insets.bottom + 12 }]}>
                            <LeaderRow user={leaderboardData.myScore} rank={leaderboardData.myScore.rank} isMe />
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

function PodiumItem({ user, rank }: any) {
    const { colors, typography } = useTheme();
    const isFirst = rank === 1;
    return (
        <View style={[styles.podiumItem, isFirst && { marginTop: -20 }]}>
            <View style={[styles.avatarPodium, { borderColor: rank === 1 ? colors.accent.amber : rank === 2 ? colors.text.tertiary : colors.accent.orange }]}>
                <Ionicons name="person" size={isFirst ? 40 : 32} color={colors.text.tertiary} />
                <View style={[styles.rankBadge, { backgroundColor: rank === 1 ? colors.accent.amber : rank === 2 ? colors.text.tertiary : colors.accent.orange }]}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#000' }}>{rank}</Text>
                </View>
            </View>
            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 12 }]}>{user.userName || 'User'}</Text>
            <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: 'bold' }]}>{user.score} pts</Text>
        </View>
    );
}

function LeaderRow({ user, rank, isMe }: any) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <View style={[styles.leaderRow, isMe && { backgroundColor: `${colors.accent.cyan}10`, borderRadius: 12 }]}>
            <Text style={[typography.subhead, { color: colors.text.tertiary, width: 30, textAlign: 'center' }]}>{rank}</Text>
            <View style={[styles.avatarMini, { backgroundColor: colors.background.tertiary }]}>
                <Ionicons name="person" size={14} color={colors.text.tertiary} />
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: isMe ? 'bold' : 'normal' }]}>{user.userName || 'User'}{isMe ? ' (You)' : ''}</Text>
            </View>
            <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: 'bold' }]}>{user.score}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    podiumContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingVertical: 40, paddingHorizontal: 10 },
    podiumItem: { alignItems: 'center' },
    avatarPodium: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    rankBadge: { position: 'absolute', bottom: -5, right: -5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    listSection: { paddingHorizontal: 20 },
    leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
    avatarMini: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    myRankBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
});
