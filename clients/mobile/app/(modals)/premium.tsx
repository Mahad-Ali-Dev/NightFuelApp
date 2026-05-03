import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { LinearGradient } from 'expo-linear-gradient';
import { colors as themeColors } from '@/theme/colors';
import { upgrade } from '@/api/subscriptions';

type Plan = 'annual' | 'monthly';

const FEATURES = [
    { title: 'AI Coach Ria',       desc: 'Unlimited chat & real-time circadian adaptations', icon: 'flash'       },
    { title: 'Wearable Sync',      desc: 'Connect Oura, Apple Watch, Garmin for sleep tracking', icon: 'watch'  },
    { title: 'Advanced Analytics', desc: 'Strength trends, 1RM tracking, sleep vs. performance', icon: 'stats-chart' },
    { title: 'Ramadan Mode',       desc: 'Automated fasting windows and hydration strategy', icon: 'moon'       },
] as const;

export default function PremiumScreen() {
    const { colors, typography, spacing } = useTheme();
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
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                <LinearGradient
                    colors={[colors.background.secondary, `${colors.accent.cyan}15`]}
                    style={[styles.featureBox, { borderColor: colors.border.default }]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    {FEATURES.map((feat, i) => (
                        <View key={i} style={styles.featureRow}>
                            <View style={[styles.iconBox, { backgroundColor: `${colors.accent.cyan}20` }]}>
                                <Ionicons name={feat.icon as any} size={20} color={colors.accent.cyan} />
                            </View>
                            <View style={styles.featureText}>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>{feat.title}</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{feat.desc}</Text>
                            </View>
                        </View>
                    ))}
                </LinearGradient>

                {/* Plan selector */}
                <View style={styles.pricingRow}>
                    {/* Annual */}
                    <TouchableOpacity
                        onPress={() => setSelectedPlan('annual')}
                        activeOpacity={0.8}
                        style={[
                            styles.priceCard,
                            {
                                borderColor:     annualSelected ? colors.accent.cyan : colors.border.default,
                                borderWidth:     annualSelected ? 2 : 1,
                                backgroundColor: colors.background.secondary,
                            },
                        ]}
                    >
                        <View style={[styles.saveBadge, { backgroundColor: colors.accent.cyan }]}>
                            <Text style={[typography.caption, { color: themeColors.background.primary, fontWeight: 'bold', fontSize: 10 }]}>
                                SAVE 20%
                            </Text>
                        </View>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>Annually</Text>
                        <Text style={[typography.display, { color: colors.accent.cyan, fontSize: 24, marginTop: 4 }]}>$89.99</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>$7.50 / month</Text>
                        {annualSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: colors.accent.cyan }]}>
                                <Ionicons name="checkmark" size={12} color="#000" />
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Monthly */}
                    <TouchableOpacity
                        onPress={() => setSelectedPlan('monthly')}
                        activeOpacity={0.8}
                        style={[
                            styles.priceCard,
                            {
                                borderColor:     monthlySelected ? colors.accent.purple : colors.border.default,
                                borderWidth:     monthlySelected ? 2 : 1,
                                backgroundColor: colors.background.secondary,
                            },
                        ]}
                    >
                        <Text style={[typography.heading, { color: colors.text.primary }]}>Monthly</Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 24, marginTop: 4 }]}>$9.99</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>Billed monthly</Text>
                        {monthlySelected && (
                            <View style={[styles.checkIcon, { backgroundColor: colors.accent.purple }]}>
                                <Ionicons name="checkmark" size={12} color="#000" />
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Sticky CTA footer */}
            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <Button
                    title={upgradeMutation.isPending ? 'Processing…' : 'Start 7-Day Free Trial'}
                    onPress={() => upgradeMutation.mutate()}
                    fullWidth
                    disabled={upgradeMutation.isPending}
                />
                <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 16 }]}>
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
    featureBox: {
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        marginBottom: 32,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
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
    },
    priceCard: {
        flex: 1,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        position: 'relative',
    },
    saveBadge: {
        position: 'absolute',
        top: -10,
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
});
