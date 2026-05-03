import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';

import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoutines, startSession } from '@/api/exercises';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function TrainingOnboardingScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [selectedRoutine, setSelectedRoutine] = useState<string | null>(null);

    const { data: routines, isLoading: loadingRoutines } = useQuery({
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
            <ImageBackgroundGradient />

            <View style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="close" size={28} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150 }}>
                <Text style={[typography.display, { color: colors.text.primary, fontSize: 36, marginBottom: 8 }]}>Ready to Train?</Text>
                <Text style={[typography.body, { color: '#8B949E', marginBottom: 32 }]}>
                    Select a routine or jump into a freestyle session. We'll track your volume and rest times according to your shift phase.
                </Text>

                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginBottom: 16 }]}>Your Routines</Text>

                {loadingRoutines ? (
                    <ActivityIndicator color={colors.accent.purple} />
                ) : (
                    <>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedRoutine(null)}
                        >
                            <Card style={[styles.routineCard, !selectedRoutine && styles.selectedCard]}>
                                <View style={[styles.iconBox, { backgroundColor: `${colors.accent.cyan}20` }]}>
                                    <Ionicons name="infinite" size={24} color={colors.accent.cyan} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subhead, { color: '#FFF', fontSize: 18 }]}>Freestyle Session</Text>
                                    <Text style={[typography.caption, { color: '#8B949E', marginTop: 4 }]}>Log any exercise as you go</Text>
                                </View>
                                {selectedRoutine === null && <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} />}
                            </Card>
                        </TouchableOpacity>

                        {(routines || []).map((routine: any) => (
                            <TouchableOpacity
                                key={routine.id}
                                activeOpacity={0.8}
                                onPress={() => setSelectedRoutine(routine.id)}
                            >
                                <Card style={[styles.routineCard, selectedRoutine === routine.id && styles.selectedCard]}>
                                    <View style={[styles.iconBox, { backgroundColor: `${colors.accent.purple}20` }]}>
                                        <Ionicons name="list" size={24} color={colors.accent.purple} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Text style={[typography.subhead, { color: '#FFF', fontSize: 18 }]}>{routine.name}</Text>
                                        <Text style={[typography.caption, { color: '#8B949E', marginTop: 4 }]}>
                                            {routine.exercises?.length || 0} Exercises • {(routine.exercises?.length || 0) * 8} min
                                        </Text>
                                    </View>
                                    {selectedRoutine === routine.id && <Ionicons name="checkmark-circle" size={24} color={colors.accent.purple} />}
                                </Card>
                            </TouchableOpacity>
                        ))}
                    </>
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom || 24, backgroundColor: colors.background.primary, borderTopColor: colors.border.default }]}>
                <TouchableOpacity
                    style={[styles.startBtn, { backgroundColor: colors.accent.coral }]}
                    onPress={handleStart}
                    disabled={startMutation.isPending}
                >
                    {startMutation.isPending ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Text style={[typography.heading, { color: '#FFF', fontSize: 18, marginRight: 8 }]}>Start Workout</Text>
                            <Ionicons name="play" size={20} color="#FFF" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

function ImageBackgroundGradient() {
    return (
        <View style={StyleSheet.absoluteFillObject}>
            <LinearGradient
                colors={['rgba(255, 107, 53, 0.15)', 'transparent']}
                style={{ height: 300, width: '100%' }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    routineCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 12,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    selectedCard: {
        borderColor: '#A78BFA',
        backgroundColor: '#1C2333',
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
        flexDirection: 'row',
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#FF6B35',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    }
});
