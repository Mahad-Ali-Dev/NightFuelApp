import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import {
    getCycleSymptoms,
    logCycleSymptoms,
    type CycleSymptomEntry,
    type SymptomFlow,
    type SymptomDischarge,
    type SymptomActivity,
} from '@/api/cycle';
import {
    SYMPTOM_CATEGORIES,
    FLOW_OPTIONS,
    DISCHARGE_OPTIONS,
    ACTIVITY_OPTIONS,
    ALL_SYMPTOM_KEYS,
} from '@/features/cycle/symptoms';

/**
 * SymptomQuickLogCard — "How do you feel today?": the full Period P1 day log.
 *
 * Started as three one-tap chip rows (mood / cramps / energy); now grown into
 * the complete daily check-in the P1 spec asks for — flow, a categorized
 * multi-select of the 31 body-feel symptoms, discharge, activity, a water
 * stepper and free-text notes, all still on top of the original mood / cramps /
 * energy scales.
 *
 * One row per user per day server-side (upsert), so re-saving simply updates
 * today. Today's stored values pre-select every control on load (we read the
 * newest row from the trailing symptom window). Saving POSTs the FULL selected
 * `symptoms[]` array — the endpoint replaces the day's set, so an unchecked chip
 * is genuinely cleared.
 *
 * Sits with the other cycle cards (female-only + tracking-on by placement — the
 * whole screen is gated). Coral accent, matching the screen's sensitive
 * lower-contrast styling. Wellness logging, not a medical record.
 */

// The coral period accent is theme-aware — see useCycleAccents (dark #FF7A90,
// darkened on light); sourced per-render in every component below.

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

// Water stepper bounds — a gentle daily range, never a target/goal.
const WATER_MIN = 0;
const WATER_MAX = 30;

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Keep only keys the current catalog knows about (drops any retired slug). */
function sanitizeSymptoms(keys: string[] | null | undefined): string[] {
    if (!keys) return [];
    return keys.filter((k) => ALL_SYMPTOM_KEYS.has(k));
}

