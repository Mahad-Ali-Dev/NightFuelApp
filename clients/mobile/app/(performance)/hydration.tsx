import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToday, logHydration } from '@/api/progress';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { EmptyState } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

const { width } = Dimensions.get('window');

const PRESETS = [250, 500, 750];

export default function HydrationTrackerScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const todayQuery = useQuery({
        queryKey: ['today-progress'],
        queryFn: getToday,
    });

    const mutation = useMutation({
        mutationFn: (amount: number) => logHydration(amount),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['today-progress'] });
        },
    });

    const progress = todayQuery.data;
    const current = progress?.hydrationActual || progress?.hydrationMl || 0;
    const target = progress?.hydrationTargetMl ?? 3000;
    const pct = Math.min(1, current / target);

    const handleAdd = (amount: number) => {
        mutation.mutate(amount);
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Hydration Tracker</Text>
                <View style={{ width: 40 }} />
            </View>

            {todayQuery.isError ? (
                <View style={styles.centered}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load hydration"
                        subtitle="Something went wrong fetching today's intake. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => todayQuery.refetch()}
                    />
                </View>
            ) : (
              <>
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Main Progress Circle */}
                <View style={styles.centerSection}>
                    <View style={styles.ringWrapper}>
                        {/* Outer Glow */}
                        <View style={[styles.glow, { backgroundColor: colors.accent.cyan }]} />
                        <View style={shadows.glow(colors.accent.cyan)}>
                            <CircularProgress progress={pct} size={240} strokeWidth={16} color={colors.accent.cyan} trackColor={colors.border.default} />
                        </View>
                        <View style={styles.ringInner}>
                            <Ionicons name="water" size={44} color={colors.accent.cyan} />
                            <Text style={[styles.bigStat, { color: colors.text.primary }]}>
                                {current}
                            </Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                                OF {target} ML
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Tracking Presets */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.lg, textAlign: 'center' }]}>Add Liquid</Text>
                    <View style={styles.presetsRow}>
                        {PRESETS.map((amount) => (
                            <TouchableOpacity
                                key={amount}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`Add ${amount} ml`}
                                accessibilityState={{ disabled: mutation.isPending }}
                                style={[styles.presetBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}
                                onPress={() => handleAdd(amount)}
                                disabled={mutation.isPending}
                            >
                                <View style={[styles.presetIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.14) }]}>
                                    <Ionicons name="add" size={22} color={colors.accent.cyan} />
                                </View>
                                <Text style={[styles.presetValue, { color: colors.text.primary }]}>{amount}</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>ml</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Hydration Tips */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <View style={[styles.tipCard, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.3), borderRadius: borderRadius.xl, borderWidth: 1 }]}>
                        <Ionicons name="information-circle" size={24} color={colors.accent.cyan} />
                        <Text style={[typography.body, { color: colors.text.primary, marginLeft: 12, flex: 1 }]}>
                            Sip water consistently throughout the day to maintain peak cognitive and physical performance.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* Custom Log Button */}
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add water"
                style={[styles.fab, { bottom: insets.bottom + 20 }, shadows.glow(colors.accent.cyan)]}
                onPress={() => handleAdd(250)}
                activeOpacity={0.9}
            >
                <LinearGradient
                    colors={colors.gradients.cyan}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.fabGradient}
                >
                    <Ionicons name="water-outline" size={30} color={colors.text.primary} />
                </LinearGradient>
            </TouchableOpacity>
              </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    centerSection: { height: 350, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
    ringWrapper: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.12 },
    bigStat: { fontFamily: typo.statLarge.fontFamily, fontSize: 52, lineHeight: 58, marginTop: 8 },
    presetsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
    presetBtn: { width: 100, paddingVertical: 20, alignItems: 'center', borderWidth: 1 },
    presetIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    presetValue: { fontFamily: typo.statSmall.fontFamily, fontSize: 22 },
    tipCard: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    fab: { position: 'absolute', alignSelf: 'center', width: 72, height: 72, borderRadius: 36 },
    fabGradient: { flex: 1, borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
