import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, log } from '@/api/sleep';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useRouter } from 'expo-router';

export default function SleepOptimizerScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: analytics, isLoading } = useQuery({
        queryKey: ['sleep-analytics'],
        queryFn: getAnalytics,
    });

    const [logging, setLogging] = useState(false);

    const logMutation = useMutation({
        mutationFn: () => {
            const end = new Date();
            const start = new Date(end.getTime() - (8 * 60 * 60 * 1000)); // 8 hours ago
            return log({ startTime: start.toISOString(), endTime: end.toISOString() });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sleep-analytics'] });
            Alert.alert('Sleep Logged', 'Your sleep block has been recorded successfully.');
            setLogging(false);
        },
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to log sleep. Please try again.');
            setLogging(false);
        },
    });

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Sleep Optimizer</Text>
                <View style={{ width: 32 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent.purple} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>

                    {/* Hero Score */}
                    <View style={styles.heroSection}>
                        <CircularProgress progress={(analytics?.qualityScore ?? 85) / 100} size={140} strokeWidth={12} color={colors.accent.purple} trackColor={colors.background.secondary} />
                        <View style={styles.heroTextOverlay}>
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 36 }]}>{analytics?.qualityScore ?? 85}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Quality</Text>
                        </View>
                    </View>

                    <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginBottom: 32, marginHorizontal: 20 }]}>
                        {analytics?.summary ?? 'Your recovery indicates you effectively managed your circadian transition.'}
                    </Text>

                    {/* Recommendations */}
                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginBottom: 16 }]}>Recommended Windows</Text>

                    <Card style={[styles.windowCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.windowHeader}>
                            <Ionicons name="moon" size={20} color={colors.accent.purple} />
                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: 8 }]}>Anchor Sleep</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: '700' }]}>{analytics?.anchorSleepWindow ?? '08:30 - 15:30'}</Text>
                        </View>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>Total darkness required. Avoid light exposure upon shift exit.</Text>
                    </Card>

                    <Card style={[styles.windowCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <View style={styles.windowHeader}>
                            <Ionicons name="battery-charging" size={20} color={colors.accent.amber} />
                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: 8 }]}>Pre-Shift Nap</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[typography.subhead, { color: colors.accent.amber, fontWeight: '700' }]}>{analytics?.preShiftNapWindow ?? '16:30 - 18:00'}</Text>
                        </View>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>90-minute cycle to top off cognitive alertness before shift.</Text>
                    </Card>

                    <TouchableOpacity
                        style={[styles.logBtn, { backgroundColor: colors.accent.purple, marginTop: 16 }]}
                        onPress={() => logMutation.mutate()}
                        disabled={logMutation.isPending}
                    >
                        {logMutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Log Rest Block</Text>}
                    </TouchableOpacity>

                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    heroSection: { alignItems: 'center', justifyContent: 'center', marginVertical: 40 },
    heroTextOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    windowCard: { padding: 16, marginBottom: 16, borderWidth: 1, borderRadius: 16 },
    windowHeader: { flexDirection: 'row', alignItems: 'center' },
    logBtn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#A78BFA', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }
});
