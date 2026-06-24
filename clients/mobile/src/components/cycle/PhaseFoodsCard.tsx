import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { GlassCard, Skeleton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { getPhaseFoods, type CyclePhaseName, type FoodItem } from '@/api/meals';
import { getMicronutrientMeta, formatMicroAmount } from '@/lib/micronutrients';

/**
 * PhaseFoodsCard — "Best foods for your <phase> phase" (cycle screen, below the
 * CyclePhaseCard). Calls GET /v1/meals/phase-foods for a CONCRETE phase and
 * renders the backend's wellness-worded `rationale` plus a horizontal scroll of
 * food cards (image + name + the focus-nutrient amount, e.g. "Iron 6.4 mg").
 *
 * GATED LIKE CyclePhaseCard: it renders NOTHING unless `phase` is a concrete
 * MENSTRUAL / FOLLICULAR / OVULATORY / LUTEAL — never for null/undefined (no
 * tracking) or 'UNKNOWN' (tracking on, no estimate). The endpoint has no focus
 * nutrient for those, so we never call it.
 *
 * NON-PRESCRIPTIVE: the copy is wellness guidance, not medical/dietary advice —
 * the rationale is shown verbatim from the backend, which is worded that way.
 */

/** Phase as it arrives from the status query — may be absent or 'UNKNOWN'. */
type IncomingPhase = CyclePhaseName | 'UNKNOWN' | null | undefined;

const CONCRETE_PHASES: readonly CyclePhaseName[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL'];

/** Type guard: is this a concrete phase the endpoint accepts? */
function isConcretePhase(phase: IncomingPhase): phase is CyclePhaseName {
    return phase != null && (CONCRETE_PHASES as readonly string[]).includes(phase);
}

/** Title-case a phase for the heading, e.g. MENSTRUAL → "menstrual". */
function phaseWord(phase: CyclePhaseName): string {
    return phase.charAt(0) + phase.slice(1).toLowerCase();
}

export interface PhaseFoodsCardProps {
    /** Derived cycle phase from GET /v1/users/me/status. Gated to concrete phases. */
    phase?: IncomingPhase;
}

export function PhaseFoodsCard({ phase }: PhaseFoodsCardProps) {
    const { colors, typography, borderRadius } = useTheme();

    const concrete = isConcretePhase(phase) ? phase : null;

    const query = useQuery({
        queryKey: ['phase-foods', concrete],
        queryFn: () => getPhaseFoods(concrete as CyclePhaseName),
        // Only fetch for a concrete phase; the card is hidden otherwise.
        enabled: concrete != null,
        staleTime: 60 * 60 * 1000, // an hour — the curated set barely changes.
    });

    // GATE: hide entirely for null / undefined / 'UNKNOWN' — matches how
    // CyclePhaseCard refuses to fabricate a phase.
    if (concrete == null) return null;

    const heading = `Best foods for your ${phaseWord(concrete)} phase`;

    return (
        <GlassCard
            glow={withAlpha(colors.accent.coral, 0.12)}
            radius={borderRadius['2xl']}
            style={styles.card}
            testID="phase-foods-card"
        >
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="nutrition-outline" size={18} color={colors.accent.coral} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        {heading.toUpperCase()}
                    </Text>
                </View>

                {query.isLoading ? (
                    <View style={styles.loadingRow}>
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} width={120} height={150} radius={14} style={{ marginRight: 12 }} />
                        ))}
                    </View>
                ) : query.isError ? (
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 10 }]}>
                        Couldn't load phase foods right now. Pull to refresh or check back later.
                    </Text>
                ) : query.data && query.data.foods.length > 0 ? (
                    <>
                        {/* Backend rationale — wellness guidance, shown verbatim. */}
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8 }]}>
                            {query.data.rationale}
                        </Text>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContent}
                            style={styles.scroll}
                        >
                            {query.data.foods.map((food) => (
                                <PhaseFoodCard
                                    key={food.id}
                                    food={food}
                                    focusNutrient={query.data.focusNutrient as string}
                                />
                            ))}
                        </ScrollView>

                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 10 }]}>
                            General wellness guidance, not medical or dietary advice.
                        </Text>
                    </>
                ) : (
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 10 }]}>
                        No suggestions for this phase yet.
                    </Text>
                )}
            </View>
        </GlassCard>
    );
}

/** A single food tile in the horizontal scroll: image + name + focus amount. */
function PhaseFoodCard({ food, focusNutrient }: { food: FoodItem; focusNutrient: string }) {
    const { colors, typography } = useTheme();

    // The focus amount is the food's value for the phase's focus micronutrient
    // (e.g. ironMg → "Iron 6.4 mg"). Render it only when both the field is a
    // known micronutrient AND the food carries a finite value for it.
    const meta = getMicronutrientMeta(focusNutrient);
    const raw = (food as unknown as Record<string, unknown>)[focusNutrient];
    const focusValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    const focusText = meta && focusValue != null ? `${meta.label} ${formatMicroAmount(meta, focusValue)}` : null;

    return (
        <View
            style={[styles.foodCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
            accessible
            accessibilityLabel={focusText ? `${food.name}, ${focusText}` : food.name}
        >
            {/* Image-bearing rows come from Open Food Facts (imageUrl populated);
                FooDB rows are nutrition-only with no imageUrl. Rather than a bare
                blank, show a clearly branded coral "no photo" placeholder so the
                tile reads intentionally. */}
            <View
                style={[
                    styles.foodImgWrap,
                    { backgroundColor: colors.background.tertiary },
                    !food.imageUrl && { borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.18) },
                ]}
            >
                {food.imageUrl ? (
                    <Image
                        source={{ uri: food.imageUrl }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                    />
                ) : (
                    <>
                        <Ionicons name="nutrition-outline" size={26} color={colors.accent.coral} />
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4, fontSize: 10 }]}>
                            No photo
                        </Text>
                    </>
                )}
            </View>
            <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={2}>
                {food.name}
            </Text>
            {focusText ? (
                <Text style={[typography.caption, { color: colors.accent.coral, marginTop: 2, fontSize: 11 }]}>
                    {focusText}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1, flex: 1 },
    loadingRow: { flexDirection: 'row', marginTop: 14 },
    scroll: { marginTop: 14 },
    scrollContent: { paddingRight: 4 },
    foodCard: {
        width: 124,
        borderRadius: 14,
        borderWidth: 1,
        padding: 10,
        marginRight: 12,
    },
    foodImgWrap: {
        width: '100%',
        height: 84,
        borderRadius: 10,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
});

export default PhaseFoodsCard;
