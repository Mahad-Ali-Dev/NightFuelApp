import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, FlatList
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPerformanceReports, generateWeeklyAudit, PerformanceReport } from '@/api/progress';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';


// Hoisted Intl formatter (js-hoist-intl): the history-tab dates use a static
// locale/style, so the DateTimeFormat is built once at module scope rather than
// per render. Used only behind the parse guard below so an unparseable
// `item.date` never reaches it.
const historyDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' });

// Render a calendar date for the history tab, or '' when the value is missing /
// unparseable — so a malformed `item.date` prints nothing instead of leaking
// 'Invalid Date'. The empty string renders cleanly inside its <Text>.
function formatHistoryDate(raw: string | null | undefined): string {
    if (!raw) return '';
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? '' : historyDateFmt.format(t);
}

// Finite-guard a report score: a NaN/undefined/Infinity score collapses to 0 so
// the numeral never renders 'NaN'/'undefined'/'Infinity' and the colour
// threshold below stays deterministic (a non-finite score would otherwise fall
// through every `>=` comparison to red AND print garbage in the badge).
function safeScore(score: number | null | undefined): number {
    return Number.isFinite(score) ? Math.round(score as number) : 0;
}

export default function AIReportsScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Outcome of the last generate-audit run, driving the inline accessible
    // banner below (replaces the old native alert pop-ups). `null` = nothing to
    // announce; 'success'/'error' surface the matching role="alert" copy.
    const [auditStatus, setAuditStatus] = useState<null | 'success' | 'error'>(null);

    const { data: reports = [], isLoading, isError, refetch } = useQuery({
        queryKey: ['performance-reports'],
        queryFn: getPerformanceReports,
    });

    const generateMutation = useMutation({
        mutationFn: generateWeeklyAudit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['performance-reports'] });
            setAuditStatus('success');
        },
        onError: () => setAuditStatus('error'),
    });

    // Clear any prior outcome, then kick off generation (used by the header
    // affordance, the empty-state CTA, and the inline error Retry).
    const runGenerate = useCallback(() => {
        setAuditStatus(null);
        generateMutation.mutate();
    }, [generateMutation]);

    const activeReport = reports.find(r => r.id === selectedId) || reports[0];

    // If no report selected yet but we have data, set first one
    useEffect(() => {
        if (!selectedId && reports.length > 0 && reports[0]) {
            setSelectedId(reports[0].id);
        }
    }, [reports, selectedId]);

    // Inline, accessible outcome banner for the generate-audit mutation — the
    // honest-state replacement for the old native alert pop-ups. Driven by genuine
    // mutation state (`auditStatus`), it announces success/failure in-tree via a
    // role="alert" live region (verbatim copy) and offers a Retry on failure that
    // re-invokes the mutation. Rendered with explicit ternary-null so the empty
    // string / null case never leaks a stray child. Hidden while a run is in
    // flight (the header/ CTA spinner already signals "working"). Mounted in BOTH
    // the empty and loaded states so the affordance's feedback is always present.
    const auditBanner = auditStatus && !generateMutation.isPending ? (
        <GlassCard
            glow={auditStatus === 'success' ? colors.accent.emerald : colors.accent.red}
            style={styles.auditBanner}
        >
            <View style={styles.auditBannerInner}>
                {/* The role="alert" live region wraps ONLY the message (icon +
                    copy) and is marked `accessible` so screen readers announce it
                    as one node. The Retry below is a SIBLING (outside the
                    accessible container) so it stays independently focusable on
                    iOS — a control nested inside an `accessible` View is collapsed
                    away from VoiceOver. */}
                <View
                    accessible
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={{ flexDirection: 'row', alignItems: 'flex-start' }}
                >
                    <Ionicons
                        name={auditStatus === 'success' ? 'checkmark-circle' : 'alert-circle'}
                        size={20}
                        color={auditStatus === 'success' ? colors.accent.emerald : colors.accent.red}
                        style={{ marginTop: 1 }}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                            {auditStatus === 'success' ? 'Audit ready' : 'Generation failed'}
                        </Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                            {auditStatus === 'success'
                                ? 'New weekly audit generated!'
                                : 'Failed to generate audit. Try again later.'}
                        </Text>
                    </View>
                </View>
                {auditStatus === 'error' ? (
                    <TouchableOpacity
                        style={[styles.retryBtn, { borderColor: colors.accent.red }]}
                        onPress={runGenerate}
                        accessibilityRole="button"
                        accessibilityLabel="Try again"
                        activeOpacity={0.85}
                    >
                        <Ionicons name="refresh" size={16} color={colors.accent.red} />
                        <Text style={[typography.caption, { color: colors.accent.red, fontWeight: '700', marginLeft: 6 }]}>
                            Try Again
                        </Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        </GlassCard>
    ) : null;

    const keyExtractor = useCallback((item: PerformanceReport) => item.id, []);

    const renderHistoryTab = useCallback(({ item }: { item: PerformanceReport }) => (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityLabel={item.weekRange}
            accessibilityState={{ selected: selectedId === item.id }}
            onPress={() => setSelectedId(item.id)}
            style={[
                styles.historyTab,
                {
                    backgroundColor: selectedId === item.id ? withAlpha(colors.accent.purple, 0.16) : colors.background.secondary,
                    borderColor: selectedId === item.id ? withAlpha(colors.accent.purple, 0.5) : colors.border.default,
                    borderRadius: borderRadius.lg
                },
                selectedId === item.id && shadows.glow(colors.accent.purple),
            ]}
        >
            <Text style={[typography.captionMedium, { color: selectedId === item.id ? colors.accent.purple : colors.text.secondary }]}>
                {item.weekRange}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>
                {formatHistoryDate(item.date)}
            </Text>
        </TouchableOpacity>
    ), [selectedId, colors, typography, borderRadius, shadows]);

    if (isLoading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                    <View style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                    </View>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>AI Performance Reports</Text>
                    <View style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.3) }]}>
                        <Ionicons name="sparkles" size={22} color={colors.accent.purple} />
                    </View>
                </View>

                {/* History tab strip */}
                <View style={{ height: 80, borderBottomWidth: 1, borderBottomColor: colors.border.default, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10 }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} width={100} height={48} radius={borderRadius.lg} />
                        ))}
                    </View>
                </View>

                {/* Report body */}
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    <SkeletonCard height={108} radius={borderRadius.xl} />
                    <SkeletonCard height={88} radius={borderRadius.xl} />
                    <Skeleton width={140} height={20} style={{ marginTop: spacing.sm, marginBottom: spacing.md }} />
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} width="100%" height={16} style={{ marginBottom: spacing.md }} />
                    ))}
                    <SkeletonCard height={96} radius={borderRadius.xl} style={{ marginTop: spacing.xl }} />
                </ScrollView>
            </View>
        );
    }

    if (isError) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>AI Performance Reports</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.centered}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load reports"
                        subtitle="Something went wrong fetching your performance audits. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => refetch()}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>AI Performance Reports</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Generate with AI"
                    activeOpacity={0.85}
                    onPress={runGenerate}
                    disabled={generateMutation.isPending}
                    style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.3) }]}
                >
                    {generateMutation.isPending ? (
                        <ActivityIndicator color={colors.accent.purple} size="small" />
                    ) : (
                        <Ionicons name="sparkles" size={22} color={colors.accent.purple} />
                    )}
                </TouchableOpacity>
            </View>

            {reports.length === 0 ? (
                <View style={styles.emptyState}>
                    <EmptyState
                        icon="analytics-outline"
                        title="No Reports Yet"
                        subtitle="Generate your first AI performance audit to get deep insights on your adherence and progress."
                    />
                    <Button
                        title="Generate First Audit"
                        onPress={runGenerate}
                        disabled={generateMutation.isPending}
                        style={{ marginTop: spacing.sm, minWidth: 220 }}
                    />
                    {auditBanner}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {/* Horizontal History Tabs */}
                    <View style={{ height: 80, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
                        <FlatList
                            horizontal
                            data={reports}
                            keyExtractor={keyExtractor}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center' }}
                            renderItem={renderHistoryTab}
                            initialNumToRender={8}
                            maxToRenderPerBatch={8}
                            windowSize={5}
                        />
                    </View>

                    {auditBanner}

                    {activeReport && (
                        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                            {/* Score Banner */}
                            {(() => {
                                const score = safeScore(activeReport.score);
                                const scoreColor = score >= 80 ? colors.accent.emerald : score >= 60 ? colors.accent.amber : colors.accent.red;
                                return (
                                    <GlassCard glow={scoreColor} style={styles.scoreCard}>
                                        <LinearGradient
                                            colors={[withAlpha(scoreColor, 0.18), 'transparent']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.scoreCardInner}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={[typography.overline, { color: colors.text.secondary }]}>Weekly Performance</Text>
                                                <Text style={[typography.h2, { color: colors.text.primary, marginTop: spacing.xs }]}>{activeReport.weekRange}</Text>
                                            </View>
                                            <View style={[styles.scoreBadge, { backgroundColor: withAlpha(scoreColor, 0.16), borderColor: withAlpha(scoreColor, 0.4) }]}>
                                                <Text style={[styles.scoreText, { color: scoreColor }]}>
                                                    {score}
                                                </Text>
                                            </View>
                                        </LinearGradient>
                                    </GlassCard>
                                );
                            })()}

                            {/* Summary */}
                            <View style={[styles.section, { backgroundColor: withAlpha(colors.accent.purple, 0.08), borderColor: withAlpha(colors.accent.purple, 0.2), borderRadius: borderRadius.xl }]}>
                                <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22, fontStyle: 'italic' }]}>
                                    "{activeReport.summary}"
                                </Text>
                            </View>

                            {/* Highlights — hidden when the audit produced none (e.g. fallback report) */}
                            {(activeReport.highlights?.length ?? 0) > 0 && (
                                <>
                                    <View style={styles.sectionTitleRow}>
                                        <Ionicons name="trending-up" size={18} color={colors.accent.emerald} />
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginLeft: 8 }]}>Highlights</Text>
                                    </View>
                                    {activeReport.highlights.map((h, i) => (
                                        <View key={i} style={styles.bulletItem}>
                                            <Ionicons name="checkmark-circle" size={16} color={colors.accent.emerald} />
                                            <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>{h}</Text>
                                        </View>
                                    ))}
                                </>
                            )}

                            {/* Improvements */}
                            {(activeReport.improvements?.length ?? 0) > 0 && (
                                <>
                                    <View style={[styles.sectionTitleRow, { marginTop: 24 }]}>
                                        <Ionicons name="alert-circle" size={18} color={colors.accent.amber} />
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginLeft: 8 }]}>Areas to Improve</Text>
                                    </View>
                                    {activeReport.improvements.map((imp, i) => (
                                        <View key={i} style={styles.bulletItem}>
                                            <Ionicons name="flash" size={16} color={colors.accent.amber} />
                                            <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>{imp}</Text>
                                        </View>
                                    ))}
                                </>
                            )}

                            {/* Focus Area */}
                            {activeReport.focusArea ? (
                                <View style={[styles.focusCard, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.3), borderRadius: borderRadius.xl, marginTop: 30 }]}>
                                    <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: '800', marginBottom: 8 }]}>Next Week's Focus</Text>
                                    <Text style={[typography.body, { color: colors.text.primary }]}>{activeReport.focusArea}</Text>
                                </View>
                            ) : null}
                        </ScrollView>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    historyTab: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, borderWidth: 1, alignItems: 'center', minWidth: 100 },
    scoreCard: { marginBottom: 20 },
    scoreCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24 },
    scoreBadge: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    scoreText: { fontFamily: typo.statSmall.fontFamily, fontSize: 26 },
    section: { padding: 20, marginBottom: 24, borderWidth: 1 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    bulletItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    focusCard: { padding: 20, borderWidth: 1 },
    auditBanner: { marginHorizontal: 20, marginTop: 16 },
    auditBannerInner: { padding: 16 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 999 },
});
