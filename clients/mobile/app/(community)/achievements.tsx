import React, { useMemo, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { getMyBadges, getBadgeCatalog, getUserScore, type Badge } from '@/api/community';

// Derives the 3-up catalog card width from the live viewport width (fed by
// useWindowDimensions inside the screen) so CARD_W tracks rotation / split-view /
// foldable resize instead of freezing at first paint.
const cardWidth = (w: number) => (w - 52) / 3;

// Tier colours & gradients. The lime brand accent is reserved for the user's
// earned / progress signals (10% rule); tiers keep their metallic identity so a
// gold badge still reads as gold, but locked tiles stay desaturated glass.
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
    // Recompute the 3-up card width on every dimension change (rotation / fold /
    // split-view) rather than freezing it at module load.
    const { width } = useWindowDimensions();
    const CARD_W = cardWidth(width);
    // Drives the thumb-zone CTA: tapping "Chase next badge" scrolls the catalog
    // into view. Uses the existing scroll surface — no new navigation/route.
    const scrollRef = useRef<ScrollView>(null);
    const catalogYRef = useRef(0);

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

    // The single locked badge to chase next: highest-tier first (platinum→bronze),
    // then biggest XP reward within that tier. Powers the "Next up" spotlight and
    // the thumb-zone CTA so the screen always points at one concrete goal.
    const nextBadge = useMemo(() => {
        for (const tier of TIER_ORDER) {
            const locked = (grouped[tier] ?? [])
                .filter((b) => !myBadgeKeys.has(b.key))
                .sort((a, b) => b.xpReward - a.xpReward);
            if (locked.length) return locked[0]!;
        }
        return undefined;
    }, [grouped, myBadgeKeys]);

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
    const levelPct = Math.min(100, Math.max(0, Math.round(levelProgress * 100)));
    const completionPct = catalog.length > 0
        ? Math.round((earned.length / catalog.length) * 100)
        : 0;
    // The 100% peak: every catalog badge earned, so there's no `nextBadge` to chase.
    // Drives a celebratory thumb-zone banner instead of leaving it blank (peak-end).
    const isComplete = catalog.length > 0 && earned.length >= catalog.length;

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
                // Loading scaffold mirrors the loaded layout: a hero-shaped block
                // (with the level/XP/badge-count placeholders + the progress track)
                // and a tier section of catalog-card placeholders. Honest loading —
                // not a bare spinner — so the screen doesn't "pop" on data arrival.
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                    <View style={[styles.heroCard, { marginHorizontal: 20, marginTop: 16, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.heroTopRow}>
                            <View style={{ flex: 1 }}>
                                <Skeleton width={92} height={11} radius={borderRadius.sm} />
                                <Skeleton width={120} height={48} radius={borderRadius.md} style={{ marginTop: 10 }} />
                                <Skeleton width={140} height={14} radius={borderRadius.sm} style={{ marginTop: 10 }} />
                            </View>
                            <Skeleton width={86} height={86} radius={43} />
                        </View>
                        <Skeleton width="100%" height={8} radius={4} style={{ marginTop: 24 }} />
                        <View style={styles.statRow}>
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} width={(width - 88) / 3} height={56} radius={borderRadius.lg} />
                            ))}
                        </View>
                    </View>

                    <Skeleton width={160} height={22} radius={borderRadius.sm} style={{ marginHorizontal: 20, marginTop: 32 }} />
                    <View style={[styles.catalogGrid, { marginHorizontal: 16, marginTop: 16 }]}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonCard key={i} height={130} radius={14} style={[styles.catalogCardSkeleton, { width: CARD_W }]} />
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
                <>
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 108 }}
                >

                    {/* ── Stat Hero — the PEAK: totals dominate, lime = progress ── */}
                    <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9)}>
                        <LinearGradient
                            colors={[colors.background.tertiary, colors.background.secondary, colors.background.tertiary]}
                            style={[styles.heroCard, { marginHorizontal: 20, marginTop: 16, borderColor: withAlpha(colors.accent.coral, 0.28) }, shadows.glow(colors.accent.coral)]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            {/* lime corner wash — the 10% accent, kept faint.
                                Decorative only: hidden from the a11y tree so it
                                doesn't add an empty node beside the hero summary. */}
                            <LinearGradient
                                colors={[withAlpha(colors.accent.coral, 0.16), 'transparent']}
                                style={styles.heroWash}
                                start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
                                pointerEvents="none"
                                importantForAccessibility="no"
                                accessibilityElementsHidden
                            />

                            <View style={styles.heroTopRow}>
                                {/* One summary node for the level block: a screen reader
                                    hears "Level 7, 1,240 XP, 60% to level 8" instead of
                                    the bare level glyph + two unlabeled lines. */}
                                <View
                                    style={{ flex: 1 }}
                                    accessible
                                    accessibilityLabel={`Level ${level}, ${xp.toLocaleString()} XP, ${levelPct}% to level ${level + 1}`}
                                >
                                    <Text style={[typography.overline, { color: withAlpha(colors.text.primary, 0.6) }]} importantForAccessibility="no-hide-descendants">
                                        CURRENT LEVEL
                                    </Text>
                                    <Text maxFontSizeMultiplier={1.2} style={[typography.statLarge, { color: colors.text.primary, marginTop: 2 }]} importantForAccessibility="no-hide-descendants">
                                        {level}
                                    </Text>
                                    <Text maxFontSizeMultiplier={1.3} style={[typography.bodySm, { color: colors.text.secondary }]} importantForAccessibility="no-hide-descendants">
                                        {xp.toLocaleString()} XP total
                                    </Text>
                                </View>

                                {/* Level ring — earned-count at centre, lime arc shows
                                    progress to next level. SVG-free: a tinted track
                                    with a lime cap dot at the progress angle reads as a
                                    "filling" ring without pulling a new dependency. */}
                                <LevelRing
                                    pct={levelPct}
                                    centerValue={earned.length}
                                    centerLabel="EARNED"
                                    colors={colors}
                                    typography={typography}
                                />
                            </View>

                            {/* Level progress bar */}
                            <View style={{ marginTop: 18 }}>
                                <View style={styles.progressLabelRow}>
                                    <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.55), fontSize: 10 }]}>
                                        LVL {level}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.accent.coralLight, fontSize: 10 }]}>
                                        {levelPct}% TO LVL {level + 1}
                                    </Text>
                                </View>
                                <View style={[styles.progressTrack, { backgroundColor: withAlpha(colors.text.primary, 0.1) }]}>
                                    <LinearGradient
                                        colors={[colors.accent.coral, colors.accent.coralLight]}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={[styles.progressFill, { width: `${levelPct}%` }]}
                                    />
                                </View>
                            </View>

                            {/* Totals strip — value > label, condensed numerals */}
                            <View style={styles.statRow}>
                                <HeroStat value={earned.length} label="Earned" tint={colors.accent.coral} colors={colors} typography={typography} />
                                <View style={[styles.statDivider, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]} />
                                <HeroStat value={Math.max(0, catalog.length - earned.length)} label="Locked" colors={colors} typography={typography} />
                                <View style={[styles.statDivider, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]} />
                                <HeroStat value={`${completionPct}%`} label="Complete" colors={colors} typography={typography} />
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* ── Next badge to chase — spotlight one concrete goal ───────
                        …or, at 100%, a celebratory completion spotlight so the
                        biggest peak-end moment never renders empty. */}
                    {nextBadge ? (
                        <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(70)}>
                            <NextBadgeSpotlight
                                badge={nextBadge}
                                colors={colors}
                                typography={typography}
                                onPress={() => scrollRef.current?.scrollTo({ y: catalogYRef.current, animated: true })}
                            />
                        </Animated.View>
                    ) : isComplete ? (
                        <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(70)}>
                            <CompletionSpotlight
                                count={earned.length}
                                colors={colors}
                                typography={typography}
                            />
                        </Animated.View>
                    ) : null}

                    {/* ── Earned Badges (recent first) ────────────────────────── */}
                    <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(120)} style={{ marginTop: 28 }}>
                        <View style={styles.sectionHeader}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>
                                Your Badges
                            </Text>
                            {earned.length > 0 && (
                                <View style={[styles.countPill, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                                    <Text style={[typography.captionMedium, { color: colors.accent.coralLight, fontSize: 11 }]}>
                                        {earned.length}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {earned.length > 0 ? (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 4 }}
                            >
                                {earned.map((badge, i) => (
                                    // Cap the per-item delay so a large collection still
                                    // enters snappily (first ~8 keep the 45ms stagger feel,
                                    // the rest share the ceiling instead of trickling in).
                                    <Animated.View key={badge.id} entering={FadeIn.delay(160 + Math.min(i, 8) * 45)}>
                                        <EarnedBadgeCard badge={badge} colors={colors} typography={typography} />
                                    </Animated.View>
                                ))}
                            </ScrollView>
                        ) : (
                            // Guiding empty state for the earned rail — never blank. An
                            // icon + one line + a real CTA that drops the user into the
                            // catalog (mirrors the thumb-zone CTA's scroll target).
                            <View style={[styles.earnedEmpty, { marginHorizontal: 20, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                <View style={styles.earnedEmptyTop}>
                                    <View style={[styles.earnedEmptyIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) }]}>
                                        <Ionicons name="ribbon-outline" size={26} color={colors.accent.coral} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[typography.subtitle, { color: colors.text.primary }]}>No badges yet</Text>
                                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]}>
                                            Train and complete challenges to earn your first badge.
                                        </Text>
                                    </View>
                                </View>
                                <PressableScale
                                    accessibilityRole="button"
                                    accessibilityLabel="Browse badges to see what you can earn"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    onPress={() => scrollRef.current?.scrollTo({ y: catalogYRef.current, animated: true })}
                                    style={[styles.earnedEmptyCta, { borderColor: withAlpha(colors.accent.coral, 0.4), backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}
                                >
                                    <Ionicons name="compass-outline" size={16} color={colors.accent.coralLight} />
                                    <Text style={[typography.captionMedium, { color: colors.accent.coralLight }]}>
                                        Browse badges
                                    </Text>
                                </PressableScale>
                            </View>
                        )}
                    </Animated.View>

                    {/* ── Full Catalog by Tier ─────────────────────────────────── */}
                    <View
                        onLayout={(e) => { catalogYRef.current = e.nativeEvent.layout.y; }}
                    >
                        <Animated.View entering={FadeInDown.springify().damping(20).delay(160)}>
                            <View style={[styles.sectionHeader, { marginTop: 32 }]}>
                                <Text style={[typography.h3, { color: colors.text.primary }]}>
                                    All Badges
                                </Text>
                                <Text style={[typography.bodySm, { color: colors.text.secondary }]}>
                                    {earned.length} / {catalog.length} unlocked
                                </Text>
                            </View>
                        </Animated.View>

                        {TIER_ORDER.filter(t => grouped[t]?.length).map((tier, ti) => {
                            const meta = TIER_META[tier]!;
                            const tierTotal = grouped[tier]?.length ?? 0;
                            const tierEarned = (grouped[tier] ?? []).filter((b) => myBadgeKeys.has(b.key)).length;
                            return (
                                <Animated.View
                                    key={tier}
                                    // Clamp the tier delay too — a full catalog must not
                                    // push the lower tiers' entrance far past the viewport.
                                    entering={FadeInDown.springify().damping(20).delay(200 + Math.min(ti, 4) * 50)}
                                    style={{ marginBottom: 24 }}
                                >
                                    <View style={[styles.tierHeader, { marginHorizontal: 20 }]}>
                                        <View style={[styles.tierDot, { backgroundColor: meta.color }, shadows.glow(meta.color)]} />
                                        <Text style={[typography.overline, { color: meta.color, fontSize: 11 }]}>
                                            {meta.label} Tier
                                        </Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[typography.captionMedium, { color: colors.text.tertiary, fontSize: 11 }]}>
                                            {tierEarned}/{tierTotal}
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
                                                    cardW={CARD_W}
                                                    colors={colors}
                                                    typography={typography}
                                                />
                                            );
                                        })}
                                    </View>
                                </Animated.View>
                            );
                        })}
                    </View>
                </ScrollView>

                {/* ── Thumb-zone CTA — points at the one next goal, or celebrates
                    full completion. A top gradient scrim dissolves scrolling
                    content into the (now opaque) bar instead of letting the last
                    catalog row bleed through faintly. ───────────────────────── */}
                {(nextBadge || isComplete) && (
                    <Animated.View
                        entering={FadeInDown.springify().damping(22).delay(240)}
                        style={[styles.ctaBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background.primary, borderTopColor: colors.border.default }]}
                    >
                        {/* Scrim: transparent → bg so content fades cleanly into the bar. */}
                        <LinearGradient
                            colors={['transparent', colors.background.primary]}
                            style={styles.ctaScrim}
                            pointerEvents="none"
                            importantForAccessibility="no"
                            accessibilityElementsHidden
                        />
                        {nextBadge ? (
                            <PressableScale
                                accessibilityRole="button"
                                accessibilityLabel={`Chase next badge, ${nextBadge.name}`}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                onPress={() => scrollRef.current?.scrollTo({ y: catalogYRef.current, animated: true })}
                                style={styles.ctaPressable}
                            >
                                <LinearGradient
                                    colors={[colors.accent.coral, colors.accent.coralDark]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                    style={[styles.ctaButton, shadows.glow(colors.accent.coral)]}
                                >
                                    <Ionicons name="flag" size={18} color={colors.text.inverse} />
                                    <Text maxFontSizeMultiplier={1.2} style={[typography.subtitle, { color: colors.text.inverse }]}>
                                        Chase next badge
                                    </Text>
                                </LinearGradient>
                            </PressableScale>
                        ) : (
                            // 100% — the peak. A lime CTA so the completion state is the
                            // proudest screen, not the blankest. Reuses the existing scroll
                            // affordance (jumps to the full collection) — no new handler /
                            // share intent is introduced, preserving behavior.
                            <PressableScale
                                accessibilityRole="button"
                                accessibilityLabel="View your full badge collection"
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                onPress={() => scrollRef.current?.scrollTo({ y: catalogYRef.current, animated: true })}
                                style={styles.ctaPressable}
                            >
                                <LinearGradient
                                    colors={[colors.accent.coral, colors.accent.coralDark]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                    style={[styles.ctaButton, shadows.glow(colors.accent.coral)]}
                                >
                                    <Ionicons name="trophy" size={18} color={colors.text.inverse} />
                                    <Text maxFontSizeMultiplier={1.2} style={[typography.subtitle, { color: colors.text.inverse }]}>
                                        View your collection
                                    </Text>
                                </LinearGradient>
                            </PressableScale>
                        )}
                    </Animated.View>
                )}
                </>
            )}
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Level ring — a TRUE stroked lime arc whose visible sweep equals `pct` (real
// react-native-svg Circle with strokeDasharray/strokeDashoffset), not a faked
// static half-ring. The lime cap dot sits at the arc's leading edge, and the
// centre reads value-over-label. Mirrors the calculator screen's 1RM ring.
const RING = 86;
const RING_STROKE = 4;
const RING_R = (RING - RING_STROKE) / 2; // radius to the stroke centre-line
const RING_C = 2 * Math.PI * RING_R;     // arc circumference
const LevelRing = React.memo(function LevelRing({
    pct, centerValue, centerLabel, colors, typography,
}: { pct: number; centerValue: number | string; centerLabel: string; colors: any; typography: any }) {
    const clamped = Math.min(100, Math.max(0, pct));
    const offset = RING_C - (clamped / 100) * RING_C;
    // Cap dot tracks the arc's leading edge. The arc starts at 12 o'clock and
    // sweeps clockwise (rotate(-90) below), so the leading angle is -90° + pct·360°.
    const angle = (clamped / 100) * 2 * Math.PI - Math.PI / 2;
    const capX = RING / 2 + RING_R * Math.cos(angle) - 5;
    const capY = RING / 2 + RING_R * Math.sin(angle) - 5;
    return (
        <View
            style={styles.ring}
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ now: clamped, min: 0, max: 100 }}
            accessibilityLabel={`${clamped}% to next level`}
        >
            <Svg
                width={RING}
                height={RING}
                style={StyleSheet.absoluteFill}
                importantForAccessibility="no-hide-descendants"
            >
                {/* Track */}
                <Circle
                    cx={RING / 2}
                    cy={RING / 2}
                    r={RING_R}
                    stroke={withAlpha(colors.text.primary, 0.1)}
                    strokeWidth={RING_STROKE}
                    fill="none"
                />
                {/* Lime progress arc — sweep === pct */}
                {clamped > 0 && (
                    <Circle
                        cx={RING / 2}
                        cy={RING / 2}
                        r={RING_R}
                        stroke={colors.accent.coral}
                        strokeWidth={RING_STROKE}
                        fill="none"
                        strokeDasharray={RING_C}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                    />
                )}
            </Svg>
            {clamped > 0 && (
                <View style={[styles.ringCap, { left: capX, top: capY, backgroundColor: colors.accent.coral }, shadows.glow(colors.accent.coral)]} />
            )}
            <View style={styles.ringCenter}>
                <Text maxFontSizeMultiplier={1.2} style={[typography.statSmall, { color: colors.text.primary }]}>{centerValue}</Text>
                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.55), fontSize: 9, letterSpacing: 1 }]}>{centerLabel}</Text>
            </View>
        </View>
    );
});