export function SymptomQuickLogCard() {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    const queryClient = useQueryClient();

    const symptomsQuery = useQuery({
        queryKey: ['cycle-symptoms'],
        queryFn: () => getCycleSymptoms(35),
    });

    // Today's stored row (if any) seeds the selections. The window is newest-
    // first, but match on the date to be explicit rather than trusting order.
    const todays: CycleSymptomEntry | undefined = useMemo(
        () => symptomsQuery.data?.symptoms.find((s) => (s.date ?? '').slice(0, 10) === todayKey()),
        [symptomsQuery.data],
    );

    // ── Original scales ────────────────────────────────────────────────────────
    const [mood, setMood] = useState<number | null>(null);
    const [cramps, setCramps] = useState<number | null>(null);
    const [energy, setEnergy] = useState<number | null>(null);
    // ── Period P1 additions ─────────────────────────────────────────────────────
    const [flow, setFlow] = useState<SymptomFlow | null>(null);
    const [symptoms, setSymptoms] = useState<Set<string>>(() => new Set());
    const [discharge, setDischarge] = useState<SymptomDischarge | null>(null);
    const [activity, setActivity] = useState<SymptomActivity | null>(null);
    const [water, setWater] = useState<number | null>(null);
    const [notes, setNotes] = useState('');

    // Seed once from today's row, when it arrives. `seeded` guards against
    // clobbering in-progress edits on a background refetch.
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
        if (seeded || !todays) return;
        setSeeded(true);
        setMood(todays.mood ?? null);
        setCramps(todays.cramps ?? null);
        setEnergy(todays.energy ?? null);
        setFlow(todays.flow && todays.flow !== 'NONE' ? todays.flow : null);
        setSymptoms(new Set(sanitizeSymptoms(todays.symptoms)));
        setDischarge(todays.discharge ?? null);
        setActivity(todays.activity ?? null);
        setWater(todays.water ?? null);
        setNotes(todays.notes ?? '');
    }, [todays, seeded]);

    /** Toggle a symptom key in the multi-select set (new Set → re-render). */
    const toggleSymptom = (key: string) => {
        setSymptoms((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const save = useMutation({
        // Send the FULL selected set — the endpoint replaces the day's symptoms[]
        // wholesale, so unchecked chips are cleared, not merely omitted.
        mutationFn: () =>
            logCycleSymptoms({
                date: todayKey(),
                ...(mood != null ? { mood } : {}),
                ...(cramps != null ? { cramps } : {}),
                ...(energy != null ? { energy } : {}),
                ...(flow != null ? { flow } : {}),
                symptoms: Array.from(symptoms),
                ...(discharge != null ? { discharge } : {}),
                ...(activity != null ? { activity } : {}),
                ...(water != null ? { water } : {}),
                ...(notes.trim() ? { notes: notes.trim() } : {}),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cycle-symptoms'] });
        },
    });

    // "Dirty" = the user has expressed anything worth saving. Notes-only counts.
    const dirty =
        mood != null ||
        cramps != null ||
        energy != null ||
        flow != null ||
        symptoms.size > 0 ||
        discharge != null ||
        activity != null ||
        water != null ||
        notes.trim().length > 0;
    const savedToday = !!todays && !save.isPending;

    return (
        <View style={styles.wrap} testID="symptom-quick-log">
            <Text style={[typography.h3, styles.heading, { color: colors.text.primary }]}>
                How do you feel today?
            </Text>

            <GlassCard radius={borderRadius.xl}>
                <View style={styles.inner}>
                    {/* ── Flow (single-select) ──────────────────────────────────── */}
                    <PillRow
                        label="Flow"
                        options={FLOW_OPTIONS}
                        value={flow}
                        onSelect={setFlow}
                    />

                    {/* ── Original scales ────────────────────────────────────────── */}
                    <ChipRow label="Mood" options={MOODS} value={mood} onSelect={setMood} big />
                    <ChipRow label="Cramps" options={CRAMPS} value={cramps} onSelect={setCramps} />
                    <ChipRow label="Energy" options={ENERGY} value={energy} onSelect={setEnergy} />

                    {/* ── Symptoms (multi-select, grouped by category) ───────────── */}
                    <View style={styles.section}>
                        <Text style={[typography.bodySm, styles.sectionLabel, { color: colors.text.secondary }]}>
                            Symptoms
                        </Text>
                        {SYMPTOM_CATEGORIES.map((cat) => (
                            <View key={cat.key} style={styles.category}>
                                <Text style={[typography.caption, styles.categoryTitle, { color: colors.text.tertiary }]}>
                                    {cat.title}
                                </Text>
                                <View style={styles.chips}>
                                    {cat.items.map((item) => {
                                        const active = symptoms.has(item.key);
                                        return (
                                            <Pressable
                                                key={item.key}
                                                onPress={() => toggleSymptom(item.key)}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: active }}
                                                accessibilityLabel={`${cat.title}: ${item.label}`}
                                                style={[
                                                    styles.symptomChip,
                                                    {
                                                        backgroundColor: active ? withAlpha(CORAL, 0.18) : 'transparent',
                                                        borderColor: active ? CORAL : colors.border.light,
                                                    },
                                                ]}
                                            >
                                                {/* Ionicons glyph names are plain strings in the catalog. */}
                                                <Ionicons
                                                    name={item.icon as any}
                                                    size={14}
                                                    color={active ? CORAL : colors.text.tertiary}
                                                    style={styles.symptomIcon}
                                                />
                                                <Text
                                                    style={[
                                                        typography.caption,
                                                        { color: active ? colors.text.primary : colors.text.secondary },
                                                    ]}
                                                >
                                                    {item.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* ── Discharge (single-select) ─────────────────────────────── */}
                    <PillRow
                        label="Discharge"
                        options={DISCHARGE_OPTIONS}
                        value={discharge}
                        onSelect={setDischarge}
                    />

                    {/* ── Activity (single-select) ──────────────────────────────── */}
                    <PillRow
                        label="Activity"
                        options={ACTIVITY_OPTIONS}
                        value={activity}
                        onSelect={setActivity}
                    />

                    {/* ── Water (+/- stepper, 0..30 glasses) ─────────────────────── */}
                    <View style={styles.section}>
                        <Text style={[typography.bodySm, styles.sectionLabel, { color: colors.text.secondary }]}>
                            Water
                        </Text>
                        <View style={styles.stepperRow}>
                            <StepperButton
                                icon="remove"
                                accessibilityLabel="One fewer glass of water"
                                disabled={(water ?? 0) <= WATER_MIN}
                                onPress={() => setWater((w) => Math.max(WATER_MIN, (w ?? 0) - 1))}
                            />
                            <View style={styles.stepperValue}>
                                <Text style={[typography.statSmall, { color: colors.text.primary }]}>
                                    {water ?? 0}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                    {(water ?? 0) === 1 ? 'glass' : 'glasses'}
                                </Text>
                            </View>
                            <StepperButton
                                icon="add"
                                accessibilityLabel="One more glass of water"
                                disabled={(water ?? 0) >= WATER_MAX}
                                onPress={() => setWater((w) => Math.min(WATER_MAX, (w ?? 0) + 1))}
                            />
                        </View>
                    </View>

                    {/* ── Notes (free text) ─────────────────────────────────────── */}
                    <View style={styles.section}>
                        <Text style={[typography.bodySm, styles.sectionLabel, { color: colors.text.secondary }]}>
                            Notes
                        </Text>
                        <TextInput
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Anything else you'd like to remember about today…"
                            placeholderTextColor={colors.text.tertiary}
                            multiline
                            maxLength={500}
                            accessibilityLabel="Notes for today"
                            style={[
                                styles.notes,
                                typography.body,
                                {
                                    color: colors.text.primary,
                                    backgroundColor: colors.background.secondary,
                                    borderColor: colors.border.light,
                                },
                            ]}
                        />
                    </View>

                    <Pressable
                        onPress={() => { if (dirty && !save.isPending) save.mutate(); }}
                        disabled={!dirty || save.isPending}
                        accessibilityRole="button"
                        accessibilityLabel="Save today's log"
                        style={({ pressed }) => [
                            styles.saveBtn,
                            {
                                backgroundColor: dirty ? CORAL : withAlpha(CORAL, 0.25),
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

/** One labelled chip row; single-select with coral active state (numeric scales). */
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
    const { coral: CORAL } = useCycleAccents();
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

/**
 * A labelled single-select row for the STRING-valued option lists (flow /
 * discharge / activity). Same coral active treatment as ChipRow, but generic
 * over the value type so each enum keeps its own union. Tapping the active pill
 * clears it (back to "unset").
 */
function PillRow<T extends string>({
    label,
    options,
    value,
    onSelect,
}: {
    label: string;
    options: Array<{ v: T; label: string }>;
    value: T | null;
    onSelect: (v: T | null) => void;
}) {
    const { colors, typography } = useTheme();
    const { coral: CORAL } = useCycleAccents();
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
                                {
                                    backgroundColor: active ? withAlpha(CORAL, 0.18) : 'transparent',
                                    borderColor: active ? CORAL : colors.border.light,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    typography.bodySm,
                                    { color: active ? colors.text.primary : colors.text.secondary },
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

/** Round +/- control for the water stepper; coral-tinted, dims when at a bound. */
function StepperButton({
    icon,
    onPress,
    disabled,
    accessibilityLabel,
}: {
    icon: 'add' | 'remove';
    onPress: () => void;
    disabled?: boolean;
    accessibilityLabel: string;
}) {
    const { colors } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    return (
        <Pressable
            onPress={() => { if (!disabled) onPress(); }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
                styles.stepperBtn,
                {
                    backgroundColor: withAlpha(CORAL, disabled ? 0.08 : 0.16),
                    borderColor: withAlpha(CORAL, disabled ? 0.2 : 0.4),
                    opacity: pressed ? 0.85 : 1,
                },
            ]}
        >
            <Ionicons name={icon} size={20} color={disabled ? colors.text.tertiary : CORAL} />
        </Pressable>
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
    // Grouped sub-sections (symptoms / water / notes) sit under a slim divider so
    // the longer form reads as distinct blocks, not one dense wall of chips.
    section: {
        marginTop: 4,
        marginBottom: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    sectionLabel: { marginBottom: 10 },
    category: { marginBottom: 10 },
    categoryTitle: { marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase' },
    symptomChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    symptomIcon: { marginRight: 5 },
    // Water stepper — two round coral controls flanking the current count.
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepperBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepperValue: { alignItems: 'center', minWidth: 72 },
    notes: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 72,
        textAlignVertical: 'top',
    },
    saveBtn: {
        marginTop: 4,
        alignItems: 'center',
        borderRadius: 14,
        paddingVertical: 12,
    },
});

export default SymptomQuickLogCard;
