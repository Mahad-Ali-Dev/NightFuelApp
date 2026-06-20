import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

/**
 * One logged set as GROUND TRUTH (state-ground-truth): the raw numbers plus a
 * `completed` flag. The displayed "N / M" count is DERIVED from these flags, not
 * tracked in a parallel counter.
 */
interface LoggedSet {
    reps: number;
    weightKg: number;
    completed: boolean;
}

interface SetLoggerProps {
    exerciseName: string;
    targetSets: number;
    onLogSet: (setData: { reps: number; weightKg: number }) => void;
    /**
     * Sets already logged for this exercise, used to SEED the logger so a resumed
     * session opens at N / M instead of 0 / M. Seeded ONCE via a lazy useState
     * initializer (react-state-fallback) so later in-place edits / toggles are
     * never clobbered by a re-render. Each entry's `completed` defaults to true
     * (a seeded set is a set that was logged). Pure visual seed — does NOT call
     * `onLogSet`, so the parent's own count is never double-incremented.
     */
    initialSets?: ReadonlyArray<{ reps: number; weightKg: number; completed?: boolean }>;
    /**
     * Allow editing an already-logged set's KG / REPS in place + toggling its
     * DONE flag. Defaults to false so the modal's additive "Add Set" reveal keeps
     * its read-only logged rows + static check exactly as before; the routed
     * workout screen opts in.
     */
    allowEdit?: boolean;
    /**
     * Allow adding extra sets past `targetSets` and removing a logged set.
     * Defaults to false (additive modal default); the routed workout screen opts
     * in. When true the input row stays visible even at/over target so more sets
     * can be appended.
     */
    allowAddRemove?: boolean;
}

/**
 * Parse + validate a reps/weight pair — the SINGLE numeric entry point shared by
 * the input-row add, the in-row edit-commit, and any future path. Reps must be a
 * finite integer >= 1; weight a finite number >= 0 (bodyweight moves log 0kg).
 * Bare parseInt/parseFloat turn 'abc' into NaN and '0'/'-5' into 0/negatives —
 * none of which should reach onLogSet or the loggedSets list. Returns null when
 * the entry is junk, so every caller rejects identically.
 */
function validateSet(repsStr: string, weightStr: string): { reps: number; weightKg: number } | null {
    const repsN = parseInt(repsStr, 10);
    const weightN = parseFloat(weightStr);
    if (!Number.isFinite(repsN) || repsN < 1 || !Number.isFinite(weightN) || weightN < 0) return null;
    return { reps: repsN, weightKg: weightN };
}

