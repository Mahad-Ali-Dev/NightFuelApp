import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard, CtaButton, Input, EmptyState, Skeleton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { MedicalDisclaimerBanner } from '@/components/MedicalDisclaimer';
import { resolveSharedCycle } from '@/api/cycle';
import type { CyclePhase, Confidence } from '@/api/cycle';

/**
 * cycle-viewer — the READ-ONLY partner view. A partner enters (or deep-links) a
 * share code and sees the owner's SANITIZED cycle summary: current phase + the
 * next-period / fertile-window PREDICTIONS. Nothing else is ever returned — the
 * server allow-list strips every raw log (symptoms / discharge / activity / notes).
 *
 * This screen is intentionally OUTSIDE the cycle feature's female+tracking gate:
 * a partner may be any user, so it lives in the open (performance) stack and is
 * reachable from Profile → "View a partner's cycle" as well as a shared code link.
 *
 * States: (1) no code yet -> paste-a-code form; (2) loading -> skeleton;
 * (3) unknown/revoked code -> a neutral "not available" empty state (the server
 * 404s both cases identically); (4) resolved -> the summary below.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an ISO YYYY-MM-DD to "Jul 20, 2026" with NO timezone drift. */
function fmtDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const month = MONTHS[Number(m[2]) - 1];
    if (!month) return null;
    return `${month} ${Number(m[3])}, ${m[1]}`;
}

const PHASE_META: Record<CyclePhase, { label: string; hint: string }> = {
    MENSTRUAL: { label: 'Menstrual', hint: 'Period phase' },
    FOLLICULAR: { label: 'Follicular', hint: 'Building toward ovulation' },
    OVULATORY: { label: 'Ovulatory', hint: 'Most fertile window' },
    LUTEAL: { label: 'Luteal', hint: 'After ovulation' },
    UNKNOWN: { label: 'Not available', hint: 'No phase estimate right now' },
};

const CONFIDENCE_HINT: Record<Confidence, string> = {
    HIGH: 'High confidence',
    MEDIUM: 'Moderate confidence',
    LOW: 'Low confidence — treat as a rough estimate',
    NONE: 'Tracking only — predictions unavailable',
};

