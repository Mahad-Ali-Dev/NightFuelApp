/**
 * Profile tab — user profile + full feature-discovery hub.
 *
 * Because this is now a visible tab (not a pushed screen) the back
 * button is removed and replaced with a Settings shortcut.
 * A "More features" grid at the bottom exposes everything not in
 * the main tab bar.
 */
import React from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Dimensions, ActivityIndicator,
} from 'react-native';
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
import { TAB_BAR_H } from './_layout';

const { width } = Dimensions.get('window');
const H_PAD = 20;
const CARD_GAP = 12;
const COL_W = (width - H_PAD * 2 - CARD_GAP) / 2;

// ─── Feature hub items ────────────────────────────────────────────────────────

const HUB_FEATURES = [
    { id: 'shifts', label: 'Shifts', icon: 'calendar', color: '#FFB300', route: '/(shifts)' },
    { id: 'exercises', label: 'Exercises', icon: 'barbell', color: '#FF4444', route: '/(exercises)' },
    { id: 'sleep', label: 'Sleep Tracker', icon: 'moon', color: '#7C4DFF', route: '/(modals)/log-sleep' },
    { id: 'community', label: 'Community', icon: 'people', color: '#4FC3F7', route: '/(community)' },
    { id: 'coaches', label: 'Coaches', icon: 'person-circle', color: '#FF6B35', route: '/coaches/browse' },
    { id: 'circadian', label: 'Circadian', icon: 'radio-button-on', color: '#B47CFF', route: '/(tabs)/circadian' },
    { id: 'plan', label: "Today's Plan", icon: 'flash', color: '#00D4AA', route: '/(tabs)/circadian' },
    { id: 'settings', label: 'Settings', icon: 'settings-outline', color: '#8B949E', route: '/(settings)' },
] as const;