const HeroStat = React.memo(function HeroStat({
    value, label, tint, colors, typography,
}: { value: number | string; label: string; tint?: string; colors: any; typography: any }) {
    return (
        <View style={styles.heroStat} accessible accessibilityLabel={`${value} ${label}`}>
            <Text maxFontSizeMultiplier={1.2} style={[typography.statSmall, { color: tint ?? colors.text.primary }]}>
                {value}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 11, marginTop: 1 }]}>
                {label}
            </Text>
        </View>
    );
});

// Next-up spotlight — a single locked badge framed as the goal. The progress
// affordance is intentionally aspirational (a faint lime track) since the API
// gives no per-badge progress; tapping jumps to the catalog.
const NextBadgeSpotlight = React.memo(function NextBadgeSpotlight({
    badge, colors, typography, onPress,
}: { badge: Badge; colors: any; typography: any; onPress: () => void }) {
    const meta = TIER_META[badge.tier] ?? TIER_META.bronze!;
    return (
        <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Next up: ${badge.name}, ${meta.label} tier. ${badge.description}`}
            onPress={onPress}
            style={[styles.spotlight, { marginHorizontal: 20, backgroundColor: colors.background.secondary, borderColor: withAlpha(meta.color, 0.4) }]}
        >
            <View style={[styles.spotlightIcon, { backgroundColor: withAlpha(meta.color, 0.14), borderColor: withAlpha(meta.color, 0.4) }]}>
                <Text style={{ fontSize: 30 }}>{badge.iconEmoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <View style={styles.spotlightTopRow}>
                    <Text style={[typography.overline, { color: meta.color, fontSize: 10 }]}>NEXT UP</Text>
                    {badge.xpReward > 0 && (
                        <View style={[styles.spotlightXp, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                            <Text style={[typography.captionMedium, { color: colors.accent.coralLight, fontSize: 11 }]}>+{badge.xpReward} XP</Text>
                        </View>
                    )}
                </View>
                <Text numberOfLines={1} style={[typography.subtitle, { color: colors.text.primary, marginTop: 2 }]}>
                    {badge.name}
                </Text>
                <Text numberOfLines={2} style={[typography.bodySm, { color: colors.text.secondary, marginTop: 1 }]}>
                    {badge.description}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
        </PressableScale>
    );
});

// 100% completion banner — the screen's biggest PEAK. Full lime is earned here
// (this is THE achievement / a key indicator, not chrome), with a trophy, a
// proportional celebratory glow + sparkle accents, and encouraging copy. One a11y
// node so it announces as a single celebration. Replaces the old empty thumb zone.
const CompletionSpotlight = React.memo(function CompletionSpotlight({
    count, colors, typography,
}: { count: number; colors: any; typography: any }) {
    return (
        <View
            style={[styles.completion, { marginHorizontal: 20, borderColor: withAlpha(colors.accent.coral, 0.5) }, shadows.glow(colors.accent.coral)]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`All ${count} badges earned. You've completed the entire collection.`}
        >
            <LinearGradient
                colors={[withAlpha(colors.accent.coral, 0.22), withAlpha(colors.accent.coral, 0.06)]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.completionFill}
            >
                {/* sparkle accents — decorative, hidden from a11y */}
                <Ionicons name="sparkles" size={14} color={withAlpha(colors.accent.coralLight, 0.8)} style={styles.completionSparkleA} importantForAccessibility="no" />
                <Ionicons name="sparkles-outline" size={11} color={withAlpha(colors.accent.coralLight, 0.55)} style={styles.completionSparkleB} importantForAccessibility="no" />

                <View style={[styles.completionTrophy, { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderColor: withAlpha(colors.accent.coral, 0.45) }, shadows.glow(colors.accent.coral)]}>
                    <Ionicons name="trophy" size={30} color={colors.accent.coralLight} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[typography.overline, { color: colors.accent.coralLight, fontSize: 10 }]} importantForAccessibility="no-hide-descendants">
                        COLLECTION COMPLETE
                    </Text>
                    <Text numberOfLines={1} style={[typography.subtitle, { color: colors.text.primary, marginTop: 2 }]} importantForAccessibility="no-hide-descendants">
                        All {count} badges earned
                    </Text>
                    <Text numberOfLines={2} style={[typography.bodySm, { color: colors.text.secondary, marginTop: 1 }]} importantForAccessibility="no-hide-descendants">
                        You've cleared the entire catalog. Incredible work, legend.
                    </Text>
                </View>
            </LinearGradient>
        </View>
    );
});

