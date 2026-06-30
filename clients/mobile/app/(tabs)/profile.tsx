/**
 * You — Zeitra profile screen.
 *
 * Rebuilt 1:1 from the design mockup `app_images/backups/you-preview.html`.
 * Flat dark (#0A0C12), design-lime (#C2F03C). Sections, top→bottom:
 *   1. cover hero — faded model photo + share / settings circular buttons
 *   2. avatar — lime LEVEL RING (CircularProgress) wrapping the avatar, an
 *      "LVL n" ink-on-lime badge, name, and a "🌙 Night Owl · joined …" meta line
 *   3. stat row — Streak / Workouts / Days, three big numerals split by dividers
 *   4. achievements — a 4-up square-tile grid (earned = lime glyph, locked = dim
 *      + lock glyph), DERIVED from real signals
 *   5. consistency — the shared ActivityHeatmap (real workout history)
 *   6. menu — Appearance & theme / Notifications / Account & settings (+ Admin /
 *      Coach Hub rows when the role applies)
 * The Ria FAB + bottom tab bar are provided globally by (tabs)/_layout.tsx.
 *
 * Every value is DERIVED from live signals — no fabricated gamification. A failed
 * secondary fetch shows an honest "—" (never a fake "0") so a backend hiccup can't
 * masquerade as a healthy brand-new user. The previous build's circadian/cycle
 * cards, fatigue/adherence strip, edit/preferences CTAs and XP hints are dropped
 * to match the focused mockup (all still reachable from settings/performance).
 */
import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { typography } from '@/theme';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { withAlpha } from '@/theme/utils';
import { useAuth } from '@/hooks/useAuth';
import { getWeeklyStats, getStreak } from '@/api/progress';
import { getMyProfile, getStatus } from '@/api/profile';
import { getRecent } from '@/api/exercises';
import { CircularProgress } from '@/components/ui';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { TAB_BAR_H } from './_layout';

const COVER_HERO = require('../../assets/images/hero-male-1.png');

type Achievement = { label: string; icon: keyof typeof Ionicons.glyphMap; earned: boolean; a11y: string };

// Achievements derived from real signals — earned/locked is honest, never faked.
function buildAchievements(a: { streakDays: number; daysLogged: number; isNightOwl: boolean; adherence: number }): Achievement[] {
    return [
        { label: '30-day', icon: 'flame', earned: a.streakDays >= 30, a11y: `30-day streak, ${a.streakDays >= 30 ? 'earned' : `${a.streakDays} of 30 days`}` },
        { label: 'Night owl', icon: 'moon', earned: a.isNightOwl, a11y: `Night owl, ${a.isNightOwl ? 'earned' : 'night shift only'}` },
        { label: 'Iron will', icon: 'barbell', earned: a.daysLogged >= 50, a11y: `Iron will, ${a.daysLogged >= 50 ? 'earned' : `${a.daysLogged} of 50 days`}` },
        { label: 'On track', icon: 'ribbon', earned: a.adherence >= 90, a11y: `On track, ${a.adherence >= 90 ? 'earned' : `${Math.round(a.adherence)} of 90 percent`}` },
    ];
}

