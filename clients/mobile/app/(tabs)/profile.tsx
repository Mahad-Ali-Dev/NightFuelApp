/**
 * Profile tab — user profile + full feature-discovery hub.
 *
 * Because this is now a visible tab (not a pushed screen) the back
 * button is removed and replaced with a Settings shortcut.
 *
 * Zeitra premium reskin: a lime-washed cover header carries the avatar
 * inside an XP level RING, the STREAK numeral leads as a big Barlow-Condensed
 * statLarge marquee beside a stacked FATIGUE/ADHERENCE pair, and achievements
 * snap in a chip carousel — every chip DERIVED from live signals with honest
 * locked/earned states (lock glyph + '7 / 30 days' progress), never fabricated.
 * The screen enters with a staggered Reanimated FadeInDown and a uniform springy
 * pressed-scale (0.96) across every interactive element. Glass surfaces use the
 * shared GlassCard primitive; the single primary CTA uses CtaButton (ink-on-lime).
 * ALL data hooks / role flags / nav / a11y labels / testIDs and the honest-error
 * StatPill contract are preserved exactly.
 */
import React from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    Pressable,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { Skeleton, GlassCard, CtaButton, CircularProgress, ProgressBar } from '@/components/ui';
import { CyclePhaseCard } from '@/components/CyclePhaseCard';
import { TAB_BAR_H } from './_layout';

const H_PAD = 20;
const CARD_GAP = 12;

// ─── Achievements (DERIVED from real signals) ────────────────────────────────
// No fabricated gamification: every chip is computed from live query data
// (streak.current, stats.daysLogged, status scores). Not-yet-earned chips render
// in a locked/greyed state with a lock glyph + honest progress ('7/30 days') so a
// brand-new 0-streak user never sees a glamorous fake '30 Day Streak / Top 5%'.
type Achievement = {
    title: string;
    /** Earned tagline (e.g. '30 Day Streak'). Shown when unlocked. */
    desc: string;
    icon: string;
    /** Token-sourced accent (single palette source — no raw hex). */
    color: string;
    /** 0–1 progress toward earning. */
    progress: number;
    /** Honest progress label for locked chips (e.g. '7 / 30 days'). */
    lockedLabel: string;
};

