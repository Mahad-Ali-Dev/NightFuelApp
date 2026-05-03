import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPreferences, updatePreferences, UserPreferences } from '@/api/profile';
import { Button, Card } from '@/components/ui';

const DIETARY_OPTIONS = ['Classic', 'Keto', 'Vegan', 'Vegetarian', 'Pescatarian', 'Paleo'];

export default function PreferencesScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: initialPrefs, isLoading } = useQuery({
        queryKey: ['my-preferences'],
        queryFn: getPreferences,
    });

    const [prefs, setPrefs] = useState<UserPreferences | null>(null);

    useEffect(() => {
        if (initialPrefs) {
            setPrefs(initialPrefs);
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
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.cyan} />
            </View>
        );
    }

    const toggleDiet = (diet: string) => {
        setPrefs(prev => prev ? ({ ...prev, dietaryType: diet }) : null);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Preferences</Text>
                <TouchableOpacity
                    onPress={() => updateMutation.mutate(prefs)}
                    disabled={updateMutation.isPending}
                >
                    <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: 'bold' }]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Circadian Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="moon-outline" size={20} color={colors.accent.purple} />
                        <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: 'bold', marginLeft: 12 }]}>CIRCADIAN RHYTHM</Text>
                    </View>
                    <Card style={[styles.prefCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <TimeRow label="Sleep Target" value={`${prefs.sleepTargetHours}h`} onEdit={() => { }} />
                        <TimeRow label="Typical Wake Time" value={prefs.wakeTime} onEdit={() => { }} />
                        <TimeRow label="Typical Sleep Time" value={prefs.sleepTime} onEdit={() => { }} />
                        <TimeRow label="Current Shift Start" value={prefs.workStartTime} onEdit={() => { }} />
                        <TimeRow label="Current Shift End" value={prefs.workEndTime} onEdit={() => { }} />
                    </Card>
                </View>

                {/* Metabolic Section */}
                <View style={[styles.section, { marginTop: 32 }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="nutrition-outline" size={20} color={colors.accent.emerald} />
                        <Text style={[typography.subhead, { color: colors.accent.emerald, fontWeight: 'bold', marginLeft: 12 }]}>METABOLIC PREFERENCES</Text>
                    </View>

                    <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 12 }]}>DIETARY TYPE</Text>
                    <View style={styles.grid}>
                        {DIETARY_OPTIONS.map(diet => (
                            <TouchableOpacity
                                key={diet}
                                style={[
                                    styles.dietBtn,
                                    { backgroundColor: prefs.dietaryType === diet ? colors.accent.emerald : colors.background.secondary, borderColor: colors.border.default }
                                ]}
                                onPress={() => toggleDiet(diet)}
                            >
                                <Text style={[typography.caption, { color: prefs.dietaryType === diet ? '#FFF' : colors.text.secondary, fontWeight: 'bold' }]}>{diet.toUpperCase()}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={{ marginTop: 24 }}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 12 }]}>RESTRICTIONS & ALLERGIES</Text>
                        <TextInput
                            style={[styles.tagInput, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderRadius: borderRadius.lg, borderColor: colors.border.default }]}
                            placeholder="Add allergy..."
                            placeholderTextColor={colors.text.tertiary}
                        />
                        <View style={styles.tagGrid}>
                            {prefs.allergies.map(a => (
                                <View key={a} style={[styles.tag, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: colors.border.default }]}>
                                    <Text style={[typography.caption, { color: colors.text.primary }]}>{a}</Text>
                                    <Ionicons name="close-circle" size={14} color={colors.text.tertiary} style={{ marginLeft: 6 }} />
                                </View>
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
        </View>
    );
}

function TimeRow({ label, value, onEdit }: any) {
    const { colors, typography } = useTheme();
    return (
        <TouchableOpacity style={[styles.timeRow, { borderBottomColor: colors.border.default }]} onPress={onEdit}>
            <Text style={[typography.body, { color: colors.text.primary }]}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.body, { color: colors.text.tertiary, fontWeight: 'bold' }]}>{value}</Text>
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
    prefCard: { borderWidth: 1, paddingHorizontal: 16, borderRadius: 20 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    dietBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minWidth: '30%', alignItems: 'center' },
    tagInput: { height: 50, paddingHorizontal: 16, borderWidth: 1, marginBottom: 12 },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
});
