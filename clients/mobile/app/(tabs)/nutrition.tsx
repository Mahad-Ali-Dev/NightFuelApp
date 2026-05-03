import React, { useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, ActivityIndicator, Image, ImageBackground
} from 'react-native';
import { BlurView } from 'expo-blur';
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
import { format } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { colors as themeColors } from '@/theme/colors';
import { TAB_BAR_H } from './_layout';

const { width } = Dimensions.get('window');

export default function NutritionHubScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
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

    return (
        <ImageBackground
            blurRadius={4}
            source={{ uri: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80' }}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.25 }}
        >
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
                    <View>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 32, fontWeight: '900' }]}>
                            Nutrition
                        </Text>
                        <Text style={[typography.body, { color: colors.text.tertiary }]}>
                            Fueling your {(progress as any)?.shiftType || 'Rotation'} phase.
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.historyBtn, { backgroundColor: colors.background.secondary }]}
                        onPress={() => router.push('/(meals)/log-meal' as any)}
                    >
                        <Ionicons name="receipt-outline" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>

                {/* Macro Dashboard */}
                <View style={styles.macroDashboard}>
                    <View style={styles.mainCircle}>
                        <CircularProgress
                            progress={stats.target.calories > 0 ? stats.consumed.calories / stats.target.calories : 0}
                            size={180}
                            strokeWidth={12}
                            color={colors.accent.emerald}
                            trackColor={colors.background.tertiary}
                        />
                        <View style={styles.circleText}>
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 36 }]}>
                                {Math.max(0, stats.target.calories - stats.consumed.calories)}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold' }]}>KCAL LEFT</Text>
                        </View>
                    </View>

                    <View style={styles.macroGrid}>
                        <MacroItem label="Protein" current={stats.consumed.protein} target={stats.target.protein} color={colors.accent.emerald} unit="g" />
                        <MacroItem label="Carbs" current={stats.consumed.carbs} target={stats.target.carbs} color={colors.accent.cyan} unit="g" />
                        <MacroItem label="Fat" current={stats.consumed.fat} target={stats.target.fat} color={colors.accent.amber} unit="g" />
                    </View>
                </View>

                {/* Quick Tools */}
                <View style={styles.toolRow}>
                    <ToolCard
                        icon="search"
                        title="Library"
                        color={colors.accent.cyan}
                        onPress={() => router.push('/(meals)/encyclopedia' as any)}
                    />
                    <ToolCard
                        icon="restaurant"
                        title="Recipes"
                        color={colors.accent.purple}
                        onPress={() => router.push('/(meals)/recipes' as any)}
                    />
                    <ToolCard
                        icon="cart"
                        title="Grocery"
                        color={colors.accent.emerald}
                        onPress={() => router.push('/(meals)/grocery' as any)}
                    />
                </View>

                {/* Daily Plan Section */}
                <View style={[styles.section, { marginTop: 32 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>Daily Plan</Text>
                        <TouchableOpacity onPress={() => router.push('/(meals)/planner' as any)}>
                            <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold' }]}>EDIT PLAN</Text>
                        </TouchableOpacity>
                    </View>

                    {planQuery.isLoading ? (
                        <ActivityIndicator color={colors.accent.emerald} style={{ marginTop: 20 }} />
                    ) : !plan ? (
                        <TouchableOpacity
                            style={{ borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.default }}
                            onPress={() => router.push('/(meals)/planner' as any)}
                        >
                            <BlurView
                                tint="dark"
                                intensity={40}
                                style={[styles.emptyPlan, { backgroundColor: 'transparent' }]}
                            >
                                <Ionicons name="sparkles" size={24} color={colors.accent.purple} />
                                <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8 }]}>No plan generated for today</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 4 }]}>Tap to let Ria build your protocol-compliant meals.</Text>
                            </BlurView>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.planList}>
                            {(plan.meals || []).map((m: any, i: number) => (
                                <TouchableOpacity
                                    key={i}
                                    style={{ borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                                    onPress={() => router.push({ pathname: '/(meals)/log-meal', params: { preset: m.label } })}
                                >
                                    <BlurView
                                        tint="dark"
                                        intensity={40}
                                        style={styles.mealCard}
                                    >
                                        <View style={[styles.mealTime, { backgroundColor: withAlpha(colors.background.tertiary, 0.4) }]}>
                                            <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>{m.time}</Text>
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 16 }}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{m.label}</Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>{m.description}</Text>
                                        </View>
                                        <Ionicons name="add-circle" size={24} color={colors.accent.emerald} />
                                    </BlurView>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Fasting Card */}
                <View style={styles.section}>
                    <View style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.accent.cyan }}>
                        <BlurView
                            tint="dark"
                            intensity={40}
                            style={styles.fastCard}
                        >
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
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>Protocol</Text>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>16:8 Windows</Text>
                                </View>
                                <TouchableOpacity
                                    style={[styles.fastAction, { backgroundColor: colors.accent.cyan }]}
                                    onPress={() => router.push('/(meals)/fasting' as any)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[typography.caption, { color: themeColors.background.primary, fontWeight: 'bold' }]}>
                                        {fasting?.status === 'ACTIVE' ? 'VIEW TIMER' : 'START FAST'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </BlurView>
                    </View>
                </View>
            </ScrollView>

        </ImageBackground>
    );
}

function MacroItem({ label, current, target, color, unit }: any) {
    const { colors, typography, borderRadius } = useTheme();
    const progress = target > 0 ? Math.min(1, current / target) : 0;

    return (
        <View style={styles.macroItem}>
            <View style={styles.macroLabelRow}>
                <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold' }]}>{label.toUpperCase()}</Text>
                <Text style={[typography.caption, { color: colors.text.primary }]}>{Math.round(current)}{unit} / {target}{unit}</Text>
            </View>
            <View style={[styles.barBg, { backgroundColor: colors.background.tertiary, borderRadius: 4 }]}>
                <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: color, borderRadius: 4 }]} />
            </View>
        </View>
    );
}

function ToolCard({ icon, title, color, onPress }: any) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <TouchableOpacity
            style={[{ flex: 1, borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <BlurView
                tint="dark"
                intensity={40}
                style={styles.toolCard}
            >
                <View style={[styles.toolIcon, { backgroundColor: `${color}15` }]}>
                    <Ionicons name={icon} size={22} color={color} />
                </View>
                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginTop: 8 }]}>{title}</Text>
            </BlurView>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
    historyBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    macroDashboard: { padding: 20, alignItems: 'center' },
    mainCircle: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
    circleText: { position: 'absolute', alignItems: 'center' },
    macroGrid: { width: '100%', gap: 16 },
    macroItem: { width: '100%' },
    macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    barBg: { height: 6, width: '100%' },
    barFill: { height: '100%' },
    toolRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginTop: 10 },
    toolCard: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
    toolIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    section: { paddingHorizontal: 20, marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    emptyPlan: { padding: 40, alignItems: 'center', justifyContent: 'center' },
    planList: { gap: 12 },
    mealCard: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    mealTime: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    fastCard: { padding: 20 },
    fastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    fastTitle: { flexDirection: 'row', alignItems: 'center' },
    fastBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    fastBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    fastAction: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    fab: { position: 'absolute', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
});
