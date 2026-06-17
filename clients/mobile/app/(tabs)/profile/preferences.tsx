import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, TextInput, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPreferences, updatePreferences, UserPreferences } from '@/api/profile';
import { Button, Card, DateTimeField, Input, Skeleton } from '@/components/ui';

const DIETARY_OPTIONS = ['Classic', 'Keto', 'Vegan', 'Vegetarian', 'Pescatarian', 'Paleo'];

type EditableTimeField = 'wakeTime' | 'sleepTime' | 'workStartTime' | 'workEndTime';
type EditableHoursField = 'sleepTargetHours';
type EditTarget =
    | { kind: 'time'; field: EditableTimeField; label: string }
    | { kind: 'hours'; field: EditableHoursField; label: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function PreferencesScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: initialPrefs, isLoading } = useQuery({
        queryKey: ['my-preferences'],
        queryFn: getPreferences,
    });

    const [prefs, setPrefs] = useState<UserPreferences | null>(null);
    const [editing, setEditing] = useState<EditTarget | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editError, setEditError] = useState('');
    const [allergyInput, setAllergyInput] = useState('');

    useEffect(() => {
        if (initialPrefs) {
            // Defensively default the array fields the UI iterates over, in case
            // the backend omits them — prevents `.some`/`.filter`/`.map` crashes.
            setPrefs({
                ...initialPrefs,
                allergies: initialPrefs.allergies ?? [],
                dislikedIngredients: initialPrefs.dislikedIngredients ?? [],
                medications: initialPrefs.medications ?? [],
                supplements: initialPrefs.supplements ?? [],
            });
        }
    }, [initialPrefs]);

    const updateMutation = useMutation({
        mutationFn: updatePreferences,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-preferences'] });
            Alert.alert('Success', 'Preferences updated');
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to update preferences');
        }
    });

    if (isLoading || !prefs) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                    <View style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </View>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>Preferences</Text>
                    <View style={{ width: 40 }} />
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <Skeleton width={180} height={14} radius={borderRadius.sm} style={{ marginBottom: 16 }} />
                        <Skeleton width="100%" height={300} radius={borderRadius['2xl']} />
                    </View>
                    <View style={[styles.section, { marginTop: 32 }]}>
                        <Skeleton width={200} height={14} radius={borderRadius.sm} style={{ marginBottom: 16 }} />
                        <Skeleton width={120} height={12} radius={borderRadius.sm} style={{ marginBottom: 12 }} />
                        <View style={styles.grid}>
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} width="30%" height={44} radius={borderRadius.lg} />
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // Bug fix #4: tapping the already-selected diet clears it instead of being a dead tap.
    const toggleDiet = (diet: string) => {
        setPrefs(prev => prev ? ({ ...prev, dietaryType: prev.dietaryType === diet ? '' : diet }) : null);
    };

    const openEdit = (target: EditTarget) => {
        if (!prefs) return;
        const current = target.kind === 'hours'
            ? String(prefs.sleepTargetHours)
            : prefs[target.field];
        setEditValue(current ?? '');
        setEditError('');
        setEditing(target);
    };

    const closeEdit = () => {
        setEditing(null);
        setEditValue('');
        setEditError('');
    };

    const saveEdit = () => {
        if (!editing || !prefs) return;
        const value = editValue.trim();
        if (editing.kind === 'time') {
            if (!TIME_RE.test(value)) {
                setEditError('Use 24-hour HH:MM (e.g. 07:30)');
                return;
            }
            setPrefs({ ...prefs, [editing.field]: value });
        } else {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 1 || n > 24) {
                setEditError('Enter hours between 1 and 24');
                return;
            }
            setPrefs({ ...prefs, sleepTargetHours: n });
        }
        closeEdit();
    };

    const addAllergy = () => {
        const value = allergyInput.trim();
        if (!value || !prefs) return;
        if (prefs.allergies.some(a => a.toLowerCase() === value.toLowerCase())) {
            setAllergyInput('');
            return;
        }
        setPrefs({ ...prefs, allergies: [...prefs.allergies, value] });
        setAllergyInput('');
    };

    const removeAllergy = (a: string) => {
        if (!prefs) return;
        setPrefs({ ...prefs, allergies: prefs.allergies.filter(x => x !== a) });
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Preferences</Text>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ disabled: updateMutation.isPending }}
                    onPress={() => updateMutation.mutate(prefs)}
                    disabled={updateMutation.isPending}
                    activeOpacity={0.85}
                >
                    <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: 'bold', opacity: updateMutation.isPending ? 0.5 : 1 }]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Circadian Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="moon-outline" size={20} color={colors.accent.purple} />
                        <Text style={[typography.overline, { color: colors.accent.purple, marginLeft: 12 }]}>CIRCADIAN RHYTHM</Text>
                    </View>
                    <Card variant="glass" style={[styles.prefCard, { borderColor: colors.border.default }]}>
                        <TimeRow
                            label="Sleep Target"
                            value={`${prefs.sleepTargetHours}h`}
                            onEdit={() => openEdit({ kind: 'hours', field: 'sleepTargetHours', label: 'Sleep Target (hours)' })}
                        />
                        <TimeRow
                            label="Typical Wake Time"
                            value={prefs.wakeTime}
                            onEdit={() => openEdit({ kind: 'time', field: 'wakeTime', label: 'Typical Wake Time' })}
                        />
                        <TimeRow
                            label="Typical Sleep Time"
                            value={prefs.sleepTime}
                            onEdit={() => openEdit({ kind: 'time', field: 'sleepTime', label: 'Typical Sleep Time' })}
                        />
                        <TimeRow
                            label="Current Shift Start"
                            value={prefs.workStartTime}
                            onEdit={() => openEdit({ kind: 'time', field: 'workStartTime', label: 'Current Shift Start' })}
                        />
                        <TimeRow
                            label="Current Shift End"
                            value={prefs.workEndTime}
                            onEdit={() => openEdit({ kind: 'time', field: 'workEndTime', label: 'Current Shift End' })}
                            isLast
                        />
                    </Card>
                </View>

                {/* Metabolic Section */}
                <View style={[styles.section, { marginTop: 32 }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="nutrition-outline" size={20} color={colors.accent.emerald} />
                        <Text style={[typography.overline, { color: colors.accent.emerald, marginLeft: 12 }]}>METABOLIC PREFERENCES</Text>
                    </View>

                    <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 12 }]}>DIETARY TYPE</Text>
                    <View style={styles.grid}>
                        {DIETARY_OPTIONS.map(diet => (
                            <TouchableOpacity
                                key={diet}
                                accessibilityRole="button"
                                accessibilityState={{ selected: prefs.dietaryType === diet }}
                                style={[
                                    styles.dietBtn,
                                    prefs.dietaryType === diet && shadows.glow(colors.accent.emerald),
                                    { backgroundColor: prefs.dietaryType === diet ? colors.accent.emerald : colors.background.secondary, borderColor: prefs.dietaryType === diet ? colors.accent.emerald : colors.border.default }
                                ]}
                                onPress={() => toggleDiet(diet)}
                                activeOpacity={0.85}
                            >
                                <Text style={[typography.captionMedium, { color: prefs.dietaryType === diet ? colors.text.primary : colors.text.secondary, fontWeight: 'bold' }]}>{diet.toUpperCase()}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={{ marginTop: 28 }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 12 }]}>RESTRICTIONS & ALLERGIES</Text>
                        <TextInput
                            style={[styles.tagInput, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}
                            placeholder="Add allergy..."
                            placeholderTextColor={colors.text.tertiary}
                            value={allergyInput}
                            onChangeText={setAllergyInput}
                            onSubmitEditing={addAllergy}
                            returnKeyType="done"
                            autoCapitalize="words"
                        />
                        <View style={styles.tagGrid}>
                            {prefs.allergies.map(a => (
                                <TouchableOpacity
                                    key={a}
                                    onPress={() => removeAllergy(a)}
                                    style={[styles.tag, { backgroundColor: withAlpha(colors.text.primary, 0.05), borderColor: colors.border.default }]}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${a}`}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[typography.caption, { color: colors.text.primary }]}>{a}</Text>
                                    <Ionicons name="close-circle" size={14} color={colors.text.tertiary} style={{ marginLeft: 6 }} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Account Section */}
                <View style={[styles.section, { marginTop: 40 }]}>
                    <Button
                        title="DEACTIVATE ACCOUNT"
                        variant="outline"
                        style={{ borderColor: colors.accent.coral, height: 60 }}
                    />
                </View>

            </ScrollView>

            <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeEdit}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.modalOverlay}
                >
                    <View style={[styles.modalCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Text style={[typography.subhead, { color: colors.text.primary, marginBottom: 16, fontWeight: 'bold' }]}>
                            {editing?.label}
                        </Text>
                        {editing?.kind === 'time' ? (
                            <DateTimeField
                                mode="time"
                                value={editValue}
                                onChange={(t) => { setEditValue(t); if (editError) setEditError(''); }}
                                error={editError || undefined}
                            />
                        ) : (
                            <Input
                                value={editValue}
                                onChangeText={(t) => { setEditValue(t); if (editError) setEditError(''); }}
                                placeholder="Hours"
                                keyboardType="numeric"
                                autoFocus
                                error={editError || undefined}
                                maxLength={4}
                            />
                        )}
                        <View style={styles.modalActions}>
                            <TouchableOpacity accessibilityRole="button" onPress={closeEdit} style={[styles.modalBtn, { borderColor: colors.border.default }]} activeOpacity={0.85}>
                                <Text style={[typography.body, { color: colors.text.secondary, fontWeight: '600' }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" onPress={saveEdit} style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.accent.cyan }]} activeOpacity={0.85}>
                                <Text style={[typography.body, { color: '#000', fontWeight: '700' }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function TimeRow({ label, value, onEdit, isLast }: { label: string; value: string; onEdit: () => void; isLast?: boolean }) {
    const { colors, typography } = useTheme();
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${value}`}
            style={[styles.timeRow, isLast ? { borderBottomWidth: 0 } : { borderBottomColor: colors.border.default }]}
            onPress={onEdit}
            activeOpacity={0.85}
        >
            <Text style={[typography.body, { color: colors.text.primary }]}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.body, { color: colors.text.secondary, fontWeight: 'bold' }]}>{value}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} style={{ marginLeft: 8 }} />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    prefCard: { borderWidth: 1, paddingHorizontal: 18, borderRadius: 24 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    dietBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, minWidth: '30%', alignItems: 'center' },
    tagInput: { height: 52, paddingHorizontal: 16, borderWidth: 1, marginBottom: 12 },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    modalCard: { width: '100%', maxWidth: 360, padding: 24, borderRadius: 24, borderWidth: 1 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
    modalBtnPrimary: { borderWidth: 0 },
});
