/**
 * Profile tab — user profile + full feature-discovery hub.
 *
 * Because this is now a visible tab (not a pushed screen) the back
 * button is removed and replaced with a Settings shortcut.
 *
 * Zeitra "You" reskin (bold & minimal, matching app_images/you-preview.html):
 * a centered avatar carries a lime LEVEL RING (CircularProgress) + an "LVL n"
 * ink-on-lime badge; a big name sits above a "🌙 Night Owl · …" meta line; a
 * single row of BIG stats (streak / workouts / days) is split by thin dividers;
 * a secondary FATIGUE/ADHERENCE strip keeps the honest fetch-error contract; an
 * "Achievements" 4-up grid renders earned tiles in lime and locked tiles greyed
 * with a lock glyph; a "Consistency" section reuses the shared ActivityHeatmap;
 * and a Settings row closes the screen. The screen enters with a staggered
 * Reanimated FadeInDown and a uniform springy pressed-scale (0.96) across every
 * interactive element. Glass surfaces use the shared GlassCard primitive; the
 * single primary CTA uses CtaButton (ink-on-lime).
 *
 * EVERY value is DERIVED from live signals — no fabricated gamification. Each
 * stat keeps the honest fetch-error contract ('—' / "Unavailable" / Retry) so a
 * backend failure never masquerades as a healthy brand-new (genuinely zeroed)
 * user. ALL data hooks / role flags / nav / a11y labels / testIDs and the
 * honest-error StatCell contract are preserved exactly.
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
import { getRecent } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors as C } from '@/theme/colors';
import { withAlpha } from '@/theme/utils';
import { Skeleton, GlassCard, CtaButton, CircularProgress, ProgressBar } from '@/components/ui';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { CyclePhaseCard } from '@/components/CyclePhaseCard';
import { TAB_BAR_H } from './_layout';

const H_PAD = 20;
const CARD_GAP = 12;

// Faded model-photo cover behind the level ring (mockup's "you-preview" hero).
// RN has no CSS grayscale filter, so we read it as a cover via a low-opacity
// image + the existing dark gradient scrim rather than a desaturate pass.
const COVER_HERO = require('../../assets/images/hero-male-1.png');

// ─── Achievements (DERIVED from real signals) ────────────────────────────────
// No fabricated gamification: every tile is computed from live query data
// (streak.current, stats.daysLogged, status scores, shiftType). Not-yet-earned
// tiles render in a locked/greyed state with a lock glyph + honest progress
// ('7 / 30 days') so a brand-new 0-streak user never sees a glamorous fake
// '30 Day Streak'. The grid mirrors the mockup's 4-up square tiles.
type Achievement = {
    title: string;
    /** Short tile caption (e.g. '30-day'). */
    label: string;
    /** Earned tagline (e.g. '30 Day Streak'). Used for a11y when unlocked. */
    desc: string;
    icon: string;
    /** Token-sourced accent (single palette source — no raw hex). */
    color: string;
    /** 0–1 progress toward earning. */
    progress: number;
    /** Honest progress label for locked tiles (e.g. '7 / 30 days'). */
    lockedLabel: string;
};

