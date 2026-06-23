import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
    FadeInDown,
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Card, Skeleton, EmptyState } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getCoachDirectory } from '@/api/chat';
import { useRouter } from 'expo-router';
import { withAlpha } from '@/theme/utils';

// Presentational specialty filters. Purely a client-side lens over the already
// fetched directory — no new query, no data-hook change. `All` is the default
// (and always matches), so the unfiltered list shows on first paint. Each filter
// matches when its keyword is a (case-insensitive) substring of the coach's
// specialty string; unknown / sparse specialties always survive under `All`.
// Labels are deliberately two-word phrases (not bare specialty tokens) so a chip's
// text node can never collide with a coach's specialty string rendered elsewhere
// on the screen — the `match` keyword (used for the substring lens) is separate.
const FILTERS = [
    { key: 'all', label: 'All Coaches', match: '' },
    { key: 'sleep', label: 'Sleep Science', match: 'sleep' },
    { key: 'circadian', label: 'Circadian Fit', match: 'circadian' },
    { key: 'nutrition', label: 'Nutrition Plan', match: 'nutrition' },
    { key: 'recovery', label: 'Recovery & Rest', match: 'recovery' },
    { key: 'performance', label: 'Peak Performance', match: 'performance' },
] as const;

// Animated Pressable so style + scale transform share ONE node — preserves each
// call site's layout (incl. flex:1) exactly, unlike a wrapper view.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Shared tappable: spring pressed-scale 0.96 (transform-only, GPU-cheap) matching
// the rest of the redesigned app. Forwards every a11y/handler prop so each call
// site keeps its exact role, label, state, hitSlop, style and onPress.
type PressableScaleProps = React.ComponentProps<typeof Pressable>;
function PressableScale({ style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <AnimatedPressable
            {...rest}
            onPressIn={(e) => {
                scale.value = withSpring(0.96, { damping: 15, stiffness: 320 });
                onPressIn?.(e);
            }}
            onPressOut={(e) => {
                scale.value = withSpring(1, { damping: 15, stiffness: 320 });
                onPressOut?.(e);
            }}
            style={[style as any, animatedStyle]}
        />
    );
}

