import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTheme, spacing, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState, GeneratingSteps } from '@/components/ui';

// Staged status lines shown while the AI nutrition plan is generated (10–30s).
const NUTRITION_GEN_STEPS = [
    'Reading your circadian profile…',
    'Calculating macro targets…',
    'Timing your meals to your shift…',
    'Balancing energy windows…',
    'Finalizing your plan…',
];
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getCurrent } from '@/api/shifts';
import { generatePlan } from '@/api/plans';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function ShiftCalendarScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: currentShift, isLoading, isError, refetch } = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrent,
    });

    const generateMutation = useMutation({
        mutationFn: (payload: any) => generatePlan(payload),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            Alert.alert('Success', 'AI Plan generated successfully!');
            router.push('/(tabs)/nutrition' as any);
        }
    });

    // Hardcoded logic removed. Instead, user routes to the new modal to pick details.

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <ImageBackgroundGradient />

            <View style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}
                    style={[styles.headerBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Sleep optimizer"
                    onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                    style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.1), borderColor: withAlpha(colors.accent.purple, 0.25), borderWidth: 1 }]}
                >
                    <Ionicons name="moon-outline" size={22} color={colors.accent.purple} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
                    {/* Title block */}
                    <Skeleton width={150} height={12} radius={borderRadius.sm} style={{ marginBottom: spacing.md }} />
                    <Skeleton width={220} height={40} radius={borderRadius.md} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={16} radius={borderRadius.sm} style={{ marginBottom: spacing.xs }} />
                    <Skeleton width="80%" height={16} radius={borderRadius.sm} style={{ marginBottom: spacing['3xl'] }} />

                    {/* Active shift card */}
                    <Skeleton width="100%" height={236} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />

                    {/* Action buttons */}
                    <Skeleton width="100%" height={56} radius={borderRadius.lg} style={{ marginBottom: spacing.md }} />
                    <Skeleton width="100%" height={56} radius={borderRadius.lg} />
                </ScrollView>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load your schedule"
                    subtitle="Something went wrong fetching your active shift. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150 }}>
                    <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: spacing.sm }]}>CIRCADIAN PLANNER</Text>
                    <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.md }]}>Your Schedule</Text>
                    <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['3xl'] }]}>
                        Manage your active shift block to ensure your circadian rhythm aligns perfectly with your body’s needs.
                    </Text>

                    {currentShift ? (
                        <>
                            <Card variant="glass" style={[styles.shiftCard, { borderColor: withAlpha(colors.accent.coral, 0.34) }, shadows.glow(colors.accent.coral)]}>
                                <LinearGradient
                                    colors={[withAlpha(colors.accent.coral, 0.12), 'transparent']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                    pointerEvents="none"
                                />
                                <View style={styles.cardHeader}>
                                    <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.3) }]}>
                                        <Ionicons name="moon" size={24} color={colors.accent.coral} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: spacing.lg }}>
                                        <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: spacing.xxs }]}>Active Shift</Text>
                                        <Text style={[typography.h3, { color: colors.text.primary, textTransform: 'capitalize' }]}>{currentShift.type}</Text>
                                        <Text style={[typography.statTiny, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                                            {new Date(currentShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(currentShift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Edit" onPress={() => router.push('/(modals)/log-shift' as any)} style={[styles.editBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }]}>
                                        <Ionicons name="create-outline" size={20} color={colors.text.secondary} />
                                    </TouchableOpacity>
                                </View>

                                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.lg }]}>Today's Timeline</Text>
                                <View style={[styles.timelineContainer, { borderLeftColor: colors.border.light }]}>
                                    <View style={styles.timelineLine} />
                                    <View style={styles.timelineNode}>
                                        <View style={[styles.timelineDot, { backgroundColor: withAlpha(colors.accent.amber, 0.16), borderColor: withAlpha(colors.accent.amber, 0.3), borderWidth: 1 }]}>
                                            <Ionicons name="sunny" size={14} color={colors.accent.amber} />
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.primary, marginLeft: spacing.md }]}>Awake</Text>
                                    </View>
                                    <View style={styles.timelineNode}>
                                        <View style={[styles.timelineDot, { backgroundColor: withAlpha(colors.accent.cyan, 0.16), borderColor: withAlpha(colors.accent.cyan, 0.3), borderWidth: 1 }]}>
                                            <Ionicons name="briefcase" size={14} color={colors.accent.cyan} />
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.primary, marginLeft: spacing.md }]}>Shift Starts</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[typography.statTiny, { color: colors.accent.cyan, fontSize: 14 }]}>{new Date(currentShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                    </View>
                                    <View style={styles.timelineNode}>
                                        <View style={[styles.timelineDot, { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.3), borderWidth: 1 }]}>
                                            <Ionicons name="bed" size={14} color={colors.accent.purple} />
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.primary, marginLeft: spacing.md }]}>Shift Ends</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[typography.statTiny, { color: colors.accent.purple, fontSize: 14 }]}>{new Date(currentShift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                    </View>
                                </View>
                            </Card>

                            <TouchableOpacity
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Optimize sleep window"
                                style={[styles.optimizeBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.1), borderColor: withAlpha(colors.accent.purple, 0.4) }]}
                                onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                            >
                                <Ionicons name="analytics" size={20} color={colors.accent.purple} style={{ marginRight: spacing.sm }} />
                                <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: '700' }]}>Optimize Sleep Window</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Generate AI nutrition plan"
                                accessibilityState={{ disabled: generateMutation.isPending, busy: generateMutation.isPending }}
                                disabled={generateMutation.isPending}
                                style={[styles.heroBtn, shadows.glow(colors.accent.coral)]}
                                onPress={() => {
                                    generateMutation.mutate({
                                        date: new Date().toISOString().slice(0, 10),
                                        shiftId: currentShift.id,
                                        shiftType: currentShift.type
                                    });
                                }}
                            >
                                <LinearGradient
                                    colors={colors.gradients.coral}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.heroBtnGradient}
                                >
                                    {generateMutation.isPending ? (
                                        <GeneratingSteps
                                            active={generateMutation.isPending}
                                            steps={NUTRITION_GEN_STEPS}
                                            color={colors.text.primary}
                                            textColor={colors.text.primary}
                                            showDots={false}
                                        />
                                    ) : (
                                        <>
                                            <Ionicons name="restaurant" size={20} color={colors.text.primary} style={{ marginRight: spacing.sm }} />
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Generate AI Nutrition Plan</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <EmptyState
                            icon="calendar-outline"
                            title="No Active Shift"
                            subtitle="Set up your next shift rotation to start generating circadian predictions and your AI nutrition plan."
                            actionLabel="Add Shift"
                            onAction={() => router.push('/(modals)/log-shift' as any)}
                            style={styles.emptyState}
                        />
                    )}
                </ScrollView>
            )}
        </View>
    );
}

function ImageBackgroundGradient() {
    const { colors } = useTheme();
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <LinearGradient
                colors={[withAlpha(colors.accent.coral, 0.16), withAlpha(colors.accent.pink, 0.06), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 360, width: '100%' }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing['4xl'], paddingBottom: spacing.lg },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shiftCard: {
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2xl'] },
    iconBox: {
        width: 52,
        height: 52,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBtn: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timelineContainer: {
        paddingLeft: spacing.sm,
        marginLeft: spacing.lg,
        borderLeftWidth: 2,
        paddingBottom: spacing.sm,
    },
    timelineLine: { display: 'none' }, // Using borderLeft instead for simplicity
    timelineNode: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.lg,
        marginLeft: -19,
        backgroundColor: 'transparent',
    },
    timelineDot: {
        width: 32,
        height: 32,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        marginTop: spacing['4xl'],
    },
    optimizeBtn: {
        flexDirection: 'row',
        height: 56,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.lg,
    },
    heroBtn: {
        height: 56,
        borderRadius: borderRadius.lg,
        marginTop: spacing.md,
        overflow: 'hidden',
    },
    heroBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