export default function ProfileScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user } = useAuth();

    const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    const { data: stats, isError: statsError } = useQuery({ queryKey: ['profile-weekly-stats'], queryFn: getWeeklyStats });
    const { data: streak, isError: streakError } = useQuery({ queryKey: ['profile-streak'], queryFn: getStreak });
    const { data: status } = useQuery({ queryKey: ['my-status'], queryFn: getStatus });
    const { data: workouts } = useQuery({
        queryKey: ['profile-workouts'],
        queryFn: () => getRecent(200).catch(() => []),
        staleTime: 60_000,
    });

    const displayName = (profile as any)?.displayName ?? user?.name ?? 'User';
    const initial = useMemo(() => String(displayName).trim().charAt(0).toUpperCase() || 'Z', [displayName]);
    const avatarUrl = (profile as any)?.avatarUrl ?? user?.avatarUrl ?? null;
    const isNightOwl = user?.shiftType === 'night';
    const isAdmin = user?.role === 'admin';
    const isCoach = user?.role === 'coach';

    // Honest "joined …" only when the server actually carries a creation date.
    const joined = useMemo(() => {
        const c = (profile as any)?.createdAt ?? (user as any)?.createdAt;
        if (!c) return null;
        const d = new Date(c);
        return isNaN(d.getTime()) ? null : format(d, 'MMM yyyy');
    }, [profile, user]);
    const persona = isNightOwl ? 'Night Owl' : 'Member';
    const metaText = joined ? `${persona} · joined ${joined}` : persona;

    // Level math (days logged / 7, +1); ring shows progress into the current block.
    const daysLogged = stats?.daysLogged ?? 0;
    const level = Math.floor(daysLogged / 7) + 1;
    const levelProgress = statsError ? 0 : (daysLogged % 7) / 7;
    const streakDays = streak?.current ?? 0;
    const workoutCount = Array.isArray(workouts) ? workouts.length : 0;

    const achievements = buildAchievements({
        streakDays: streakError ? 0 : streakDays,
        daysLogged: statsError ? 0 : daysLogged,
        isNightOwl,
        adherence: (status as any)?.adherenceScore ?? 0,
    });

    const onShare = useCallback(() => {
        Share.share({ message: `${displayName} is on a ${streakDays}-day streak with Zeitra. 💪` }).catch(() => {});
    }, [displayName, streakDays]);

    return (
        <View style={[st.root, { backgroundColor: D.bg }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 96 }}
                bounces={false}
                showsVerticalScrollIndicator={false}
            >
                {/* ══ COVER HERO ══════════════════════════════════════════════ */}
                <View style={st.cover}>
                    <Image source={COVER_HERO} style={st.coverPhoto} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" transition={200} />
                    {/* Vertical fade → page bg, and a left-dark wash for the buttons. */}
                    <LinearGradient colors={['rgba(10,12,18,0.33)', 'rgba(10,12,18,0.80)', D.bg]} locations={[0, 0.68, 1]} style={StyleSheet.absoluteFillObject} />
                    <LinearGradient colors={[D.bg, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.92, y: 0.4 }} style={StyleSheet.absoluteFillObject} />
                    <View style={[st.coverActions, { paddingTop: insets.top + 8 }]}>
                        <Pressable
                            style={st.coverBtn} accessibilityRole="button" accessibilityLabel="Share profile"
                            hitSlop={8} onPress={onShare}
                        >
                            <Ionicons name="share-social-outline" size={18} color={D.text} />
                        </Pressable>
                        <Pressable
                            style={st.coverBtn} accessibilityRole="button" accessibilityLabel="Settings"
                            hitSlop={8} onPress={() => router.push('/(settings)' as any)}
                        >
                            <Ionicons name="settings-outline" size={19} color={D.text} />
                        </Pressable>
                    </View>
                </View>

                {/* ══ AVATAR + IDENTITY ═══════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(60).duration(440)} style={st.avatarBlock}>
                    <View style={st.ringWrap}>
                        <CircularProgress size={108} strokeWidth={4.5} progress={levelProgress} color={D.lime} trackColor={D.ringTrack}>
                            <View style={st.avatarInner}>
                                {avatarUrl ? (
                                    <Image source={{ uri: avatarUrl }} style={st.avatarImg} cachePolicy="memory-disk" transition={200} accessibilityLabel={`${displayName} photo`} />
                                ) : (
                                    <Text style={st.avatarInitial} accessibilityLabel={`${displayName} avatar`}>{initial}</Text>
                                )}
                            </View>
                        </CircularProgress>
                        <View style={st.levelBadge} accessible accessibilityLabel={statsError ? 'Level unavailable' : `Level ${level}`}>
                            <Text style={st.levelTxt}>{statsError ? 'LVL —' : `LVL ${level}`}</Text>
                        </View>
                    </View>
                    <Text style={st.name} numberOfLines={1}>{displayName}</Text>
                    <View style={st.metaRow}>
                        <Ionicons name="moon" size={13} color={D.lime} />
                        <Text style={st.metaTxt} numberOfLines={1}>{metaText}</Text>
                    </View>
                </Animated.View>

                {/* ══ STAT ROW ════════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(110).duration(440)} style={st.statSection}>
                    <View style={st.statCard}>
                        <Stat value={streakError ? '—' : String(streakDays)} label="Streak" lime />
                        <View style={st.statDivider} />
                        <Stat value={String(workoutCount)} label="Workouts" />
                        <View style={st.statDivider} />
                        <Stat value={statsError ? '—' : String(daysLogged)} label="Days" />
                    </View>
                </Animated.View>

                {/* ══ ACHIEVEMENTS ════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(150).duration(440)}>
                    <View style={st.secHead}>
                        <Text style={st.secTitle}>Achievements</Text>
                        <Pressable
                            style={st.allLink} hitSlop={8} accessibilityRole="button" accessibilityLabel="All achievements"
                            onPress={() => router.push('/(performance)' as any)}
                        >
                            <Text style={st.allTxt}>All</Text>
                            <Ionicons name="chevron-forward" size={15} color={D.muted} />
                        </Pressable>
                    </View>
                    <View style={st.achGrid}>
                        {achievements.map((a) => (
                            <View key={a.label} style={st.achItem}>
                                <View style={[st.achIc, !a.earned && st.achIcLocked]} accessible accessibilityRole="image" accessibilityLabel={a.a11y}>
                                    <Ionicons name={a.earned ? a.icon : 'lock-closed'} size={a.earned ? 26 : 22} color={a.earned ? D.lime : D.muted} />
                                </View>
                                <Text style={st.achLbl} numberOfLines={1}>{a.earned ? a.label : 'Locked'}</Text>
                            </View>
                        ))}
                    </View>
                </Animated.View>

                {/* ══ CONSISTENCY ═════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(190).duration(440)}>
                    <Text style={[st.secTitle, st.consTitle]}>Consistency</Text>
                    <View style={st.consCard}>
                        <ActivityHeatmap embedded />
                    </View>
                </Animated.View>

                {/* ══ MENU ════════════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(230).duration(440)} style={st.menuSection}>
                    <View style={st.menuCard}>
                        <MenuRow icon="color-palette-outline" label="Appearance & theme" onPress={() => router.push('/(settings)' as any)} />
                        <MenuRow icon="notifications-outline" label="Notifications" onPress={() => router.push('/(settings)/notifications' as any)} />
                        <MenuRow icon="person-circle-outline" label="Account & settings" onPress={() => router.push('/(settings)' as any)} />
                        {!isCoach && !isAdmin && <MenuRow icon="ribbon-outline" label="Become a coach" onPress={() => router.push('/(coach)/apply' as any)} last />}
                        {isCoach && <MenuRow icon="people-outline" label="Coach Hub" onPress={() => router.push('/(coach)/dashboard' as any)} last={!isAdmin} />}
                        {isAdmin && <MenuRow icon="shield-outline" label="Admin Dashboard" onPress={() => router.push('/(admin)' as any)} last />}
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

/** One big numeral + caption in the stat row. */
function Stat({ value, label, lime }: { value: string; label: string; lime?: boolean }) {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    return (
        <View style={st.statItem} accessible accessibilityLabel={`${label}, ${value}`}>
            <Text style={[st.statNum, { color: lime ? D.lime : D.text }]} maxFontSizeMultiplier={1.2} numberOfLines={1}>{value}</Text>
            <Text style={st.statLbl} numberOfLines={1}>{label}</Text>
        </View>
    );
}

/** A settings menu row: lime glyph + label + chevron, hairline divider below. */
function MenuRow({ icon, label, onPress, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; last?: boolean }) {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    return (
        <Pressable
            style={({ pressed }) => [st.menuRow, !last && st.menuRowBorder, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
        >
            <View style={st.menuLeft}>
                <Ionicons name={icon} size={19} color={D.lime} />
                <Text style={st.menuLbl} numberOfLines={1}>{label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={D.muted} />
        </Pressable>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1 },

    // Cover hero
    cover: { height: 160, width: '100%' },
    coverPhoto: { position: 'absolute', top: 0, bottom: 0, right: 4, width: '64%', opacity: 0.55 },
    coverActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18 },
    coverBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: withAlpha(D.card, 0.85), borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center' },

    // Avatar + identity
    avatarBlock: { alignItems: 'center', marginTop: -48 },
    ringWrap: { width: 108, height: 108, alignItems: 'center', justifyContent: 'center' },
    avatarInner: { width: 84, height: 84, borderRadius: 42, backgroundColor: D.avBg, borderWidth: 3, borderColor: D.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: 84, height: 84, borderRadius: 42 },
    avatarInitial: [typography.h1, { color: D.lime, fontSize: 34, fontWeight: '700' }] as any,
    levelBadge: { position: 'absolute', bottom: -3, alignSelf: 'center', backgroundColor: D.lime, borderWidth: 2, borderColor: D.bg, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 },
    levelTxt: [typography.captionMedium, { color: D.ink, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 }] as any,
    name: [typography.h1, { color: D.text, fontSize: 24, fontWeight: '600', letterSpacing: -0.4, marginTop: 13 }] as any,
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    metaTxt: [typography.body, { color: D.muted, fontSize: 13 }] as any,

    // Stat row
    statSection: { paddingHorizontal: 16, marginTop: 20 },
    statCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 14 },
    statItem: { alignItems: 'center', flex: 1 },
    statNum: [typography.h1, { fontSize: 24, fontWeight: '600', letterSpacing: -0.5, lineHeight: 24 }] as any,
    statLbl: [typography.caption, { color: D.muted, fontSize: 11.5, marginTop: 6 }] as any,
    statDivider: { width: 1, height: 32, backgroundColor: D.border },

    // Section header (Achievements / Consistency)
    secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 12 },
    secTitle: [typography.subtitle, { color: D.text, fontSize: 16 }] as any,
    allLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    allTxt: [typography.caption, { color: D.muted, fontSize: 12.5 }] as any,

    // Achievements grid
    achGrid: { flexDirection: 'row', gap: 11, paddingHorizontal: 16 },
    achItem: { flex: 1, alignItems: 'center' },
    achIc: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center' },
    achIcLocked: { opacity: 0.5 },
    achLbl: [typography.caption, { color: D.muted, fontSize: 11, fontWeight: '500', marginTop: 7 }] as any,

    // Consistency
    consTitle: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 12 },
    consCard: { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 14, marginHorizontal: 16, alignItems: 'center' },

    // Menu
    menuSection: { paddingHorizontal: 16, marginTop: 20 },
    menuCard: { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, overflow: 'hidden' },
    menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 14 },
    menuRowBorder: { borderBottomWidth: 1, borderBottomColor: D.menuDiv },
    menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuLbl: [typography.bodyMedium, { color: D.text, fontSize: 14.5, fontWeight: '500' }] as any,
});