export default function CycleViewerScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const { coral: CORAL, isLight } = useCycleAccents();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const params = useLocalSearchParams<{ code?: string }>();
    const initialCode = typeof params.code === 'string' ? params.code : '';

    const [codeInput, setCodeInput] = useState(initialCode);
    const [activeCode, setActiveCode] = useState<string | null>(initialCode ? initialCode.trim() : null);

    const summaryQuery = useQuery({
        queryKey: ['shared-cycle', activeCode],
        queryFn: () => resolveSharedCycle(activeCode as string),
        enabled: !!activeCode,
        retry: false,
        staleTime: 60_000,
    });

    const summary = summaryQuery.data;
    const notFound = (summaryQuery.error as any)?.response?.status === 404;

    const submit = () => {
        const trimmed = codeInput.trim();
        if (trimmed.length > 0) setActiveCode(trimmed);
    };

    const reset = () => {
        setActiveCode(null);
        setCodeInput('');
    };

    const Header = (
        <View style={styles.header}>
            <TouchableOpacity
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                activeOpacity={0.85}
                onPress={() => router.back()}
                style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
            >
                <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
                <Text style={[typography.overline, { color: colors.text.tertiary, textAlign: 'center' }]}>WELLNESS</Text>
                <Text style={[typography.h3, { color: colors.text.primary, textAlign: 'center' }]}>Partner's cycle</Text>
            </View>
            <View style={{ width: 40 }} />
        </View>
    );

    const ownerName = summary?.owner?.displayName?.trim();
    const phaseMeta = summary ? PHASE_META[summary.currentPhase] ?? PHASE_META.UNKNOWN : PHASE_META.UNKNOWN;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style={isLight ? 'dark' : 'light'} />
            <View pointerEvents="none" style={[styles.ambient, { backgroundColor: withAlpha(CORAL, 0.06) }]} />
            {Header}

            <ScrollView
                contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, paddingBottom: insets.bottom + 40 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── (1) No code yet — paste-a-code form ─────────────────────── */}
                {!activeCode ? (
                    <Animated.View entering={FadeInDown.duration(300)}>
                        <GlassCard radius={borderRadius['2xl']} style={styles.card}>
                            <View style={styles.inner}>
                                <View style={styles.rowHead}>
                                    <Ionicons name="key-outline" size={18} color={CORAL} />
                                    <Text style={[typography.overline, styles.rowHeadLabel, { color: colors.text.secondary }]}>
                                        ENTER A SHARE CODE
                                    </Text>
                                </View>
                                <Text style={[typography.bodySm, styles.blurb, { color: colors.text.secondary }]}>
                                    Paste the code your partner shared with you to see their current phase and cycle
                                    predictions. It's read-only, and they can revoke it anytime.
                                </Text>
                                <Input
                                    value={codeInput}
                                    onChangeText={setCodeInput}
                                    placeholder="Paste share code"
                                    icon="key-outline"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="off"
                                    returnKeyType="go"
                                    onSubmitEditing={submit}
                                    accessibilityLabel="Share code"
                                    style={{ marginTop: 14 }}
                                />
                                <CtaButton
                                    label="View cycle"
                                    icon="eye-outline"
                                    onPress={submit}
                                    disabled={codeInput.trim().length === 0}
                                    testID="cycle-viewer-submit"
                                    style={{ marginTop: 16 }}
                                />
                            </View>
                        </GlassCard>
                    </Animated.View>
                ) : summaryQuery.isLoading ? (
                    // ── (2) Loading ────────────────────────────────────────────
                    <View>
                        <Skeleton height={150} radius={24} />
                        <View style={{ height: 12 }} />
                        <Skeleton height={220} radius={24} />
                    </View>
                ) : summaryQuery.isError ? (
                    // ── (3) Unknown / revoked code, or a network error ─────────
                    <Animated.View entering={FadeInDown.duration(300)}>
                        <EmptyState
                            icon={notFound ? 'lock-closed-outline' : 'cloud-offline-outline'}
                            title={notFound ? 'Cycle not available' : "Couldn't load"}
                            subtitle={
                                notFound
                                    ? 'This code is invalid or has been revoked. Ask your partner for a fresh code.'
                                    : 'Something went wrong loading the shared cycle. Check your connection and try again.'
                            }
                            actionLabel={notFound ? 'Try another code' : 'Retry'}
                            onAction={notFound ? reset : () => summaryQuery.refetch()}
                        />
                    </Animated.View>
                ) : summary ? (
                    // ── (4) Resolved — the sanitized summary ────────────────────
                    <>
                        <Animated.View entering={FadeInDown.delay(40).duration(360)}>
                            <GlassCard radius={borderRadius['2xl']} glow={withAlpha(CORAL, 0.5)} style={styles.card}>
                                <View style={styles.heroInner}>
                                    <View style={[styles.readonlyChip, { borderColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                                        <Ionicons name="eye-outline" size={12} color={colors.text.tertiary} />
                                        <Text style={[typography.caption, styles.readonlyText, { color: colors.text.tertiary }]}>READ-ONLY</Text>
                                    </View>
                                    <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 4 }]}>
                                        {ownerName ? `${ownerName.toUpperCase()}'S CYCLE` : 'SHARED CYCLE'}
                                    </Text>
                                    <Text style={[typography.h1, styles.phaseLabel, { color: CORAL }]}>{phaseMeta.label}</Text>
                                    <Text style={[typography.bodySm, { color: colors.text.secondary, textAlign: 'center' }]}>
                                        {phaseMeta.hint}
                                    </Text>
                                </View>
                            </GlassCard>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(90).duration(360)}>
                            <GlassCard radius={borderRadius['2xl']} style={styles.card}>
                                <View style={styles.inner}>
                                    {summary.trackingOnly ? (
                                        <View style={styles.trackingNote}>
                                            <Ionicons name="information-circle-outline" size={16} color={colors.text.tertiary} />
                                            <Text style={[typography.bodySm, styles.trackingNoteText, { color: colors.text.secondary }]}>
                                                Predictions aren't available for this cycle right now — only the current
                                                phase is shown.
                                            </Text>
                                        </View>
                                    ) : (
                                        <>
                                            <SummaryRow
                                                icon="water-outline"
                                                accent={CORAL}
                                                label="Next period"
                                                value={fmtDate(summary.predictedNextPeriodStart) ?? 'Not predicted'}
                                                hint={
                                                    summary.daysUntilNextPeriod != null
                                                        ? summary.daysUntilNextPeriod === 0
                                                            ? 'Expected today or overdue'
                                                            : `In ${summary.daysUntilNextPeriod} day${summary.daysUntilNextPeriod === 1 ? '' : 's'}`
                                                        : undefined
                                                }
                                            />
                                            <SummaryRow
                                                icon="leaf-outline"
                                                accent={CORAL}
                                                label="Fertile window"
                                                value={
                                                    summary.fertileWindow
                                                        ? `${fmtDate(summary.fertileWindow.start)} – ${fmtDate(summary.fertileWindow.end)}`
                                                        : 'Not predicted'
                                                }
                                            />
                                            <SummaryRow
                                                icon="ellipse-outline"
                                                accent={CORAL}
                                                label="Ovulation"
                                                value={fmtDate(summary.predictedOvulationDate) ?? 'Not predicted'}
                                                last
                                            />
                                        </>
                                    )}
                                </View>
                            </GlassCard>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(130).duration(360)}>
                            <View style={styles.confidenceRow}>
                                <Ionicons name="pulse-outline" size={14} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                    {CONFIDENCE_HINT[summary.confidence] ?? CONFIDENCE_HINT.NONE}
                                </Text>
                            </View>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(170).duration(360)}>
                            <MedicalDisclaimerBanner
                                text="These are wellness estimates shared by your partner, not medical advice or a contraceptive method."
                                style={{ marginTop: 16 }}
                            />
                        </Animated.View>

                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="View a different code"
                            onPress={reset}
                            style={({ pressed }) => [styles.resetRow, pressed && { opacity: 0.6 }]}
                        >
                            <Ionicons name="swap-horizontal-outline" size={15} color={colors.text.tertiary} />
                            <Text style={[typography.caption, styles.resetText, { color: colors.text.tertiary }]}>
                                View a different code
                            </Text>
                        </Pressable>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

