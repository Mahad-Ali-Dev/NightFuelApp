import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
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

const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze'];

export default function AchievementsScreen() {
    const { colors, typography, borderRadius } = useTheme();
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

    const grouped = useMemo(() => {
        const map: Record<string, Badge[]> = {};
        for (const b of catalog) {
            if (!map[b.tier]) map[b.tier] = [];
            map[b.tier]!.push(b);
        }
        return map;
    }, [catalog]);

    const isLoading = badgesQuery.isLoading || catalogQuery.isLoading;
    // A failed catalog/badges fetch must surface a retryable error rather than
    // silently rendering the empty layout (an empty 'All Badges' grid reads as
    // "you have no badges" when the request actually failed).
    const isError = badgesQuery.isError || catalogQuery.isError;

    // Refetch all three queries from the error state's retry. scoreQuery feeds the
    // XP card, so we refresh it alongside the two catalog queries that gate the view.
    const handleRetry = () => {
        badgesQuery.refetch();
        catalogQuery.refetch();
        scoreQuery.refetch();
    };

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
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h2, { color: colors.text.primary }]}>
                    Achievements
                </Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                // Loading scaffold mirrors the loaded layout: an xpCard-shaped block
                // (with the level/XP/badge-count placeholders + the progress track)
                // and a tier section of catalog-card placeholders. Honest loading —
                // not a bare spinner — so the screen doesn't "pop" on data arrival.
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                    <View style={[styles.xpCard, { marginHorizontal: 20, marginTop: 16, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.xpCardInner}>
                            <View style={{ flex: 1 }}>
                                <Skeleton width={92} height={11} radius={borderRadius.sm} />
                                <Skeleton width={64} height={44} radius={borderRadius.md} style={{ marginTop: 10 }} />
                                <Skeleton width={120} height={14} radius={borderRadius.sm} style={{ marginTop: 10 }} />
                            </View>
                            <Skeleton width={80} height={80} radius={40} />
                        </View>
                        <Skeleton width="100%" height={6} radius={3} style={{ marginTop: 24 }} />
                    </View>

                    <Skeleton width={160} height={22} radius={borderRadius.sm} style={{ marginHorizontal: 20, marginTop: 32 }} />
                    <View style={[styles.catalogGrid, { marginHorizontal: 16, marginTop: 16 }]}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonCard key={i} height={130} radius={14} style={styles.catalogCardSkeleton} />
                        ))}
                    </View>
                </ScrollView>
            ) : isError ? (
                // Honest retryable error — a failed catalog/badges fetch would
                // otherwise fall through to the empty layout (a blank 'All Badges'
                // grid), which misreads as "you have no badges". The retry refetches
                // all three queries (react-state-fallback: the cache is the single
                // source of truth, so we never mirror an error flag into state).
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load achievements"
                    subtitle="Something went wrong fetching your badges and level. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={handleRetry}
                    style={styles.stateFill}
                />
            ) : catalog.length === 0 ? (
                // Loaded but the badge catalog is empty — show an honest empty state
                // instead of a blank 'All Badges' section.
                <EmptyState
                    icon="trophy-outline"
                    title="No badges yet"
                    subtitle="Badges will appear here as the catalog fills out. Keep training and check back soon."
                    style={styles.stateFill}
                />
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

                    {/* ── XP / Level Card ─────────────────────────────────── */}
                    <LinearGradient
                        colors={[colors.background.tertiary, colors.accent.purpleDark, colors.background.tertiary]}
                        style={[styles.xpCard, { marginHorizontal: 20, marginTop: 16, borderColor: withAlpha(colors.accent.purple, 0.35) }, shadows.glow(colors.accent.purple)]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.xpCardInner}>
                            <View>
                                <Text style={[typography.overline, { color: withAlpha(colors.text.primary, 0.7) }]}>
                                    CURRENT LEVEL
                                </Text>
                                <Text maxFontSizeMultiplier={1.3} style={[typography.statLarge, { color: colors.text.primary, marginTop: 2 }]}>
                                    {level}
                                </Text>
                                <Text maxFontSizeMultiplier={1.3} style={[typography.body, { color: withAlpha(colors.text.primary, 0.75) }]}>
                                    {xp.toLocaleString()} XP total
                                </Text>
                            </View>
                            <View style={[styles.badgeCountCircle, { borderColor: withAlpha(colors.text.primary, 0.2), backgroundColor: withAlpha(colors.text.primary, 0.08) }]}>
                                <Text maxFontSizeMultiplier={1.3} style={[typography.statSmall, { color: colors.text.primary }]}>{earned.length}</Text>
                                <Text maxFontSizeMultiplier={1.3} style={[typography.caption, { color: withAlpha(colors.text.primary, 0.6), fontSize: 10 }]}>BADGES</Text>
                            </View>
                        </View>

                        {/* Progress bar */}
                        <View style={{ marginTop: 16 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.6), fontSize: 10 }]}>
                                    LEVEL {level}
                                </Text>
                                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.6), fontSize: 10 }]}>
                                    LEVEL {level + 1} · {nextLevelXp.toLocaleString()} XP
                                </Text>
                            </View>
                            <View style={[styles.progressTrack, { backgroundColor: withAlpha(colors.text.primary, 0.12) }]}>
                                <View
                                    style={[styles.progressFill, {
                                        width: `${Math.min(100, Math.round(levelProgress * 100))}%`,
                                        backgroundColor: colors.accent.purpleLight
                                    }]}
                                />
                            </View>
                            <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.5), fontSize: 10, marginTop: 4, textAlign: 'right' }]}>
                                {Math.round(levelProgress * 100)}% to next level
                            </Text>
                        </View>
                    </LinearGradient>

                    {/* ── Earned Badges (recent first) ────────────────────── */}
                    {earned.length > 0 && (
                        <View style={{ marginTop: 28 }}>
                            <Text style={[typography.h3, { color: colors.text.primary, marginHorizontal: 20, marginBottom: 14 }]}>
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
                    <Text style={[typography.h3, { color: colors.text.primary, marginHorizontal: 20, marginTop: 32, marginBottom: 6 }]}>
                        📚 All Badges
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, marginHorizontal: 20, marginBottom: 16 }]}>
                        {earned.length} of {catalog.length} unlocked
                    </Text>

                    {TIER_ORDER.filter(t => grouped[t]?.length).map((tier) => {
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

const EarnedBadgeCard = React.memo(function EarnedBadgeCard({ badge, colors, typography }: { badge: Badge; colors: any; typography: any }) {
    const meta = TIER_META[badge.tier] ?? TIER_META.bronze!;
    return (
        // One a11y node per badge: a screen reader announces the badge name + its
        // tier + earned state as a single summary rather than reading the emoji
        // glyph and the tier pill as separate, contextless nodes.
        <View
            style={styles.earnedCard}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${badge.name} badge, ${meta.label} tier, earned`}
        >
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
});

const CatalogBadgeCard = React.memo(function CatalogBadgeCard({
    badge, unlocked, tierColor, colors, typography
}: { badge: Badge; unlocked: boolean; tierColor: string; colors: any; typography: any }) {
    return (
        // One a11y node per catalog tile: collapses the emoji + name + description
        // + lock badge into a single announcement of name and locked/unlocked state.
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${badge.name} badge, ${unlocked ? 'unlocked' : 'locked'}`}
            style={[styles.catalogCard, {
                backgroundColor: colors.background.secondary,
                borderColor: unlocked ? withAlpha(tierColor, 0.5) : colors.border.default,
                opacity: unlocked ? 1 : 0.5,
            }]}
        >
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
                color: colors.text.secondary,
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
                    <Ionicons name="checkmark" size={10} color={colors.text.inverse} />
                </View>
            )}
        </View>
    );
});

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
    // Fills the area below the header so the empty / error EmptyState centers in
    // the remaining space rather than hugging the top.
    stateFill: { flex: 1 },

    xpCard: {
        borderRadius: 24,
        borderWidth: 1,
        padding: 20,
        overflow: 'hidden',
    },
    // Matches CatalogBadgeCard's width so the skeleton grid lines up with the
    // loaded catalog grid; the SkeletonCard default marginBottom is zeroed since
    // the grid's `gap` already spaces the tiles.
    catalogCardSkeleton: { width: CARD_W, marginBottom: 0 },
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressTrack: {
        height: 6,
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
