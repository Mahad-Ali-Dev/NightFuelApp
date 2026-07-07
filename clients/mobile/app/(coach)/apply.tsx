/**
 * Apply to be a coach. A USER fills in a short profile (bio, specialties, rate)
 * and submits — it lands in the admin review queue. On approval the backend
 * promotes them to COACH + activates their coach profile. Re-applying after a
 * rejection is allowed. Honest status states: pending / approved / rejected.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { GlassCard, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import {
    getMyCoachApplication,
    submitCoachApplication,
    type CoachApplication,
} from '@/api/coachApply';

const STATUS_META: Record<CoachApplication['status'], { icon: keyof typeof Ionicons.glyphMap; title: string; tint: 'cyan' | 'lime' | 'coral' }> = {
    PENDING: { icon: 'hourglass-outline', title: 'Application under review', tint: 'cyan' },
    APPROVED: { icon: 'checkmark-circle', title: "You're a coach! 🎉", tint: 'lime' },
    REJECTED: { icon: 'close-circle-outline', title: 'Not approved this time', tint: 'coral' },
};

export default function CoachApplyScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const { data: existing, isLoading } = useQuery({
        queryKey: ['my-coach-application'],
        queryFn: getMyCoachApplication,
    });

    const [bio, setBio] = useState('');
    const [specs, setSpecs] = useState('');
    const [certs, setCerts] = useState('');
    const [rate, setRate] = useState('');

    const submit = useMutation({
        mutationFn: () =>
            submitCoachApplication({
                bio: bio.trim() || undefined,
                specializations: specs.split(',').map((s) => s.trim()).filter(Boolean),
                certifications: certs.split(',').map((s) => s.trim()).filter(Boolean),
                monthlyRateUsd: rate.trim() ? Number(rate) : null,
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['my-coach-application'] }),
    });

    const showForm = !existing || existing.status === 'REJECTED' || submit.isError;
    const canSubmit = bio.trim().length >= 10 && !submit.isPending;

    return (
        <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
                <PressableScale onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
                    <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Become a coach</Text>
                <View style={styles.back} />
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing['3xl'] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {isLoading ? (
                    <ActivityIndicator color={colors.accent.cyan} style={{ marginTop: spacing['3xl'] }} />
                ) : (
                    <>
                        {/* Current status banner (if they've applied before) */}
                        {existing ? (
                            <GlassCard radius={br.xl} style={styles.statusCard}>
                                <Ionicons name={STATUS_META[existing.status].icon} size={26} color={(colors.accent as any)[STATUS_META[existing.status].tint] ?? colors.accent.cyan} />
                                <Text style={[typography.body, { color: colors.text.primary, marginTop: 6, fontWeight: '700' }]}>{STATUS_META[existing.status].title}</Text>
                                {existing.status === 'PENDING' ? (
                                    <Text style={[typography.bodySm, { color: colors.text.tertiary, marginTop: 2, textAlign: 'center' }]}>We'll let you know once an admin reviews it.</Text>
                                ) : null}
                                {existing.status === 'REJECTED' && existing.rejectionReason ? (
                                    <Text style={[typography.bodySm, { color: colors.text.tertiary, marginTop: 2, textAlign: 'center' }]}>{existing.rejectionReason}</Text>
                                ) : null}
                            </GlassCard>
                        ) : null}

                        {showForm ? (
                            <>
                                <Text style={[typography.bodySm, { color: colors.text.tertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                                    Tell us about your coaching. An admin reviews every application.
                                </Text>

                                <Field label="About you" hint="A short bio (min 10 chars)">
                                    <TextInput value={bio} onChangeText={setBio} placeholder="I help shift workers train + eat around their schedule…" placeholderTextColor={colors.text.tertiary} multiline style={[styles.input, styles.multiline, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]} />
                                </Field>
                                <Field label="Specialties" hint="Comma-separated">
                                    <TextInput value={specs} onChangeText={setSpecs} placeholder="strength, nutrition, night-shift" placeholderTextColor={colors.text.tertiary} style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]} />
                                </Field>
                                <Field label="Certifications" hint="Comma-separated (optional)">
                                    <TextInput value={certs} onChangeText={setCerts} placeholder="NASM-CPT, Precision Nutrition" placeholderTextColor={colors.text.tertiary} style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]} />
                                </Field>
                                <Field label="Monthly rate (USD)" hint="Optional">
                                    <TextInput value={rate} onChangeText={setRate} placeholder="99" placeholderTextColor={colors.text.tertiary} keyboardType="number-pad" style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: colors.border.default }]} />
                                </Field>

                                {submit.isError ? (
                                    <Text style={[typography.caption, { color: colors.warning, textAlign: 'center', marginTop: spacing.sm }]}>Couldn't submit — please try again.</Text>
                                ) : null}

                                <CtaButton
                                    label={existing?.status === 'REJECTED' ? 'Re-apply' : 'Submit application'}
                                    icon="ribbon"
                                    loading={submit.isPending}
                                    disabled={!canSubmit}
                                    onPress={() => submit.mutate()}
                                    style={{ marginTop: spacing.lg }}
                                />
                            </>
                        ) : null}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    const { colors, typography } = useTheme();
    return (
        <View style={{ marginTop: spacing.md }}>
            <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 5 }]}>
                {label}{hint ? <Text style={{ color: colors.text.tertiary }}>{`  ·  ${hint}`}</Text> : null}
            </Text>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    statusCard: { padding: spacing.lg, marginTop: spacing.md, alignItems: 'center' },
    input: { borderWidth: 1, borderRadius: br.lg, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    multiline: { minHeight: 96, textAlignVertical: 'top' },
});
