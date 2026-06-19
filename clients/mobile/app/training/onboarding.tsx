import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { CtaButton, Skeleton, EmptyState } from '@/components/ui';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoutines, startSession } from '@/api/exercises';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';

export default function TrainingOnboardingScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { routineId } = useLocalSearchParams<{ routineId?: string }>();
    const [selectedRoutine, setSelectedRoutine] = useState<string | null>(routineId ?? null);

    // `isError`/`refetch` drive the honest retryable error state below: a failed
    // routines fetch surfaces a retry instead of an indefinite spinner. The
    // Freestyle session option renders in every state (it doesn't depend on the
    // routines list), so the user can always start a workout. The react-query
    // cache stays the source of truth — the error flag is never mirrored into
    // local state (react-state-fallback).
    const { data: routines, isLoading: loadingRoutines, isError, refetch } = useQuery({
        queryKey: ['routines'],
        queryFn: getRoutines,
    });

    const startMutation = useMutation({
        mutationFn: () => startSession(selectedRoutine || undefined),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: (sessionData) => {
            queryClient.invalidateQueries({ queryKey: ['active-session'] });
            router.replace({ pathname: '/training/workout', params: { sessionId: sessionData.id } } as any);
        }
    });

    const handleStart = () => {
        startMutation.mutate();
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ImageBackgroundGradient />

            <View style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150 }}>
                <Text style={[typography.display, { color: colors.text.primary, fontSize: 36, marginBottom: 8 }]}>Ready to Train?</Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 32 }]}>
                    Select a routine or jump into a freestyle session. We'll track your volume and rest times according to your shift phase.
                </Text>

                <Text style={[typography.h3, { color: colors.text.primary, marginBottom: 16 }]}>Your Routines</Text>

                {/* Freestyle session — rendered in every state (loading / error /
                    loaded) since it doesn't depend on the routines list. Keeps the
                    user able to start a workout even when routines fail to load. */}
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedRoutine(null)}
                >
                    <Card style={[styles.routineCard, { borderColor: colors.border.default }, !selectedRoutine && { borderColor: colors.accent.cyan, backgroundColor: colors.background.tertiary }]}>
                        <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.cyan, 0.16) }]}>
                            <Ionicons name="infinite" size={24} color={colors.accent.cyan} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={[typography.subtitle, { color: colors.text.primary }]}>Freestyle Session</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>Log any exercise as you go</Text>
                        </View>
                        {selectedRoutine === null && <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} />}
                    </Card>
                </TouchableOpacity>

                {loadingRoutines ? (
                    // Honest loading scaffold mirroring the routine cards (icon
                    // square + name/meta lines) instead of a bare spinner.
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} style={[styles.routineCard, { borderColor: colors.border.default }]}>
                            <Skeleton width={48} height={48} radius={12} />
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Skeleton width="55%" height={16} radius={borderRadius.sm} />
                                <Skeleton width="35%" height={12} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                            </View>
                        </Card>
                    ))
                ) : isError ? (
                    // Honest retryable error — a failed fetch would otherwise read
                    // as "you have no routines". The retry refetches the routines
                    // query; the Freestyle option above stays usable meanwhile.
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load your routines"
                        subtitle="Something went wrong fetching your saved routines. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => refetch()}
                        style={styles.routinesError}
                    />
                ) : (
                    (routines || []).map((routine: any) => (
                        <TouchableOpacity
                            key={routine.id}
                            activeOpacity={0.8}
                            onPress={() => setSelectedRoutine(routine.id)}
                        >
                            <Card style={[styles.routineCard, { borderColor: colors.border.default }, selectedRoutine === routine.id && { borderColor: colors.accent.purple, backgroundColor: colors.background.tertiary }]}>
                                <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.purple, 0.16) }]}>
                                    <Ionicons name="list" size={24} color={colors.accent.purple} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subtitle, { color: colors.text.primary }]}>{routine.name}</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                        {routine.exercises?.length || 0} Exercises • {(routine.exercises?.length || 0) * 8} min
                                    </Text>
                                </View>
                                {selectedRoutine === routine.id && <Ionicons name="checkmark-circle" size={24} color={colors.accent.purple} />}
                            </Card>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom || 24, backgroundColor: colors.background.primary, borderTopColor: colors.border.default }]}>
                <CtaButton
                    label="Start Workout"
                    icon="play"
                    size="lg"
                    loading={startMutation.isPending}
                    onPress={handleStart}
                    style={styles.startBtn}
                />
            </View>
        </View>
    );
}

function ImageBackgroundGradient() {
    const { colors } = useTheme();
    return (
        <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
                colors={[withAlpha(colors.accent.coral, 0.15), 'transparent']}
                style={{ height: 300, width: '100%' }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routineCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
    },
    // Trim the EmptyState's default top padding so the routines-error state sits
    // naturally below the Freestyle card rather than floating mid-screen.
    routinesError: {
        paddingVertical: 24,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 16,
        borderTopWidth: 1,
    },
    startBtn: {
        height: 56,
        borderRadius: 28,
    }
});
