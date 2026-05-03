import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TAB_BAR_H } from './_layout';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { generatePlan } from '@/api/ai';
import { getModel } from '@/api/circadian';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/utils/validation';

export default function CircadianScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const { user } = useAuthStore();
    const router = useRouter();
    const [selectedTab, setSelectedTab] = useState<'profile' | 'plan'>('profile');

    const { data: currentShift, isLoading: isLoadingShift } = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrentShift,
    });

    const { data: circadianModel } = useQuery({
        queryKey: ['circadian-model'],
        queryFn: getModel,
        enabled: !!currentShift,
    });

    const { data: plan, isPending: isLoadingPlan, mutate: generateAIPlan } = useMutation({
        mutationFn: () => {
            const currentUserId = user?.id ? String(user.id) : 'unknown';
            return generatePlan({
                userId: currentUserId,
                date: new Date().toISOString().split('T')[0] as string,
                shiftId: String(currentShift?.id ?? ''),
                shiftType: (currentShift?.type as string) || 'night',
            });
        },
        onError: (error: unknown) => {
            Alert.alert('Error', getErrorMessage(error));
        },
    });

    const profileMetrics = useMemo(() => {
        if (!currentShift) return null;

        // Use circadian model data if available, otherwise estimate from shift times
        if (circadianModel) {
            return {
                melatoninStart: circadianModel.melatoninOnset || '--:--',
                caffeineCutoff: circadianModel.caffeineCutoff || '--:--',
                insulinStart: circadianModel.insulinPeak || '--:--',
                peakTemp: circadianModel.peakTemperature || '--:--',
                entrainmentScore: circadianModel.entrainmentScore ?? null,
            };
        }

        const endTime = new Date(currentShift.endTime);
        const melatoninStart = new Date(endTime.getTime() + 1 * 60 * 60 * 1000);
        const caffeineCutoff = new Date(endTime.getTime() - 6 * 60 * 60 * 1000);
        const insulinStart = new Date(currentShift.startTime);

        return {
            melatoninStart: melatoninStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            caffeineCutoff: caffeineCutoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            insulinStart: insulinStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            peakTemp: new Date(currentShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            entrainmentScore: null as number | null,
        };
    }, [currentShift, circadianModel]);

    // Use AI plan data if available, otherwise estimate from shift
    const protocol = useMemo(() => {
        if (plan && Array.isArray((plan as any).items)) {
            return (plan as any).items;
        }
        // Fallback estimation from shift data
        return [
            { type: 'meal', title: 'Pre-Shift Protein', time: profileMetrics?.insulinStart || '20:00', macros: '40P / 20C / 15F' },
            { type: 'workout', title: 'Activation Protocol', time: '21:00', duration: '30m' },
            { type: 'meal', title: 'Mid-Shift Fuel', time: '01:00', macros: '30P / 40C / 10F' },
            { type: 'action', title: 'Caffeine Cutoff', time: profileMetrics?.caffeineCutoff || '02:00', note: 'Switch to water/decaf' },
            { type: 'meal', title: 'Recovery Fast', time: '06:00', macros: 'Fasting Window Starts' },
        ];
    }, [plan, profileMetrics]);

    const entrainmentScore = profileMetrics?.entrainmentScore ?? (circadianModel as any)?.score ?? null;

    if (isLoadingShift) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={styles.header}>
                <Text style={[typography.display, { color: colors.text.primary, fontSize: 28 }]}>
                    Circadian <Text style={{ color: colors.accent.cyan }}>Optimizer</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
                    {currentShift ? `Active ${currentShift.type.charAt(0).toUpperCase() + currentShift.type.slice(1)} Shift` : 'No active shift logged'}
                </Text>
            </View>

            {/* Tab Selector */}
            <View style={[styles.tabSelector, { borderBottomColor: withAlpha(colors.text.primary, 0.05) }]}>
                <TouchableOpacity
                    style={[styles.tab, selectedTab === 'profile' && { borderBottomColor: colors.accent.cyan, borderBottomWidth: 2 }]}
                    onPress={() => setSelectedTab('profile')}
                >
                    <Text style={[typography.heading, { color: selectedTab === 'profile' ? colors.accent.cyan : colors.text.secondary, fontSize: 16 }]}>Profile Hub</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, selectedTab === 'plan' && { borderBottomColor: colors.accent.cyan, borderBottomWidth: 2 }]}
                    onPress={() => setSelectedTab('plan')}
                >
                    <Text style={[typography.heading, { color: selectedTab === 'plan' ? colors.accent.cyan : colors.text.secondary, fontSize: 16 }]}>AI Protocol</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_H + 80 }}>
                {selectedTab === 'profile' && (
                    <View>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginBottom: 16 }]}>Biological Windows</Text>
                        <View style={styles.grid}>
                            <Card style={[styles.metricCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.blue, 0.2) }]}>
                                <Ionicons name="moon" size={24} color={colors.accent.blue} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>Melatonin Onset</Text>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginTop: 4 }]}>{profileMetrics?.melatoninStart || '--:--'}</Text>
                            </Card>
                            <Card style={[styles.metricCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.amber, 0.2) }]}>
                                <Ionicons name="cafe" size={24} color={colors.accent.amber} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>Caffeine Cutoff</Text>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginTop: 4 }]}>{profileMetrics?.caffeineCutoff || '--:--'}</Text>
                            </Card>
                            <Card style={[styles.metricCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.cyan, 0.2) }]}>
                                <Ionicons name="restaurant" size={24} color={colors.accent.cyan} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>Insulin Peak</Text>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginTop: 4 }]}>{profileMetrics?.insulinStart || '--:--'}</Text>
                            </Card>
                            <Card style={[styles.metricCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.coral, 0.2) }]}>
                                <Ionicons name="thermometer" size={24} color={colors.accent.coral} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>Peak Temp</Text>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginTop: 4 }]}>{profileMetrics?.peakTemp || '--:--'}</Text>
                            </Card>
                        </View>

                        {/* Entrainment Score */}
                        <Card style={[styles.scoreCard, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default, borderWidth: 1, borderRadius: borderRadius.xl, marginTop: 24 }]}>
                            <Text style={[typography.heading, { color: colors.text.primary, textAlign: 'center', fontSize: 16 }]}>Entrainment Score</Text>
                            <Text style={[typography.display, { color: colors.accent.cyan, fontSize: 48, textAlign: 'center', marginVertical: 4 }]}>
                                {entrainmentScore ?? '--'}<Text style={{ fontSize: 20, color: colors.text.secondary }}>/100</Text>
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', paddingHorizontal: 16 }]}>
                                {entrainmentScore != null && entrainmentScore >= 80
                                    ? 'Good alignment. Try getting 15m of sunlight upon waking to improve this score.'
                                    : entrainmentScore != null
                                        ? 'Room for improvement. Focus on consistent sleep/wake times.'
                                        : 'Log more shifts to calculate your score.'}
                            </Text>
                        </Card>
                    </View>
                )}

                {selectedTab === 'plan' && (
                    <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Today's Protocol</Text>
                            <Button title="Regenerate" size="sm" variant="outline" onPress={() => generateAIPlan()} disabled={isLoadingPlan} />
                        </View>

                        {isLoadingPlan ? (
                            <ActivityIndicator size="large" color={colors.accent.cyan} style={{ marginTop: 40 }} />
                        ) : (
                            <View>
                                {protocol.map((item: any, idx: number) => (
                                    <View key={idx} style={styles.timelineItem}>
                                        <View style={styles.timeColumn}>
                                            <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold' }]}>{item.time}</Text>
                                            {idx !== protocol.length - 1 && <View style={[styles.timelineLine, { backgroundColor: colors.border.default }]} />}
                                        </View>
                                        <Card style={[styles.protocolCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons
                                                    name={item.type === 'meal' ? 'restaurant' : item.type === 'workout' ? 'barbell' : 'warning'}
                                                    size={20}
                                                    color={item.type === 'meal' ? colors.accent.cyan : item.type === 'workout' ? colors.accent.amber : colors.accent.coral}
                                                    style={{ marginRight: 12 }}
                                                />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16 }]}>{item.title}</Text>
                                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>
                                                        {item.type === 'meal' ? item.macros : item.type === 'workout' ? item.duration : item.note}
                                                    </Text>
                                                </View>
                                                {item.type === 'meal' && (
                                                    <TouchableOpacity style={[styles.swapBtn, { backgroundColor: withAlpha(colors.text.primary, 0.05) }]} onPress={() => router.push('/(modals)/build-plate' as any)}>
                                                        <Ionicons name="swap-horizontal" size={16} color={colors.text.secondary} />
                                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4 }]}>Swap</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </Card>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 24, marginBottom: 16, marginTop: 16 },
    tabSelector: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        marginBottom: 16,
        borderBottomWidth: 1,
    },
    tab: {
        marginRight: 24,
        paddingBottom: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricCard: {
        width: '48%',
        padding: 16,
        borderWidth: 1,
        borderRadius: 16,
    },
    scoreCard: {
        padding: 24,
        alignItems: 'center',
    },
    timelineItem: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    timeColumn: {
        width: 60,
        alignItems: 'center',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        marginTop: 8,
        borderRadius: 1,
    },
    protocolCard: {
        flex: 1,
        padding: 16,
        borderWidth: 1,
    },
    swapBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    }
});