function buildAchievements(args: {
    streakDays: number;
    daysLogged: number;
    adherence: number;
}): Achievement[] {
    const { streakDays, daysLogged, adherence } = args;
    const pct = (n: number, target: number) => Math.max(0, Math.min(1, target > 0 ? n / target : 0));
    return [
        {
            title: 'Streak Keeper',
            desc: '30 Day Streak',
            icon: 'flame',
            color: C.warning,
            progress: pct(streakDays, 30),
            lockedLabel: `${streakDays} / 30 days`,
        },
        {
            title: 'Consistent',
            desc: '50 Days Logged',
            icon: 'body',
            color: C.accent.cyan,
            progress: pct(daysLogged, 50),
            lockedLabel: `${daysLogged} / 50 days`,
        },
        {
            title: 'On Track',
            desc: '90% Adherence',
            icon: 'ribbon',
            color: C.accent.purple,
            progress: pct(adherence, 90),
            lockedLabel: `${Math.round(adherence)} / 90%`,
        },
    ];
}

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
    const { data: stats, isError: statsError } = useQuery({ queryKey: ['profile-weekly-stats'], queryFn: getWeeklyStats });
    const { data: streak, isError: streakError, refetch: refetchStreak } = useQuery({ queryKey: ['profile-streak'], queryFn: getStreak });

    const isCoach = ['COACH', 'TRAINER', 'NUTRITIONIST', 'coach'].includes(user?.role ?? '');
    const isAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

    if (isLoading) {
        return <ProfileSkeleton />;
    }

    const displayName = (profile as any)?.displayName ?? user?.name;

    // ── Derived gamification values ──────────────────────────────────────────
    // Level math is preserved EXACTLY (days logged / 7, +1). The XP ring shows
    // honest progress toward the next level: days-into-the-current-7-day-block
    // out of 7. Hidden when the stats fetch failed so we never paint a fake ring.
    const daysLogged = stats?.daysLogged ?? 0;
    const level = Math.floor(daysLogged / 7) + 1;
    const levelProgress = statsError ? 0 : (daysLogged % 7) / 7; // 0–1 toward next level
    const daysToNext = 7 - (daysLogged % 7);

    // Achievements derived from live signals (honest locked/earned states). The
    // whole row is gated behind real loaded data: if BOTH the streak and stats
    // fetches failed we have no honest signal to grade against, so we hide it
    // rather than render fabricated or all-zero chips.
    const achievements = buildAchievements({
        streakDays: streakError ? 0 : (streak?.current ?? 0),
        daysLogged: statsError ? 0 : daysLogged,
        adherence: statusError ? 0 : ((status as any)?.adherenceScore ?? 0),
    });
    const showAchievements = !(streakError && statsError && statusError);

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
                        colors={[withAlpha(C.accent.coral, 0.22), withAlpha(C.accent.pink, 0.07), colors.background.primary]}
                        start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />
                    <Animated.View
                        entering={FadeInDown.duration(380)}
                        style={[s.navHeader, { marginTop: insets.top > 0 ? 0 : 8 }]}
                    >
                        <Text style={[typography.h1, { color: colors.text.primary }]}>
                            Profile
                        </Text>
                        <View style={s.navRight}>
                            <Pressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Settings"
                                style={({ pressed }) => [s.iconBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: withAlpha(colors.text.primary, 0.08) }, pressed && s.pressed]}
                                onPress={() => router.push('/(settings)' as any)}
                            >
                                <Ionicons name="settings-outline" size={20} color={colors.text.primary} />
                            </Pressable>
                            <Pressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Log out"
                                style={({ pressed }) => [s.iconBtn, { backgroundColor: withAlpha(C.error, 0.10), borderColor: withAlpha(C.error, 0.18) }, pressed && s.pressed]}
                                onPress={logout}
                            >
                                <Ionicons name="log-out-outline" size={20} color={C.error} />
                            </Pressable>
                        </View>
                    </Animated.View>
                </View>

                {/* ══ AVATAR + LEVEL RING ═════════════════════════════════════ */}
                <Animated.View
                    entering={FadeInDown.delay(60).springify().damping(18)}
                    style={[s.avatarWrap, shadows.glow(colors.accent.coral)]}
                >
                    {/* XP ring wraps the avatar — gamified progress to next level. */}
                    <CircularProgress
                        size={120}
                        strokeWidth={4}
                        progress={levelProgress}
                        color={colors.accent.coral}
                        trackColor={withAlpha(colors.text.primary, 0.10)}
                    >
                        <View style={[s.avatarRing, { backgroundColor: colors.background.primary }]}>
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
                                    <Ionicons name="person" size={52} color={colors.text.tertiary} />
                                </View>
                            )}
                        </View>
                    </CircularProgress>
                    {/* Level badge anchored to the ring — ink-on-lime chip. */}
                    <View
                        style={[s.levelBadge, { backgroundColor: colors.accent.coral, borderColor: colors.background.primary }]}
                        accessible
                        accessibilityLabel={statsError ? 'Level unavailable' : `Level ${level}`}
                    >
                        <Text style={[s.levelBadgeTxt, { color: colors.text.inverse }]} maxFontSizeMultiplier={1.3}>
                            {statsError ? 'LVL —' : `LVL ${level}`}
                        </Text>
                    </View>
                </Animated.View>

                <View style={s.details}>
                    {/* Name + title */}
                    <Animated.View entering={FadeInDown.delay(110).springify().damping(18)} style={s.nameBlock}>
                        <Text style={[typography.display, { color: colors.text.primary, textAlign: 'center' }]}>
                            {displayName}
                        </Text>
                        <View style={s.metaRow}>
                            <Text style={[typography.body, { color: colors.text.secondary }]}>
                                {(profile as any)?.occupation ?? 'Member'}
                            </Text>
                            <View style={[s.metaDot, { backgroundColor: colors.text.tertiary }]} />
                            {/* Streak chip — animated gamification accent. */}
                            <View
                                style={[s.streakChip, { backgroundColor: withAlpha(C.accent.orange, 0.14), borderColor: withAlpha(C.accent.orange, 0.28) }]}
                                accessible
                                accessibilityLabel={streakError ? 'Streak unavailable' : `${streak?.current ?? 0} day streak`}
                            >
                                <Ionicons name="flame" size={13} color={C.accent.orange} />
                                <Text style={[s.streakChipTxt, { color: C.accent.orange }]}>
                                    {streakError ? '—' : `${streak?.current ?? 0}d`}
                                </Text>
                            </View>
                        </View>
                        {!!(profile as any)?.aboutMe && (
                            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 }]}>
                                {(profile as any).aboutMe}
                            </Text>
                        )}
                        {/* Honest XP-to-next-level hint, only when stats loaded. */}
                        {!statsError && (
                            <View style={s.xpHintWrap}>
                                <ProgressBar
                                    progress={levelProgress * 100}
                                    gradientColors={colors.gradients.coralCta}
                                    height={5}
                                    trackColor={withAlpha(colors.text.primary, 0.08)}
                                />
                                <Text style={[s.xpHintTxt, { color: colors.text.tertiary }]}>
                                    {daysToNext === 7 ? `7 active days to Level ${level + 1}` : `${daysToNext} more to Level ${level + 1}`}
                                </Text>
                            </View>
                        )}
                    </Animated.View>

                    {/* Action buttons — ONE primary CTA (Edit) + glass Preferences. */}
                    <Animated.View entering={FadeInDown.delay(150).springify().damping(18)} style={s.actionRow}>
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
                                style={({ pressed }) => [s.prefBtn, pressed ? { opacity: 0.85, transform: [{ scale: 0.97 }] } : null]}
                                onPress={() => router.push('/(tabs)/profile/preferences' as any)}
                            >
                                <Ionicons name="options-outline" size={17} color={colors.text.primary} />
                                <Text style={[s.btnTxt, { color: colors.text.primary }]}>Preferences</Text>
                            </Pressable>
                        </GlassCard>
                    </Animated.View>

                    {isAdmin && (
                        <Animated.View entering={FadeInDown.delay(175).springify().damping(18)} style={{ width: '100%' }}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Admin Dashboard"
                                style={({ pressed }) => [s.adminBtn, { backgroundColor: C.error, borderRadius: borderRadius.xl }, pressed && s.pressed]}
                                onPress={() => router.push('/(admin)' as any)}
                            >
                                <Ionicons name="shield" size={17} color="#fff" />
                                <Text style={[s.btnTxt, { color: '#fff' }]}>Admin Dashboard</Text>
                            </Pressable>
                        </Animated.View>
                    )}

                    {/* ══ HERO STATS ══════════════════════════════════════════
                        STREAK leads as a wide statLarge (48px) marquee numeral with
                        FATIGUE + ADHERENCE stacked as a secondary pair, so the hero
                        numbers actually read as hero. Each cell keeps the honest
                        fetch-error contract ('—' + retry) so a backend failure never
                        masquerades as a zeroed new user. */}
                    <Animated.View entering={FadeInDown.delay(195).springify().damping(18)} style={s.statsBandWrap}>
                        <GlassCard radius={borderRadius['2xl']} style={s.statsBand}>
                            <View style={s.statsBandInner}>
                                {/* Lead cell — STREAK promoted to hero statLarge (48px). It's
                                    the most gamified number so it reads as the marquee. */}
                                <StatCell
                                    label="STREAK"
                                    value={`${streak?.current ?? 0}`}
                                    unit="d"
                                    color={C.accent.cyan}
                                    isError={streakError}
                                    onRetry={refetchStreak}
                                    lead
                                />
                                <View style={[s.statDividerTall, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]} />
                                {/* Secondary pair — stacked smaller numerals beside the lead. */}
                                <View style={s.statsSecondaryCol}>
                                    <StatCell label="FATIGUE" value={`${(status as any)?.fatigueScore ?? 0}`} unit="%" color={C.warning} isError={statusError} onRetry={refetchStatus} />
                                    <View style={[s.statRowDivider, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]} />
                                    <StatCell label="ADHERENCE" value={`${(status as any)?.adherenceScore ?? 0}`} unit="%" color={C.success} isError={statusError} onRetry={refetchStatus} />
                                </View>
                            </View>
                        </GlassCard>
                    </Animated.View>

                    {/* Circadian phase card */}
                    <Animated.View entering={FadeInDown.delay(225).springify().damping(18)} style={{ width: '100%' }}>
                        <GlassCard glow={withAlpha(C.accent.amber, 0.18)} radius={borderRadius['2xl']} style={s.circCard}>
                            <View style={s.circInner}>
                                <View style={s.circHeader}>
                                    <Ionicons name="sunny-outline" size={18} color={C.accent.amber} />
                                    <Text style={[s.circLabel, { color: colors.text.secondary }]}>CIRCADIAN PHASE</Text>
                                </View>
                                <Text style={[typography.h2, { color: colors.text.primary, marginTop: 10 }]}>
                                    {statusError ? 'Unavailable' : ((status as any)?.circadianPhase ?? '—')}
                                </Text>
                                <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
                                    {statusError
                                        ? "We couldn't load your circadian status."
                                        : 'Your metabolic window is currently optimised for activity.'}
                                </Text>
                                {statusError ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel="Retry loading circadian status"
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={({ pressed }) => [s.circBtn, { backgroundColor: withAlpha(C.accent.amber, 0.12), borderColor: withAlpha(C.accent.amber, 0.25) }, pressed && s.pressed]}
                                        onPress={() => refetchStatus()}
                                    >
                                        <Text style={[s.circBtnTxt, { color: C.accent.amber }]}>Retry</Text>
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel="View full schedule"
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={({ pressed }) => [s.circBtn, { backgroundColor: withAlpha(C.accent.amber, 0.12), borderColor: withAlpha(C.accent.amber, 0.25) }, pressed && s.pressed]}
                                        onPress={() => router.push('/(tabs)/circadian' as any)}
                                    >
                                        <Text style={[s.circBtnTxt, { color: C.accent.amber }]}>View Full Schedule →</Text>
                                    </Pressable>
                                )}
                            </View>
                        </GlassCard>
                    </Animated.View>

                    {/* Cycle tracker (F25/F28/F29) — OPT-IN, FEMALE-only. Gate on the
                        actual profile fields, NOT status.cyclePhase: the server returns
                        'UNKNOWN' (never null) for a status row, so a cyclePhase != null
                        check would surface the card + link to males / opted-out users.
                        cycleTrackingEnabled===true && biologicalSex==='FEMALE' is the
                        same eligibility the cycle screen itself enforces, and it still
                        shows the honest 'UNKNOWN' tracking-only card for an eligible
                        woman whose phase can't yet be predicted (irregular / new). */}
                    {(profile as any)?.cycleTrackingEnabled === true
                        && (profile as any)?.biologicalSex === 'FEMALE' && (
                        <Animated.View entering={FadeInDown.delay(255).springify().damping(18)} style={{ width: '100%' }}>
                            <CyclePhaseCard cyclePhase={(status as any)?.cyclePhase} />
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Open cycle tracker"
                                onPress={() => router.push('/(performance)/cycle' as any)}
                                style={({ pressed }) => [s.circBtn, { borderColor: withAlpha(colors.accent.coral, 0.3), marginTop: 10 }, pressed && s.pressed]}
                            >
                                <Text style={[s.circBtnTxt, { color: colors.accent.coral }]}>
                                    View Cycle Tracker →
                                </Text>
                            </Pressable>
                        </Animated.View>
                    )}

                    {/* Achievements — snapping chip carousel, DERIVED from real
                        signals. Earned chips glow; not-yet-earned chips render a
                        locked/greyed state with a lock glyph + honest progress
                        ('7 / 30 days') and an animated progress bar. */}
                    {showAchievements && (
                        <Animated.View entering={FadeInDown.delay(285).springify().damping(18)} style={s.achSection}>
                            <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>ACHIEVEMENTS</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                decelerationRate="fast"
                                snapToInterval={124 + 12}
                                snapToAlignment="start"
                                contentContainerStyle={{ gap: 12, paddingRight: H_PAD }}
                            >
                                {achievements.map((ach, i) => (
                                    <AchievementCard key={ach.title} ach={ach} index={i} />
                                ))}
                            </ScrollView>
                        </Animated.View>
                    )}

                    {/* ══ MORE FEATURES HUB (Moved to Home) ═══════════════════════════════════ */}

                    {/* Coach Hub button (coach users only) */}
                    {isCoach && (
                        <Animated.View entering={FadeInDown.delay(315).springify().damping(18)} style={{ width: '100%' }}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Open Coach Hub"
                                style={({ pressed }) => [s.coachBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.12), borderColor: withAlpha(colors.accent.purple, 0.3) }, pressed && s.pressed]}
                                onPress={() => router.push('/(coach)/dashboard' as any)}
                            >
                                <Ionicons name="people" size={20} color={colors.accent.purple} />
                                <Text style={[s.coachBtnTxt, { color: colors.accent.purple }]}>Open Coach Hub</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.accent.purple} />
                            </Pressable>
                        </Animated.View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