const EarnedBadgeCard = React.memo(function EarnedBadgeCard({ badge, colors, typography }: { badge: Badge; colors: any; typography: any }) {
    const meta = TIER_META[badge.tier] ?? TIER_META.bronze!;
    return (
        // One a11y node per badge: a screen reader announces the badge name + its
        // tier + earned state as a single summary rather than reading the emoji
        // glyph and the tier pill as separate, contextless nodes. Earned badges
        // glow (peak-end celebration) via a tier-tinted halo.
        <View
            style={[styles.earnedCard, shadows.glow(meta.color)]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${badge.name} badge, ${meta.label} tier, earned`}
        >
            <LinearGradient
                colors={[withAlpha(meta.color, 0.28), withAlpha(meta.color, 0.08)]}
                style={[styles.earnedCardGradient, { borderColor: withAlpha(meta.color, 0.45) }]}
            >
                <View style={[styles.earnedEmojiWrap, { backgroundColor: withAlpha(meta.color, 0.16), borderColor: withAlpha(meta.color, 0.35) }]}>
                    <Text style={{ fontSize: 30 }}>{badge.iconEmoji}</Text>
                </View>
                <Text numberOfLines={2} style={[typography.captionMedium, { color: colors.text.primary, marginTop: 8, textAlign: 'center', fontSize: 12 }]}>
                    {badge.name}
                </Text>
                <View style={[styles.earnedTierPill, { backgroundColor: withAlpha(meta.color, 0.22) }]}>
                    <Text style={[typography.overline, { color: meta.color, fontSize: 9, letterSpacing: 0.8 }]}>
                        {badge.tier}
                    </Text>
                </View>
            </LinearGradient>
        </View>
    );
});

const CatalogBadgeCard = React.memo(function CatalogBadgeCard({
    badge, unlocked, tierColor, cardW, colors, typography
}: { badge: Badge; unlocked: boolean; tierColor: string; cardW: number; colors: any; typography: any }) {
    return (
        // One a11y node per catalog tile: collapses the emoji + name + description
        // + lock badge into a single announcement of name and locked/unlocked state.
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${badge.name} badge, ${unlocked ? 'unlocked' : 'locked'}`}
            style={[styles.catalogCard, { width: cardW }, unlocked ? shadows.glow(tierColor) : null, {
                backgroundColor: colors.background.secondary,
                borderColor: unlocked ? withAlpha(tierColor, 0.5) : colors.border.default,
            }]}
        >
            <View style={[styles.catalogEmojiWrap, {
                backgroundColor: unlocked ? withAlpha(tierColor, 0.14) : withAlpha(colors.text.primary, 0.04),
                borderColor: unlocked ? withAlpha(tierColor, 0.3) : 'transparent',
            }]}>
                <Text style={{ fontSize: 24, opacity: unlocked ? 1 : 0.45 }}>{badge.iconEmoji}</Text>
            </View>
            <Text style={[typography.captionMedium, {
                color: unlocked ? colors.text.primary : colors.text.tertiary,
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
                opacity: unlocked ? 1 : 0.7,
            }]} numberOfLines={2}>
                {badge.description}
            </Text>
            {badge.xpReward > 0 && (
                <View style={[styles.xpPill, { backgroundColor: withAlpha(tierColor, unlocked ? 0.18 : 0.1) }]}>
                    <Text style={[typography.overline, { color: tierColor, fontSize: 9, opacity: unlocked ? 1 : 0.8 }]}>
                        +{badge.xpReward} XP
                    </Text>
                </View>
            )}
            {unlocked ? (
                <View style={[styles.checkMark, { backgroundColor: tierColor }]}>
                    <Ionicons name="checkmark" size={11} color={colors.text.inverse} />
                </View>
            ) : (
                // Lock is a second, non-color signal of locked state (a11y: color is
                // never the only cue) and a quiet "go earn it" prompt.
                <View style={[styles.lockMark, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]}>
                    <Ionicons name="lock-closed" size={9} color={colors.text.tertiary} />
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

    heroCard: {
        borderRadius: 24,
        borderWidth: 1,
        padding: 20,
        overflow: 'hidden',
    },
    heroWash: {
        position: 'absolute',
        top: 0, right: 0,
        width: 200, height: 200,
        borderTopRightRadius: 24,
    },
    heroTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    progressLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
    },
    statDivider: { width: 1, height: 30 },
    heroStat: { flex: 1, alignItems: 'center' },

    // Matches CatalogBadgeCard's width so the skeleton grid lines up with the
    // loaded catalog grid; the SkeletonCard default marginBottom is zeroed since
    // the grid's `gap` already spaces the tiles. Width is applied inline (from the
    // live useWindowDimensions value) so it tracks rotation / resize.
    catalogCardSkeleton: { marginBottom: 0 },

    // Level ring — geometry lives in the SVG <Circle>s (true arc); only the
    // box, the leading-edge cap dot, and the centred value/label remain here.
    ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
    ringCap: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
    ringCenter: { alignItems: 'center' },

    progressTrack: {
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },

    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 20,
        marginBottom: 14,
        gap: 10,
    },
    countPill: {
        minWidth: 26,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Next-up spotlight
    spotlight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginTop: 16,
        padding: 14,
        borderRadius: 20,
        borderWidth: 1,
    },
    spotlightIcon: {
        width: 58, height: 58,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    spotlightTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    spotlightXp: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },

    // 100% completion banner — the peak. Lime-tinted glass with a trophy + sparkles.
    completion: {
        marginTop: 16,
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
    },
    completionFill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
    },
    completionTrophy: {
        width: 58, height: 58,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    completionSparkleA: { position: 'absolute', top: 10, right: 14 },
    completionSparkleB: { position: 'absolute', top: 26, right: 30 },

    // Earned rail
    earnedCard: { width: 124 },
    earnedCardGradient: {
        borderRadius: 18,
        borderWidth: 1,
        padding: 14,
        alignItems: 'center',
    },
    earnedEmojiWrap: {
        width: 54, height: 54,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    earnedTierPill: {
        marginTop: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    earnedEmpty: {
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        gap: 14,
    },
    earnedEmptyTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    earnedEmptyIcon: {
        width: 52, height: 52,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    earnedEmptyCta: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
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
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        alignItems: 'center',
        position: 'relative',
    },
    catalogEmojiWrap: {
        width: 46, height: 46,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    xpPill: {
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
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
    lockMark: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Thumb-zone CTA
    ctaBar: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    // Sits just above the bar's top edge; fades scrolling content into the bar so
    // the last catalog row doesn't bleed through behind it mid-scroll.
    ctaScrim: {
        position: 'absolute',
        left: 0, right: 0,
        bottom: '100%',
        height: 28,
    },
    ctaPressable: { borderRadius: 16 },
    ctaButton: {
        height: 54,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
});
