/**
 * Coach — incoming client requests. Lists clients who asked this coach to take
 * them on (PENDING CoachClientRelations) and lets the coach Accept (→ they join
 * the roster) or Decline. Reached from the Coach Hub.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { GlassCard, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { getCoachRequests, respondToCoachRequest } from '@/api/coachRelations';

export default function CoachRequestsScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const { data: requests, isLoading, isRefetching, refetch } = useQuery({
        queryKey: ['coach-requests'],
        queryFn: getCoachRequests,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['coach-requests'] });
        qc.invalidateQueries({ queryKey: ['coach-students'] });
    };
    const respond = useMutation({
        mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) => respondToCoachRequest(id, action),
        onSuccess: invalidate,
    });
    const busyId = respond.isPending ? respond.variables?.id : null;

    return (
        <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
                <PressableScale onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
                    <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Client requests</Text>
                <View style={styles.back} />
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing['3xl'] }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent.cyan} />}
                showsVerticalScrollIndicator={false}
            >
                {isLoading ? (
                    <ActivityIndicator color={colors.accent.cyan} style={{ marginTop: spacing['3xl'] }} />
                ) : !requests || requests.length === 0 ? (
                    <Text style={[typography.bodySm, { color: colors.text.tertiary, textAlign: 'center', marginTop: spacing['3xl'] }]}>No pending requests right now.</Text>
                ) : (
                    requests.map((r) => (
                        <GlassCard key={r.id} radius={br.xl} style={styles.card}>
                            <View style={styles.row}>
                                {r.avatarUrl ? (
                                    <Image source={{ uri: r.avatarUrl }} style={styles.avatar} />
                                ) : (
                                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.background.secondary }]}>
                                        <Text style={[typography.body, { color: colors.accent.cyan }]}>{(r.displayName ?? 'C')[0]}</Text>
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: '700' }]} numberOfLines={1}>{r.displayName ?? `User ${r.clientUserId.slice(0, 6)}`}</Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>wants you as their coach</Text>
                                </View>
                            </View>
                            <View style={styles.actions}>
                                <CtaButton label="Accept" size="sm" icon="checkmark" loading={respond.isPending && busyId === r.id} disabled={busyId === r.id} onPress={() => respond.mutate({ id: r.id, action: 'accept' })} style={{ flex: 1 }} />
                                <PressableScale onPress={() => respond.mutate({ id: r.id, action: 'decline' })} accessibilityRole="button" accessibilityLabel="Decline request" disabled={busyId === r.id} style={[styles.declineBtn, { borderColor: colors.border.default, opacity: busyId === r.id ? 0.5 : 1 }]}>
                                    <Text style={[typography.bodySm, { color: colors.text.secondary }]}>Decline</Text>
                                </PressableScale>
                            </View>
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
    card: { padding: spacing.lg, marginBottom: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: { width: 44, height: 44, borderRadius: br.full },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
    declineBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: br.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
