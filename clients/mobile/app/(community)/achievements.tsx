import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { getMyBadges, getBadgeCatalog, getUserScore, type Badge } from '@/api/community';

const { width } = Dimensions.get('window');
const CARD_W = (width - 52) / 3;

// Tier colours & gradients
const TIER_META: Record<string, { color: string; gradient: [string, string]; label: string }> = {
    bronze:   { color: '#CD7F32', gradient: ['#CD7F32', '#A0522D'], label: 'Bronze' },
    silver:   { color: '#C0C0C0', gradient: ['#C0C0C0', '#808080'], label: 'Silver' },
    gold:     { color: '#FFD700', gradient: ['#FFD700', '#FFA500'], label: 'Gold' },
    platinum: { color: '#E5E4E2', gradient: ['#E5E4E2', '#B0C4DE'], label: 'Platinum' },
};

export default function AchievementsScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const badgesQuery = useQuery({
        queryKey: ['my-badges'],
        queryFn: getMyBadges,
    });

    const catalogQuery = useQuery({
        queryKey: ['badge-catalog'],
        queryFn: getBadgeCatalog,
    });

    const scoreQuery = useQuery({
        queryKey: ['my-score'],
        queryFn: () => getUserScore('me'),
    });

    const myBadgeKeys = useMemo(
        () => new Set((badgesQuery.data ?? []).map((b: Badge) => b.key)),
        [badgesQuery.data]
    );

    const catalog = catalogQuery.data ?? [];
    const earned = (badgesQuery.data ?? []) as Badge[];
    const score = scoreQuery.data;

    const tierOrder = ['platinum', 'gold', 'silver', 'bronze'];
    const grouped = useMemo(() => {
        const map: Record<string, Badge[]> = {};
        for (const b of catalog) {
            if (!map[b.tier]) map[b.tier] = [];
            map[b.tier]!.push(b);
        }
        return map;
    }, [catalog]);

    const isLoading = badgesQuery.isLoading || catalogQuery.isLoading;

    // XP progress for next level
    const xp = score?.xp ?? 0;
    const level = score?.level ?? 1;
    const nextLevelXp = score?.xpForNextLevel ?? 100;
    const prevLevelXp = level > 1 ? 100 * (level - 1) * level / 2 : 0;
    const levelProgress = nextLevelXp > prevLevelXp
        ? (xp - prevLevelXp) / (nextLevelXp - prevLevelXp)
        : 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, fontWeight: '900' }]}>
                    Achievements
                </Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent.coral} />
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

                    {/* ── XP / Level Card ─────────────────────────────────── */}
                    <LinearGradient
                        colors={['#1A1A2E', '#2D1B69', '#1A1A2E']}
                        style={[styles.xpCard, { marginHorizontal: 20, marginTop: 16 }]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.xpCardInner}>
                            <View>
                                <Text style={[typography.caption, { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 1 }]}>
                                    CURRENT LEVEL
                                </Text>
                                <Text style={{ fontSize: 52, fontWeight: '900', color: '#fff', lineHeight: 58 }}>
                                    {level}
                                </Text>
                                <Text style={[typography.body, { color: 'rgba(255,255,255,0.7)' }]}>
                                    {xp.toLocaleString()} XP total
                                </Text>
                            </View>
                            <View style={styles.badgeCountCircle}>
                                <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff' }}>{earned.length}</Text>
                                <Text style={[typography.caption, { color: 'rgba(255,255,255,0.6)', fontSize: 10 }]}>BADGES</Text>
                            </View>
                        </View>

                        {/* Progress bar */}
                        <View style={{ marginTop: 16 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Text style={[typography.caption, { color: 'rgba(255,255,255,0.6)', fontSize: 10 }]}>
                                    LEVEL {level}
                                </Text>
                                <Text style={[typography.caption, { color: 'rgba(255,255,255,0.6)', fontSize: 10 }]}>
                                    LEVEL {level + 1} · {nextLevelXp.toLocaleString()} XP
                                </Text>
                            </View>
                            <View style={styles.progressTrack}>
                                <View
                                    style={[styles.progressFill, {
                                        width: `${Math.min(100, Math.round(levelProgress * 100))}%`,
                                        backgroundColor: '#A855F7'
                                    }]}
                                />
                            </View>
                            <Text style={[typography.caption, { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4, textAlign: 'right' }]}>
                                {Math.round(levelProgress * 100)}% to next level
                            </Text>
                        </View>
                    </LinearGradient>

                    {/* ── Earned Badges (recent first) ────────────────────── */}
                    {earned.length > 0 && (
                        <View style={{ marginTop: 28 }}>
                            <Text style={[typography.heading, { color: colors.text.primary, marginHorizontal: 20, marginBottom: 14, fontSize: 16, fontWeight: '800' }]}>
                                🏅 Your Badges ({earned.length})
                            </Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                            >
                                {earned.map((badge) => (
                                    <EarnedBadgeCard key={badge.id} badge={badge} colors={colors} typography={typography} />
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* ── Full Catalog by Tier ─────────────────────────────── */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginHorizontal: 20, marginTop: 32, marginBottom: 6, fontSize: 16, fontWeight: '800' }]}>
                        📚 All Badges
                    </Text>
                    <Text style={[typography.body, { color: colors.text.tertiary, marginHorizontal: 20, marginBottom: 16 }]}>
                        {earned.length} of {catalog.length} unlocked
                    </Text>

                    {tierOrder.filter(t => grouped[t]?.length).map((tier) => {
                        const meta = TIER_META[tier]!;
                        return (
                            <View key={tier} style={{ marginBottom: 24 }}>
                                <View style={[styles.tierHeader, { marginHorizontal: 20 }]}>
                                    <View style={[styles.tierDot, { backgroundColor: meta.color }]} />
                                    <Text style={[typography.caption, { color: meta.color, fontWeight: 'bold', letterSpacing: 1, fontSize: 11 }]}>
                                        {meta.label.toUpperCase()} TIER
                                    </Text>
                                </View>
                                <View style={[styles.catalogGrid, { marginHorizontal: 16 }]}>
                                    {(grouped[tier] ?? []).map((badge) => {
                                        const unlocked = myBadgeKeys.has(badge.key);
                                        return (
                                            <CatalogBadgeCard
                                                key={badge.id}
                                                badge={badge}
                                                unlocked={unlocked}
                                                tierColor={meta.color}
                                                colors={colors}
                                                typography={typography}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EarnedBadgeCard({ badge, colors, typography }: { badge: Badge; colors: any; typography: any }) {
    const meta = TIER_META[badge.tier] ?? TIER_META.bronze!;
    return (
        <View style={styles.earnedCard}>
            <LinearGradient
                colors={[withAlpha(meta.color, 0.25), withAlpha(meta.color, 0.08)]}
                style={[styles.earnedCardGradient, { borderColor: withAlpha(meta.color, 0.4) }]}
            >
                <Text style={{ fontSize: 32 }}>{badge.iconEmoji}</Text>
                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginTop: 8, textAlign: 'center', fontSize: 12 }]}>
                    {badge.name}
                </Text>
                <View style={[styles.earnedTierPill, { backgroundColor: withAlpha(meta.color, 0.2) }]}>
                    <Text style={{ color: meta.color, fontSize: 9, fontWeight: 'bold' }}>
                        {badge.tier.toUpperCase()}
                    </Text>
                </View>
            </LinearGradient>
        </View>
    );
}

function CatalogBadgeCard({
    badge, unlocked, tierColor, colors, typography
}: { badge: Badge; unlocked: boolean; tierColor: string; colors: any; typography: any }) {
    return (
        <View style={[styles.catalogCard, {
            backgroundColor: colors.background.secondary,
            borderColor: unlocked ? withAlpha(tierColor, 0.5) : colors.border.default,
            opacity: unlocked ? 1 : 0.5,
        }]}>
            <Text style={{ fontSize: 26, opacity: unlocked ? 1 : 0.4 }}>{badge.iconEmoji}</Text>
            <Text style={[typography.caption, {
                color: unlocked ? colors.text.primary : colors.text.tertiary,
                fontWeight: 'bold',
                fontSize: 11,
                textAlign: 'center',
                marginTop: 6,
            }]} numberOfLines={2}>
                {badge.name}
            </Text>
            <Text style={[typography.caption, {
                color: colors.text.tertiary,
                fontSize: 9,
                textAlign: 'center',
                marginTop: 3,
                lineHeight: 13,
            }]} numberOfLines={2}>
                {badge.description}
            </Text>
            {badge.xpReward > 0 && (
                <View style={[styles.xpPill, { backgroundColor: withAlpha(tierColor, 0.15) }]}>
                    <Text style={{ color: tierColor, fontSize: 9, fontWeight: 'bold' }}>
                        +{badge.xpReward} XP
                    </Text>
                </View>
            )}
            {unlocked && (
                <View style={[styles.checkMark, { backgroundColor: tierColor }]}>
                    <Ionicons name="checkmark" size={10} color="#000" />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    xpCard: {
        borderRadius: 20,
        padding: 20,
        overflow: 'hidden',
    },
    xpCardInner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    badgeCountCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    progressTrack: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },

    earnedCard: { width: 120 },
    earnedCardGradient: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        alignItems: 'center',
    },
    earnedTierPill: {
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },

    tierHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    tierDot: { width: 8, height: 8, borderRadius: 4 },
    catalogGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    catalogCard: {
        width: CARD_W,
        borderRadius: 14,
        borderWidth: 1,
        padding: 12,
        alignItems: 'center',
        position: 'relative',
    },
    xpPill: {
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    checkMark: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
