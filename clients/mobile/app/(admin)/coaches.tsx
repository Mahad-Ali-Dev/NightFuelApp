/**
 * Admin — coach applications review queue. Lists applications (PENDING by
 * default) and lets an admin Approve (→ backend promotes the user to COACH +
 * activates their profile) or Reject. Guarded by the (admin) route guard + the
 * backend requireAdmin on every endpoint.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
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
    adminListCoachApplications,
    adminApproveCoachApplication,
    adminRejectCoachApplication,
    type CoachApplicationStatus,
} from '@/api/coachApply';

const TABS: CoachApplicationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export default function AdminCoachesScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const [tab, setTab] = useState<CoachApplicationStatus>('PENDING');

    const { data: apps, isLoading, isRefetching, refetch } = useQuery({
        queryKey: ['admin-coach-applications', tab],
        queryFn: () => adminListCoachApplications(tab),
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['admin-coach-applications'] });
        qc.invalidateQueries({ queryKey: ['admin-stats'] });
    };
    const approve = useMutation({ mutationFn: adminApproveCoachApplication, onSuccess: invalidate });
    const reject = useMutation({ mutationFn: (id: string) => adminRejectCoachApplication(id), onSuccess: invalidate });
    const busyId = approve.isPending ? approve.variables : reject.isPending ? reject.variables : null;

    return (
        <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
                <PressableScale onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
                    <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Coach applications</Text>
                <View style={styles.back} />
            </View>

            {/* Status tabs */}
            <View style={styles.tabs}>
                {TABS.map((t) => {
                    const on = t === tab;
                    return (
                        <PressableScale key={t} onPress={() => setTab(t)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.tab, { borderColor: on ? colors.accent.lime : colors.border.default, backgroundColor: on ? colors.background.secondary : 'transparent' }]}>
                            <Text style={[typography.caption, { color: on ? colors.text.primary : colors.text.tertiary, fontWeight: '600' }]}>{t[0] + t.slice(1).toLowerCase()}</Text>
                        </PressableScale>
                    );
                })}
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing['3xl'] }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent.cyan} />}
                showsVerticalScrollIndicator={false}
            >
                {isLoading ? (
                    <ActivityIndicator color={colors.accent.cyan} style={{ marginTop: spacing['3xl'] }} />
                ) : !apps || apps.length === 0 ? (
                    <Text style={[typography.bodySm, { color: colors.text.tertiary, textAlign: 'center', marginTop: spacing['3xl'] }]}>No {tab.toLowerCase()} applications.</Text>
                ) : (
                    apps.map((a) => (
                        <GlassCard key={a.id} radius={br.xl} style={styles.card}>
                            <Text style={[typography.body, { color: colors.text.primary, fontWeight: '700' }]} numberOfLines={1}>{a.displayName ?? `User ${a.userId.slice(0, 6)}`}</Text>
                            {a.bio ? <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={3}>{a.bio}</Text> : null}
                            {a.specializations.length ? (
                                <Text style={[typography.caption, { color: colors.accent.cyan, marginTop: 6 }]} numberOfLines={1}>{a.specializations.join(' · ')}</Text>
                            ) : null}
                            {a.monthlyRateUsd != null ? (
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>${a.monthlyRateUsd}/mo</Text>
                            ) : null}

                            {tab === 'PENDING' ? (
                                <View style={styles.actions}>
                                    <CtaButton label="Approve" size="sm" icon="checkmark" loading={approve.isPending && busyId === a.id} disabled={busyId === a.id} onPress={() => approve.mutate(a.id)} style={{ flex: 1 }} />
                                    <PressableScale onPress={() => reject.mutate(a.id)} accessibilityRole="button" accessibilityLabel={`Reject ${a.displayName ?? 'application'}`} disabled={busyId === a.id} style={[styles.rejectBtn, { borderColor: colors.border.default, opacity: busyId === a.id ? 0.5 : 1 }]}>
                                        <Text style={[typography.bodySm, { color: colors.text.secondary }]}>Reject</Text>
                                    </PressableScale>
                                </View>
                            ) : (
                                <Text style={[typography.caption, { color: a.status === 'APPROVED' ? colors.accent.lime : colors.warning, marginTop: 8 }]}>
                                    {a.status === 'APPROVED' ? 'Approved' : `Rejected${a.rejectionReason ? ` — ${a.rejectionReason}` : ''}`}
                                </Text>
                            )}
                        </GlassCard>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: br.full, borderWidth: 1 },
    card: { padding: spacing.lg, marginBottom: spacing.md },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
    rejectBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: br.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