const ACHIEVEMENTS = [
    { title: 'Early Riser', desc: '30 Day Streak', icon: 'trophy', color: '#FFB300' },
    { title: 'Mindful', desc: '50 Sessions', icon: 'body', color: '#00D4AA' },
    { title: 'Night Owl', desc: 'Top 5%', icon: 'moon', color: '#7C4DFF' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const router = useRouter();

    const { data: profile, isLoading } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    const { data: status } = useQuery({ queryKey: ['my-status'], queryFn: getStatus });
    const { data: stats } = useQuery({ queryKey: ['profile-weekly-stats'], queryFn: getWeeklyStats });
    const { data: streak } = useQuery({ queryKey: ['profile-streak'], queryFn: getStreak });

    const isCoach = ['COACH', 'TRAINER', 'NUTRITIONIST', 'coach'].includes(user?.role ?? '');
    const isAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

    if (isLoading) {
        return (
            <View style={[s.root, { backgroundColor: colors.background.primary, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.purple} />
            </View>
        );
    }

    return (
        <View style={[s.root, { backgroundColor: colors.background.primary }]}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 40 }}
                bounces={false}
                showsVerticalScrollIndicator={false}
            >
                {/* ══ COVER + HEADER ══════════════════════════════════════════ */}
                <View style={[s.cover, { paddingTop: insets.top }]}>
                    <LinearGradient
                        colors={[C.background.quaternary, colors.background.primary]}
                        style={StyleSheet.absoluteFillObject}
                    />
                    <View style={[s.navHeader, { marginTop: insets.top > 0 ? 0 : 8 }]}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>
                            Profile
                        </Text>
                        <View style={s.navRight}>
                            <TouchableOpacity
                                style={[s.iconBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                                onPress={() => router.push('/(settings)' as any)}
                            >
                                <Ionicons name="settings-outline" size={20} color={colors.text.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.iconBtn, { backgroundColor: withAlpha(C.error, 0.10) }]}
                                onPress={logout}
                            >
                                <Ionicons name="log-out-outline" size={20} color={C.error} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* ══ AVATAR ══════════════════════════════════════════════════ */}
                <View style={s.avatarWrap}>
                    <View style={[s.avatarRing, { backgroundColor: colors.background.primary, borderColor: colors.accent.cyan }]}>
                        {(profile as any)?.avatarUrl ? (
                            <Image source={{ uri: (profile as any).avatarUrl }} style={s.avatar} />
                        ) : (
                            <View style={[s.avatar, { backgroundColor: colors.background.tertiary, alignItems: 'center', justifyContent: 'center' }]}>
                                <Ionicons name="person" size={56} color={colors.text.tertiary} />
                            </View>
                        )}
                    </View>
                    <View style={[s.onlineDot, { borderColor: colors.background.primary, backgroundColor: colors.success }]} />
                </View>

                <View style={s.details}>
                    {/* Name + title */}
                    <Text style={[typography.display, { color: colors.text.primary, fontSize: 26, textAlign: 'center' }]}>
                        {(profile as any)?.displayName ?? user?.name}
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4, textAlign: 'center' }]}>
                        {(profile as any)?.occupation ?? 'Member'} · Level {Math.floor(((stats?.daysLogged ?? 0)) / 7) + 1}
                    </Text>
                    {!!(profile as any)?.aboutMe && (
                        <Text style={[typography.body, { color: colors.text.tertiary, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 }]}>
                            {(profile as any).aboutMe}
                        </Text>
                    )}

                    {/* Action buttons */}
                    <View style={s.actionRow}>
                        <TouchableOpacity
                            style={[s.btnPrimary, { backgroundColor: colors.accent.purple, borderRadius: borderRadius.xl }]}
                            onPress={() => router.push('/(tabs)/profile/edit' as any)}
                        >
                            <Ionicons name="create-outline" size={17} color="#fff" />
                            <Text style={[s.btnTxt, { color: '#fff' }]}>Edit Profile</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.btnSecondary, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}
                            onPress={() => router.push('/(tabs)/profile/preferences' as any)}
                        >
                            <Ionicons name="options-outline" size={17} color={colors.text.primary} />
                            <Text style={[s.btnTxt, { color: colors.text.primary }]}>Preferences</Text>
                        </TouchableOpacity>
                    </View>

                    {isAdmin && (
                        <TouchableOpacity
                            style={[s.adminBtn, { backgroundColor: C.error, borderRadius: borderRadius.xl }]}
                            onPress={() => router.push('/(admin)' as any)}
                        >
                            <Ionicons name="shield" size={17} color="#fff" />
                            <Text style={[s.btnTxt, { color: '#fff' }]}>Admin Dashboard</Text>
                        </TouchableOpacity>
                    )}

                    {/* Stats */}
                    <View style={s.statsRow}>
                        <StatPill label="FATIGUE" value={`${(status as any)?.fatigueScore ?? 0}%`} color={C.warning} colors={colors} />
                        <StatPill label="STREAK" value={`${streak?.current ?? 0}d`} color={C.accent.cyan} colors={colors} />
                        <StatPill label="ADHERENCE" value={`${(status as any)?.adherenceScore ?? 0}%`} color={C.success} colors={colors} />
                    </View>

                    {/* Circadian phase card */}
                    <View style={[s.circCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.07) }]}>
                        <View style={s.circHeader}>
                            <Ionicons name="sunny-outline" size={18} color={C.accent.amber} />
                            <Text style={[s.circLabel, { color: colors.text.tertiary }]}>CIRCADIAN PHASE</Text>
                        </View>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginTop: 10 }]}>
                            {(status as any)?.circadianPhase ?? '—'}
                        </Text>
                        <Text style={[typography.body, { color: colors.text.tertiary, marginTop: 4 }]}>
                            Your metabolic window is currently optimised for activity.
                        </Text>
                        <TouchableOpacity
                            style={[s.circBtn, { backgroundColor: withAlpha(C.accent.amber, 0.12), borderColor: withAlpha(C.accent.amber, 0.25) }]}
                            onPress={() => router.push('/(tabs)/circadian' as any)}
                        >
                            <Text style={[s.circBtnTxt, { color: C.accent.amber }]}>View Full Schedule →</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Achievements */}
                    <Text style={[s.sectionLbl, { color: colors.text.tertiary }]}>ACHIEVEMENTS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                        {ACHIEVEMENTS.map((ach, i) => (
                            <View key={i} style={[s.achCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.06) }]}>
                                <View style={[s.achIcon, { backgroundColor: withAlpha(ach.color, 0.13) }]}>
                                    <Ionicons name={ach.icon as any} size={24} color={ach.color} />
                                </View>
                                <Text style={[s.achTitle, { color: colors.text.primary }]}>{ach.title}</Text>
                                <Text style={[s.achDesc, { color: colors.text.tertiary }]}>{ach.desc}</Text>
                            </View>
                        ))}
                    </ScrollView>

                    {/* ══ MORE FEATURES HUB (Moved to Home) ═══════════════════════════════════ */}

                    {/* Coach Hub button (coach users only) */}
                    {isCoach && (
                        <TouchableOpacity
                            style={[s.coachBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.12), borderColor: withAlpha(colors.accent.purple, 0.3) }]}
                            onPress={() => router.push('/(coach)/dashboard' as any)}
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

function StatPill({ label, value, color, colors }: { label: string; value: string; color: string; colors: any }) {
    return (
        <View style={[s.statPill, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.06) }]}>
            <Text style={[s.statValue, { color }]}>{value}</Text>
            <Text style={[s.statLabel, { color: colors.text.tertiary }]}>{label}</Text>
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
    btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13 },
    btnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderWidth: 1 },
    btnTxt: { fontSize: 14, fontWeight: '700' },
    adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 13, marginBottom: 24 },

    // Stats
    statsRow: { flexDirection: 'row', width: '100%', gap: CARD_GAP, marginBottom: 20 },
    statPill: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, borderWidth: 1 },
    statValue: { fontSize: 20, fontWeight: '900' },
    statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 3 },

    // Circadian
    circCard: { width: '100%', padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 28 },
    circHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    circLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    circBtn: { marginTop: 14, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
    circBtnTxt: { fontSize: 13, fontWeight: '700' },

    // Section label
    sectionLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, alignSelf: 'flex-start', marginBottom: 14 },

    // Achievements
    achCard: { width: 120, padding: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center' },
    achIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    achTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    achDesc: { fontSize: 11, textAlign: 'center', marginTop: 2 },

    // More features hub
    hubGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, width: '100%', marginBottom: 20 },
    hubCard: { width: COL_W, padding: 16, borderRadius: 18, borderWidth: 1, alignItems: 'flex-start' },
    hubIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    hubLabel: { fontSize: 13, fontWeight: '700' },

    // Coach button
    coachBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', padding: 16, borderRadius: 18, borderWidth: 1 },
    coachBtnTxt: { flex: 1, fontSize: 14, fontWeight: '700' },
});
