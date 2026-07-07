import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChallenges, joinChallenge, updateChallengeProgress, type Challenge } from '@/api/community';
import { withAlpha } from '@/theme/utils';
import { GlassCard, Button, EmptyState, Skeleton, SkeletonCard, CircularProgress } from '@/components/ui';
import { ChallengeParticipantStack } from '@/components/ChallengeParticipantStack';
import { shadows } from '@/theme';

export default function ChallengesScreen() {
    const { colors, typography, borderRadius } = useTheme();
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
            Alert.alert('Progress saved! 🔥', 'Keep it up — your effort counts toward the leaderboard.');
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to save progress');
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

    // ── Derived view model (render-only; never mutates the cached array) ──────
    // The brief asks for "active challenges up top". A challenge is "active" for
    // this user once joined (myProgress is defined). We partition a shallow copy
    // for display order only — the query cache stays the single source of truth.
    const list = challenges ?? [];
    const active = list.filter((c) => c.myProgress !== undefined);
    const discover = list.filter((c) => c.myProgress === undefined);
    const hasAny = list.length > 0;

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
                    contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
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
                                    <SkeletonCard height={64} radius={borderRadius.full} style={styles.skeletonIcon} />
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Skeleton width="70%" height={20} radius={borderRadius.sm} />
                                        <Skeleton width="95%" height={13} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                                        <Skeleton width={90} height={12} radius={borderRadius.sm} style={{ marginTop: 12 }} />
                                        <Skeleton width="100%" height={48} radius={borderRadius.lg} style={{ marginTop: 16 }} />
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
                    ) : !hasAny ? (
                        <EmptyState
                            icon="trophy-outline"
                            title="No active challenges"
                            subtitle="There are no community challenges running right now. Check back soon to compete, track progress, and earn XP."
                        />
                    ) : (
                        <>
                            {/* Hero summary — value-dominant, condensed numerals. Lime is
                                spent only on the "joined" stat (the meaningful one). */}
                            <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
                                <View style={styles.heroRow}>
                                    <View style={styles.heroStat}>
                                        <Text style={[typography.statMedium, { color: colors.text.primary }]}>
                                            {list.length}
                                        </Text>
                                        <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>
                                            LIVE
                                        </Text>
                                    </View>
                                    <View style={[styles.heroDivider, { backgroundColor: colors.border.default }]} />
                                    <View style={styles.heroStat}>
                                        <Text style={[typography.statMedium, { color: active.length > 0 ? colors.accent.coral : colors.text.primary }]}>
                                            {active.length}
                                        </Text>
                                        <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>
                                            JOINED
                                        </Text>
                                    </View>
                                    <View style={styles.heroFill} />
                                    <View style={[styles.heroBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.1), borderColor: withAlpha(colors.accent.coral, 0.22) }]}>
                                        <Ionicons name="flame" size={14} color={colors.accent.coral} />
                                        <Text style={[typography.captionMedium, { color: colors.accent.coral, marginLeft: 5 }]}>
                                            Compete
                                        </Text>
                                    </View>
                                </View>
                            </Animated.View>

                            {/* ── Active (joined) — up top ─────────────────────── */}
                            {active.length > 0 ? (
                                <SectionLabel
                                    icon="flash"
                                    label="YOUR ACTIVE CHALLENGES"
                                    color={colors.accent.coral}
                                    typography={typography}
                                    textColor={colors.text.secondary}
                                />
                            ) : null}
                            {active.map((chall, idx) => (
                                <ChallengeCard
                                    key={chall.id}
                                    chall={chall}
                                    index={idx}
                                    isExpanded={expandedId === chall.id}
                                    progressInput={progressInputs[chall.id] ?? ''}
                                    joinPending={joinMutation.isPending}
                                    progressPending={progressMutation.isPending}
                                    onJoin={() => joinMutation.mutate(chall.id)}
                                    onToggleExpand={() => setExpandedId(expandedId === chall.id ? null : chall.id)}
                                    onChangeProgress={(v) => setProgressInputs(prev => ({ ...prev, [chall.id]: v }))}
                                    onSubmitProgress={() => handleLogProgress(chall.id)}
                                />
                            ))}

                            {/* ── Discover (not yet joined) ────────────────────── */}
                            {discover.length > 0 ? (
                                <SectionLabel
                                    icon="compass"
                                    label="DISCOVER"
                                    color={colors.accent.blue}
                                    typography={typography}
                                    textColor={colors.text.secondary}
                                    style={{ marginTop: active.length > 0 ? 28 : 4 }}
                                />
                            ) : null}
                            {discover.map((chall, idx) => (
                                <ChallengeCard
                                    key={chall.id}
                                    chall={chall}
                                    index={active.length + idx}
                                    isExpanded={expandedId === chall.id}
                                    progressInput={progressInputs[chall.id] ?? ''}
                                    joinPending={joinMutation.isPending}
                                    progressPending={progressMutation.isPending}
                                    onJoin={() => joinMutation.mutate(chall.id)}
                                    onToggleExpand={() => setExpandedId(expandedId === chall.id ? null : chall.id)}
                                    onChangeProgress={(v) => setProgressInputs(prev => ({ ...prev, [chall.id]: v }))}
                                    onSubmitProgress={() => handleLogProgress(chall.id)}
                                />
                            ))}
                        </>
                    )}
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}

