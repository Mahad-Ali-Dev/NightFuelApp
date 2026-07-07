import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme, spacing as spacingTokens, borderRadius } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState, Avatar, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '@/api/users';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    FadeInDown,
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    withSequence,
    Easing,
} from 'react-native-reanimated';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { typography as typo } from '@/theme/typography';

// ── Coach roster row ──────────────────────────────────────────────────────────
// A single client in the coach's roster. People read as AVATARS (photo →
// initials fallback via the shared <Avatar>), the NAME dominates a muted email,
// and a tinted "message" affordance pulls the eye to the row's primary action.
// Primitive props keep React.memo's shallow compare effective across the list,
// and the staggered FadeInDown entrance is gated to the first screenful so a
// long roster still scrolls snappily.
interface ClientRowProps {
    name: string;
    email: string;
    avatarUri?: string;
    index: number;
    onPress: () => void;
}

const ClientRow = React.memo(function ClientRow({ name, email, avatarUri, index, onPress }: ClientRowProps) {
    const { colors, typography } = useTheme();

    const row = (
        <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Message ${name}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={onPress}
        >
            <Card variant="glass" style={styles.clientRow}>
                <Avatar
                    uri={avatarUri}
                    name={name}
                    size={46}
                    borderColor={withAlpha(colors.accent.purple, 0.35)}
                />
                <View style={styles.clientInfo}>
                    <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>
                        {name}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]} numberOfLines={1}>
                        {email}
                    </Text>
                </View>
                {/* Message affordance — purple is the AI/Coach hue; a faint tinted
                    chip keeps lime reserved for the one primary CTA below. */}
                <View
                    style={[
                        styles.msgChip,
                        { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.3) },
                    ]}
                >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.accent.purple} />
                </View>
            </Card>
        </PressableScale>
    );

    // Stagger only the first ~10 rows; deeper rows render immediately.
    if (index < 10) {
        return (
            <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(240 + index * 40)}>
                {row}
            </Animated.View>
        );
    }
    return row;
});

// ── Compact secondary KPI tile ────────────────────────────────────────────────
// Sits beside its sibling under the hero. VALUE dominates (big condensed numeral)
// over a tiny uppercase label; a small tinted glyph badges the metric. Functional
// hues only (cyan / purple) so the 10% lime stays on the hero + primary CTA.
interface MiniStatProps {
    value: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
}

const MiniStat = React.memo(function MiniStat({ value, label, icon, tint }: MiniStatProps) {
    const { colors, typography } = useTheme();
    return (
        <Card variant="glass" style={styles.miniStat}>
            <View style={[styles.miniBadge, { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.28) }]}>
                <Ionicons name={icon} size={16} color={tint} />
            </View>
            <Text style={[typography.statMedium, { color: colors.text.primary, marginTop: spacingTokens.sm }]} numberOfLines={1}>
                {value}
            </Text>
            <Text style={[typography.overline, { color: colors.text.tertiary }]} numberOfLines={1}>
                {label}
            </Text>
        </Card>
    );
});