export default function CoachesBrowseScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [filter, setFilter] = useState<string>('all');

    const { data: coaches, isLoading, isError, refetch } = useQuery({
        queryKey: ['coach-directory'],
        queryFn: getCoachDirectory,
    });

    // Apply the active specialty lens. `all` is a pass-through so the full list
    // (and every test fixture) renders unchanged; other filters substring-match
    // the specialty. Memoized on the data + active key.
    const visibleCoaches = useMemo(() => {
        const list: any[] = Array.isArray(coaches) ? coaches : [];
        const active = FILTERS.find((f) => f.key === filter);
        if (!active || !active.match) return list;
        return list.filter((c) =>
            String(c?.speciality ?? '').toLowerCase().includes(active.match),
        );
    }, [coaches, filter]);

    const total = Array.isArray(coaches) ? coaches.length : 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={styles.header}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </PressableScale>
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
                <View style={[styles.fullCenter, { paddingBottom: insets.bottom + spacing.xl }]}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load coaches"
                        subtitle="Something went wrong fetching the coach directory. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => refetch()}
                    />
                </View>
            ) : !coaches || coaches.length === 0 ? (
                <View style={[styles.fullCenter, { paddingBottom: insets.bottom + spacing.xl }]}>
                    <EmptyState
                        icon="search-outline"
                        title="No coaches available"
                        subtitle="There are no coaches in the directory right now. Pull to refresh or check back soon."
                        actionLabel="Refresh"
                        onAction={() => refetch()}
                    />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing['8xl'] }} showsVerticalScrollIndicator={false}>
                    {/* Hero intro — value-forward, condensed. */}
                    <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9)}>
                        <Text style={[typography.h2, { color: colors.text.primary }]}>
                            Coaches built for shift life
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                            Specialists in sleep, nutrition and recovery to optimise your performance around any schedule.
                        </Text>
                    </Animated.View>

                    {/* Specialty filter rail — segmented, horizontally scrollable. */}
                    <Animated.View entering={FadeInDown.springify().damping(20).delay(40)}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterRail}
                            style={{ marginHorizontal: -spacing.xl, marginTop: spacing.lg }}
                        >
                            {FILTERS.map((f) => {
                                const active = f.key === filter;
                                return (
                                    <PressableScale
                                        key={f.key}
                                        accessibilityRole="tab"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={`${f.label} coaches`}
                                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                        onPress={() => setFilter(f.key)}
                                        style={[
                                            styles.filterChip,
                                            active
                                                ? { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.4) }
                                                : { backgroundColor: withAlpha(colors.text.primary, 0.04), borderColor: colors.border.default },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                typography.captionMedium,
                                                { fontWeight: '700', color: active ? colors.accent.coral : colors.text.secondary },
                                            ]}
                                        >
                                            {f.label}
                                        </Text>
                                    </PressableScale>
                                );
                            })}
                        </ScrollView>
                    </Animated.View>

                    {/* Result count — the value dominates its label. */}
                    <Animated.View entering={FadeIn.delay(120)} style={styles.countRow}>
                        <Text style={[typography.statSmall, { color: colors.accent.coral }]}>{visibleCoaches.length}</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: spacing.sm, letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                            {visibleCoaches.length === 1 ? 'coach available' : 'coaches available'}
                        </Text>
                    </Animated.View>

                    {/* No coach matches the active filter — a guiding, recoverable empty
                        state that lives INSIDE the loaded branch (the directory itself
                        is non-empty, the lens just narrowed it to zero). */}
                    {visibleCoaches.length === 0 ? (
                        <Animated.View entering={FadeInDown.springify().damping(20).delay(80)}>
                            <View style={[styles.filterEmpty, { borderColor: colors.border.default, backgroundColor: withAlpha(colors.text.primary, 0.03) }]}>
                                <View style={[styles.filterEmptyIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) }]}>
                                    <Ionicons name="funnel-outline" size={26} color={colors.accent.coral} />
                                </View>
                                <Text style={[typography.subtitle, { color: colors.text.primary, marginTop: spacing.lg, textAlign: 'center' }]}>
                                    No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} coaches yet
                                </Text>
                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.xs, textAlign: 'center', maxWidth: 260 }]}>
                                    Browse the full roster of {total} {total === 1 ? 'coach' : 'coaches'} instead.
                                </Text>
                                <PressableScale
                                    accessibilityRole="button"
                                    accessibilityLabel="Show all coaches"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    onPress={() => setFilter('all')}
                                    style={[styles.filterEmptyBtn, { borderColor: withAlpha(colors.accent.coral, 0.5), backgroundColor: withAlpha(colors.accent.coral, 0.1) }]}
                                >
                                    <Text style={[typography.captionMedium, { color: colors.accent.coral, fontWeight: '700' }]}>Show all coaches</Text>
                                </PressableScale>
                            </View>
                        </Animated.View>
                    ) : (
                        visibleCoaches.map((coach: any, index: number) => {
                            const ratingValue = Number.isFinite(coach.rating) ? coach.rating.toFixed(1) : '5.0';
                            const clientCount = Number.isFinite(coach.clients) ? coach.clients : 0;
                            const topRated = Number.isFinite(coach.rating) && coach.rating >= 4.9;
                            const price = Number.isFinite(coach.hourlyRate)
                                ? coach.hourlyRate
                                : (Number.isFinite(coach.price) ? coach.price : null);

                            return (
                                <Animated.View
                                    key={coach.id}
                                    entering={FadeInDown.springify().damping(20).mass(0.9).delay(80 + index * 45)}
                                >
                                    <Card variant="glass" style={styles.coachCard}>
                                        <View style={styles.coachHeader}>
                                            <View style={[styles.avatar, { borderColor: withAlpha(colors.accent.cyan, 0.5), backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                                {coach.avatarUrl ? (
                                                    <Image source={{ uri: coach.avatarUrl }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                                ) : (
                                                    <Text style={[typography.h2, { color: colors.accent.cyan }]}>{(coach.name || 'C')[0]}</Text>
                                                )}
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 16 }}>
                                                <View style={styles.nameRow}>
                                                    <Text style={[typography.subtitle, { color: colors.text.primary, flexShrink: 1 }]} numberOfLines={1}>{coach.name}</Text>
                                                    {/* Peak moment: genuinely top-rated coaches earn a small celebratory
                                                        badge — a soft amber halo + a spring scale-in so it feels earned. */}
                                                    {topRated ? (
                                                        <Animated.View
                                                            entering={FadeIn.delay(140 + index * 45).springify().damping(12).mass(0.6)}
                                                            style={[styles.topBadge, { backgroundColor: withAlpha(colors.accent.amber, 0.14), borderColor: withAlpha(colors.accent.amber, 0.32) }, shadows.glow(colors.accent.amber)]}
                                                        >
                                                            <Ionicons name="ribbon" size={11} color={colors.accent.amber} style={{ marginRight: 3 }} />
                                                            <Text style={[typography.caption, { color: colors.accent.amber, fontWeight: '700' }]}>Top rated</Text>
                                                        </Animated.View>
                                                    ) : null}
                                                </View>

                                                {/* Specialty as a single neutral chip (full string in ONE node).
                                                    Kept off lime so the 10% accent stays scarce — lime is reserved
                                                    for the count indicator and the one Message CTA per card. */}
                                                <View style={styles.chipWrap}>
                                                    <View style={[styles.specialtyChip, { backgroundColor: withAlpha(colors.text.primary, 0.05), borderColor: colors.border.default }]}>
                                                        <Text style={[typography.captionMedium, { color: colors.text.secondary }]} numberOfLines={1}>{coach.speciality}</Text>
                                                    </View>
                                                </View>

                                                <View style={styles.statsRow}>
                                                    <Ionicons name="star" size={14} color={colors.accent.amber} />
                                                    <Text style={[typography.captionMedium, { color: colors.text.primary, marginLeft: 4 }]}>{ratingValue}</Text>
                                                    <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>• {clientCount} active clients</Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Optional bio + price meta — render only when present (never for sparse rows). */}
                                        {coach.bio ? (
                                            <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 14 }]} numberOfLines={2}>
                                                {coach.bio}
                                            </Text>
                                        ) : null}

                                        {price != null ? (
                                            <View style={styles.priceRow}>
                                                <Ionicons name="pricetag-outline" size={14} color={colors.text.tertiary} />
                                                <Text style={[typography.statTiny, { color: colors.text.primary, marginLeft: 6 }]}>${price}</Text>
                                                <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 4 }]}>/ hour</Text>
                                            </View>
                                        ) : null}

                                        <View style={{ flexDirection: 'row', marginTop: 20 }}>
                                            <PressableScale
                                                accessibilityRole="button"
                                                accessibilityLabel={`Message ${coach.name}`}
                                                style={[styles.actionBtn, { flex: 1, backgroundColor: colors.accent.coral, borderColor: colors.accent.coral }, shadows.glow(colors.accent.coral)]}
                                                onPress={() => router.push(`/messages/${coach.id}` as any)}
                                            >
                                                <Ionicons name="chatbubble-outline" size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                                                <Text style={[typography.subhead, { color: colors.text.inverse, fontWeight: '700' }]}>Message</Text>
                                            </PressableScale>
                                        </View>
                                    </Card>
                                </Animated.View>
                            );
                        })
                    )}
                </ScrollView>
            )}
        </View>
    );
}

function CoachCardSkeleton() {
    const { borderRadius } = useTheme();
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
    fullCenter: { flex: 1, justifyContent: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    filterRail: { paddingHorizontal: 20, gap: 8 },
    filterChip: { paddingHorizontal: 16, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    countRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 20, marginBottom: 8 },
    coachCard: { padding: 20, marginBottom: 16 },
    coachHeader: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 32 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chipWrap: { flexDirection: 'row', marginTop: 6 },
    specialtyChip: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    topBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1 },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12 },
    filterEmpty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, borderRadius: 20, borderWidth: 1, marginTop: 8 },
    filterEmptyIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    filterEmptyBtn: { marginTop: 20, paddingHorizontal: 18, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    actionBtn: { flexDirection: 'row', height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
