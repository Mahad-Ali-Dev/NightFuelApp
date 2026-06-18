import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTheme, spacing as spacingTokens, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, log } from '@/api/sleep';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

export default function SleepOptimizerScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: analytics, isLoading, isError, refetch } = useQuery({
        queryKey: ['sleep-analytics'],
        queryFn: getAnalytics,
    });

    const logMutation = useMutation({
        mutationFn: () => {
            const end = new Date();
            const start = new Date(end.getTime() - (8 * 60 * 60 * 1000)); // 8 hours ago
            return log({ startTime: start.toISOString(), endTime: end.toISOString() });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sleep-analytics'] });
            Alert.alert('Sleep Logged', 'Your sleep block has been recorded successfully.');
        },
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to log sleep. Please try again.');
        },
    });

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Sleep Optimizer</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                    {/* Hero score card */}
                    <View style={{ alignItems: 'center', marginBottom: spacing['3xl'] }}>
                        <Skeleton width={140} height={140} radius={borderRadius.full} style={{ marginVertical: spacing.xl }} />
                        <Skeleton width="90%" height={14} radius={borderRadius.sm} style={{ marginBottom: spacing.sm }} />
                        <Skeleton width="70%" height={14} radius={borderRadius.sm} />
                    </View>
                    {/* Section header */}
                    <Skeleton width={180} height={16} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                    {/* Window cards */}
                    <Skeleton width="100%" height={96} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={96} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
                    {/* Log button */}
                    <Skeleton width="100%" height={56} radius={borderRadius.full} />
                </ScrollView>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load sleep analytics"
                    subtitle="Something went wrong fetching your recovery data. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                    {/* Hero Score */}
                    <Card
                        variant="glass"
                        style={[
                            styles.heroCard,
                            { borderColor: withAlpha(colors.accent.purple, 0.3) },
                            shadows.glow(colors.accent.purple),
                        ]}
                    >
                        <LinearGradient
                            colors={[withAlpha(colors.accent.purple, 0.14), 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                        />
                        <Text style={[typography.overline, { color: colors.accent.purple, marginBottom: spacing.xl }]}>Sleep Quality Score</Text>
                        <View style={styles.heroSection}>
                            <View style={shadows.glow(colors.accent.purple)}>
                                <CircularProgress progress={(analytics?.qualityScore ?? 0) / 100} size={140} strokeWidth={12} color={colors.accent.purple} trackColor={colors.background.tertiary} />
                            </View>
                            <View style={styles.heroTextOverlay}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{analytics?.qualityScore ?? '--'}</Text>
                                <Text style={[typography.overline, { color: colors.accent.purple, marginTop: spacing.xs }]}>QUALITY</Text>
                            </View>
                        </View>

                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xl, marginHorizontal: spacing.sm }]}>
                            {analytics?.summary ?? 'Log a sleep block to see your recovery analytics.'}
                        </Text>
                    </Card>

                    {/* Recommendations */}
                    <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.lg }]}>Recommended Windows</Text>

                    <Card variant="glass" style={[styles.windowCard, { borderColor: withAlpha(colors.accent.purple, 0.25) }]}>
                        <View style={styles.windowHeader}>
                            <View style={[styles.windowIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.28), borderWidth: 1 }]}>
                                <Ionicons name="moon" size={18} color={colors.accent.purple} />
                            </View>
                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: spacing.md }]}>Anchor Sleep</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[typography.statTiny, { color: colors.accent.cyan }]}>{analytics?.anchorSleepWindow ?? '—'}</Text>
                        </View>
                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.md }]}>Total darkness required. Avoid light exposure upon shift exit.</Text>
                    </Card>

                    <Card variant="glass" style={[styles.windowCard, { borderColor: withAlpha(colors.accent.amber, 0.25) }]}>
                        <View style={styles.windowHeader}>
                            <View style={[styles.windowIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.14), borderColor: withAlpha(colors.accent.amber, 0.28), borderWidth: 1 }]}>
                                <Ionicons name="battery-charging" size={18} color={colors.accent.amber} />
                            </View>
                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: spacing.md }]}>Pre-Shift Nap</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[typography.statTiny, { color: colors.accent.amber }]}>{analytics?.preShiftNapWindow ?? '—'}</Text>
                        </View>
                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.md }]}>90-minute cycle to top off cognitive alertness before shift.</Text>
                    </Card>

                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Log rest block"
                        accessibilityState={{ disabled: logMutation.isPending, busy: logMutation.isPending }}
                        style={[styles.logBtn, shadows.glow(colors.accent.purple)]}
                        onPress={() => logMutation.mutate()}
                        disabled={logMutation.isPending}
                    >
                        <LinearGradient
                            colors={colors.gradients.purple}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.logBtnGradient}
                        >
                            {logMutation.isPending ? (
                                <ActivityIndicator color={colors.text.primary} />
                            ) : (
                                <>
                                    <Ionicons name="bed" size={20} color={colors.text.primary} style={{ marginRight: spacing.sm }} />
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Log Rest Block</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacingTokens.xl, paddingBottom: spacingTokens.lg, borderBottomWidth: 1 },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroCard: {
        alignItems: 'center',
        padding: spacingTokens['2xl'],
        marginBottom: spacingTokens['3xl'],
        overflow: 'hidden',
    },
    heroSection: { alignItems: 'center', justifyContent: 'center' },
    heroTextOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    windowCard: { padding: spacingTokens.lg, marginBottom: spacingTokens.lg },
    windowHeader: { flexDirection: 'row', alignItems: 'center' },
    windowIcon: {
        width: 36,
        height: 36,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logBtn: {
        height: 56,
        borderRadius: borderRadius.full,
        marginTop: spacingTokens.lg,
        overflow: 'hidden',
    },
    logBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
