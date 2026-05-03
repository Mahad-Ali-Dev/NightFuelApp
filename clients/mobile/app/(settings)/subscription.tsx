import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getStatus } from '@/api/subscriptions';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const TIERS = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        period: 'forever',
        color: '#8B949E',
        gradient: ['rgba(139, 148, 158, 0.1)', 'rgba(0,0,0,0)'],
        features: [
            'Basic Workout Logging & 1RM',
            'ExerciseDB Library (Standard)',
            'Limited Meal Tracking (No AI)',
            'Standard Community Access',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$9.99',
        period: '/mo',
        color: '#FFB300', // Amber
        gradient: ['rgba(255, 179, 0, 0.15)', 'rgba(0,0,0,0)'],
        recommended: true,
        features: [
            'Advanced Analytics & Real-time Insights',
            'Unlimited AI Meal Planning',
            'Custom Workout Routines',
            'Advanced Circadian Fasting Timer',
        ],
    },
    {
        id: 'premium',
        name: 'Premium',
        price: '$19.99',
        period: '/mo',
        color: '#4FC3F7', // Cyan
        gradient: ['rgba(79, 195, 247, 0.15)', 'rgba(0,0,0,0)'],
        features: [
            'Everything in Pro tier',
            'Direct Chat with Professional Coaches',
            'Priority Support line',
            'Ad-Free Experience & Export Data',
        ],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: '$49.99',
        period: '/mo',
        color: '#B47CFF', // Purple
        gradient: ['rgba(180, 124, 255, 0.15)', 'rgba(0,0,0,0)'],
        features: [
            'Client Management Dashboard (For Coaches)',
            'Global Template Creation',
            'Advanced Fleet Analytics & API Access',
            'Dedicated Account Manager',
        ],
    },
];

export default function SubscriptionScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: sub, isLoading } = useQuery({
        queryKey: ['subscription-status'],
        queryFn: getStatus,
    });

    const activeTierId = sub?.tier?.toLowerCase() || 'pro';
    const [selectedTier, setSelectedTier] = useState<string>(activeTierId);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Subscription</Text>
                <View style={{ width: 32 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.accent.amber} size="large" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.heroTextContainer}>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 32, textAlign: 'center' }]}>
                            Choose Your Plan
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 10 }]}>
                            Unlock your true potential with the plan that fits your goals.
                        </Text>
                    </View>

                    {/* Horizontal scroll for Tiers */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
                        snapToInterval={width * 0.75 + 16}
                        decelerationRate="fast"
                    >
                        {TIERS.map((tier) => {
                            const isActive = activeTierId === tier.id;
                            const isSelected = selectedTier === tier.id;

                            return (
                                <TouchableOpacity
                                    key={tier.id}
                                    activeOpacity={0.9}
                                    onPress={() => setSelectedTier(tier.id)}
                                >
                                    <LinearGradient
                                        colors={isSelected ? tier.gradient as [string, string] : [colors.background.secondary, colors.background.secondary]}
                                        style={[
                                            styles.tierCard,
                                            {
                                                width: width * 0.75,
                                                borderRadius: borderRadius['2xl'],
                                                borderColor: isSelected ? tier.color : colors.border.default,
                                                borderWidth: isSelected ? 2 : 1
                                            }
                                        ]}
                                    >
                                        {tier.recommended && !isActive && (
                                            <View style={[styles.badgeTop, { backgroundColor: tier.color }]}>
                                                <Text style={[typography.caption, { color: '#000', fontWeight: '900', letterSpacing: 0.5 }]}>RECOMMENDED</Text>
                                            </View>
                                        )}
                                        {isActive && (
                                            <View style={[styles.badgeTop, { backgroundColor: colors.accent.cyan }]}>
                                                <Text style={[typography.caption, { color: '#000', fontWeight: '900', letterSpacing: 0.5 }]}>CURRENT PLAN</Text>
                                            </View>
                                        )}

                                        <Text style={[typography.display, { color: isSelected ? tier.color : colors.text.primary, fontSize: 28, marginTop: (tier.recommended || isActive) ? 10 : 0 }]}>
                                            {tier.name}
                                        </Text>

                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 40 }]}>{tier.price}</Text>
                                            <Text style={[typography.body, { color: colors.text.tertiary, marginLeft: 4, fontWeight: 'bold' }]}>{tier.period}</Text>
                                        </View>

                                        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                                        <View style={{ gap: 14 }}>
                                            {tier.features.map((feat, idx) => (
                                                <View key={idx} style={styles.featureRow}>
                                                    <Ionicons name="checkmark-circle" size={20} color={tier.color} />
                                                    <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: 12, flex: 1 }]}>
                                                        {feat}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>

                                        <View style={{ flex: 1 }} />

                                        <View style={[
                                            styles.actionBtn,
                                            {
                                                backgroundColor: isActive ? 'transparent' : isSelected ? tier.color : colors.background.tertiary,
                                                borderColor: isActive ? colors.text.tertiary : 'transparent',
                                                borderWidth: isActive ? 1 : 0
                                            }
                                        ]}>
                                            <Text style={[
                                                typography.subhead,
                                                {
                                                    color: isActive ? colors.text.tertiary : (isSelected && tier.id !== 'free') ? '#000' : colors.text.primary,
                                                    fontWeight: 'bold'
                                                }
                                            ]}>
                                                {isActive ? 'Current Plan' : (tier.id === 'free' ? 'Downgrade to Free' : `Upgrade to ${tier.name}`)}
                                            </Text>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
                        <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 16 }]}>Billing Settings</Text>

                        <TouchableOpacity style={[styles.billingItem, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                            <View>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>Payment Method</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                    {sub?.active ? 'Visa ending in 4242' : 'No payment method on file'}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.billingItem, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default, marginTop: 12 }]}>
                            <View>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>Billing History</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>View past invoices</Text>
                            </View>
                            <Ionicons name="receipt-outline" size={20} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    </View>

                    {activeTierId !== 'free' && (
                        <TouchableOpacity style={{ marginTop: 40, alignItems: 'center' }}>
                            <Text style={[typography.subhead, { color: colors.accent.coral, fontWeight: '600' }]}>Cancel Subscription</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    heroTextContainer: { paddingHorizontal: 30, paddingTop: 20, paddingBottom: 30 },
    tierCard: { padding: 24, marginRight: 16, minHeight: 450, display: 'flex' },
    badgeTop: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 16 },
    divider: { height: 1, marginVertical: 20 },
    featureRow: { flexDirection: 'row', alignItems: 'center' },
    actionBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 30 },
    billingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderWidth: 1 },
});