/** One labelled prediction row: accent icon + label on the left, value + hint right. */
function SummaryRow({
    icon,
    accent,
    label,
    value,
    hint,
    last,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    accent: string;
    label: string;
    value: string;
    hint?: string;
    last?: boolean;
}) {
    const { colors, typography } = useTheme();
    return (
        <View style={[styles.summaryRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }]}>
            <View style={styles.summaryLeft}>
                <View style={[styles.summaryIcon, { backgroundColor: withAlpha(accent, 0.14) }]}>
                    <Ionicons name={icon} size={16} color={accent} />
                </View>
                <Text style={[typography.body, { color: colors.text.secondary }]}>{label}</Text>
            </View>
            <View style={styles.summaryRight}>
                <Text style={[typography.body, styles.summaryValue, { color: colors.text.primary }]}>{value}</Text>
                {hint ? <Text style={[typography.caption, { color: colors.text.tertiary }]}>{hint}</Text> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, alignItems: 'center' },
    card: { marginTop: 12 },
    inner: { padding: 18 },
    rowHead: { flexDirection: 'row', alignItems: 'center' },
    rowHeadLabel: { marginLeft: 8, letterSpacing: 1 },
    blurb: { marginTop: 12, lineHeight: 19 },
    heroInner: { padding: 22, alignItems: 'center' },
    readonlyChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    readonlyText: { letterSpacing: 1, fontWeight: '600' },
    phaseLabel: { marginTop: 10, marginBottom: 4, textAlign: 'center' },
    trackingNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    trackingNoteText: { flex: 1, lineHeight: 19 },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    summaryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    summaryRight: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 12 },
    summaryValue: { fontWeight: '600' },
    confidenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
    resetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
    resetText: { letterSpacing: 0.3 },
});