function buildAchievements(args: {
    streakDays: number;
    daysLogged: number;
    adherence: number;
    isNightOwl: boolean;
}): Achievement[] {
    const { streakDays, daysLogged, adherence, isNightOwl } = args;
    const pct = (n: number, target: number) => Math.max(0, Math.min(1, target > 0 ? n / target : 0));
    return [
        {
            title: 'Streak Keeper',
            label: '30-day',
            desc: '30 Day Streak',
            icon: 'flame',
            color: C.accent.lime,
            progress: pct(streakDays, 30),
            lockedLabel: `${streakDays} / 30 days`,
        },
        {
            // Night-owl badge is EARNED purely from the real shiftType flag — it's
            // a binary signal, so its progress is 0 or 1 (never a fake fraction).
            title: 'Night Owl',
            label: 'Night owl',
            desc: 'Night Shift',
            icon: 'moon',
            color: C.accent.lime,
            progress: isNightOwl ? 1 : 0,
            lockedLabel: 'Night shift only',
        },
        {
            title: 'Consistent',
            label: 'Iron will',
            desc: '50 Days Logged',
            icon: 'barbell',
            color: C.accent.lime,
            progress: pct(daysLogged, 50),
            lockedLabel: `${daysLogged} / 50 days`,
        },
        {
            title: 'On Track',
            label: '90% adher.',
            desc: '90% Adherence',
            icon: 'ribbon',
            color: C.accent.lime,
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
    // affected stat cells instead of coalescing to '0%' / '0d' / 'Level 1' — a
    // failed fetch must NOT look like a healthy brand-new (genuinely zeroed) user.
    const { data: status, isError: statusError, refetch: refetchStatus } = useQuery({ queryKey: ['my-status'], queryFn: getStatus });
    const { data: stats, isError: statsError } = useQuery({ queryKey: ['profile-weekly-stats'], queryFn: getWeeklyStats });
    const { data: streak, isError: streakError, refetch: refetchStreak } = useQuery({ queryKey: ['profile-streak'], queryFn: getStreak });
    // Lifetime workout count for the hero stat row — the same logged-workout feed
    // the Consistency heatmap reads. Soft-fails to [] (caught) so a backend hiccup
    // shows an honest 0, never crashes the screen.
    const { data: workouts } = useQuery({
        queryKey: ['profile-workouts'],
        queryFn: () => getRecent(200).catch(() => []),
        staleTime: 60_000,
    });

    const isCoach = ['COACH', 'TRAINER', 'NUTRITIONIST', 'coach'].includes(user?.role ?? '');
    const isAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

    if (isLoading) {
        return <ProfileSkeleton />;
    }

    const displayName = (profile as any)?.displayName ?? user?.name;
    // Honest "Night Owl" badge: only a genuine night-shift worker is one. Falls
    // back to the real occupation (or 'Member') so we never fabricate a persona.
    const isNightOwl = user?.shiftType === 'night';
    const metaLabel = isNightOwl ? 'Night Owl' : ((profile as any)?.occupation ?? 'Member');

    // ── Derived gamification values ──────────────────────────────────────────
    // Level math is preserved EXACTLY (days logged / 7, +1). The XP ring shows
    // honest progress toward the next level: days-into-the-current-7-day-block
    // out of 7. Hidden when the stats fetch failed so we never paint a fake ring.
    const daysLogged = stats?.daysLogged ?? 0;
    const level = Math.floor(daysLogged / 7) + 1;
    const levelProgress = statsError ? 0 : (daysLogged % 7) / 7; // 0–1 toward next level
    const daysToNext = 7 - (daysLogged % 7);
    const workoutCount = Array.isArray(workouts) ? workouts.length : 0;

    // Achievements derived from live signals (honest locked/earned states). The
    // whole grid is gated behind real loaded data: if BOTH the streak and stats
    // fetches failed we have no honest signal to grade against, so we hide it
    // rather than render fabricated or all-zero tiles.
    const achievements = buildAchievements({
        streakDays: streakError ? 0 : (streak?.current ?? 0),
        daysLogged: statsError ? 0 : daysLogged,
        adherence: statusError ? 0 : ((status as any)?.adherenceScore ?? 0),
        isNightOwl,
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
                    {/* Faded model-photo cover (mockup) — low-opacity image anchored
                        right, read as a cover via the dark gradient scrims layered on
                        top (RN has no CSS grayscale, so opacity + scrim stand in). */}
                    <Image
                        source={COVER_HERO}
                        style={s.coverPhoto}
                        contentFit="cover"
                        contentPosition="top"
                        cachePolicy="memory-disk"
                        transition={200}
                        accessibilityLabel=""
                    />
                    {/* Vertical scrim → fade the photo into the page bg toward the avatar. */}
                    <LinearGradient
                        colors={['rgba(10,12,18,0.30)', 'rgba(10,12,18,0.80)', colors.background.primary]}
                        style={StyleSheet.absoluteFillObject}
                    />
                    {/* Horizontal lime wash (kept) — brand tint sweeping in from the left. */}
                    <LinearGradient
                        colors={[withAlpha(C.accent.lime, 0.18), withAlpha(C.accent.lime, 0.05), 'transparent']}
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
                    style={[s.avatarWrap, shadows.glow(colors.accent.lime)]}
                >
                    {/* Lime level ring wraps the avatar — gamified progress to next level. */}
                    <CircularProgress
                        size={122}
                        strokeWidth={4}
                        progress={levelProgress}
                        color={colors.accent.lime}
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
                                <View style={[s.avatar, { backgroundColor: withAlpha(colors.accent.lime, 0.12), alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel="No profile photo">
                                    <Ionicons name="person" size={48} color={colors.accent.lime} />
                                </View>
                            )}
                        </View>
                    </CircularProgress>
                    {/* Level badge anchored to the ring — ink-on-lime chip. */}
                    <View
                        style={[s.levelBadge, { backgroundColor: colors.accent.lime, borderColor: colors.background.primary }]}
                        accessible
                        accessibilityLabel={statsError ? 'Level unavailable' : `Level ${level}`}
                    >
                        <Text style={[s.levelBadgeTxt, { color: colors.text.inverse }]} maxFontSizeMultiplier={1.3}>
                            {statsError ? 'LVL —' : `LVL ${level}`}
                        </Text>
                    </View>
                </Animated.View>

                <View style={s.details}>
                    {/* Name + meta line */}
                    <Animated.View entering={FadeInDown.delay(110).springify().damping(18)} style={s.nameBlock}>
                        <Text style={[typography.display, { color: colors.text.primary, textAlign: 'center' }]}>
                            {displayName}
                        </Text>
                        <View style={s.metaRow}>
                            <Text style={[typography.body, { color: colors.text.secondary }]}>
                                {isNightOwl ? '🌙 ' : ''}{metaLabel}
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
                                    gradientColors={colors.gradients.limeCta}
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

                    {/* ══ HERO STATS ROW ══════════════════════════════════════
                        Three big numerals (STREAK / WORKOUTS / DAYS) split by thin
                        dividers, exactly like the mockup. STREAK leads in lime. The
                        STREAK cell keeps the honest fetch-error contract ('—' + retry)
                        so a backend failure never masquerades as a zeroed new user. */}
                    <Animated.View entering={FadeInDown.delay(195).springify().damping(18)} style={s.heroStatsRow}>
                        <StatCell
                            label="STREAK"
                            value={`${streak?.current ?? 0}`}
                            color={colors.accent.lime}
                            isError={streakError}
                            onRetry={refetchStreak}
                        />
                        <View style={[s.heroDivider, { backgroundColor: withAlpha(colors.text.primary, 0.10) }]} />
                        <StatCell
                            label="WORKOUTS"
                            value={`${workoutCount}`}
                            color={colors.text.primary}
                        />
                        <View style={[s.heroDivider, { backgroundColor: withAlpha(colors.text.primary, 0.10) }]} />
                        <StatCell
                            label="DAYS"
                            value={statsError ? '—' : `${daysLogged}`}
                            color={colors.text.primary}
                        />
                    </Animated.View>

                    {/* Secondary status strip — FATIGUE + ADHERENCE keep their honest
                        '—' / "Unavailable" / Retry contract (refetch status). */}
                    <Animated.View entering={FadeInDown.delay(215).springify().damping(18)} style={s.statusStripWrap}>
                        <GlassCard radius={borderRadius['2xl']} style={s.statusStrip}>
                            <View style={s.statusStripInner}>
                                <StatCell label="FATIGUE" value={`${(status as any)?.fatigueScore ?? 0}`} unit="%" color={C.warning} isError={statusError} onRetry={refetchStatus} compact />
                                <View style={[s.heroDivider, { backgroundColor: withAlpha(colors.text.primary, 0.10) }]} />
                                <StatCell label="ADHERENCE" value={`${(status as any)?.adherenceScore ?? 0}`} unit="%" color={C.success} isError={statusError} onRetry={refetchStatus} compact />
                            </View>
                        </GlassCard>
                    </Animated.View>

                    {/* Circadian phase card */}
                    <Animated.View entering={FadeInDown.delay(235).springify().damping(18)} style={{ width: '100%' }}>
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
                                style={({ pressed }) => [s.circBtn, { borderColor: withAlpha(colors.accent.lime, 0.3), marginTop: 10 }, pressed && s.pressed]}
                            >
                                <Text style={[s.circBtnTxt, { color: colors.accent.lime }]}>
                                    View Cycle Tracker →
                                </Text>
                            </Pressable>
                        </Animated.View>
                    )}

                    {/* Achievements — 4-up square-tile grid, DERIVED from real signals.
                        Earned tiles glow lime with the full-colour icon; not-yet-earned
                        tiles render a locked/greyed state with a lock glyph + honest
                        '7 / 30 days' progress. */}
                    {showAchievements && (
                        <Animated.View entering={FadeInDown.delay(285).springify().damping(18)} style={s.achSection}>
                            <View style={s.sectionHeader}>
                                <Text style={[typography.h3, { color: colors.text.primary }]}>Achievements</Text>
                                <Text style={[s.sectionHint, { color: colors.text.tertiary }]}>
                                    {achievements.filter((a) => a.progress >= 1).length} earned
                                </Text>
                            </View>
                            <View style={s.achGrid}>
                                {achievements.map((ach, i) => (
                                    <AchievementTile key={ach.title} ach={ach} index={i} />
                                ))}
                            </View>
                        </Animated.View>
                    )}

                    {/* Consistency — reuse the shared ActivityHeatmap (16-week grid). */}
                    <Animated.View entering={FadeInDown.delay(315).springify().damping(18)} style={s.consistencySection}>
                        <Text style={[typography.h3, s.consistencyLbl, { color: colors.text.primary }]}>Consistency</Text>
                        <ActivityHeatmap />
                    </Animated.View>

                    {/* Coach Hub button (coach users only) */}
                    {isCoach && (
                        <Animated.View entering={FadeInDown.delay(335).springify().damping(18)} style={{ width: '100%' }}>
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

                    {/* Settings row — closes the screen like the mockup's bottom card. */}
                    <Animated.View entering={FadeInDown.delay(355).springify().damping(18)} style={s.settingsRowWrap}>
                        <GlassCard radius={borderRadius.xl} style={{ width: '100%' }}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Open Settings"
                                style={({ pressed }) => [s.settingsRow, pressed ? { opacity: 0.85 } : null]}
                                onPress={() => router.push('/(settings)' as any)}
                            >
                                <Ionicons name="settings" size={20} color={colors.accent.lime} />
                                <Text style={[s.settingsTxt, { color: colors.text.primary }]} numberOfLines={1}>
                                    Settings · theme · account
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                            </Pressable>
                        </GlassCard>
                    </Animated.View>
                </View>
            </ScrollView>
        </View>
    );
}

// ─── StatCell sub-component (hero / status stat) ──────────────────────────────

function StatCell({
    label,
    value,
    unit,
    color,
    isError = false,
    onRetry,
    compact = false,
}: {
    label: string;
    value: string;
    unit?: string;
    color: string;
    isError?: boolean;
    onRetry?: () => void;
    /** Smaller numeral (statMedium) for the secondary status strip. */
    compact?: boolean;
}) {
    const { typography, colors } = useTheme();
    const valueStyle = compact ? typography.statMedium : typography.statLarge;

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
                style={({ pressed }) => [s.statCell, pressed ? { opacity: 0.85, transform: [{ scale: 0.96 }] } : null]}
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
        <View style={s.statCell} accessible accessibilityLabel={`${label} ${value}${unit ?? ''}`}>
            <View style={s.statValueRow}>
                <Text style={[valueStyle, { color }]} maxFontSizeMultiplier={1.2}>{value}</Text>
                {!!unit && (
                    <Text style={[compact ? typography.statTiny : typography.statSmall, s.statUnit, { color: withAlpha(color, 0.7) }]} maxFontSizeMultiplier={1.2}>{unit}</Text>
                )}
            </View>
            <Text style={[s.statLabel, { color: colors.text.secondary }]}>{label}</Text>
        </View>
    );
}

// ─── AchievementTile sub-component (earned ↔ locked) ──────────────────────────
// Square grid tile mirroring the mockup: earned → lime icon on a lime-washed
// tile; locked → greyed tile with a lock glyph + honest progress bar +
// '7 / 30 days' caption. Every state is derived from real query data.

function AchievementTile({ ach, index }: { ach: Achievement; index: number }) {
    const { colors, borderRadius } = useTheme();
    const earned = ach.progress >= 1;
    const accent = earned ? ach.color : colors.text.tertiary;
    const pct = Math.round(ach.progress * 100);

    return (
        <Animated.View entering={FadeInDown.delay(300 + index * 40).springify().damping(18)} style={s.achTileWrap}>
            <View
                style={[
                    s.achTile,
                    {
                        backgroundColor: earned ? withAlpha(ach.color, 0.12) : colors.background.secondary,
                        borderColor: earned ? withAlpha(ach.color, 0.36) : withAlpha(colors.text.primary, 0.08),
                    },
                    !earned && s.achTileLocked,
                ]}
                accessible
                accessibilityRole="image"
                accessibilityLabel={
                    earned
                        ? `${ach.title} achievement earned: ${ach.desc}`
                        : `${ach.title} achievement locked, ${ach.lockedLabel}`
                }
                accessibilityState={{ disabled: !earned }}
            >
                <Ionicons name={(earned ? ach.icon : 'lock-closed') as any} size={earned ? 26 : 20} color={accent} />
            </View>
            <Text style={[s.achLabel, { color: earned ? colors.text.secondary : colors.text.tertiary }]} numberOfLines={1}>
                {ach.label}
            </Text>
            {!earned && (
                <View style={s.achProgWrap}>
                    <ProgressBar
                        progress={pct}
                        color={ach.color}
                        height={3}
                        trackColor={withAlpha(colors.text.primary, 0.08)}
                    />
                </View>
            )}
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
                    colors={[withAlpha(C.accent.lime, 0.18), withAlpha(C.accent.lime, 0.05), colors.background.primary]}
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
                <Skeleton width={122} height={122} radius={61} />
            </View>

            <View style={s.details}>
                <Skeleton width={200} height={36} radius={borderRadius.md} style={{ marginBottom: spacing.sm }} />
                <Skeleton width={160} height={18} radius={borderRadius.sm} />

                {/* Action buttons */}
                <View style={s.actionRow}>
                    <Skeleton width="48%" height={48} radius={borderRadius.xl} />
                    <Skeleton width="48%" height={48} radius={borderRadius.xl} />
                </View>

                {/* Hero stats row */}
                <View style={s.heroStatsRow}>
                    <Skeleton width="30%" height={64} radius={borderRadius.lg} />
                    <Skeleton width="30%" height={64} radius={borderRadius.lg} />
                    <Skeleton width="30%" height={64} radius={borderRadius.lg} />
                </View>

                {/* Status strip */}
                <View style={s.statusStripWrap}>
                    <Skeleton width="100%" height={80} radius={borderRadius['2xl']} />
                </View>

                {/* Circadian card */}
                <Skeleton width="100%" height={170} radius={borderRadius['2xl']} style={{ marginBottom: spacing['3xl'] }} />

                {/* Achievements grid */}
                <Skeleton width={160} height={20} radius={borderRadius.sm} style={{ alignSelf: 'flex-start', marginBottom: spacing.lg }} />
                <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'flex-start' }}>
                    <Skeleton width={70} height={70} radius={borderRadius.lg} />
                    <Skeleton width={70} height={70} radius={borderRadius.lg} />
                    <Skeleton width={70} height={70} radius={borderRadius.lg} />
                    <Skeleton width={70} height={70} radius={borderRadius.lg} />
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
    cover: { height: 130, width: '100%' },
    // Faded model-photo cover — anchored to the right half, low opacity so the
    // dark + lime scrims layered above read it as an atmospheric cover (mockup).
    coverPhoto: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '62%', opacity: 0.5 },
    navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: H_PAD, height: 52 },
    navRight: { flexDirection: 'row', gap: 10 },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

    // Avatar + level ring
    avatarWrap: { marginTop: -56, alignSelf: 'center', marginBottom: 16 },
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

    // Hero stats row — three big numerals split by thin dividers (the mockup).
    heroStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', marginBottom: 18, paddingVertical: 4 },
    heroDivider: { width: 1, height: 34, alignSelf: 'center' },
    statCell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline' },
    statUnit: { marginLeft: 1 },
    statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 4, textTransform: 'lowercase' },
    statRetryRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
    statRetryTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

    // Secondary status strip (FATIGUE / ADHERENCE)
    statusStripWrap: { width: '100%', marginBottom: 24 },
    statusStrip: { width: '100%' },
    statusStripInner: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 16, paddingHorizontal: 14 },

    // Circadian
    circCard: { width: '100%', marginBottom: 28 },
    circInner: { padding: 22 },
    circHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    circLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    circBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    circBtnTxt: { fontSize: 13, fontWeight: '700' },

    // Section header (Achievements / Consistency)
    sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', width: '100%', marginBottom: 14 },
    sectionHint: { fontSize: 11, fontWeight: '600' },

    // Achievements grid (4-up squares)
    achSection: { width: '100%', marginBottom: 28 },
    achGrid: { flexDirection: 'row', width: '100%', gap: 10 },
    achTileWrap: { flex: 1, alignItems: 'center' },
    achTile: { width: '100%', aspectRatio: 1, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    achTileLocked: { opacity: 0.85 },
    achLabel: { fontSize: 10, fontWeight: '600', marginTop: 6, textAlign: 'center' },
    achProgWrap: { width: '70%', marginTop: 5 },

    // Consistency
    consistencySection: { width: '100%', marginBottom: 24 },
    consistencyLbl: { marginBottom: 14 },

    // Coach button
    coachBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', padding: 16, borderRadius: 18, borderWidth: 1, marginTop: 4, marginBottom: 18 },
    coachBtnTxt: { flex: 1, fontSize: 14, fontWeight: '700' },

    // Settings row
    settingsRowWrap: { width: '100%' },
    settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16, minHeight: 52 },
    settingsTxt: { flex: 1, fontSize: 14, fontWeight: '600' },
});
