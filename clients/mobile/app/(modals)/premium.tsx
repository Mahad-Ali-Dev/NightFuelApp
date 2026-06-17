import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassCard } from '@/components/ui/GlassCard';
import { CtaButton } from '@/components/ui/CtaButton';
import { withAlpha } from '@/theme/utils';
import { upgrade } from '@/api/subscriptions';

type Plan = 'annual' | 'monthly';

const FEATURES = [
    { title: 'AI Coach Ria',       desc: 'Unlimited chat & real-time circadian adaptations', icon: 'flash'       },
    { title: 'Wearable Sync',      desc: 'Connect Oura, Apple Watch, Garmin for sleep tracking', icon: 'watch'  },
    { title: 'Advanced Analytics', desc: 'Strength trends, 1RM tracking, sleep vs. performance', icon: 'stats-chart' },
    { title: 'Ramadan Mode',       desc: 'Automated fasting windows and hydration strategy', icon: 'moon'       },
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
                '🎉 Welcome to NightFuel Pro!',
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

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            <View style={styles.header}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
                {/* Title */}
                <View style={styles.titleArea}>
                    <Text style={[typography.display, { color: colors.text.primary, textAlign: 'center' }]}>
                        Unlock{' '}
                        <Text style={{ color: colors.accent.cyan }}>NightFuel Pro</Text>
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
                        The ultimate chrono-nutrition and fitness toolkit designed exclusively for shift workers.
                    </Text>
                </View>

                {/* Feature list */}
                <GlassCard radius={24} style={styles.featureCard}>
                    <View style={styles.featureCardInner}>
                        {FEATURES.map((feat, i) => (
                            <View
                                key={i}
                                style={[styles.featureRow, i === FEATURES.length - 1 && styles.featureRowLast]}
                            >
                                <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.cyan, 0.14) }]}>
                                    <Ionicons name={feat.icon as any} size={20} color={colors.accent.cyan} />
                                </View>
                                <View style={styles.featureText}>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>{feat.title}</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{feat.desc}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </GlassCard>

                {/* Plan selector */}
                <View style={styles.pricingRow}>
                    {/* Annual — outer relative wrapper so the floating SAVE badge is not clipped by GlassCard overflow:hidden */}
                    <View style={styles.planWrapper}>
                        <Pressable
                            onPress={() => setSelectedPlan('annual')}
                            accessibilityRole="button"
                            accessibilityLabel="Annual plan, $89.99 per year, save 20%"
                            accessibilityState={{ selected: annualSelected }}
                        >
                            <GlassCard
                                radius={24}
                                style={[
                                    styles.planCard,
                                    { borderWidth: 2, borderColor: annualSelected ? colors.accent.cyan : 'transparent' },
                                    annualSelected && shadows.glow(colors.accent.cyan),
                                ]}
                            >
                                <View style={styles.planCardInner}>
                                    <Text style={[typography.heading, { color: colors.text.primary }]}>Annually</Text>
                                    <Text style={[typography.statSmall, { color: colors.accent.cyan, marginTop: 4 }]} maxFontSizeMultiplier={1.3}>
                                        $89.99
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>$7.50 / month</Text>
                                    {annualSelected && (
                                        <View style={[styles.checkIcon, { backgroundColor: colors.accent.cyan }]}>
                                            <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
                                        </View>
                                    )}
                                </View>
                            </GlassCard>
                        </Pressable>
                        {/* SAVE badge — sibling overlay on the outer relative wrapper */}
                        <View style={styles.saveBadgeOverlay} pointerEvents="none">
                            <View style={[styles.saveBadge, { backgroundColor: colors.accent.cyan }]}>
                                <Text style={[typography.caption, { color: colors.text.inverse, fontWeight: 'bold', fontSize: 10 }]}>
                                    SAVE 20%
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Monthly */}
                    <View style={styles.planWrapper}>
                        <Pressable
                            onPress={() => setSelectedPlan('monthly')}
                            accessibilityRole="button"
                            accessibilityLabel="Monthly plan, $9.99 billed monthly"
                            accessibilityState={{ selected: monthlySelected }}
                        >
                            <GlassCard
                                radius={24}
                                style={[
                                    styles.planCard,
                                    { borderWidth: 2, borderColor: monthlySelected ? colors.accent.purple : 'transparent' },
                                    monthlySelected && shadows.glow(colors.accent.purple),
                                ]}
                            >
                                <View style={styles.planCardInner}>
                                    <Text style={[typography.heading, { color: colors.text.primary }]}>Monthly</Text>
                                    <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: 4 }]} maxFontSizeMultiplier={1.3}>
                                        $9.99
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Billed monthly</Text>
                                    {monthlySelected && (
                                        <View style={[styles.checkIcon, { backgroundColor: colors.accent.purple }]}>
                                            <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
                                        </View>
                                    )}
                                </View>
                            </GlassCard>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>

            {/* Sticky CTA footer */}
            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <CtaButton
                    label={upgradeMutation.isPending ? 'Processing…' : 'Start 7-Day Free Trial'}
                    loading={upgradeMutation.isPending}
                    onPress={() => upgradeMutation.mutate()}
                    style={styles.ctaLg}
                />
                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 16 }]}>
                    Cancel anytime. Subscription auto-renews.
                </Text>
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
    titleArea: {
        alignItems: 'center',
        marginBottom: 32,
    },
    featureCard: {
        marginBottom: 32,
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
    featureText: { flex: 1 },
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
        minHeight: 132,
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
    footer: {
        borderTopWidth: 1,
        paddingTop: 16,
    },
    // CtaButton "lg" sizing achieved via style override (cannot edit the shared primitive this sprint).
    ctaLg: {
        paddingVertical: 16,
        minHeight: 52,
    },
});
