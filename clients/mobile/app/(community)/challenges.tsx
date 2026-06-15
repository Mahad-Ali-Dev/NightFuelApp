import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChallenges, joinChallenge, updateChallengeProgress } from '@/api/community';
import { withAlpha } from '@/theme/utils';
import { Card, Button, EmptyState } from '@/components/ui';
import { shadows } from '@/theme';

export default function ChallengesScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Which challenge has its progress panel open
    const [expandedId, setExpandedId] = useState<string | null>(null);
    // Progress value keyed by challenge id
    const [progressInputs, setProgressInputs] = useState<Record<string, string>>({});

    // ── Queries ─────────────────────────────────────────────────────────────
    const { data: challenges, isLoading } = useQuery({
        queryKey: ['community-challenges'],
        queryFn: getChallenges,
    });

    const joinMutation = useMutation({
        mutationFn: (id: string) => joinChallenge(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community-challenges'] });
            Alert.alert('Joined!', 'You are now part of this challenge. Keep going!');
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to join challenge');
        },
    });

    const progressMutation = useMutation({
        mutationFn: ({ id, value }: { id: string; value: number }) =>
            updateChallengeProgress(id, value),
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['community-challenges'] });
            setProgressInputs(prev => ({ ...prev, [id]: '' }));
            setExpandedId(null);
            Alert.alert('Progress Logged! 🔥', 'Keep it up — your effort counts toward the leaderboard.');
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to log progress');
        },
    });

    const handleLogProgress = (id: string) => {
        const raw   = progressInputs[id] ?? '';
        const value = parseFloat(raw);
        if (!raw || isNaN(value) || value <= 0) {
            Alert.alert('Invalid value', 'Please enter a positive number.');
            return;
        }
        progressMutation.mutate({ id, value });
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>
                        Community Challenges
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {isLoading ? (
                        <ActivityIndicator size="large" color={colors.accent.cyan} style={{ marginTop: 40 }} />
                    ) : !challenges || challenges.length === 0 ? (
                        <EmptyState
                            icon="trophy-outline"
                            title="No active challenges"
                            subtitle="There are no community challenges running right now. Check back soon to compete and earn XP."
                        />
                    ) : (
                        challenges.map((chall) => {
                            const isJoined   = chall.myProgress !== undefined;
                            const isExpanded = expandedId === chall.id;

                            return (
                                <Card
                                    key={chall.id}
                                    style={[
                                        styles.challCard,
                                        {
                                            backgroundColor: colors.background.secondary,
                                            borderColor: isJoined
                                                ? withAlpha(colors.accent.emerald, 0.4)
                                                : colors.border.default,
                                            borderRadius: borderRadius.xl,
                                        },
                                    ]}
                                >
                                    {/* Joined indicator */}
                                    {isJoined && (
                                        <View style={[styles.joinedBadge, { backgroundColor: withAlpha(colors.accent.emerald, 0.15) }]}>
                                            <Ionicons name="checkmark-circle" size={12} color={colors.accent.emerald} />
                                            <Text style={[typography.caption, { color: colors.accent.emerald, fontSize: 10, fontWeight: 'bold', marginLeft: 4 }]}>
                                                JOINED
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.challBody}>
                                        {/* Icon */}
                                        <View style={[styles.challIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.1) }, shadows.glow(colors.accent.cyan)]}>
                                            <Ionicons name="flash" size={28} color={colors.accent.cyan} />
                                        </View>

                                        {/* Details */}
                                        <View style={{ flex: 1, marginLeft: 16 }}>
                                            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 17 }]}>
                                                {chall.title}
                                            </Text>
                                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
                                                {chall.description}
                                            </Text>

                                            {/* Meta row */}
                                            <View style={styles.metaRow}>
                                                <Ionicons name="people" size={13} color={colors.text.tertiary} />
                                                <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4 }]}>
                                                    {chall.participants} joined
                                                </Text>
                                                {isJoined && chall.myProgress !== undefined && (
                                                    <>
                                                        <View style={[styles.dot, { backgroundColor: colors.text.tertiary }]} />
                                                        <Ionicons name="stats-chart" size={13} color={colors.accent.emerald} />
                                                        <Text style={[typography.caption, { color: colors.accent.emerald, fontWeight: 'bold', marginLeft: 4 }]}>
                                                            <Text style={[typography.statTiny, { color: colors.accent.emerald, fontSize: 13 }]}>{chall.myProgress}</Text> logged
                                                        </Text>
                                                    </>
                                                )}
                                            </View>

                                            {/* CTA */}
                                            {isJoined ? (
                                                <TouchableOpacity
                                                    accessibilityRole="button"
                                                    accessibilityLabel={isExpanded ? 'Cancel logging progress' : 'Log progress'}
                                                    accessibilityState={{ expanded: isExpanded }}
                                                    style={[
                                                        styles.progressBtn,
                                                        {
                                                            borderColor: withAlpha(colors.accent.emerald, 0.5),
                                                            backgroundColor: withAlpha(colors.accent.emerald, 0.08),
                                                        },
                                                    ]}
                                                    onPress={() => setExpandedId(isExpanded ? null : chall.id)}
                                                    activeOpacity={0.8}
                                                >
                                                    <Ionicons
                                                        name={isExpanded ? 'chevron-up' : 'add-circle-outline'}
                                                        size={16}
                                                        color={colors.accent.emerald}
                                                    />
                                                    <Text style={[typography.caption, { color: colors.accent.emerald, fontWeight: 'bold', marginLeft: 6 }]}>
                                                        {isExpanded ? 'CANCEL' : 'LOG PROGRESS'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <Button
                                                    title="JOIN CHALLENGE"
                                                    variant="primary"
                                                    style={{ marginTop: 14, height: 44 }}
                                                    onPress={() => joinMutation.mutate(chall.id)}
                                                    disabled={joinMutation.isPending}
                                                />
                                            )}
                                        </View>
                                    </View>

                                    {/* Inline progress logger (expands on demand) */}
                                    {isJoined && isExpanded && (
                                        <View style={[styles.progressPanel, { borderTopColor: withAlpha(colors.border.default, 0.6) }]}>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 10 }]}>
                                                Enter how much you've completed (steps, reps, km — whatever this challenge tracks):
                                            </Text>
                                            <View style={styles.inputRow}>
                                                <TextInput
                                                    style={[
                                                        styles.progressInput,
                                                        {
                                                            color:           colors.text.primary,
                                                            backgroundColor: colors.background.primary,
                                                            borderColor:     colors.border.default,
                                                        },
                                                    ]}
                                                    placeholder="e.g. 5000"
                                                    placeholderTextColor={colors.text.tertiary}
                                                    keyboardType="numeric"
                                                    value={progressInputs[chall.id] ?? ''}
                                                    onChangeText={(v) =>
                                                        setProgressInputs(prev => ({ ...prev, [chall.id]: v }))
                                                    }
                                                    returnKeyType="done"
                                                    onSubmitEditing={() => handleLogProgress(chall.id)}
                                                />
                                                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Log progress"
                                                    style={[styles.submitBtn, { backgroundColor: colors.accent.emerald }]}
                                                    onPress={() => handleLogProgress(chall.id)}
                                                    disabled={progressMutation.isPending}
                                                >
                                                    {progressMutation.isPending ? (
                                                        <ActivityIndicator color={colors.text.primary} size="small" />
                                                    ) : (
                                                        <Ionicons name="checkmark" size={22} color={colors.text.primary} />
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </Card>
                            );
                        })
                    )}
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

    challCard: { marginBottom: 16, borderWidth: 1, overflow: 'hidden' },
    joinedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 20,
        marginTop: 14,
    },
    challBody: { flexDirection: 'row', padding: 20, paddingTop: 10 },
    challIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 8 },

    progressBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginTop: 14,
    },

    progressPanel: {
        borderTopWidth: 1,
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    progressInput: {
        flex: 1,
        height: 46,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        fontSize: 15,
    },
    submitBtn: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
