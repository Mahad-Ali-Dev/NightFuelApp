/**
 * Profile tab — user profile + full feature-discovery hub.
 *
 * Because this is now a visible tab (not a pushed screen) the back
 * button is removed and replaced with a Settings shortcut.
 *
 * Aurora dark-glass reskin: glass surfaces use the shared GlassCard
 * primitive (SafeBlurView), the primary CTA uses CtaButton (coralCta
 * gradient), and a light StatusBar keeps glyphs legible over the coral
 * cover wash. All data hooks / role flags / nav / a11y labels preserved.
 */
import React from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Pressable, Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getWeeklyStats, getStreak } from '@/api/progress';
import { getMyProfile, getStatus } from '@/api/profile';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors as C } from '@/theme/colors';
import { withAlpha } from '@/theme/utils';
import { Skeleton, GlassCard, CtaButton } from '@/components/ui';
import { CyclePhaseCard } from '@/components/CyclePhaseCard';
import { TAB_BAR_H } from './_layout';

const { width } = Dimensions.get('window');
const H_PAD = 20;
const CARD_GAP = 12;
const COL_W = (width - H_PAD * 2 - CARD_GAP) / 2;

const ACHIEVEMENTS = [
    { title: 'Early Riser', desc: '30 Day Streak', icon: 'trophy', color: '#FFB300' },
    { title: 'Mindful', desc: '50 Sessions', icon: 'body', color: '#00D4AA' },
    { title: 'Night Owl', desc: 'Top 5%', icon: 'moon', color: '#7C4DFF' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
    const { colors, typography, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const router = useRouter();

    const { data: profile, isLoading } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    // Secondary queries are destructured with isError + refetch so a backend
    // failure surfaces an HONEST indicator ('—' / "Unavailable" + retry) on the
    // affected stat pills instead of coalescing to '0%' / '0d' / 'Level 1' — a
    // failed fetch must NOT look like a healthy brand-new (genuinely zeroed) user.
    const { data: status, isError: statusError, refetch: refetchStatus } = useQuery({ queryKey: ['my-status'], queryFn: getStatus });
    const { data: stats, isError: statsError, refetch: refetchStats } = useQuery({ queryKey: ['profile-weekly-stats'], queryFn: getWeeklyStats });
    const { data: streak, isError: streakError, refetch: refetchStreak } = useQuery({ queryKey: ['profile-streak'], queryFn: getStreak });

    const isCoach = ['COACH', 'TRAINER', 'NUTRITIONIST', 'coach'].includes(user?.role ?? '');
    const isAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

    if (isLoading) {
        return <ProfileSkeleton />;
    }

    const displayName = (profile as any)?.displayName ?? user?.name;

    return (
        <View style={[s.root, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 40 }}
                bounces={false}
                showsVerticalScrollIndicator={false}
            >
                {/* ══ COVER + HEADER ══════════════════════════════════════════ */}
                <View style={[s.cover, { paddingTop: insets.top }]}>
                    <LinearGradient
                        colors={[withAlpha(C.accent.coral, 0.18), withAlpha(C.accent.pink, 0.06), colors.background.primary]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />
                    <View style={[s.navHeader, { marginTop: insets.top > 0 ? 0 : 8 }]}>
                        <Text style={[typography.h1, { color: colors.text.primary }]}>
                            Profile
                        </Text>
                        <View style={s.navRight}>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Settings"
                                activeOpacity={0.85}
                                style={[s.iconBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                                onPress={() => router.push('/(settings)' as any)}
                            >
                                <Ionicons name="settings-outline" size={20} color={colors.text.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Log out"
                                activeOpacity={0.85}
                                style={[s.iconBtn, { backgroundColor: withAlpha(C.error, 0.10) }]}
                                onPress={logout}
                            >
                                <Ionicons name="log-out-outline" size={20} color={C.error} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* ══ AVATAR ══════════════════════════════════════════════════ */}
                <View style={[s.avatarWrap, shadows.glow(colors.accent.coral)]}>
                    <View style={[s.avatarRing, { backgroundColor: colors.background.primary, borderColor: colors.accent.coral }]}>
                        {(profile as any)?.avatarUrl ? (
                            <Image
                                source={{ uri: (profile as any).avatarUrl }}
                                style={s.avatar}
                                cachePolicy="memory-disk"
                                transition={200}
                                accessibilityLabel={`${displayName ?? user?.name} profile photo`}
                            />
                        ) : (
                            <View style={[s.avatar, { backgroundColor: colors.background.tertiary, alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel="No profile photo">
                                <Ionicons name="person" size={56} color={colors.text.tertiary} />
                            </View>
                        )}
                    </View>
                    <View
                        style={[s.onlineDot, { borderColor: colors.background.primary, backgroundColor: colors.success }]}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                    />
                </View>

                <View style={s.details}>
                    {/* Name + title */}
                    <Text style={[typography.h1, { color: colors.text.primary, textAlign: 'center' }]}>
                        {displayName}
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4, textAlign: 'center' }]}>
                        {(profile as any)?.occupation ?? 'Member'} · {statsError ? 'Level —' : `Level ${Math.floor(((stats?.daysLogged ?? 0)) / 7) + 1}`}
                    </Text>
                    {!!(profile as any)?.aboutMe && (
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 }]}>
                            {(profile as any).aboutMe}
                        </Text>
                    )}

                    {/* Action buttons */}
                    <View style={s.actionRow}>
                        <CtaButton
                            label="Edit Profile"
                            icon="create-outline"
                            accessibilityLabel="Edit Profile"
                            onPress={() => router.push('/(tabs)/profile/edit' as any)}
                            style={s.editCta}
                        />
                        <GlassCard radius={borderRadius.xl} style={s.prefWrap}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Preferences"
                                style={({ pressed }) => [s.prefBtn, pressed ? { opacity: 0.85 } : null]}
                                onPress={() => router.push('/(tabs)/profile/preferences' as any)}
                            >
                                <Ionicons name="options-outline" size={17} color={colors.text.primary} />
                                <Text style={[s.btnTxt, { color: colors.text.primary }]}>Preferences</Text>
                            </Pressable>
                        </GlassCard>
                    </View>

                    {isAdmin && (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Admin Dashboard"
                            style={[s.adminBtn, { backgroundColor: C.error, borderRadius: borderRadius.xl }]}
                            onPress={() => router.push('/(admin)' as any)}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="shield" size={17} color="#fff" />
                            <Text style={[s.btnTxt, { color: '#fff' }]}>Admin Dashboard</Text>
                        </TouchableOpacity>
                    )}

                    {/* Stats — each pill distinguishes an honest fetch error
                        ('—' + retry) from a genuine zeroed new-user value. */}
                    <View style={s.statsRow}>
                        <StatPill label="FATIGUE" value={`${(status as any)?.fatigueScore ?? 0}%`} color={C.warning} isError={statusError} onRetry={refetchStatus} />
                        <StatPill label="STREAK" value={`${streak?.current ?? 0}d`} color={C.accent.cyan} isError={streakError} onRetry={refetchStreak} />
                        <StatPill label="ADHERENCE" value={`${(status as any)?.adherenceScore ?? 0}%`} color={C.success} isError={statusError} onRetry={refetchStatus} />
                    </View>

                    {/* Circadian phase card */}
                    <GlassCard glow={withAlpha(C.accent.amber, 0.18)} radius={borderRadius['2xl']} style={s.circCard}>
                        <View style={s.circInner}>
                            <View style={s.circHeader}>
                                <Ionicons name="sunny-outline" size={18} color={C.accent.amber} />
                                <Text style={[s.circLabel, { color: colors.text.secondary }]}>CIRCADIAN PHASE</Text>
                            </View>
                            <Text style={[typography.h3, { color: colors.text.primary, marginTop: 10 }]}>
                                {statusError ? 'Unavailable' : ((status as any)?.circadianPhase ?? '—')}
                            </Text>
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
                                {statusError
                                    ? "We couldn't load your circadian status."
                                    : 'Your metabolic window is currently optimised for activity.'}
                            </Text>
                            {statusError ? (
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel="Retry loading circadian status"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={[s.circBtn, { backgroundColor: withAlpha(C.accent.amber, 0.12), borderColor: withAlpha(C.accent.amber, 0.25) }]}
                                    onPress={() => refetchStatus()}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[s.circBtnTxt, { color: C.accent.amber }]}>Retry</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel="View full schedule"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={[s.circBtn, { backgroundColor: withAlpha(C.accent.amber, 0.12), borderColor: withAlpha(C.accent.amber, 0.25) }]}
                                    onPress={() => router.push('/(tabs)/circadian' as any)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[s.circBtnTxt, { color: C.accent.amber }]}>View Full Schedule →</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </GlassCard>

                    {/* Cycle phase card (F25) — OPT-IN-aware: renders nothing
                        unless the user enabled cycle tracking (status.cyclePhase
                        present). 'UNKNOWN' shows an honest tracking-only state. */}
                    <CyclePhaseCard cyclePhase={(status as any)?.cyclePhase} />

                    {/* Achievements */}
                    <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>ACHIEVEMENTS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                        {ACHIEVEMENTS.map((ach, i) => (
                            <GlassCard
                                key={i}
                                radius={borderRadius.xl}
                                style={s.achCard}
                            >
                                <View
                                    style={s.achInner}
                                    accessible
                                    accessibilityLabel={`${ach.title}, ${ach.desc}`}
                                >
                                    <View style={[s.achIcon, { backgroundColor: withAlpha(ach.color, 0.13) }]}>
                                        <Ionicons name={ach.icon as any} size={24} color={ach.color} />
                                    </View>
                                    <Text style={[s.achTitle, { color: colors.text.primary }]}>{ach.title}</Text>
                                    <Text style={[s.achDesc, { color: colors.text.secondary }]}>{ach.desc}</Text>
                                </View>
                            </GlassCard>
                        ))}
                    </ScrollView>

                    {/* ══ MORE FEATURES HUB (Moved to Home) ═══════════════════════════════════ */}

                    {/* Coach Hub button (coach users only) */}
                    {isCoach && (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Open Coach Hub"
                            style={[s.coachBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.12), borderColor: withAlpha(colors.accent.purple, 0.3) }]}
                            onPress={() => router.push('/(coach)/dashboard' as any)}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="people" size={20} color={colors.accent.purple} />
                            <Text style={[s.coachBtnTxt, { color: colors.accent.purple }]}>Open Coach Hub</Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.accent.purple} />
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

// ─── StatPill sub-component ───────────────────────────────────────────────────

function StatPill({
    label,
    value,
    color,
    isError = false,
    onRetry,
}: {
    label: string;
    value: string;
    color: string;
    isError?: boolean;
    onRetry?: () => void;
}) {
    const { typography, borderRadius, colors } = useTheme();

    // HONEST error state: the fetch failed, so we DON'T know this stat. Render
    // '—' + a small "Unavailable / Retry" affordance instead of the misleading
    // '0%'/'0d' a coalesce would produce — a backend failure must not look like
    // a healthy brand-new (genuinely zeroed) user.
    if (isError) {
        return (
            <GlassCard radius={borderRadius.xl} style={s.statPill}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label} unavailable, tap to retry`}
                    onPress={() => onRetry?.()}
                    style={({ pressed }) => [s.statInner, pressed ? { opacity: 0.85 } : null]}
                >
                    <Text style={[typography.statSmall, s.statValue, { color: colors.text.tertiary }]} maxFontSizeMultiplier={1.3}>—</Text>
                    <Text style={[s.statLabel, { color: colors.text.secondary }]}>Unavailable</Text>
                    <View style={s.statRetryRow}>
                        <Ionicons name="refresh" size={11} color={colors.text.tertiary} />
                        <Text style={[s.statRetryTxt, { color: colors.text.tertiary }]}>Retry</Text>
                    </View>
                </Pressable>
            </GlassCard>
        );
    }

    return (
        <GlassCard
            radius={borderRadius.xl}
            style={s.statPill}
        >
            <View style={s.statInner} accessible accessibilityLabel={`${label} ${value}`}>
                <Text style={[typography.statSmall, s.statValue, { color }]} maxFontSizeMultiplier={1.3}>{value}</Text>
                <Text style={[s.statLabel, { color: colors.text.secondary }]}>{label}</Text>
            </View>
        </GlassCard>
    );
}

// ─── Loading skeleton (mirrors the profile layout) ────────────────────────────

function ProfileSkeleton() {
    const { colors, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    return (
        <View style={[s.root, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Cover gradient wash */}
            <View style={[s.cover, { paddingTop: insets.top }]}>
                <LinearGradient
                    colors={[withAlpha(C.accent.coral, 0.18), withAlpha(C.accent.pink, 0.06), colors.background.primary]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                />
                <View style={[s.navHeader, { marginTop: insets.top > 0 ? 0 : 8 }]}>
                    <Skeleton width={120} height={28} radius={borderRadius.md} />
                    <View style={s.navRight}>
                        <Skeleton width={38} height={38} radius={19} />
                        <Skeleton width={38} height={38} radius={19} />
                    </View>
                </View>
            </View>

            {/* Avatar */}
            <View style={[s.avatarWrap, { marginBottom: 16 }]}>
                <Skeleton width={110} height={110} radius={55} />
            </View>

            <View style={s.details}>
                <Skeleton width={180} height={28} radius={borderRadius.md} style={{ marginBottom: spacing.sm }} />
                <Skeleton width={140} height={16} radius={borderRadius.sm} />

                {/* Action buttons */}
                <View style={s.actionRow}>
                    <Skeleton width="48%" height={48} radius={borderRadius.xl} />
                    <Skeleton width="48%" height={48} radius={borderRadius.xl} />
                </View>

                {/* Stat pills */}
                <View style={s.statsRow}>
                    <Skeleton width="31%" height={72} radius={borderRadius.xl} />
                    <Skeleton width="31%" height={72} radius={borderRadius.xl} />
                    <Skeleton width="31%" height={72} radius={borderRadius.xl} />
                </View>

                {/* Circadian card */}
                <Skeleton width="100%" height={170} radius={borderRadius['2xl']} style={{ marginBottom: spacing['3xl'] }} />

                {/* Achievements row */}
                <Skeleton width={140} height={14} radius={borderRadius.sm} style={{ alignSelf: 'flex-start', marginBottom: spacing.lg }} />
                <View style={{ flexDirection: 'row', gap: spacing.md, alignSelf: 'flex-start' }}>
                    <Skeleton width={124} height={120} radius={borderRadius.xl} />
                    <Skeleton width={124} height={120} radius={borderRadius.xl} />
                    <Skeleton width={124} height={120} radius={borderRadius.xl} />
                </View>
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    root: { flex: 1 },

    // Cover header
    cover: { height: 140, width: '100%' },
    navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: H_PAD, height: 52 },
    navRight: { flexDirection: 'row', gap: 10 },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

    // Avatar
    avatarWrap: { marginTop: -55, alignSelf: 'center', marginBottom: 16 },
    avatarRing: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', borderWidth: 3.5 },
    avatar: { width: 96, height: 96, borderRadius: 48 },
    onlineDot: { position: 'absolute', bottom: 5, right: 5, width: 20, height: 20, borderRadius: 10, borderWidth: 3 },

    // Details
    details: { paddingHorizontal: H_PAD, alignItems: 'center' },
    actionRow: { flexDirection: 'row', width: '100%', gap: CARD_GAP, marginTop: 24, marginBottom: 24 },
    editCta: { flex: 1 },
    prefWrap: { flex: 1 },
    prefBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, minHeight: 48 },
    btnTxt: { fontSize: 14, fontWeight: '700' },
    adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 13, marginBottom: 24 },

    // Stats
    statsRow: { flexDirection: 'row', width: '100%', gap: CARD_GAP, marginBottom: 24 },
    statPill: { flex: 1 },
    statInner: { paddingVertical: 16, alignItems: 'center' },
    statValue: {},
    statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
    statRetryRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
    statRetryTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

    // Circadian
    circCard: { width: '100%', marginBottom: 28 },
    circInner: { padding: 22 },
    circHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    circLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    circBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    circBtnTxt: { fontSize: 13, fontWeight: '700' },

    // Section label
    sectionLbl: { alignSelf: 'flex-start', marginBottom: 14 },

    // Achievements
    achCard: { width: 124 },
    achInner: { padding: 16, alignItems: 'center' },
    achIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    achTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    achDesc: { fontSize: 11, textAlign: 'center', marginTop: 2 },

    // Coach button
    coachBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', padding: 16, borderRadius: 18, borderWidth: 1 },
    coachBtnTxt: { flex: 1, fontSize: 14, fontWeight: '700' },
});
