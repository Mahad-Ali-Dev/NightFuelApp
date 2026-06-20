import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChallenges, joinChallenge, updateChallengeProgress } from '@/api/community';
import { withAlpha } from '@/theme/utils';
import { GlassCard, Button, EmptyState, Skeleton, SkeletonCard } from '@/components/ui';
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
    // `isError`/`refetch` drive the honest retryable error state below — a failed
    // fetch must surface a retry rather than falling through to the "No active
    // challenges" empty state (an empty list reads as "nothing is running" when the
    // request actually failed). The cache stays the single source of truth, so we
    // never mirror the error flag into local state (react-state-fallback).
    const { data: challenges, isLoading, isError, refetch } = useQuery({
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
                <StatusBar style="light" />
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
                        // Honest loading scaffold mirroring the loaded layout — a few
                        // challenge-card-shaped placeholders (icon square + title/desc
                        // lines) instead of a bare spinner, so the screen doesn't "pop"
                        // when data arrives.
                        Array.from({ length: 3 }).map((_, i) => (
                            <GlassCard key={i} radius={borderRadius.xl} style={styles.challCard}>
                                <View style={styles.challBody}>
                                    <SkeletonCard height={52} radius={14} style={styles.skeletonIcon} />
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Skeleton width="70%" height={17} radius={borderRadius.sm} />
                                        <Skeleton width="95%" height={13} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                                        <Skeleton width={90} height={12} radius={borderRadius.sm} style={{ marginTop: 12 }} />
                                        <Skeleton width={140} height={44} radius={borderRadius.lg} style={{ marginTop: 14 }} />
                                    </View>
                                </View>
                            </GlassCard>
                        ))
                    ) : isError ? (
                        // Honest retryable error — a failed fetch would otherwise fall
                        // through to the "No active challenges" empty layout, which
                        // misreads as "nothing is running". The retry refetches the
                        // challenges query.
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load challenges"
                            subtitle="Something went wrong fetching the community challenges. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => refetch()}
                        />
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
                                <GlassCard
                                    key={chall.id}
                                    testID={`challenge-card-${chall.id}`}
                                    radius={borderRadius.xl}
                                    glow={isJoined ? colors.accent.emerald : undefined}
                                    style={[
                                        styles.challCard,
                                        isJoined
                                            ? { borderColor: withAlpha(colors.accent.emerald, 0.4) }
                                            : null,
                                    ]}
                                >
                                    {/* Joined indicator */}
                                    {isJoined ? (
                                        <View style={[styles.joinedBadge, { backgroundColor: withAlpha(colors.accent.emerald, 0.15) }]}>
                                            <Ionicons name="checkmark-circle" size={12} color={colors.accent.emerald} />
                                            <Text style={[typography.caption, { color: colors.accent.emerald, fontSize: 10, fontWeight: 'bold', marginLeft: 4 }]}>
                                                JOINED
                                            </Text>
                                        </View>
                                    ) : null}

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
                                                {isJoined && chall.myProgress !== undefined ? (
                                                    <>
                                                        <View style={[styles.dot, { backgroundColor: colors.text.tertiary }]} />
                                                        <Ionicons name="stats-chart" size={13} color={colors.accent.emerald} />
                                                        <Text style={[typography.caption, { color: colors.accent.emerald, fontWeight: 'bold', marginLeft: 4 }]}>
                                                            <Text style={[typography.statTiny, { color: colors.accent.emerald, fontSize: 13 }]}>{chall.myProgress}</Text> logged
                                                        </Text>
                                                    </>
                                                ) : null}
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
                                    {isJoined && isExpanded ? (
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
                                    ) : null}
                                </GlassCard>
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

    // Margin-only wrapper — the GlassCard primitive owns the surface (radius +
    // hairline + clip + the joined-state emerald border/glow passed via style).
    challCard: { marginBottom: 16 },
    // Constrains SkeletonCard to the 52×52 challIcon square (it defaults to full
    // width + a bottom margin) so the loading scaffold lines up with the loaded card.
    skeletonIcon: { width: 52, marginBottom: 0 },
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