// ─── StatCell sub-component (hero stat) ───────────────────────────────────────

function StatCell({
    label,
    value,
    unit,
    color,
    isError = false,
    onRetry,
    lead = false,
}: {
    label: string;
    value: string;
    unit?: string;
    color: string;
    isError?: boolean;
    onRetry?: () => void;
    /** Hero lead cell — renders the numeral in statLarge (48px) vs statMedium. */
    lead?: boolean;
}) {
    const { typography, colors } = useTheme();
    const valueStyle = lead ? typography.statLarge : typography.statMedium;

    // HONEST error state: the fetch failed, so we DON'T know this stat. Render
    // '—' + a small "Unavailable / Retry" affordance instead of the misleading
    // '0%'/'0d' a coalesce would produce — a backend failure must not look like
    // a healthy brand-new (genuinely zeroed) user.
    if (isError) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label} unavailable, tap to retry`}
                onPress={() => onRetry?.()}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                style={({ pressed }) => [lead ? s.statCellLead : s.statCell, pressed ? { opacity: 0.85, transform: [{ scale: 0.96 }] } : null]}
            >
                <Text style={[valueStyle, { color: colors.text.tertiary }]} maxFontSizeMultiplier={1.2}>—</Text>
                <Text style={[s.statLabel, { color: colors.text.secondary }]}>Unavailable</Text>
                <View style={s.statRetryRow}>
                    <Ionicons name="refresh" size={11} color={colors.text.tertiary} />
                    <Text style={[s.statRetryTxt, { color: colors.text.tertiary }]}>Retry</Text>
                </View>
            </Pressable>
        );
    }

    return (
        <View style={lead ? s.statCellLead : s.statCell} accessible accessibilityLabel={`${label} ${value}${unit ?? ''}`}>
            <View style={s.statValueRow}>
                <Text style={[valueStyle, { color }]} maxFontSizeMultiplier={1.2}>{value}</Text>
                {!!unit && (
                    <Text style={[lead ? typography.statSmall : typography.statTiny, s.statUnit, { color: withAlpha(color, 0.7) }]} maxFontSizeMultiplier={1.2}>{unit}</Text>
                )}
            </View>
            <Text style={[s.statLabel, { color: colors.text.secondary }]}>{label}</Text>
        </View>
    );
}

// ─── AchievementCard sub-component (earned ↔ locked) ──────────────────────────
// Animated locked→unlocked chip: earned chips glow with the full-colour icon;
// locked chips grey out, swap to a lock glyph, and show an honest progress bar +
// '7 / 30 days' label. This is the 'avoid static' gamification the brief asks
// for — every state is derived from real query data, never fabricated.

function AchievementCard({ ach, index }: { ach: Achievement; index: number }) {
    const { colors, borderRadius } = useTheme();
    const earned = ach.progress >= 1;
    const accent = earned ? ach.color : colors.text.tertiary;
    const pct = Math.round(ach.progress * 100);

    return (
        <Animated.View entering={FadeInDown.delay(300 + index * 40).springify().damping(18)}>
            <GlassCard
                radius={borderRadius.xl}
                glow={earned ? withAlpha(ach.color, 0.16) : undefined}
                style={s.achCard}
            >
                <View
                    style={[s.achInner, !earned && s.achInnerLocked]}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={
                        earned
                            ? `${ach.title} achievement earned: ${ach.desc}`
                            : `${ach.title} achievement locked, ${ach.lockedLabel}`
                    }
                    accessibilityState={{ disabled: !earned }}
                >
                    <View style={[s.achIcon, { backgroundColor: withAlpha(accent, earned ? 0.13 : 0.08), borderColor: withAlpha(accent, earned ? 0.30 : 0.18) }]}>
                        <Ionicons name={(earned ? ach.icon : 'lock-closed') as any} size={earned ? 24 : 20} color={accent} />
                    </View>
                    <Text style={[s.achTitle, { color: earned ? colors.text.primary : colors.text.secondary }]}>{ach.title}</Text>
                    {earned ? (
                        <Text style={[s.achDesc, { color: colors.text.secondary }]}>{ach.desc}</Text>
                    ) : (
                        <View style={s.achProgWrap}>
                            <ProgressBar
                                progress={pct}
                                color={ach.color}
                                height={4}
                                trackColor={withAlpha(colors.text.primary, 0.08)}
                            />
                            <Text style={[s.achLockedTxt, { color: colors.text.tertiary }]}>{ach.lockedLabel}</Text>
                        </View>
                    )}
                </View>
            </GlassCard>
        </Animated.View>
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
                    colors={[withAlpha(C.accent.coral, 0.22), withAlpha(C.accent.pink, 0.07), colors.background.primary]}
                    start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }}
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
                <Skeleton width={120} height={120} radius={60} />
            </View>

            <View style={s.details}>
                <Skeleton width={200} height={36} radius={borderRadius.md} style={{ marginBottom: spacing.sm }} />
                <Skeleton width={160} height={18} radius={borderRadius.sm} />

                {/* Action buttons */}
                <View style={s.actionRow}>
                    <Skeleton width="48%" height={48} radius={borderRadius.xl} />
                    <Skeleton width="48%" height={48} radius={borderRadius.xl} />
                </View>

                {/* Stat band */}
                <View style={s.statsBandWrap}>
                    <Skeleton width="100%" height={96} radius={borderRadius['2xl']} />
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

    // Shared springy pressed feedback — uniform across every interactive element.
    pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },

    // Cover header
    cover: { height: 140, width: '100%' },
    navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: H_PAD, height: 52 },
    navRight: { flexDirection: 'row', gap: 10 },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

    // Avatar + level ring
    avatarWrap: { marginTop: -60, alignSelf: 'center', marginBottom: 16 },
    avatarRing: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatar: { width: 96, height: 96, borderRadius: 48 },
    levelBadge: {
        position: 'absolute', bottom: -6, alignSelf: 'center',
        paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999, borderWidth: 2,
        minHeight: 24, justifyContent: 'center',
    },
    levelBadgeTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },

    // Details
    details: { paddingHorizontal: H_PAD, alignItems: 'center' },
    nameBlock: { alignItems: 'center', width: '100%', marginTop: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    metaDot: { width: 3, height: 3, borderRadius: 2 },
    streakChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
    streakChipTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
    xpHintWrap: { width: '70%', marginTop: 14, alignItems: 'center', gap: 6 },
    xpHintTxt: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

    actionRow: { flexDirection: 'row', width: '100%', gap: CARD_GAP, marginTop: 22, marginBottom: 22 },
    editCta: { flex: 1 },
    prefWrap: { flex: 1 },
    prefBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, minHeight: 48 },
    btnTxt: { fontSize: 14, fontWeight: '700' },
    adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 13, marginBottom: 22 },

    // Hero stat band — wide lead numeral + stacked secondary pair.
    statsBandWrap: { width: '100%', marginBottom: 24 },
    statsBand: { width: '100%' },
    statsBandInner: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 18, paddingHorizontal: 14 },
    statCell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
    statCellLead: { flex: 1.1, alignItems: 'center', justifyContent: 'center', minHeight: 96 },
    statsSecondaryCol: { flex: 1, justifyContent: 'center' },
    statDivider: { width: 1, height: 44, alignSelf: 'center' },
    statDividerTall: { width: 1, alignSelf: 'stretch', marginVertical: 4, marginHorizontal: 6 },
    statRowDivider: { height: 1, alignSelf: 'stretch', marginVertical: 10 },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline' },
    statUnit: { marginLeft: 1 },
    statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
    statRetryRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
    statRetryTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

    // Circadian
    circCard: { width: '100%', marginBottom: 28 },
    circInner: { padding: 22 },
    circHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    circLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    circBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    circBtnTxt: { fontSize: 13, fontWeight: '700' },

    // Achievements
    achSection: { width: '100%' },
    sectionLbl: { alignSelf: 'flex-start', marginBottom: 14 },
    achCard: { width: 124 },
    achInner: { padding: 16, alignItems: 'center', minHeight: 132, justifyContent: 'center' },
    achInnerLocked: { opacity: 0.92 },
    achIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1 },
    achTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    achDesc: { fontSize: 11, textAlign: 'center', marginTop: 2 },
    achProgWrap: { width: '100%', alignItems: 'center', gap: 5, marginTop: 6 },
    achLockedTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

    // Coach button
    coachBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', padding: 16, borderRadius: 18, borderWidth: 1, marginTop: 4 },
    coachBtnTxt: { flex: 1, fontSize: 14, fontWeight: '700' },
});
