import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, ImageBackground
} from 'react-native';
import { SafeBlurView } from '@/components/SafeBlurView';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getPlanByDate } from '@/api/plans';
import { getMealLogs, getFastingLogs } from '@/api/meals';
import { getToday as getTodayProgress } from '@/api/progress';
import { LinearGradient } from 'expo-linear-gradient';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { format } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { colors as themeColors } from '@/theme/colors';
import { TAB_BAR_H } from './_layout';

const { width } = Dimensions.get('window');

// Bundled Aurora dark-glass art (no external host → offline-safe, no 404 /
// rate-limit). '@/*' resolves to ./src, so assets are required by relative path
// — same module-scope require pattern as (tabs)/training.tsx.
const HERO_NUTRITION = require('../../assets/images/hero-nutrition.png');

export default function NutritionHubScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // ── Queries ─────────────────────────────────────────────────────────────
    const planQuery = useQuery({
        queryKey: ['nutrition-plan', todayStr],
        queryFn: () => getPlanByDate(todayStr),
    });

    const logsQuery = useQuery({
        queryKey: ['meal-logs', todayStr],
        queryFn: () => getMealLogs(todayStr),
    });

    const progressQuery = useQuery({
        queryKey: ['daily-progress', todayStr],
        queryFn: getTodayProgress,
    });

    const fastingQuery = useQuery({
        queryKey: ['fasting-logs'],
        queryFn: () => getFastingLogs(1),
    });

    // ── Calculations ────────────────────────────────────────────────────────
    const progress = progressQuery.data;
    const plan = planQuery.data;
    const logs = Array.isArray(logsQuery.data) ? logsQuery.data : [];
    const fasting = fastingQuery.data?.[0];

    // The macro dashboard is this tab's primary content; it's driven by the
    // daily-progress (targets) + meal-logs (consumed) reads. Surface explicit
    // loading / error-with-retry states for those instead of silently rendering
    // fallback defaults (2400kcal / 0 consumed) while they load or after a
    // failure. Retry re-runs every query feeding the tab in one tap.
    const macroLoading = progressQuery.isLoading || logsQuery.isLoading;
    const macroError = progressQuery.isError || logsQuery.isError;
    // TanStack `refetch` fns are stable across renders, so depending on them
    // keeps this callback stable too (avoids re-rendering the memoized EmptyState).
    const planRefetch = planQuery.refetch;
    const logsRefetch = logsQuery.refetch;
    const progressRefetch = progressQuery.refetch;
    const fastingRefetch = fastingQuery.refetch;
    const refetchAll = useCallback(() => {
        planRefetch();
        logsRefetch();
        progressRefetch();
        fastingRefetch();
    }, [planRefetch, logsRefetch, progressRefetch, fastingRefetch]);

    const stats = useMemo(() => {
        const target = {
            calories: progress?.caloriesTarget || 2400,
            protein: progress?.proteinTarget || 180,
            carbs: progress?.carbsTarget || 200,
            fat: progress?.fatTarget || 70,
        };

        const consumed = logs.reduce((acc, log) => ({
            calories: acc.calories + (log.totalCalories || 0),
            protein: acc.protein + (log.totalProtein || 0),
            carbs: acc.carbs + (log.totalCarbs || 0),
            fat: acc.fat + (log.totalFat || 0),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        return { target, consumed };
    }, [progress, logs]);

    // Stable navigation handlers so the memoized ToolCards don't re-render on
    // unrelated parent updates.
    const openLibrary = useCallback(() => router.push('/(meals)/encyclopedia' as any), [router]);
    const openRecipes = useCallback(() => router.push('/(meals)/recipes' as any), [router]);
    const openGrocery = useCallback(() => router.push('/(meals)/grocery' as any), [router]);

    return (
        <ImageBackground
            blurRadius={4}
            source={HERO_NUTRITION}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.25 }}
        >
            {/* Translucent light status bar so the blurred food photo bleeds
                under the notch. Mirrors the global root StatusBar (idempotent)
                and makes the intent explicit at the screen level. */}
            <StatusBar style="light" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['rgba(10,10,13,0.85)', colors.background.primary]}
                style={StyleSheet.absoluteFillObject}
            />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 80 }}
            >
                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>
                            {format(new Date(), 'EEEE, MMM d').toUpperCase()}
                        </Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 34, marginTop: 4 }]}>
                            Nutrition
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 2 }]}>
                            Fueling your {(progress as any)?.shiftType || 'Rotation'} shift.
                        </Text>
                    </View>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="View log"
                        activeOpacity={0.85}
                        style={[styles.historyBtn, { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default }, shadows.sm]}
                        onPress={() => router.push('/(meals)/log-meal' as any)}
                    >
                        <Ionicons name="receipt-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>

                {/* Macro Dashboard */}
                {macroLoading ? (
                    <Card variant="glass" style={styles.macroDashboard}>
                        <Skeleton width={180} height={180} radius={borderRadius.full} style={{ marginBottom: 30 }} />
                        <View style={styles.macroGrid}>
                            {[0, 1, 2].map((i) => (
                                <Skeleton key={i} width="100%" height={28} radius={borderRadius.md} />
                            ))}
                        </View>
                    </Card>
                ) : macroError ? (
                    <Card variant="glass" style={styles.macroDashboard}>
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load your macros"
                            subtitle="Check your connection and try again."
                            actionLabel="Retry"
                            onAction={refetchAll}
                        />
                    </Card>
                ) : (
                <Card variant="glass" style={styles.macroDashboard}>
                    {/* SVG has no implicit text → expose the ring to TalkBack /
                        VoiceOver as a single labelled summary. accessible groups
                        the numeral + label so they aren't read as two fragments. */}
                    <View
                        style={[styles.mainCircle, shadows.glow(colors.accent.emerald)]}
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel={`${Math.max(0, stats.target.calories - stats.consumed.calories)} kcal left of ${stats.target.calories}`}
                    >
                        <CircularProgress
                            progress={stats.target.calories > 0 ? stats.consumed.calories / stats.target.calories : 0}
                            size={180}
                            strokeWidth={12}
                            color={colors.accent.emerald}
                            trackColor={colors.background.tertiary}
                        />
                        <View style={styles.circleText}>
                            <Text
                                style={[typography.statLarge, { color: colors.text.primary, fontSize: 44, lineHeight: 50 }]}
                                maxFontSizeMultiplier={1.3}
                                allowFontScaling
                            >
                                {Math.max(0, stats.target.calories - stats.consumed.calories)}
                            </Text>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>KCAL LEFT</Text>
                        </View>
                    </View>

                    {/* At-a-glance + screen-reader friendly consumed/target line. */}
                    <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 18 }]}>
                        {`consumed ${Math.round(stats.consumed.calories)} / target ${stats.target.calories} kcal`}
                    </Text>

                    <View style={styles.macroGrid}>
                        <MacroItem label="Protein" current={stats.consumed.protein} target={stats.target.protein} color={colors.accent.emerald} unit="g" />
                        <MacroItem label="Carbs" current={stats.consumed.carbs} target={stats.target.carbs} color={colors.accent.cyan} unit="g" />
                        <MacroItem label="Fat" current={stats.consumed.fat} target={stats.target.fat} color={colors.accent.amber} unit="g" />
                    </View>
                </Card>
                )}

                {/* Quick Tools */}
                <Text style={[typography.overline, { color: colors.text.secondary, marginHorizontal: 20, marginTop: 28, marginBottom: 12 }]}>
                    Quick Tools
                </Text>
                <View style={styles.toolRow}>
                    <ToolCard
                        icon="search"
                        title="Library"
                        color={colors.accent.cyan}
                        onPress={openLibrary}
                    />
                    <ToolCard
                        icon="restaurant"
                        title="Recipes"
                        color={colors.accent.purple}
                        onPress={openRecipes}
                    />
                    <ToolCard
                        icon="cart"
                        title="Grocery"
                        color={colors.accent.emerald}
                        onPress={openGrocery}
                    />
                </View>

                {/* Daily Plan Section */}
                <View style={[styles.section, { marginTop: 32 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>Daily Plan</Text>
                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => router.push('/(meals)/planner' as any)}>
                            <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold' }]}>EDIT PLAN</Text>
                        </TouchableOpacity>
                    </View>

                    {planQuery.isLoading ? (
                        <View style={styles.planList}>
                            {[0, 1, 2].map((i) => (
                                <Skeleton key={i} width="100%" height={72} radius={borderRadius.xl} />
                            ))}
                        </View>
                    ) : planQuery.isError ? (
                        // Distinct error tone (never falls through to the empty
                        // "Generate plan" CTA). Retry re-runs every query feeding
                        // this tab so a transient failure recovers in one tap.
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load nutrition"
                            subtitle="Check your connection and try again."
                            actionLabel="Retry"
                            onAction={refetchAll}
                        />
                    ) : !plan || !((plan.meals || []).some((m: any) => m && (m.label || m.name))) ? (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="No plan generated for today. Generate plan."
                            style={{ borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.default }}
                            onPress={() => router.push('/(meals)/planner' as any)}
                        >
                            <SafeBlurView
                                tint="dark"
                                intensity={40}
                                style={[styles.emptyPlan, { backgroundColor: 'transparent' }]}
                            >
                                <View style={[styles.emptyPlanIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.12), borderColor: withAlpha(colors.accent.purple, 0.24) }, shadows.glow(colors.accent.purple)]}>
                                    <Ionicons name="sparkles" size={26} color={colors.accent.purple} />
                                </View>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 14 }]}>No plan generated for today</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 6, maxWidth: 240, lineHeight: 18 }]}>Tap to let Ria build your protocol-compliant meals.</Text>
                                <View style={[styles.emptyPlanCta, { backgroundColor: withAlpha(colors.accent.purple, 0.14) }]}>
                                    <Text style={[typography.caption, { color: colors.accent.purpleLight, fontWeight: 'bold', letterSpacing: 0.5 }]}>GENERATE PLAN</Text>
                                </View>
                            </SafeBlurView>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.planList}>
                            {(plan.meals || []).filter((m: any) => m && (m.label || m.name)).map((m: any, i: number) => (
                                <TouchableOpacity
                                    key={i}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Log ${m.label || m.name}${m.time ? `, ${m.time}` : ''}`}
                                    style={{ borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                                    onPress={() => router.push({ pathname: '/(meals)/log-meal', params: { preset: m.label } })}
                                >
                                    <SafeBlurView
                                        tint="dark"
                                        intensity={40}
                                        style={styles.mealCard}
                                    >
                                        <View style={[styles.mealTime, { backgroundColor: withAlpha(colors.background.tertiary, 0.4) }]}>
                                            <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>{m.time}</Text>
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 16 }}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{m.label || m.name}</Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1}>{m.description}</Text>
                                        </View>
                                        <Ionicons name="add-circle" size={24} color={colors.accent.emerald} />
                                    </SafeBlurView>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Fasting Card */}
                <View style={styles.section}>
                    <View style={[{ borderRadius: borderRadius['2xl'], overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.accent.cyan, 0.4) }, shadows.glow(colors.accent.cyan)]}>
                        <SafeBlurView
                            tint="dark"
                            intensity={40}
                            style={styles.fastCard}
                        >
                            <LinearGradient colors={[withAlpha(colors.accent.cyan, 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                            <View style={styles.fastHeader}>
                                <View style={styles.fastTitle}>
                                    <Ionicons name="timer" size={24} color={colors.accent.cyan} />
                                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginLeft: 12 }]}>Fasting Timer</Text>
                                </View>
                                <View style={[styles.fastBadge, { backgroundColor: withAlpha(colors.accent.cyan, 0.1) }]}>
                                    <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: 'bold' }]}>{fasting?.status === 'ACTIVE' ? 'IN PROGRESS' : 'IDLE'}</Text>
                                </View>
                            </View>

                            <View style={styles.fastBody}>
                                <View>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>Protocol</Text>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>16:8 Windows</Text>
                                </View>
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel={fasting?.status === 'ACTIVE' ? 'View timer' : 'Start fast'}
                                    style={[styles.fastAction, { backgroundColor: colors.accent.cyan }, shadows.glow(colors.accent.cyan)]}
                                    onPress={() => router.push('/(meals)/fasting' as any)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[typography.caption, { color: themeColors.background.primary, fontWeight: 'bold' }]}>
                                        {fasting?.status === 'ACTIVE' ? 'VIEW TIMER' : 'START FAST'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </SafeBlurView>
                    </View>
                </View>
            </ScrollView>

        </ImageBackground>
    );
}

const MacroItem = React.memo(function MacroItem({ label, current, target, color, unit }: any) {
    const { colors, typography, borderRadius } = useTheme();
    const progress = target > 0 ? Math.min(1, current / target) : 0;

    return (
        <View style={styles.macroItem}>
            {/* Group the label + numeric value so screen readers announce one
                coherent statement ("Protein: 90 of 180 grams") instead of two
                disjoint fragments. Color is never the sole signal — every bar
                carries a text label and numeric value. */}
            <View
                style={styles.macroLabelRow}
                accessible
                accessibilityLabel={`${label}: ${Math.round(current)} of ${target} grams`}
            >
                <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold' }]}>{label.toUpperCase()}</Text>
                <Text style={[typography.caption, { color: colors.text.primary }]}>{Math.round(current)}{unit} / {target}{unit}</Text>
            </View>
            <View style={[styles.barBg, { backgroundColor: colors.background.tertiary, borderRadius: 4 }]}>
                <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: color, borderRadius: 4 }]} />
            </View>
        </View>
    );
});

const ToolCard = React.memo(function ToolCard({ icon, title, color, onPress }: any) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={title}
            style={[{ flex: 1, borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }]}
            onPress={onPress}
            activeOpacity={0.85}
        >
            <SafeBlurView
                tint="dark"
                intensity={40}
                style={styles.toolCard}
            >
                <View style={[styles.toolIcon, { backgroundColor: `${color}15` }]}>
                    <Ionicons name={icon} size={22} color={color} />
                </View>
                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginTop: 8 }]}>{title}</Text>
            </SafeBlurView>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
    historyBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    macroDashboard: { marginHorizontal: 20, padding: 24, alignItems: 'center' },
    mainCircle: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    circleText: { position: 'absolute', alignItems: 'center' },
    macroGrid: { width: '100%', gap: 16 },
    macroItem: { width: '100%' },
    macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    barBg: { height: 6, width: '100%' },
    barFill: { height: '100%' },
    toolRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
    toolCard: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
    toolIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    section: { paddingHorizontal: 20, marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    emptyPlan: { paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
    emptyPlanIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    emptyPlanCta: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    planList: { gap: 12 },
    mealCard: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    mealTime: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    fastCard: { padding: 20 },
    fastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    fastTitle: { flexDirection: 'row', alignItems: 'center' },
    fastBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    fastBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    fastAction: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    fab: { position: 'absolute', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: themeColors.accent.coral, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
});
