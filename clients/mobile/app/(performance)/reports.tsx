import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, FlatList, Share, Platform
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
import { CtaButton } from '@/components/ui/CtaButton';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
import { AnimatedRing } from '@/components/AnimatedRing';
import { CountUpText } from '@/components/CountUpText';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import { spacing as sp } from '@/theme/spacing';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';


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

// Peak-END human affirmation, scaled to the score band. The performance report
// is a peak-end surface: it should always close on an encouraging, human note
// (never a cold number). Copy is intentionally warm + specific, not generic.
function affirmationFor(score: number): { overline: string; line: string } {
    if (score >= 80) return { overline: 'You showed up', line: 'A standout week — this is what compounding looks like.' };
    if (score >= 60) return { overline: 'Real progress', line: "You're building momentum. Keep stacking the good days." };
    if (score >= 40) return { overline: 'Showing up counts', line: 'Not your peak week — but you logged it, and that matters.' };
    return { overline: 'You came back', line: 'Every week is a fresh start. One good day begins the next streak.' };
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

    // Build + open the OS share sheet with a compact, premium text card of the
    // active report. Additive affordance for the thumb-zone CTA — owns no data,
    // reads only the already-loaded `activeReport`. Swallows dismissal like the
    // rest of the app's Share callers.
    const handleShare = useCallback(async () => {
        if (!activeReport) return;
        const score = safeScore(activeReport.score);
        const lines = [
            `Zeitra — Performance Report`,
            `${activeReport.weekRange} · Score ${score}/100`,
        ];
        const topHighlight = activeReport.highlights?.[0];
        if (topHighlight) lines.push(`Win: ${topHighlight}`);
        if (activeReport.focusArea) lines.push(`Next focus: ${activeReport.focusArea}`);
        try {
            await Share.share({ message: lines.join('\n') });
        } catch {
            // User dismissed the share sheet or it's unavailable — nothing to do.
        }
    }, [activeReport]);

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
            glow={auditStatus === 'success' ? colors.accent.cyan : colors.accent.red}
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
                        color={auditStatus === 'success' ? colors.accent.cyan : colors.accent.red}
                        style={{ marginTop: 1 }}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary }]}>
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

    const renderHistoryTab = useCallback(({ item }: { item: PerformanceReport }) => {
        const isActive = selectedId === item.id;
        return (
            <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="tab"
                accessibilityLabel={item.weekRange}
                accessibilityState={{ selected: isActive }}
                onPress={() => setSelectedId(item.id)}
                style={[
                    styles.historyTab,
                    {
                        backgroundColor: isActive ? withAlpha(colors.accent.coral, 0.14) : colors.background.secondary,
                        borderColor: isActive ? withAlpha(colors.accent.coral, 0.45) : colors.border.default,
                        borderRadius: borderRadius.lg,
                    },
                    isActive && shadows.glow(colors.accent.coral),
                ]}
            >
                <Text style={[typography.captionMedium, { color: isActive ? colors.accent.coral : colors.text.primary }]}>
                    {item.weekRange}
                </Text>
                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, marginTop: 2 }]}>
                    {formatHistoryDate(item.date)}
                </Text>
            </TouchableOpacity>
        );
    }, [selectedId, colors, typography, borderRadius, shadows]);

    // Shared header — back chevron + AI-generate affordance. Title sits left of
    // the actions so the "report" framing reads first. Unchanged behaviour/a11y.
    const renderHeader = (interactive: boolean) => (
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
            {interactive ? (
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
            ) : (
                <View style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </View>
            )}
            <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                <Text style={[typography.overline, { color: colors.text.tertiary }]}>Performance</Text>
                <Text style={[typography.h3, { color: colors.text.primary }]} numberOfLines={1}>AI Reports</Text>
            </View>
            {interactive ? (
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Generate with AI"
                    activeOpacity={0.85}
                    onPress={runGenerate}
                    disabled={generateMutation.isPending}
                    style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.34) }]}
                >
                    {generateMutation.isPending ? (
                        <ActivityIndicator color={colors.accent.purple} size="small" />
                    ) : (
                        <Ionicons name="sparkles" size={20} color={colors.accent.purple} />
                    )}
                </TouchableOpacity>
            ) : (
                <View style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.34) }]}>
                    <Ionicons name="sparkles" size={20} color={colors.accent.purple} />
                </View>
            )}
        </View>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {renderHeader(false)}

                {/* History tab strip */}
                <View style={{ height: 84, borderBottomWidth: 1, borderBottomColor: colors.border.default, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10 }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} width={104} height={50} radius={borderRadius.lg} />
                        ))}
                    </View>
                </View>

                {/* Report body */}
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    <SkeletonCard height={188} radius={borderRadius['2xl']} />
                    <Skeleton width="100%" height={72} radius={borderRadius.xl} style={{ marginTop: spacing.lg }} />
                    <Skeleton width={140} height={20} style={{ marginTop: spacing.xl, marginBottom: spacing.md }} />
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
                {renderHeader(true)}
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
            {renderHeader(true)}

            {reports.length === 0 ? (
                <View style={styles.emptyState}>
                    <Animated.View entering={FadeInDown.duration(420).springify().damping(18)} style={{ alignItems: 'center' }}>
                        <EmptyState
                            icon="podium-outline"
                            title="Your first report awaits"
                            subtitle="Generate an AI performance audit to see your week scored, your wins called out, and a focus for next week."
                        />
                        <Button
                            title="Generate First Audit"
                            onPress={runGenerate}
                            disabled={generateMutation.isPending}
                            style={{ marginTop: spacing.sm, minWidth: 240 }}
                        />
                    </Animated.View>
                    {auditBanner}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {/* Horizontal History Tabs — a visual period selector */}
                    <View style={{ height: 84, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
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

                    {activeReport && (() => {
                        const score = safeScore(activeReport.score);
                        // Hero score band — the brand lime owns any positive week (the
                        // "real progress" 60+ band and up, matching the mockup's lime
                        // score ring), so amber stays reserved for a genuine caution
                        // (a weak 40–59 week) and red for a poor one. `accent.coral`
                        // resolves to lime post-rebrand. This keeps amber "only on
                        // warnings", never on a respectable score.
                        const scoreColor = score >= 60 ? colors.accent.coral : score >= 40 ? colors.accent.amber : colors.accent.red;
                        const aff = affirmationFor(score);
                        const highlightCount = activeReport.highlights?.length ?? 0;
                        const improveCount = activeReport.improvements?.length ?? 0;

                        return (
                            <ScrollView
                                contentContainerStyle={{ padding: spacing.xl, paddingBottom: 132 + insets.bottom }}
                                showsVerticalScrollIndicator={false}
                            >
                                {/* ── PEAK: the score hero. Animated ring + count-up numeral
                                    on dark glass, topped with a warm affirmation overline. ── */}
                                <Animated.View entering={FadeInDown.duration(440).springify().damping(18)}>
                                    <GlassCard glow={scoreColor} style={styles.heroCard}>
                                        <LinearGradient
                                            colors={[withAlpha(scoreColor, 0.16), 'transparent']}
                                            start={{ x: 0.5, y: 0 }}
                                            end={{ x: 0.5, y: 1 }}
                                            style={styles.heroInner}
                                        >
                                            <Text style={[typography.overline, { color: scoreColor, marginBottom: spacing.xs }]}>
                                                {aff.overline}
                                            </Text>
                                            <Text style={[typography.h2, { color: colors.text.primary, marginBottom: spacing.lg }]}>
                                                {activeReport.weekRange}
                                            </Text>

                                            <AnimatedRing
                                                size={176}
                                                strokeWidth={14}
                                                progress={score}
                                                color={scoreColor}
                                                trackColor={withAlpha(colors.text.primary, 0.07)}
                                            >
                                                <View style={{ alignItems: 'center' }}>
                                                    <CountUpText
                                                        value={score}
                                                        accessibilityLabel={`Performance score ${score} out of 100`}
                                                        style={[styles.heroScore, { color: colors.text.primary }]}
                                                    />
                                                    <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: -2 }]}>
                                                        / 100 score
                                                    </Text>
                                                </View>
                                            </AnimatedRing>

                                            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.lg, maxWidth: 280, lineHeight: 22 }]}>
                                                {aff.line}
                                            </Text>
                                        </LinearGradient>
                                    </GlassCard>
                                </Animated.View>

                                {/* Period summary strip — value-dominant stat tiles */}
                                <Animated.View
                                    entering={FadeInDown.duration(440).delay(80).springify().damping(18)}
                                    style={styles.statRow}
                                >
                                    <View style={[styles.statTile, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                                        <Text style={[typography.statMedium, { color: scoreColor }]}>{score}</Text>
                                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>Score</Text>
                                    </View>
                                    <View style={[styles.statTile, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                                        <Text style={[typography.statMedium, { color: colors.accent.cyan }]}>{highlightCount}</Text>
                                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>Wins</Text>
                                    </View>
                                    <View style={[styles.statTile, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                                        <Text style={[typography.statMedium, { color: colors.accent.amber }]}>{improveCount}</Text>
                                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>To fix</Text>
                                    </View>
                                </Animated.View>

                                {/* Coach summary — the AI's read on the week */}
                                <Animated.View
                                    entering={FadeInDown.duration(440).delay(140).springify().damping(18)}
                                    style={[styles.summaryCard, { backgroundColor: withAlpha(colors.accent.purple, 0.09), borderColor: withAlpha(colors.accent.purple, 0.22), borderRadius: borderRadius.xl }]}
                                >
                                    <View style={styles.sectionTitleRow}>
                                        <Ionicons name="sparkles" size={16} color={colors.accent.purple} />
                                        <Text style={[typography.overline, { color: colors.accent.purpleLight, marginLeft: 8 }]}>Coach summary</Text>
                                    </View>
                                    <Text style={[typography.body, { color: colors.text.primary, lineHeight: 23, marginTop: spacing.sm }]}>
                                        {activeReport.summary}
                                    </Text>
                                </Animated.View>

                                {/* Highlights — the wins (hidden when none, e.g. fallback report) */}
                                {highlightCount > 0 && (
                                    <Animated.View entering={FadeInDown.duration(440).delay(200).springify().damping(18)}>
                                        <View style={[styles.sectionTitleRow, { marginTop: spacing['2xl'] }]}>
                                            <View style={[styles.sectionDot, { backgroundColor: withAlpha(colors.accent.cyan, 0.16) }]}>
                                                <Ionicons name="trending-up" size={15} color={colors.accent.cyan} />
                                            </View>
                                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: 10 }]}>Highlights</Text>
                                        </View>
                                        {activeReport.highlights.map((h, i) => (
                                            <View key={i} style={[styles.bulletItem, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.lg }]}>
                                                <Ionicons name="checkmark-circle" size={17} color={colors.accent.cyan} />
                                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginLeft: 10, flex: 1, lineHeight: 20 }]}>{h}</Text>
                                            </View>
                                        ))}
                                    </Animated.View>
                                )}

                                {/* Improvements — areas to work on */}
                                {improveCount > 0 && (
                                    <Animated.View entering={FadeInDown.duration(440).delay(260).springify().damping(18)}>
                                        <View style={[styles.sectionTitleRow, { marginTop: spacing['2xl'] }]}>
                                            <View style={[styles.sectionDot, { backgroundColor: withAlpha(colors.accent.amber, 0.16) }]}>
                                                <Ionicons name="alert-circle" size={15} color={colors.accent.amber} />
                                            </View>
                                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: 10 }]}>Areas to improve</Text>
                                        </View>
                                        {activeReport.improvements.map((imp, i) => (
                                            <View key={i} style={[styles.bulletItem, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.lg }]}>
                                                <Ionicons name="flash" size={16} color={colors.accent.amber} />
                                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginLeft: 10, flex: 1, lineHeight: 20 }]}>{imp}</Text>
                                            </View>
                                        ))}
                                    </Animated.View>
                                )}

                                {/* Next week focus — calm forward-looking treatment */}
                                {activeReport.focusArea ? (
                                    <Animated.View
                                        entering={FadeInDown.duration(440).delay(320).springify().damping(18)}
                                        style={[styles.focusCard, { backgroundColor: withAlpha(colors.accent.blue, 0.1), borderColor: withAlpha(colors.accent.blue, 0.28), borderRadius: borderRadius.xl }]}
                                    >
                                        <View style={styles.sectionTitleRow}>
                                            <Ionicons name="flag" size={16} color={colors.accent.blue} />
                                            <Text style={[typography.overline, { color: colors.accent.blue, marginLeft: 8 }]}>Next week's focus</Text>
                                        </View>
                                        <Text style={[typography.subtitle, { color: colors.text.primary, marginTop: spacing.sm }]}>{activeReport.focusArea}</Text>
                                    </Animated.View>
                                ) : null}

                                {/* ── END: the human send-off. A summary affirmation that
                                    closes the report on momentum, not a raw metric. ── */}
                                <Animated.View
                                    entering={FadeIn.duration(520).delay(420)}
                                    style={[styles.endCard, { borderColor: withAlpha(colors.accent.coral, 0.28), borderRadius: borderRadius['2xl'] }]}
                                >
                                    <LinearGradient
                                        colors={[withAlpha(colors.accent.coral, 0.12), 'transparent']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.endInner}
                                    >
                                        <Ionicons name="ribbon" size={26} color={colors.accent.coral} />
                                        <Text style={[typography.h3, { color: colors.text.primary, marginTop: spacing.sm, textAlign: 'center' }]}>
                                            You showed up this week.
                                        </Text>
                                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.xs, textAlign: 'center', maxWidth: 260, lineHeight: 20 }]}>
                                            That's the part that compounds. Keep this report — then go build the next one.
                                        </Text>
                                    </LinearGradient>
                                </Animated.View>
                            </ScrollView>
                        );
                    })()}

                    {/* Thumb-zone primary CTA — share the active report as a premium card. */}
                    {activeReport ? (
                        <View
                            style={[
                                styles.ctaBar,
                                {
                                    paddingBottom: Math.max(insets.bottom, spacing.md) + (Platform.OS === 'android' ? spacing.xs : 0),
                                    backgroundColor: withAlpha(colors.background.primary, 0.92),
                                    borderTopColor: colors.border.default,
                                },
                            ]}
                        >
                            <CtaButton
                                label="Share Report"
                                icon="share-outline"
                                size="lg"
                                onPress={handleShare}
                                accessibilityLabel="Share this performance report"
                            />
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    historyTab: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, borderWidth: 1, alignItems: 'center', minWidth: 104 },

    // Peak hero
    heroCard: { marginBottom: sp.lg },
    heroInner: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
    heroScore: { fontFamily: typo.statLarge.fontFamily, fontSize: 56, lineHeight: 60, textAlign: 'center' },

    // Stat strip
    statRow: { flexDirection: 'row', gap: 12, marginBottom: sp.lg },
    statTile: { flex: 1, borderWidth: 1, alignItems: 'center', paddingVertical: 16 },

    // Sections
    summaryCard: { padding: 18, borderWidth: 1 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
    sectionDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    bulletItem: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, padding: 14, borderWidth: 1 },
    focusCard: { padding: 18, borderWidth: 1, marginTop: sp['2xl'] },

    // Peak-end send-off
    endCard: { marginTop: sp['2xl'], borderWidth: 1, overflow: 'hidden' },
    endInner: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20 },

    // Thumb-zone CTA bar
    ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },

    // Audit banner
    auditBanner: { marginHorizontal: 20, marginTop: 16 },
    auditBannerInner: { padding: 16 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 999 },
});
