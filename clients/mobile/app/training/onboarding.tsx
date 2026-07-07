import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { CtaButton, Skeleton, EmptyState, Button } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoutines, startSession } from '@/api/exercises';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { withAlpha } from '@/theme/utils';

export default function TrainingOnboardingScreen() {
    // `shadows` is intentionally not pulled here — the only glow on this screen
    // lives inside OptionCard (which reads its own `shadows`). `typography`,
    // `spacing`, `borderRadius` are all used below (hero, grid, skeletons).
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

    // Loaded-and-empty: distinct from the error state (above) — the fetch
    // succeeded but the user has no saved routines. We still surface the Freestyle
    // card so they can train, plus an inline empty hint instead of a blank gap.
    const loadedEmpty = !loadingRoutines && !isError && (routines || []).length === 0;

    // The picked routine's name powers the footer selection summary (value-first:
    // shows WHAT will start). Falls back to "Freestyle" when nothing is selected.
    const selectedName = selectedRoutine
        ? (routines || []).find((r: any) => r.id === selectedRoutine)?.name ?? 'Routine'
        : 'Freestyle Session';

    const routineCount = (routines || []).length;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ImageBackgroundGradient />

            {/* Sheet affordance: a drag handle reads this as a dismissible modal;
                the close X is the explicit dismiss. Both sit inside safe-area. */}
            <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
                <View style={[styles.grabber, { backgroundColor: colors.border.light }]} />
                <View style={styles.headerRow}>
                    <View style={styles.headerSpacer} />
                    <TouchableOpacity
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        onPress={() => router.back()}
                        style={[styles.closeBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                    >
                        <Ionicons name="close" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 200 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero — value-first progress hint. The STEP value dominates its
                    label; lime appears only as a low-opacity tinted badge (10% rule). */}
                <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
                    <View
                        // Presentational only — the "Step 01 · Setup" rail is a spatial
                        // hint, not an interactive control, so it carries no role.
                        accessible={false}
                        style={[styles.stepBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.28) }]}
                    >
                        <View style={[styles.stepDot, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.overline, { color: colors.accent.coral }]} maxFontSizeMultiplier={1.3}>Step 01 · Setup</Text>
                    </View>
                    {/* Let the headline reflow naturally — a hard line break fights
                        large Dynamic Type and narrow widths. */}
                    <Text style={[typography.display, { color: colors.text.primary, marginTop: spacing.lg }]} maxFontSizeMultiplier={1.3}>
                        Ready to Train?
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing.md }]} maxFontSizeMultiplier={1.4}>
                        Pick a routine or jump into a freestyle session. We'll track your volume and rest times around your shift phase.
                    </Text>
                </Animated.View>

                {/* Progress hint — a 2-step segmented rail. The first segment (Setup)
                    is lime-active; the second (Workout) stays neutral. Reinforces
                    "Step 01" with a spatial cue rather than text alone. */}
                <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.progressRow} accessible={false}>
                    <View style={styles.progressSeg}>
                        <View style={[styles.progressBar, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.captionMedium, { color: colors.accent.coral, marginTop: spacing.xs }]} maxFontSizeMultiplier={1.3}>Setup</Text>
                    </View>
                    <View style={styles.progressSeg}>
                        <View style={[styles.progressBar, { backgroundColor: colors.border.light }]} />
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: spacing.xs }]} maxFontSizeMultiplier={1.3}>Workout</Text>
                    </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(100).duration(420)} style={styles.sectionHead}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]} maxFontSizeMultiplier={1.3}>Your Session</Text>
                    {routineCount > 0 ? (
                        <Text style={[typography.caption, { color: colors.text.tertiary }]} maxFontSizeMultiplier={1.3}>
                            {routineCount} {routineCount === 1 ? 'routine' : 'routines'}
                        </Text>
                    ) : null}
                </Animated.View>

                {/* Freestyle session — rendered in every state (loading / error /
                    loaded) since it doesn't depend on the routines list. Keeps the
                    user able to start a workout even when routines fail to load. */}
                <Animated.View entering={FadeInDown.delay(140).duration(420)}>
                    <OptionCard
                        icon="infinite"
                        iconTint={colors.accent.cyan}
                        title="Freestyle Session"
                        subtitle="Log any exercise as you go"
                        selected={selectedRoutine === null}
                        onPress={() => setSelectedRoutine(null)}
                    />
                </Animated.View>

                {loadingRoutines ? (
                    // Honest loading scaffold mirroring the routine cards (icon
                    // square + name/meta lines) instead of a bare spinner.
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} variant="glass" style={[styles.routineCard, { borderColor: colors.border.default }]}>
                            <Skeleton width={48} height={48} radius={borderRadius.lg} />
                            <View style={{ flex: 1, marginLeft: spacing.lg }}>
                                <Skeleton width="55%" height={16} radius={borderRadius.sm} />
                                <Skeleton width="35%" height={12} radius={borderRadius.sm} style={{ marginTop: spacing.sm }} />
                            </View>
                        </Card>
                    ))
                ) : isError ? (
                    // Honest retryable error — a failed fetch would otherwise read
                    // as "you have no routines". The retry refetches the routines
                    // query; the Freestyle option above stays usable meanwhile.
                    //
                    // The retry is deliberately a lime OUTLINE (not EmptyState's
                    // full-lime primary): the always-present "Start Workout" footer
                    // is the screen's single lime hero, so a second full-lime fill
                    // here would create two competing primaries in the thumb path
                    // and dilute the 10% accent. Outline keeps retry available but
                    // visually secondary. Hence no actionLabel/onAction on EmptyState.
                    <View style={styles.routinesError}>
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load your routines"
                            subtitle="Something went wrong fetching your saved routines. Check your connection and try again."
                        />
                        <View style={styles.retryRow}>
                            <Button
                                title="Try Again"
                                variant="outline"
                                icon={<Ionicons name="refresh" size={17} color={colors.accent.coral} />}
                                onPress={() => refetch()}
                                accessibilityLabel="Try again"
                            />
                        </View>
                    </View>
                ) : loadedEmpty ? (
                    // Loaded-and-empty — never a blank gap. Guides the user that
                    // Freestyle is ready while no saved routines exist yet.
                    <Animated.View entering={FadeIn.duration(360)}>
                        <EmptyState
                            icon="barbell-outline"
                            title="No saved routines yet"
                            subtitle="Start a Freestyle session above — your generated and saved routines will show up here."
                            style={styles.routinesError}
                        />
                    </Animated.View>
                ) : (
                    (routines || []).map((routine: any, idx: number) => {
                        const count = routine.exercises?.length || 0;
                        return (
                            <Animated.View key={routine.id} entering={FadeInDown.delay(180 + idx * 50).duration(420)}>
                                <OptionCard
                                    icon="list"
                                    iconTint={colors.accent.purple}
                                    title={routine.name}
                                    // Value-first meta: the exercise COUNT is the big
                                    // condensed numeral; "exercises · ~min" is the label.
                                    statValue={String(count)}
                                    statLabel={`${count === 1 ? 'exercise' : 'exercises'} · ~${count * 8} min`}
                                    selected={selectedRoutine === routine.id}
                                    onPress={() => setSelectedRoutine(routine.id)}
                                />
                            </Animated.View>
                        );
                    })
                )}
            </ScrollView>

            <Animated.View
                entering={FadeInDown.delay(220).duration(420)}
                style={[styles.footer, { paddingBottom: (insets.bottom || spacing.lg) + spacing.lg }]}
            >
                {/* Glass footer plate so the thumb-zone CTA reads as an elevated
                    action bar rather than a flat strip. */}
                <LinearGradient
                    colors={colors.gradients.card}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.footerPlate, { borderTopColor: colors.border.default }]}
                    pointerEvents="none"
                />
                {/* Selection summary — value-first confirmation of what's about to
                    start, so the thumb-zone CTA acts on a known choice. The session
                    NAME dominates; "Starting" is the quiet label above it. */}
                <View style={styles.selectionRow}>
                    <View style={[styles.selectionIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                        <Ionicons name={selectedRoutine ? 'list' : 'infinite'} size={18} color={colors.accent.coral} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Text style={[typography.overline, { color: colors.text.tertiary }]} maxFontSizeMultiplier={1.3}>Starting</Text>
                        <Text style={[typography.subtitle, { color: colors.text.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            {selectedName}
                        </Text>
                    </View>
                </View>
                <CtaButton
                    label="Start Workout"
                    icon="play"
                    size="lg"
                    loading={startMutation.isPending}
                    onPress={handleStart}
                    style={styles.startBtn}
                />
            </Animated.View>
        </View>
    );
}

/* ------------------------------------------------------------------ */
/* OptionCard — a selectable session tile. Lime is the ACTIVE-state    */
/* signal (the 10% accent): the selected tile gets a lime ring, lime   */
/* tint + soft lime halo and a lime check. Unselected tiles stay       */
/* neutral glass; the leading icon keeps its own low-intensity         */
/* semantic tint. Pressed-scale via the shared PressableScale recipe   */
/* (0.96 spring inset) so each tile feels tactile on touch.            */
/* ------------------------------------------------------------------ */
function OptionCard({
    icon,
    iconTint,
    title,
    subtitle,
    statValue,
    statLabel,
    selected,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    iconTint: string;
    title: string;
    subtitle?: string;
    statValue?: string;
    statLabel?: string;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors, typography, spacing, shadows } = useTheme();
    const lime = colors.accent.coral;

    return (
        <PressableScale
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={title}
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
        >
            {/* Outer NON-clipping wrapper carries the lime halo. The glow must NOT
                live on the Card itself: Card's glass branch renders a LinearGradient
                with overflow:'hidden', and iOS won't paint a shadow on an
                overflow:hidden node — so the premium selection halo never appeared.
                The wrapper has no overflow clip and mirrors the Card's radius (xl=20)
                so the iOS shadow is shaped to the card. The lime RING stays on the
                Card (borderColor) where the clip is harmless. */}
            <View style={[styles.cardWrap, selected && shadows.glow(lime)]}>
            <Card
                variant="glass"
                style={[
                    styles.routineCard,
                    styles.cardInner,
                    { borderColor: colors.border.default },
                    selected && { borderColor: lime },
                ]}
            >
                {/* Lime wash sits ABOVE the glass gradient on selection so the
                    active tile clearly tints toward the brand. */}
                {selected && (
                    <View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha(lime, 0.1) }]}
                    />
                )}

                <View style={[styles.iconBox, { backgroundColor: withAlpha(selected ? lime : iconTint, selected ? 0.18 : 0.16) }]}>
                    <Ionicons name={icon} size={24} color={selected ? lime : iconTint} />
                </View>

                <View style={{ flex: 1, marginLeft: spacing.lg }}>
                    {/* Allow the routine name a 2nd line at large Dynamic Type so it
                        wraps instead of truncating; capped so it can't blow out the
                        row height. */}
                    <Text style={[typography.subtitle, { color: colors.text.primary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>{title}</Text>

                    {/* value-first meta when present (routines): big condensed COUNT
                        leads, the unit/duration label follows beneath it. */}
                    {statValue ? (
                        <View style={styles.statRow}>
                            <Text style={[typography.statSmall, { color: selected ? lime : colors.text.primary }]} maxFontSizeMultiplier={1.3}>{statValue}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: spacing.sm, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                {statLabel}
                            </Text>
                        </View>
                    ) : subtitle ? (
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.xs }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{subtitle}</Text>
                    ) : null}
                </View>

                {/* Active-state check — the one lime key indicator per selected tile.
                    Unselected tiles show a hollow ring so the row keeps its rhythm. */}
                {selected ? (
                    <Ionicons name="checkmark-circle" size={26} color={lime} style={{ marginLeft: spacing.sm }} />
                ) : (
                    <View style={[styles.radioEmpty, { borderColor: colors.border.light }]} />
                )}
            </Card>
            </View>
        </PressableScale>
    );
}

function ImageBackgroundGradient() {
    const { colors } = useTheme();
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {/* Primary lime ambient wash from the top — the brand's warm halo. */}
            <LinearGradient
                colors={[withAlpha(colors.accent.coral, 0.16), 'transparent']}
                style={{ height: 340, width: '100%' }}
            />
            {/* Faint cool counter-wash from the lower edge for depth balance. */}
            <LinearGradient
                colors={['transparent', withAlpha(colors.accent.purple, 0.06)]}
                style={StyleSheet.absoluteFillObject}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingBottom: 8 },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 5,
        borderRadius: 3,
        marginBottom: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerSpacer: { width: 40, height: 40 },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hero: {
        marginBottom: 20,
    },
    stepBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
    },
    stepDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 8,
    },
    progressRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    progressSeg: {
        flex: 1,
    },
    progressBar: {
        height: 4,
        borderRadius: 2,
        width: '100%',
    },
    sectionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    routineCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
    },
    // Non-clipping halo wrapper for OptionCard. Owns the row's bottom spacing and
    // mirrors the Card radius (xl=20) so the iOS selection glow is shaped to the
    // card. (The loading-skeleton Cards keep their own marginBottom via
    // routineCard — only the wrapped OptionCard swaps to cardInner.)
    cardWrap: {
        borderRadius: 20,
        marginBottom: 12,
    },
    // Neutralizes routineCard's own bottom margin when the Card is inside
    // cardWrap, so spacing isn't doubled.
    cardInner: {
        marginBottom: 0,
    },
    // Centers the lime-outline retry beneath the error EmptyState.
    retryRow: {
        alignItems: 'center',
        marginTop: 8,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 2,
    },
    // Trim the EmptyState's default top padding so the routines error/empty
    // states sit naturally below the Freestyle card rather than floating.
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
    radioEmpty: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        marginLeft: 8,
    },
    selectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        paddingHorizontal: 4,
    },
    selectionIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
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
    },
    footerPlate: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1,
    },
    startBtn: {
        height: 56,
        borderRadius: 28,
    }
});
