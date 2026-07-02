import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import {
    getCycleSymptoms,
    logCycleSymptoms,
    type CycleSymptomEntry,
} from '@/api/cycle';

/**
 * SymptomQuickLogCard — "How do you feel today?": three one-tap chip rows
 * (mood / cramps / energy) + save. One row per user per day server-side
 * (upsert), so re-saving simply updates today. Today's stored values pre-select
 * the chips on load.
 *
 * Sits with the other cycle cards (female-only + tracking-on by placement —
 * the whole screen is gated). Coral accent, matching the screen's sensitive
 * lower-contrast styling. Wellness logging, not a medical record.
 */

const CORAL = '#FF7A90';

const MOODS = [
    { v: 1, label: '😞' },
    { v: 2, label: '🙁' },
    { v: 3, label: '😐' },
    { v: 4, label: '🙂' },
    { v: 5, label: '😄' },
];
const CRAMPS = [
    { v: 0, label: 'None' },
    { v: 1, label: 'Mild' },
    { v: 2, label: 'Moderate' },
    { v: 3, label: 'Strong' },
];
const ENERGY = [
    { v: 1, label: 'Drained' },
    { v: 2, label: 'Low' },
    { v: 3, label: 'OK' },
    { v: 4, label: 'Good' },
    { v: 5, label: 'High' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

export function SymptomQuickLogCard() {
    const { colors, typography, borderRadius } = useTheme();
    const queryClient = useQueryClient();

    const symptomsQuery = useQuery({
        queryKey: ['cycle-symptoms'],
        queryFn: () => getCycleSymptoms(35),
    });

    // Today's stored row (if any) seeds the selections.
    const todays: CycleSymptomEntry | undefined = useMemo(
        () => symptomsQuery.data?.symptoms.find((s) => (s.date ?? '').slice(0, 10) === todayKey()),
        [symptomsQuery.data],
    );

    const [mood, setMood] = useState<number | null>(null);
    const [cramps, setCramps] = useState<number | null>(null);
    const [energy, setEnergy] = useState<number | null>(null);
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
        if (seeded || !todays) return;
        setSeeded(true);
        setMood(todays.mood ?? null);
        setCramps(todays.cramps ?? null);
        setEnergy(todays.energy ?? null);
    }, [todays, seeded]);

    const save = useMutation({
        mutationFn: () =>
            logCycleSymptoms({
                date: todayKey(),
                ...(mood != null ? { mood } : {}),
                ...(cramps != null ? { cramps } : {}),
                ...(energy != null ? { energy } : {}),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cycle-symptoms'] });
        },
    });

    const dirty = mood != null || cramps != null || energy != null;
    const savedToday = !!todays && !save.isPending;

    return (
        <View style={styles.wrap} testID="symptom-quick-log">
            <Text style={[typography.h3, styles.heading, { color: colors.text.primary }]}>
                How do you feel today?
            </Text>

            <GlassCard radius={borderRadius.xl}>
                <View style={styles.inner}>
                    <ChipRow
                        label="Mood"
                        options={MOODS}
                        value={mood}
                        onSelect={setMood}
                        big
                    />
                    <ChipRow
                        label="Cramps"
                        options={CRAMPS}
                        value={cramps}
                        onSelect={setCramps}
                    />
                    <ChipRow
                        label="Energy"
                        options={ENERGY}
                        value={energy}
                        onSelect={setEnergy}
                    />

                    <Pressable
                        onPress={() => { if (dirty && !save.isPending) save.mutate(); }}
                        disabled={!dirty || save.isPending}
                        accessibilityRole="button"
                        accessibilityLabel="Save today's symptoms"
                        style={({ pressed }) => [
                            styles.saveBtn,
                            {
                                backgroundColor: dirty ? colors.accent.coral : withAlpha(CORAL, 0.25),
                                opacity: pressed ? 0.85 : 1,
                            },
                        ]}
                    >
                        <Text style={[typography.bodyMedium, { color: colors.text.inverse, fontWeight: '700' }]}>
                            {save.isPending ? 'Saving…' : savedToday ? 'Update today' : 'Save today'}
                        </Text>
                    </Pressable>

                    {save.isError ? (
                        <Text style={[typography.caption, { color: colors.error, marginTop: 8, textAlign: 'center' }]}>
                            Couldn't save — try again.
                        </Text>
                    ) : savedToday ? (
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8, textAlign: 'center' }]}>
                            Logged for today — tap to adjust anytime.
                        </Text>
                    ) : null}
                </View>
            </GlassCard>
        </View>
    );
}

/** One labelled chip row; single-select with coral active state. */
function ChipRow({
    label,
    options,
    value,
    onSelect,
    big = false,
}: {
    label: string;
    options: Array<{ v: number; label: string }>;
    value: number | null;
    onSelect: (v: number | null) => void;
    big?: boolean;
}) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.row}>
            <Text style={[typography.bodySm, { color: colors.text.secondary, marginBottom: 7 }]}>
                {label}
            </Text>
            <View style={styles.chips}>
                {options.map((o) => {
                    const active = value === o.v;
                    return (
                        <Pressable
                            key={o.v}
                            onPress={() => onSelect(active ? null : o.v)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${label}: ${o.label}`}
                            style={[
                                styles.chip,
                                big && styles.chipBig,
                                {
                                    backgroundColor: active ? withAlpha(CORAL, 0.18) : 'transparent',
                                    borderColor: active ? CORAL : colors.border.light,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    big ? styles.emoji : typography.bodySm,
                                    !big && { color: active ? colors.text.primary : colors.text.secondary },
                                ]}
                            >
                                {o.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginTop: 18 },
    heading: { marginBottom: 12 },
    inner: { padding: 14 },
    row: { marginBottom: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    chipBig: { paddingHorizontal: 10, paddingVertical: 6 },
    emoji: { fontSize: 22 },
    saveBtn: {
        marginTop: 4,
        alignItems: 'center',
        borderRadius: 14,
        paddingVertical: 12,
    },
});

export default SymptomQuickLogCard;