export default function CoachDashboardScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: studentsResponse, isLoading, isError, refetch } = useQuery({
        queryKey: ['coach-students'],
        queryFn: getStudents,
    });

    const students = Array.isArray(studentsResponse?.data) ? studentsResponse.data : [];

    // Derived headline metrics. The roster length is the one hard truth the
    // payload guarantees; the rest read defensively off whatever the relation row
    // carries (assigned protocol, accepted status) and degrade to a sensible
    // count when absent — never inventing data the API didn't send.
    const { activeCount, onProtocolCount, needsProtocolCount, newThisWeekCount } = useMemo(() => {
        const total = students.length;
        const onProtocol = students.filter(
            (s: any) => s?.activeProtocolId || s?.protocolId || s?.assignedProtocolId,
        ).length;
        // "New this week" — clients whose connection landed in the last 7 days.
        // Reads whatever timestamp the relation row carries (started/created/
        // accepted/connected) and degrades to 0 when none is present or parseable,
        // so the tile never invents data the API didn't send.
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const newThisWeek = students.filter((s: any) => {
            const raw = s?.startedAt ?? s?.createdAt ?? s?.acceptedAt ?? s?.connectedAt;
            if (!raw) return false;
            const t = new Date(raw).getTime();
            return Number.isFinite(t) && t >= weekAgo;
        }).length;
        return {
            activeCount: total,
            onProtocolCount: onProtocol,
            // Clients with no protocol assigned yet — the actionable inverse of
            // on-protocol; clamped at 0 so it never reads negative.
            needsProtocolCount: Math.max(0, total - onProtocol),
            newThisWeekCount: newThisWeek,
        };
    }, [students]);

    // Peak-end: a healthy, growing roster earns a soft celebratory lime halo on
    // the hero. An empty roster stays calm (no glow) so the moment lands only
    // when there's something to celebrate.
    const rosterHealthy = activeCount > 0;

    // Peak-end flourish — a one-shot scale-pop on the hero VALUE when the roster
    // is healthy (transform/opacity only). Fires once data resolves to a non-empty
    // roster; stays at rest (1 / fully shown) otherwise so the empty state reads
    // calm. The short delay lets the hero's entrance settle before the value pops.
    const heroPop = useSharedValue(0);
    useEffect(() => {
        if (rosterHealthy) {
            heroPop.value = 0;
            heroPop.value = withDelay(
                360,
                withSequence(
                    withTiming(1, { duration: 240, easing: Easing.out(Easing.back(1.6)) }),
                    withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }),
                ),
            );
        } else {
            heroPop.value = 0;
        }
    }, [rosterHealthy, activeCount, heroPop]);

    // Scale-only pop (rests at exactly 1 when heroPop is 0, so the value is never
    // left dimmed or resized between flourishes).
    const heroValueStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + heroPop.value * 0.12 }],
    }));

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={styles.header}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </PressableScale>
                <View style={styles.headerTitleWrap}>
                    <Text style={[typography.overline, { color: colors.accent.coral }]}>COACH</Text>
                    <Text style={[typography.h3, { color: colors.text.primary, marginTop: 1 }]} numberOfLines={1}>Dashboard</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Client requests" onPress={() => router.push('/(coach)/requests' as any)} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="person-add-outline" size={22} color={colors.text.primary} />
                    </PressableScale>
                    <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push('/(settings)/notifications' as any)} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
                    </PressableScale>
                </View>
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                    {/* Hero KPI */}
                    <Skeleton width="100%" height={148} radius={borderRadius.xl} style={{ marginBottom: spacing.md }} />
                    {/* Two mini-stat tiles */}
                    <View style={styles.miniRow}>
                        <Skeleton width="48%" height={104} radius={borderRadius.xl} />
                        <Skeleton width="48%" height={104} radius={borderRadius.xl} />
                    </View>
                    {/* Roster section header */}
                    <Skeleton width={140} height={20} radius={borderRadius.sm} style={{ marginTop: spacing['2xl'], marginBottom: spacing.lg }} />
                    {/* Roster rows */}
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} width="100%" height={78} radius={borderRadius.xl} style={{ marginBottom: spacing.md }} />
                    ))}
                </ScrollView>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load your roster"
                    subtitle="Something went wrong fetching your students. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                    style={styles.stateFill}
                />
            ) : (
                <>
                    <ScrollView
                        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 132 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ── Hero KPI — the headline metric. The VALUE (active clients)
                            dominates; lime is the one bold accent here, earned by the
                            peak-end glow only when the roster is healthy. ───────────── */}
                        <Animated.View entering={FadeInDown.springify().damping(18).mass(0.9).delay(40)}>
                            <Card
                                variant="glass"
                                noPadding
                                style={[styles.kpiCard, rosterHealthy ? shadows.glow(colors.accent.coral) : null]}
                            >
                                <LinearGradient
                                    colors={[withAlpha(colors.accent.coral, 0.18), withAlpha(colors.accent.coral, 0.04)]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.kpiInner}
                                >
                                    <View style={styles.kpiTopRow}>
                                        <Text style={[typography.overline, { color: colors.text.secondary }]}>Active Clients</Text>
                                        <View style={[styles.heroBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.3) }]}>
                                            <Ionicons name="people" size={16} color={colors.accent.coral} />
                                        </View>
                                    </View>
                                    <Animated.Text style={[styles.kpiValue, { color: colors.text.primary }, heroValueStyle]}>{activeCount}</Animated.Text>
                                    <View style={styles.kpiTrend}>
                                        <Ionicons
                                            name={rosterHealthy ? 'trending-up' : 'sparkles-outline'}
                                            size={14}
                                            color={rosterHealthy ? colors.accent.cyan : colors.text.tertiary}
                                        />
                                        <Text style={[typography.captionMedium, { color: rosterHealthy ? colors.accent.cyan : colors.text.tertiary, marginLeft: 6 }]}>
                                            {rosterHealthy ? `${onProtocolCount} on an active protocol` : 'Ready for your first client'}
                                        </Text>
                                    </View>
                                </LinearGradient>
                            </Card>
                        </Animated.View>

                        {/* Secondary KPIs — two metrics the hero DOESN'T already
                            state: who still needs a protocol (actionable) and who
                            joined this week (momentum). The hero owns roster size +
                            the on-protocol figure, so these add new information rather
                            than restating it. Functional hues keep lime reserved for
                            the hero + the CTA; amber flags the needs-attention count. */}
                        <Animated.View entering={FadeInDown.springify().damping(20).delay(110)} style={styles.miniRow}>
                            <MiniStat value={String(needsProtocolCount)} label="Needs Protocol" icon="clipboard-outline" tint={colors.accent.amber} />
                            <MiniStat value={String(newThisWeekCount)} label="New This Week" icon="person-add-outline" tint={colors.accent.cyan} />
                        </Animated.View>

                        {/* Roster section header */}
                        <Animated.View entering={FadeIn.delay(180)} style={styles.sectionHeader}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>Your Roster</Text>
                            {students.length > 0 ? (
                                <View style={[styles.countPill, { backgroundColor: withAlpha(colors.text.primary, 0.05), borderColor: colors.border.default }]}>
                                    <Text style={[typography.captionMedium, { color: colors.text.secondary, fontWeight: '700' }]}>{students.length}</Text>
                                </View>
                            ) : null}
                        </Animated.View>

                        {students.length === 0 ? (
                            <EmptyState
                                icon="people-outline"
                                title="No clients yet"
                                subtitle="Your roster is empty. Athletes who connect with you will appear here, ready for coaching."
                                actionLabel="Go Back"
                                onAction={() => router.back()}
                            />
                        ) : (
                            students.map((student: any, idx: number) => (
                                <ClientRow
                                    key={student.id || student.clientUserId || idx}
                                    name={student.name || 'Unknown Student'}
                                    email={student.email || 'No email'}
                                    avatarUri={safeImageUri(student.avatarUrl)}
                                    index={idx}
                                    onPress={() => router.push(`/messages/${student.id}` as any)}
                                />
                            ))
                        )}
                    </ScrollView>

                    {/* ── Thumb-zone primary CTA — the one full-lime action on screen.
                        Pinned above the safe area; INK text on the lime fill. Hidden
                        when there's no one to message so the empty state owns the
                        moment. ──────────────────────────────────────────────────── */}
                    {students.length > 0 && (
                        <Animated.View
                            entering={FadeInDown.springify().damping(20).mass(0.9).delay(260)}
                            style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}
                            pointerEvents="box-none"
                        >
                            {/* Thumb-zone fade — content dissolves into the bar instead
                                of colliding with the lime fill. Non-interactive overlay
                                (no coral token, no Text) so taps pass through to rows and
                                the CTA guard isn't tripped. */}
                            <LinearGradient
                                colors={['transparent', colors.background.primary]}
                                style={styles.ctaScrim}
                                pointerEvents="none"
                            />
                            <CtaButton
                                icon="chatbubbles"
                                label="Message a Client"
                                size="lg"
                                onPress={() => router.push(`/messages/${students[0].id}` as any)}
                                accessibilityLabel="Message a client"
                                style={{ borderRadius: borderRadius.full }}
                            />
                        </Animated.View>
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacingTokens.xl, marginBottom: spacingTokens.lg },
    headerBtn: { width: 40, height: 40, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerTitleWrap: { flex: 1, alignItems: 'center' },
    stateFill: { flex: 1 },

    // Hero KPI
    kpiCard: { marginBottom: spacingTokens.md },
    kpiInner: { padding: spacingTokens['2xl'] },
    kpiTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroBadge: { width: 32, height: 32, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    kpiValue: { fontFamily: typo.display.fontFamily, fontSize: 52, lineHeight: 58, marginTop: spacingTokens.xs, alignSelf: 'flex-start' },
    kpiTrend: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },

    // Secondary KPI tiles
    miniRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacingTokens.md },
    miniStat: { flex: 1, padding: spacingTokens.lg },
    miniBadge: { width: 30, height: 30, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    // Section header
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacingTokens['2xl'], marginBottom: spacingTokens.lg },
    countPill: { minWidth: 28, height: 24, paddingHorizontal: 8, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    // Client rows
    clientRow: { flexDirection: 'row', alignItems: 'center', padding: spacingTokens.lg, marginBottom: spacingTokens.md },
    clientInfo: { flex: 1, marginLeft: 14 },
    msgChip: { width: 40, height: 40, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    // Thumb-zone CTA
    ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacingTokens.xl, paddingTop: spacingTokens.sm },
    // Bottom-anchored fade behind the CTA: stretches ~72pt above the bar so
    // roster rows dissolve into the background instead of colliding with the
    // bright lime button mid-scroll.
    ctaScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, top: -72 },
});
