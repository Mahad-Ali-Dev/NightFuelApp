/**
 * Premium paywall (modal) — the conversion peak.
 *
 * Zeitra premium reskin: a confident, aspirational paywall. A glass "PRO" crown
 * hero states the value first (big Barlow-Condensed display); benefit rows carry
 * function-colored icon tiles (purple=AI, cyan=sync, amber=analytics, blue=fasting)
 * so LIME stays the 10% accent — reserved for the ONE primary action and the
 * ACTIVE plan only. The plan selector is two tappable cards: the selected plan
 * lights up in full lime with an ink check and a per-month value that dominates
 * its label; annual carries a floating SAVE badge. A trust-signal triad
 * (free-trial / cancel-anytime / secure) sits above a sticky THUMB-ZONE lime CTA
 * (CtaButton, ink-on-lime). Restore + Terms/Privacy are subdued links below it.
 * The screen enters with a staggered Reanimated FadeInDown.
 *
 * EVERY data hook / mutation / nav / a11y label / accessibilityState is preserved
 * exactly: the `upgrade` mutation (tier mapping, success/error Alerts, router.back),
 * the `selectedPlan` toggle and its plan a11y labels, and the close handler. The
 * benefit list is a static const (never async) so the screen cannot be empty — no
 * empty state is required. This paywall has no destructive action, so there is no
 * red-separated row to add (restore/links are non-destructive, subdued).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassCard } from '@/components/ui/GlassCard';
import { CtaButton } from '@/components/ui/CtaButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { withAlpha } from '@/theme/utils';
import { upgrade } from '@/api/subscriptions';

type Plan = 'annual' | 'monthly';

// Benefit rows. `tint` keys a *function* color (AI=purple, sync=cyan,
// analytics=amber, fasting=blue) so the page reads as a coherent feature map and
// LIME is never spent here — it stays the 10% accent on the CTA + active plan.
const FEATURES = [
    { title: 'AI Coach Ria',       desc: 'Unlimited chat & real-time circadian adaptations', icon: 'flash',       tint: 'purple' },
    { title: 'Wearable Sync',      desc: 'Connect Oura, Apple Watch, Garmin for sleep tracking', icon: 'watch',   tint: 'cyan'   },
    { title: 'Advanced Analytics', desc: 'Strength trends, 1RM tracking, sleep vs. performance', icon: 'stats-chart', tint: 'amber' },
    { title: 'Ramadan Mode',       desc: 'Automated fasting windows and hydration strategy', icon: 'moon',        tint: 'blue'   },
] as const;

// Trust triad shown just above the CTA. Muted, supportive — reassurance, not accent.
const TRUST = [
    { icon: 'gift-outline',          label: '7-day free trial' },
    { icon: 'close-circle-outline',  label: 'Cancel anytime' },
    { icon: 'lock-closed-outline',   label: 'Secure checkout' },
] as const;

export default function PremiumScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();

    const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');

    const upgradeMutation = useMutation({
        mutationFn: () =>
            upgrade({ tier: selectedPlan === 'annual' ? 'PRO_ANNUAL' : 'PRO' }),
        onSuccess: () => {
            // Refresh subscription status everywhere it's used
            qc.invalidateQueries({ queryKey: ['subscription-status'] });
            qc.invalidateQueries({ queryKey: ['user-profile'] });
            Alert.alert(
                '🎉 Welcome to Zeitra Pro!',
                'Your 7-day free trial has started. Enjoy all premium features.',
                [{ text: "Let's Go!", onPress: () => router.back() }]
            );
        },
        onError: (err: any) => {
            Alert.alert(
                'Upgrade Failed',
                err?.response?.data?.message ?? err?.message ?? 'Something went wrong. Please try again.'
            );
        },
    });

    const annualSelected  = selectedPlan === 'annual';
    const monthlySelected = selectedPlan === 'monthly';

    // Lime is the active-state accent (10% rule); unselected cards stay neutral glass.
    const lime = colors.accent.coral;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
                {/* Hero — value first */}
                <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
                    <View style={[styles.crown, { backgroundColor: withAlpha(lime, 0.12), borderColor: withAlpha(lime, 0.35) }, shadows.glow(lime)]}>
                        <Ionicons name="flash" size={30} color={lime} />
                    </View>
                    <Text style={[typography.overline, { color: lime, marginTop: spacing.lg }]}>
                        ZEITRA PRO
                    </Text>
                    <Text style={[typography.display, { color: colors.text.primary, textAlign: 'center', marginTop: spacing.xs }]}>
                        Unlock your{'\n'}peak performance
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.sm, maxWidth: 320 }]}>
                        The complete chrono-nutrition and fitness toolkit, built for shift workers.
                    </Text>
                </Animated.View>

                {/* Benefits */}
                <Animated.View entering={FadeInDown.duration(420).delay(60)}>
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>
                        WHAT YOU UNLOCK
                    </Text>
                    <GlassCard radius={24} style={styles.featureCard}>
                        <View style={styles.featureCardInner}>
                            {FEATURES.map((feat, i) => {
                                const tint = colors.accent[feat.tint];
                                return (
                                    <View
                                        key={feat.title}
                                        style={[styles.featureRow, i === FEATURES.length - 1 && styles.featureRowLast]}
                                    >
                                        <View style={[styles.iconBox, { backgroundColor: withAlpha(tint, 0.14) }]}>
                                            <Ionicons name={feat.icon as any} size={20} color={tint} />
                                        </View>
                                        <View style={styles.featureText}>
                                            <Text style={[typography.subhead, { color: colors.text.primary }]}>{feat.title}</Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{feat.desc}</Text>
                                        </View>
                                        <Ionicons name="checkmark-circle" size={20} color={colors.text.tertiary} />
                                    </View>
                                );
                            })}
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Plan selector */}
                <Animated.View entering={FadeInDown.duration(420).delay(120)}>
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: spacing['2xl'], marginBottom: spacing.md }]}>
                        CHOOSE YOUR PLAN
                    </Text>
                    <View style={styles.pricingRow} accessibilityRole="radiogroup">
                        {/* Annual — outer relative wrapper so the floating SAVE badge is not clipped by GlassCard overflow:hidden */}
                        <View style={styles.planWrapper}>
                            <PressableScale
                                pressedScale={0.97}
                                onPress={() => setSelectedPlan('annual')}
                                accessibilityRole="radio"
                                accessibilityLabel="Annual plan, $89.99 per year, save 20%"
                                accessibilityState={{ selected: annualSelected }}
                            >
                                <GlassCard
                                    radius={24}
                                    style={[
                                        styles.planCard,
                                        { borderWidth: 2, borderColor: annualSelected ? lime : colors.border.default },
                                        annualSelected && shadows.glow(lime),
                                    ]}
                                >
                                    <View style={[styles.planCardInner, styles.planCardInnerAnnual]}>
                                        <Text style={[typography.subhead, { color: colors.text.secondary }]}>Annual</Text>
                                        <Text
                                            style={[typography.statMedium, { color: annualSelected ? lime : colors.text.primary, marginTop: spacing.xs }]}
                                            maxFontSizeMultiplier={1.3}
                                        >
                                            $7.50
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>per month</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm }]}>$89.99 billed yearly</Text>
                                        {annualSelected && (
                                            <View style={[styles.checkIcon, { backgroundColor: lime }]}>
                                                <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
                                            </View>
                                        )}
                                    </View>
                                </GlassCard>
                            </PressableScale>
                            {/* SAVE badge — sibling overlay on the outer relative wrapper */}
                            <View style={styles.saveBadgeOverlay} pointerEvents="none">
                                <View style={[styles.saveBadge, { backgroundColor: lime }]}>
                                    <Text style={[typography.caption, { color: colors.text.inverse, fontWeight: 'bold', fontSize: 10 }]}>
                                        SAVE 20%
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Monthly */}
                        <View style={styles.planWrapper}>
                            <PressableScale
                                pressedScale={0.97}
                                onPress={() => setSelectedPlan('monthly')}
                                accessibilityRole="radio"
                                accessibilityLabel="Monthly plan, $9.99 billed monthly"
                                accessibilityState={{ selected: monthlySelected }}
                            >
                                <GlassCard
                                    radius={24}
                                    style={[
                                        styles.planCard,
                                        { borderWidth: 2, borderColor: monthlySelected ? lime : colors.border.default },
                                        monthlySelected && shadows.glow(lime),
                                    ]}
                                >
                                    <View style={styles.planCardInner}>
                                        <Text style={[typography.subhead, { color: colors.text.secondary }]}>Monthly</Text>
                                        <Text
                                            style={[typography.statMedium, { color: monthlySelected ? lime : colors.text.primary, marginTop: spacing.xs }]}
                                            maxFontSizeMultiplier={1.3}
                                        >
                                            $9.99
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>per month</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm }]}>Billed monthly</Text>
                                        {monthlySelected && (
                                            <View style={[styles.checkIcon, { backgroundColor: lime }]}>
                                                <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
                                            </View>
                                        )}
                                    </View>
                                </GlassCard>
                            </PressableScale>
                        </View>
                    </View>
                </Animated.View>

                {/* Trust signals */}
                <Animated.View entering={FadeInDown.duration(420).delay(180)} style={styles.trustRow}>
                    {TRUST.map((t) => (
                        <View key={t.label} style={styles.trustItem}>
                            <Ionicons name={t.icon as any} size={18} color={colors.text.secondary} />
                            <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xs }]}>
                                {t.label}
                            </Text>
                        </View>
                    ))}
                </Animated.View>
            </ScrollView>

            {/* Sticky CTA footer — thumb zone */}
            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <CtaButton
                    size="lg"
                    label="Start 7-Day Free Trial"
                    loading={upgradeMutation.isPending}
                    onPress={() => upgradeMutation.mutate()}
                />
                <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: spacing.md }]}>
                    Cancel anytime. Subscription auto-renews.
                </Text>

                {/* Restore + legal — subdued, non-destructive links */}
                <View style={styles.linksRow}>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Restore purchases"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => router.push('/(settings)/subscription')}
                    >
                        <Text style={[typography.captionMedium, { color: colors.text.secondary }]}>Restore</Text>
                    </TouchableOpacity>
                    <View style={[styles.linkDot, { backgroundColor: colors.text.tertiary }]} />
                    <TouchableOpacity
                        accessibilityRole="link"
                        accessibilityLabel="Terms of Service"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => Linking.openURL('https://zeitra.app/terms')}
                    >
                        <Text style={[typography.captionMedium, { color: colors.text.secondary }]}>Terms</Text>
                    </TouchableOpacity>
                    <View style={[styles.linkDot, { backgroundColor: colors.text.tertiary }]} />
                    <TouchableOpacity
                        accessibilityRole="link"
                        accessibilityLabel="Privacy Policy"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => Linking.openURL('https://zeitra.app/privacy')}
                    >
                        <Text style={[typography.captionMedium, { color: colors.text.secondary }]}>Privacy</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    hero: {
        alignItems: 'center',
        marginBottom: 32,
    },
    crown: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureCard: {
        marginBottom: 0,
    },
    featureCardInner: {
        padding: 20,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    featureRowLast: {
        marginBottom: 0,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    featureText: { flex: 1, marginRight: 12 },
    pricingRow: {
        flexDirection: 'row',
        gap: 16,
        alignItems: 'stretch',
    },
    planWrapper: {
        flex: 1,
        position: 'relative',
    },
    planCard: {
        borderRadius: 24,
        padding: 0,
    },
    planCardInner: {
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 148,
    },
    // Annual card carries the floating SAVE badge (top:-10); extra top padding
    // nudges the content down so the badge never crowds the "Annual" label.
    planCardInnerAnnual: {
        paddingTop: 24,
    },
    saveBadgeOverlay: {
        position: 'absolute',
        top: -10,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 2,
    },
    saveBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    checkIcon: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    trustRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 24,
        paddingHorizontal: 4,
    },
    trustItem: {
        flex: 1,
        alignItems: 'center',
    },
    footer: {
        borderTopWidth: 1,
        paddingTop: 16,
    },
    linksRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: 12,
    },
    linkDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        opacity: 0.6,
    },
});