export function SetLogger({
    exerciseName,
    targetSets,
    onLogSet,
    initialSets,
    allowEdit = false,
    allowAddRemove = false,
}: SetLoggerProps) {
    const [reps, setReps] = useState('');
    const [weight, setWeight] = useState('');
    // Lazy initializer seeds the list ONCE from initialSets (react-state-fallback)
    // — a later parent re-render never re-seeds and clobbers in-place edits.
    const [loggedSets, setLoggedSets] = useState<LoggedSet[]>(() =>
        initialSets
            ? initialSets.map((s) => ({ reps: s.reps, weightKg: s.weightKg, completed: s.completed ?? true }))
            : [],
    );

    // Count of completed sets, DERIVED from the ground-truth flags (state-ground-
    // truth) — no separate counter to drift.
    const completedCount = loggedSets.filter((s) => s.completed).length;

    // Add a set from the input row through the shared guard. Junk → no-op (no
    // onLogSet, no row); a valid entry appends a completed row, fires onLogSet
    // once, and clears the inputs. Immutable append (react-state-dispatcher).
    const handleLog = () => {
        const valid = validateSet(reps, weight);
        if (!valid) return;
        setLoggedSets((prev) => [...prev, { ...valid, completed: true }]);
        onLogSet(valid);
        setReps('');
        setWeight('');
    };

    // Commit an in-row edit of one logged set's KG or REPS through the SAME guard.
    // The edited field's draft text is combined with the row's other current
    // value; junk → the row is left untouched (immutable .map, never in-place —
    // react-state-dispatcher). No onLogSet here: editing an already-counted set
    // must not re-increment the parent's set count.
    const commitEdit = (index: number, field: 'reps' | 'weightKg', text: string) => {
        setLoggedSets((prev) => {
            const row = prev[index];
            if (!row) return prev;
            const repsStr = field === 'reps' ? text : String(row.reps);
            const weightStr = field === 'weightKg' ? text : String(row.weightKg);
            const valid = validateSet(repsStr, weightStr);
            if (!valid) return prev;
            return prev.map((s, i) => (i === index ? { ...s, ...valid } : s));
        });
    };

    // Toggle one set's DONE flag. Immutable .map (react-state-dispatcher); the
    // derived count updates from the flags.
    const toggleDone = (index: number) => {
        setLoggedSets((prev) => prev.map((s, i) => (i === index ? { ...s, completed: !s.completed } : s)));
    };

    // Remove one logged set (immutable filter).
    const removeSet = (index: number) => {
        setLoggedSets((prev) => prev.filter((_, i) => i !== index));
    };

    // The input row is the add path. It shows while below target; with
    // allowAddRemove it stays visible so extra sets can be appended past target.
    const showInputRow = allowAddRemove || loggedSets.length < targetSets;

    return (
        <View style={styles.container}>
            <Text style={styles.exercise}>{exerciseName}</Text>
            <Text style={styles.setCount}>{completedCount} / {targetSets} sets</Text>

            {/* Logged Sets */}
            {loggedSets.map((s, i) => (
                <View key={i} style={styles.loggedRow}>
                    <Text style={styles.setNum}>Set {i + 1}</Text>

                    {/* KG / REPS — editable in place when allowed, else static.
                        Controlled by the row's own number and committed through the
                        SAME guard on change: a valid edit updates the displayed
                        value, junk leaves the row's value untouched (it snaps back). */}
                    {allowEdit ? (
                        <TextInput
                            accessibilityLabel={`Reps for set ${i + 1}`}
                            style={styles.rowInput}
                            keyboardType="numeric"
                            value={String(s.reps)}
                            onChangeText={(t) => commitEdit(i, 'reps', t)}
                        />
                    ) : (
                        <Text style={styles.loggedVal}>{s.reps} reps</Text>
                    )}
                    {allowEdit ? (
                        <TextInput
                            accessibilityLabel={`Weight in kilograms for set ${i + 1}`}
                            style={styles.rowInput}
                            keyboardType="decimal-pad"
                            value={String(s.weightKg)}
                            onChangeText={(t) => commitEdit(i, 'weightKg', t)}
                        />
                    ) : (
                        <Text style={styles.loggedVal}>{s.weightKg} kg</Text>
                    )}

                    {/* Per-set DONE control. Pressable toggle when allowEdit (>=44pt
                        + hitSlop, role=button, accessibilityState.selected reflects
                        the flag); otherwise the original static check glyph so the
                        modal's read-only rows are unchanged. */}
                    {allowEdit ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Mark set ${i + 1} done`}
                            accessibilityState={{ selected: s.completed }}
                            hitSlop={8}
                            style={styles.doneBtn}
                            onPress={() => toggleDone(i)}
                        >
                            <Ionicons
                                name={s.completed ? 'checkmark-circle' : 'ellipse-outline'}
                                size={22}
                                color={s.completed ? colors.accent.cyan : colors.text.tertiary}
                            />
                        </Pressable>
                    ) : (
                        <Ionicons name="checkmark-circle" size={18} color={colors.accent.cyan} />
                    )}

                    {/* Remove control (opt-in). */}
                    {allowAddRemove ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove set ${i + 1}`}
                            hitSlop={8}
                            style={styles.removeBtn}
                            onPress={() => removeSet(i)}
                        >
                            <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
                        </Pressable>
                    ) : null}
                </View>
            ))}

            {/* Input Row (the guarded add path). Ternary-null per
                rendering-no-falsy-and. */}
            {showInputRow ? (
                <View style={styles.inputRow}>
                    <TextInput accessibilityLabel="Reps" style={styles.input} placeholder="Reps" placeholderTextColor={colors.text.tertiary} keyboardType="numeric" value={reps} onChangeText={setReps} />
                    <TextInput accessibilityLabel="Weight in kilograms" style={styles.input} placeholder="Weight (kg)" placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
                    <Pressable accessibilityRole="button" accessibilityLabel="Log set" hitSlop={8} style={styles.logBtn} onPress={handleLog}>
                        <Ionicons name="checkmark" size={22} color={colors.text.primary} />
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: colors.background.secondary, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border.default, marginBottom: 16 },
    exercise: { color: colors.text.primary, fontSize: 18, fontWeight: '700' },
    setCount: { color: colors.text.secondary, fontSize: 13, marginTop: 4, marginBottom: 16 },
    loggedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.background.primary, gap: 16 },
    setNum: { color: colors.text.secondary, fontSize: 12, width: 48 },
    loggedVal: { color: colors.text.primary, fontSize: 14, fontWeight: '600', flex: 1 },
    rowInput: { flex: 1, backgroundColor: colors.background.primary, borderRadius: 10, paddingHorizontal: 12, height: 40, color: colors.text.primary, fontSize: 14, fontWeight: '600', borderWidth: 1, borderColor: colors.border.light },
    doneBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    removeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    inputRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    input: { flex: 1, backgroundColor: colors.background.primary, borderRadius: 12, paddingHorizontal: 14, height: 44, color: colors.text.primary, fontSize: 14, borderWidth: 1, borderColor: colors.border.light },
    logBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent.coral, alignItems: 'center', justifyContent: 'center' },
});