// ── Section label ───────────────────────────────────────────────────────────
function SectionLabel({
    icon, label, color, textColor, typography, style,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
    textColor: string;
    typography: ReturnType<typeof useTheme>['typography'];
    style?: any;
}) {
    return (
        <View style={[styles.sectionLabel, style]}>
            <Ionicons name={icon} size={14} color={color} />
            <Text style={[typography.overline, { color: textColor, marginLeft: 7 }]}>{label}</Text>
        </View>
    );
}

// ── Challenge card ──────────────────────────────────────────────────────────
// Visual-only presentational card. Every handler/testID/prop is passed down from
// the screen verbatim — this component owns layout/motion, not data.
function ChallengeCard({
    chall, index, isExpanded, progressInput, joinPending, progressPending,
    onJoin, onToggleExpand, onChangeProgress, onSubmitProgress,
}: {
    chall: Challenge;
    index: number;
    isExpanded: boolean;
    progressInput: string;
    joinPending: boolean;
    progressPending: boolean;
    onJoin: () => void;
    onToggleExpand: () => void;
    onChangeProgress: (v: string) => void;
    onSubmitProgress: () => void;
}) {
    const { colors, typography, borderRadius } = useTheme();
    const isJoined = chall.myProgress !== undefined;
    const progressValue = chall.myProgress ?? 0;
    const hasMomentum = isJoined && progressValue > 0;

    // PEAK moment: when a joined challenge already has logged momentum, the ring
    // does a one-time celebratory pop on mount (spring-scale + a soft sparkle
    // fade). Transform/opacity only, proportional — a reward, not a distraction.
    const ringScale = useSharedValue(hasMomentum ? 0.82 : 1);
    const sparkle = useSharedValue(0);
    React.useEffect(() => {
        if (hasMomentum) {
            ringScale.value = withSequence(
                withSpring(1.06, { damping: 9, stiffness: 200 }),
                withSpring(1, { damping: 14, stiffness: 220 }),
            );
            sparkle.value = withSequence(
                withTiming(1, { duration: 260 }),
                withTiming(0, { duration: 620 }),
            );
        }
        // Run once on mount per card identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const ringAnim = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));
    const sparkleAnim = useAnimatedStyle(() => ({ opacity: sparkle.value }));

    // The ring has no true target in the wire shape, so it visualizes momentum on
    // a gentle log curve (never a fake 100%): more logged → fuller, asymptotic.
    const ringPct = hasMomentum
        ? Math.min(96, 18 + Math.log10(progressValue + 1) * 34)
        : 0;

    const accent = isJoined ? colors.accent.coral : colors.accent.cyan;

    return (
        <Animated.View entering={FadeInDown.delay(90 + index * 45).duration(420).springify().damping(18)}>
            <GlassCard
                testID={`challenge-card-${chall.id}`}
                radius={borderRadius.xl}
                glow={isJoined ? colors.accent.coral : undefined}
                style={[
                    styles.challCard,
                    isJoined ? { borderColor: withAlpha(colors.accent.coral, 0.4) } : null,
                ]}
            >
                {/* Joined indicator */}
                {isJoined ? (
                    <View style={[styles.joinedBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.accent.coral} />
                        <Text style={[typography.caption, { color: colors.accent.coral, fontSize: 10, fontWeight: 'bold', marginLeft: 4 }]}>
                            JOINED
                        </Text>
                    </View>
                ) : null}

                <View style={styles.challBody}>
                    {/* Leading visual: progress RING for joined (value dominates),
                        icon MEDALLION for discover. */}
                    {isJoined ? (
                        <Animated.View style={[styles.ringWrap, ringAnim]}>
                            <CircularProgress
                                size={64}
                                strokeWidth={6}
                                progress={ringPct}
                                color={colors.accent.coral}
                                trackColor={withAlpha(colors.accent.coral, 0.16)}
                            >
                                <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 22, lineHeight: 24 }]}>
                                    {progressValue}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 9, marginTop: -1 }]}>
                                    LOGGED
                                </Text>
                            </CircularProgress>
                            {/* Sparkle accent on the peak pop */}
                            <Animated.View style={[styles.sparkle, sparkleAnim]} pointerEvents="none">
                                <Ionicons name="sparkles" size={16} color={colors.accent.coral} />
                            </Animated.View>
                        </Animated.View>
                    ) : (
                        <View style={[styles.challIcon, { backgroundColor: withAlpha(accent, 0.1) }, shadows.glow(accent)]}>
                            <Ionicons name="flash" size={28} color={accent} />
                        </View>
                    )}

                    {/* Details */}
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]} numberOfLines={2}>
                            {chall.title}
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={2}>
                            {chall.description}
                        </Text>

                        {/* Participants — avatars for people, not a bare count */}
                        <View style={styles.metaRow}>
                            {chall.participants > 0 ? (
                                <ChallengeParticipantStack count={chall.participants} size={24} />
                            ) : null}
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: chall.participants > 0 ? 8 : 0 }]}>
                                <Text style={[typography.statTiny, { color: colors.text.primary, fontSize: 13 }]}>{chall.participants}</Text> joined
                            </Text>
                        </View>

                        {/* CTA — JOIN is the primary action (full lime, thumb zone).
                            Joined cards expose a subordinate LOG PROGRESS control. */}
                        {isJoined ? (
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel={isExpanded ? 'Cancel tracking progress' : 'Track progress'}
                                accessibilityState={{ expanded: isExpanded }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={[
                                    styles.progressBtn,
                                    {
                                        borderColor: withAlpha(colors.accent.coral, 0.45),
                                        backgroundColor: withAlpha(colors.accent.coral, 0.08),
                                    },
                                ]}
                                onPress={onToggleExpand}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name={isExpanded ? 'chevron-up' : 'add-circle-outline'}
                                    size={16}
                                    color={colors.accent.coral}
                                />
                                <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold', marginLeft: 6 }]}>
                                    {isExpanded ? 'CANCEL' : 'TRACK PROGRESS'}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <Button
                                title="JOIN CHALLENGE"
                                variant="primary"
                                icon={<Ionicons name="add" size={18} color={colors.text.inverse} />}
                                style={{ marginTop: 16, height: 48 }}
                                onPress={onJoin}
                                disabled={joinPending}
                            />
                        )}
                    </View>
                </View>

                {/* Inline progress logger (expands on demand) */}
                {isJoined && isExpanded ? (
                    <Animated.View
                        entering={FadeInDown.duration(220)}
                        style={[styles.progressPanel, { borderTopColor: withAlpha(colors.border.default, 0.6) }]}
                    >
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
                                value={progressInput}
                                onChangeText={onChangeProgress}
                                returnKeyType="done"
                                onSubmitEditing={onSubmitProgress}
                            />
                            <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Track progress"
                                style={[styles.submitBtn, { backgroundColor: colors.accent.coral }]}
                                onPress={onSubmitProgress}
                                disabled={progressPending}
                            >
                                {progressPending ? (
                                    <ActivityIndicator color={colors.text.inverse} size="small" />
                                ) : (
                                    <Ionicons name="checkmark" size={22} color={colors.text.inverse} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                ) : null}
            </GlassCard>
        </Animated.View>
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

    // Hero summary strip
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 22,
    },
    heroStat: { alignItems: 'flex-start' },
    heroDivider: { width: 1, height: 34, marginHorizontal: 18 },
    heroFill: { flex: 1 },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },

    sectionLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },

    // Margin-only wrapper — the GlassCard primitive owns the surface (radius +
    // hairline + clip + the joined-state coral border/glow passed via style).
    challCard: { marginBottom: 16 },
    // Constrains SkeletonCard to the 64×64 leading-visual square (it defaults to
    // full width + a bottom margin) so the loading scaffold lines up with the card.
    skeletonIcon: { width: 64, marginBottom: 0 },
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
    challIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    ringWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    sparkle: { position: 'absolute', top: -4, right: -4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },

    progressBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 9,
        marginTop: 14,
        minHeight: 44,
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
