import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToday, logHydration } from '@/api/progress';
import { CircularProgress } from '@/components/ui/CircularProgress';

const { width } = Dimensions.get('window');

const PRESETS = [250, 500, 750];

export default function HydrationTrackerScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
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
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Hydration Tracker</Text>
                <TouchableOpacity>
                    <Ionicons name="settings-outline" size={24} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Main Progress Circle */}
                <View style={styles.centerSection}>
                    <View style={styles.ringWrapper}>
                        {/* Outer Glow */}
                        <View style={[styles.glow, { backgroundColor: colors.accent.cyan }]} />
                        <CircularProgress progress={pct} size={240} strokeWidth={16} color={colors.accent.cyan} trackColor={colors.border.default} />
                        <View style={styles.ringInner}>
                            <Ionicons name="water" size={48} color={colors.accent.cyan} />
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 48, marginTop: 8 }]}>
                                {current}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 14 }]}>
                                OF {target} ML
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Tracking Presets */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.lg, textAlign: 'center' }]}>Add Liquid</Text>
                    <View style={styles.presetsRow}>
                        {PRESETS.map((amount) => (
                            <TouchableOpacity
                                key={amount}
                                style={[styles.presetBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}
                                onPress={() => handleAdd(amount)}
                                disabled={mutation.isPending}
                            >
                                <Ionicons name="add" size={24} color={colors.accent.cyan} />
                                <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 8, fontWeight: '700' }]}>{amount}ml</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Hydration Tips */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <View style={[styles.tipCard, { backgroundColor: `${colors.accent.cyan}10`, borderColor: `${colors.accent.cyan}30`, borderRadius: borderRadius.xl, borderWidth: 1 }]}>
                        <Ionicons name="information-circle" size={24} color={colors.accent.cyan} />
                        <Text style={[typography.body, { color: colors.text.primary, marginLeft: 12, flex: 1 }]}>
                            Sip water consistently throughout the day to maintain peak cognitive and physical performance.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* Custom Log Button */}
            <TouchableOpacity
                style={[styles.fab, { bottom: insets.bottom + 20, backgroundColor: colors.accent.cyan }]}
                onPress={() => handleAdd(250)}
            >
                <Ionicons name="water-outline" size={32} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    centerSection: { height: 350, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
    ringWrapper: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.05 },
    presetsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
    presetBtn: { width: 90, padding: 20, alignItems: 'center', borderWidth: 1 },
    tipCard: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    fab: { position: 'absolute', alignSelf: 'center', width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', elevation: 8 },
});
