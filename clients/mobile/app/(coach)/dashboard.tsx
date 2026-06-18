import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme, spacing as spacingTokens, borderRadius } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '@/api/users';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

export default function CoachDashboardScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: studentsResponse, isLoading, isError, refetch } = useQuery({
        queryKey: ['coach-students'],
        queryFn: getStudents,
    });

    const students = Array.isArray(studentsResponse?.data) ? studentsResponse.data : [];

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={styles.header}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Coach Dashboard</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Notifications" style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                    {/* Global KPI card */}
                    <Skeleton width="100%" height={140} radius={borderRadius.xl} style={{ marginBottom: spacing['2xl'] }} />
                    {/* Roster section header */}
                    <Skeleton width={140} height={20} radius={borderRadius.sm} style={{ marginVertical: spacing.lg }} />
                    {/* Roster rows */}
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} width="100%" height={76} radius={borderRadius.xl} style={{ marginBottom: spacing.md }} />
                    ))}
                </ScrollView>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load your roster"
                    subtitle="Something went wrong fetching your students. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Global KPI */}
                    <Card variant="glass" noPadding style={[styles.kpiCard, shadows.glow(colors.accent.coral)]}>
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.2), withAlpha(colors.accent.pink, 0.06)]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.kpiInner}
                        >
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Total Active Students</Text>
                            <Text style={[styles.kpiValue, { color: colors.text.primary }]}>{students.length}</Text>
                            <View style={styles.kpiTrend}>
                                <Ionicons name="trending-up" size={14} color={colors.accent.cyan} />
                                <Text style={[typography.captionMedium, { color: colors.accent.cyan, marginLeft: 6 }]}>Growing steady</Text>
                            </View>
                        </LinearGradient>
                    </Card>

                    <Text style={[typography.h3, { color: colors.text.primary, marginVertical: spacing.lg }]}>Your Roster</Text>

                    {students.length === 0 ? (
                        <EmptyState
                            icon="people-outline"
                            title="No students yet"
                            subtitle="Your roster is empty. Students who connect with you will appear here, ready for coaching."
                        />
                    ) : (
                        students.map((student: any, idx) => (
                            <TouchableOpacity
                                key={student.id || idx}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`Message ${student.name || 'Unknown Student'}`}
                                onPress={() => router.push(`/messages/${student.id}` as any)}
                            >
                                <Card variant="glass" style={styles.clientRow}>
                                    <View style={[styles.avatar, { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.3) }]}>
                                        <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: 'bold' }]}>
                                            {(student.name || 'U')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={styles.clientInfo}>
                                        <Text style={[typography.subhead, { color: colors.text.primary }]}>{student.name || 'Unknown Student'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>{student.email || 'No email'}</Text>
                                    </View>
                                    <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.accent.purple} />
                                </Card>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacingTokens.xl, marginBottom: spacingTokens.lg },
    headerBtn: { width: 40, height: 40, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    kpiCard: { marginBottom: spacingTokens['2xl'] },
    kpiInner: { padding: spacingTokens['2xl'] },
    kpiValue: { fontFamily: typo.statLarge.fontFamily, fontSize: 48, lineHeight: 56, marginTop: spacingTokens.xs },
    kpiTrend: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    clientRow: { flexDirection: 'row', alignItems: 'center', padding: spacingTokens.lg, marginBottom: spacingTokens.md },
    avatar: { width: 44, height: 44, borderRadius: borderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    clientInfo: { flex: 1 },
});
