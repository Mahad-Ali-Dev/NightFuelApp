import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrent, create, update, CreateShiftPayload } from '@/api/shifts';
import { generatePlan } from '@/api/plans';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function ShiftCalendarScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: currentShift, isLoading } = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrent,
    });

    const createMutation = useMutation({
        mutationFn: (payload: CreateShiftPayload) => create(payload),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['current-shift'] });
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string, payload: Partial<CreateShiftPayload> }) => update(id, payload),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['current-shift'] });
        }
    });

    const generateMutation = useMutation({
        mutationFn: (payload: any) => generatePlan(payload),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            Alert.alert('Success', 'AI Plan generated successfully!');
            router.push('/(tabs)/nutrition' as any);
        }
    });

    // Hardcoded logic removed. Instead, user routes to the new modal to pick details.

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <ImageBackgroundGradient />

            <View style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}>
                    <Ionicons name="moon-outline" size={24} color={colors.accent.purple} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent.cyan} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150 }}>
                    <Text style={[typography.display, { color: colors.text.primary, fontSize: 36, marginBottom: 8 }]}>Your Schedule</Text>
                    <Text style={[typography.body, { color: colors.text.tertiary, marginBottom: 32 }]}>
                        Manage your active shift block to ensure your circadian rhythm aligns perfectly with your body’s needs.
                    </Text>

                    {currentShift ? (
                        <>
                            <Card style={[styles.shiftCard, { borderColor: colors.accent.cyan, backgroundColor: 'transparent' }]}>
                                <View style={styles.cardHeader}>
                                    <View style={[styles.iconBox, { backgroundColor: `${colors.accent.cyan}20` }]}>
                                        <Ionicons name="moon" size={24} color={colors.accent.cyan} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontSize: 18 }]}>Active {currentShift.type} Shift</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]}>
                                            {new Date(currentShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(currentShift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={() => router.push('/(modals)/log-shift' as any)}>
                                        <Ionicons name="create-outline" size={24} color={colors.text.tertiary} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.timelineContainer}>
                                    <View style={styles.timelineLine} />
                                    <View style={styles.timelineNode}>
                                        <Ionicons name="sunny" size={16} color={colors.accent.amber} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>Awake</Text>
                                    </View>
                                    <View style={styles.timelineNode}>
                                        <Ionicons name="briefcase" size={16} color={colors.accent.cyan} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>Shift Starts ({new Date(currentShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</Text>
                                    </View>
                                    <View style={styles.timelineNode}>
                                        <Ionicons name="bed" size={16} color={colors.accent.purple} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>Shift Ends ({new Date(currentShift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</Text>
                                    </View>
                                </View>
                            </Card>

                            <TouchableOpacity
                                style={[styles.optimizeBtn, { backgroundColor: `${colors.accent.purple}20`, borderColor: colors.accent.purple }]}
                                onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                            >
                                <Ionicons name="analytics" size={20} color={colors.accent.purple} style={{ marginRight: 8 }} />
                                <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: '700' }]}>Optimize Sleep Window</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.optimizeBtn, { backgroundColor: colors.accent.cyan, borderColor: colors.accent.cyan, marginTop: 12 }]}
                                onPress={() => {
                                    generateMutation.mutate({
                                        date: new Date().toISOString().slice(0, 10),
                                        shiftId: currentShift.id,
                                        shiftType: currentShift.type
                                    });
                                }}
                            >
                                {generateMutation.isPending ? (
                                    <ActivityIndicator color="#000" />
                                ) : (
                                    <>
                                        <Ionicons name="restaurant" size={20} color="#000" style={{ marginRight: 8 }} />
                                        <Text style={[typography.subhead, { color: '#000', fontWeight: '700' }]}>Generate AI Nutrition Plan</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Card style={styles.emptyCard}>
                                <Ionicons name="calendar-outline" size={48} color={colors.text.tertiary} style={{ marginBottom: 16 }} />
                                <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 8, textAlign: 'center' }]}>No Active Shift</Text>
                                <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginBottom: 24 }]}>
                                    Set up your next shift rotation to start generating circadian predictions.
                                </Text>

                                <TouchableOpacity
                                    style={[styles.primaryBtn, { backgroundColor: colors.accent.cyan }]}
                                    onPress={() => router.push('/(modals)/log-shift' as any)}
                                >
                                    <Text style={[typography.heading, { color: '#000', fontSize: 16 }]}>Add Shift</Text>
                                </TouchableOpacity>
                            </Card>
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

function ImageBackgroundGradient() {
    return (
        <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
                colors={['rgba(79, 195, 247, 0.15)', 'transparent']}
                style={{ height: 300, width: '100%' }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    shiftCard: {
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timelineContainer: {
        paddingLeft: 8,
        marginLeft: 16,
        borderLeftWidth: 2,
        borderLeftColor: 'transparent',
        paddingBottom: 8,
    },
    timelineLine: { display: 'none' }, // Using borderLeft instead for simplicity
    timelineNode: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        marginLeft: -18,
        backgroundColor: 'transparent',
        paddingVertical: 4,
    },
    emptyCard: {
        alignItems: 'center',
        padding: 32,
        borderWidth: 1,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        width: '100%'
    },
    primaryBtn: {
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    optimizeBtn: {
        flexDirection: 'row',
        height: 56,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
    }
});
