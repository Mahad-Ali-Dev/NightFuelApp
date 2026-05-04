import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, Alert, Linking, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStatus } from '@/api/subscriptions';
import { LinearGradient } from 'expo-linear-gradient';
import {
    SUBSCRIPTION_PRODUCT_IDS,
    type SubscriptionProductId,
    initializeIap,
    listenForPurchases,
    getSubscriptionProducts,
    requestSubscription,
    restorePurchases,
    acknowledgePurchase,
    openManageSubscriptions,
    productIdToTier,
} from '@/lib/iap';
import { validateReceipt } from '@/api/iap';
import { captureException } from '@/lib/sentry';

const { width } = Dimensions.get('window');

interface TierUI {
    id: 'free' | 'pro' | 'premium' | 'enterprise';
    name: string;
    /** Fallback price shown when IAP catalog hasn't loaded yet. */
    fallbackPrice: string;
    period: string;
    productIdMonthly?: SubscriptionProductId;
    color: string;
    gradient: [string, string];
    recommended?: boolean;
    features: string[];
}

const TIERS: TierUI[] = [
    {
        id: 'free',
        name: 'Free',
        fallbackPrice: 'Free',
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
        fallbackPrice: '$9.99',
        period: '/mo',
        productIdMonthly: SUBSCRIPTION_PRODUCT_IDS.PRO_MONTHLY,
        color: '#FFB300',
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
        fallbackPrice: '$19.99',
        period: '/mo',
        productIdMonthly: SUBSCRIPTION_PRODUCT_IDS.PREMIUM_MONTHLY,
        color: '#4FC3F7',
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
        fallbackPrice: '$49.99',
        period: '/mo',
        productIdMonthly: SUBSCRIPTION_PRODUCT_IDS.ENTERPRISE_MONTHLY,
        color: '#B47CFF',
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
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: sub, isLoading } = useQuery({
        queryKey: ['subscription-status'],
        queryFn: getStatus,
    });

    const activeTierId = (sub?.tier?.toLowerCase() as TierUI['id']) || 'free';
    const [selectedTier, setSelectedTier] = useState<string>(activeTierId);
    const [iapAvailable, setIapAvailable] = useState(false);
    const [productPrices, setProductPrices] = useState<Record<string, string>>({});
    const [purchaseInFlight, setPurchaseInFlight] = useState(false);
    const [restoreInFlight, setRestoreInFlight] = useState(false);

    // Initialize IAP + listen for purchases (StoreKit / Google Play Billing).
    useEffect(() => {
        let removeListener: (() => void) | undefined;

        (async () => {
            const { available } = await initializeIap();
            setIapAvailable(available);
            if (!available) return;

            // Load product catalog so we can show platform-localized prices.
            const products = await getSubscriptionProducts();
            const priceMap: Record<string, string> = {};
            for (const p of products) priceMap[p.productId] = p.localizedPrice;
            setProductPrices(priceMap);

            // Listen for purchase completions (the actual money-moving event
            // arrives asynchronously after requestSubscription returns).
            removeListener = listenForPurchases(async (purchase) => {
                try {
                    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
                    // Apple StoreKit 2 returns jwsRepresentationIos; legacy
                    // StoreKit 1 returns transactionReceipt. Send whichever exists.
                    const receipt =
                        purchase?.jwsRepresentationIos ??
                        purchase?.transactionReceipt ??
                        purchase?.purchaseToken ??
                        '';
                    if (!receipt) {
                        captureException(new Error('iap_purchase_no_receipt'), {
                            productId: purchase?.productId,
                        });
                        Alert.alert('Purchase issue', 'No receipt was returned. Please try again.');
                        return;
                    }

                    const result = await validateReceipt({
                        platform,
                        receipt,
                        productId: purchase.productId,
                        transactionId: purchase.transactionId,
                        originalTransactionId: purchase.originalTransactionIdentifierIOS,
                    });

                    if (result.valid) {
                        // Acknowledge ONLY after server confirms — otherwise
                        // a tampered receipt would be acknowledged before
                        // we know it was fraudulent.
                        await acknowledgePurchase(purchase);
                        await queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
                        Alert.alert('Welcome to ' + (result.tier ?? 'your new plan') + '!', 'Your subscription is active.');
                    } else {
                        Alert.alert(
                            'Purchase issue',
                            result.errorMessage ?? 'Your purchase could not be verified. Apple/Google have not been charged.',
                        );
                    }
                } catch (err) {
                    captureException(err, { source: 'subscription.purchaseHandler' });
                    Alert.alert('Purchase issue', 'Something went wrong. If you were charged, restore purchases will recover your subscription.');
                } finally {
                    setPurchaseInFlight(false);
                }
            }, () => {
                // Error listener (user cancelled or store error).
                setPurchaseInFlight(false);
            });
        })();

        return () => {
            removeListener?.();
        };
    }, [queryClient]);

    const handleUpgrade = useCallback(async (tier: TierUI) => {
        if (tier.id === 'free' || tier.id === activeTierId) return;
        if (!tier.productIdMonthly) return;

        if (!iapAvailable) {
            // Fall back to web checkout if Play/App Store unavailable
            // (e.g. Huawei device without Play Services).
            Alert.alert(
                'Subscribe on the web',
                'In-app purchases aren\'t available on this device. You can subscribe at nightfuel.app instead.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open website', onPress: () => Linking.openURL('https://nightfuel.app/pricing') },
                ],
            );
            return;
        }

        setPurchaseInFlight(true);
        const result = await requestSubscription(tier.productIdMonthly);
        if (!result.requested && result.error !== 'user_cancelled') {
            setPurchaseInFlight(false);
            Alert.alert('Couldn\'t start purchase', result.error ?? 'Unknown error');
        }
        // On success, the purchase listener picks it up. Don't clear
        // purchaseInFlight here — let the listener clear it after server
        // validation completes.
    }, [iapAvailable, activeTierId]);

    const handleRestore = useCallback(async () => {
        if (!iapAvailable) return;
        setRestoreInFlight(true);
        try {
            const result = await restorePurchases();
            if (result.error) {
                Alert.alert('Restore failed', 'Please try again later.');
            } else if (result.count === 0) {
                Alert.alert('No purchases found', 'No active subscriptions linked to your Apple ID / Google account.');
            }
            // Successful restores will fire the purchase listener which
            // re-validates and updates the tier — no extra UI needed here.
        } finally {
            setRestoreInFlight(false);
        }
    }, [iapAvailable]);

    const handleManage = useCallback(async () => {
        // Apple guideline 3.1.2(c): apps must provide a way to manage
        // subscriptions. Deep-links to the App Store / Play Store sheet.
        if (iapAvailable) {
            await openManageSubscriptions();
        } else {
            await Linking.openURL(
                Platform.OS === 'ios'
                    ? 'https://apps.apple.com/account/subscriptions'
                    : 'https://play.google.com/store/account/subscriptions',
            );
        }
    }, [iapAvailable]);

    const priceFor = (tier: TierUI): string => {
        if (tier.id === 'free') return tier.fallbackPrice;
        if (tier.productIdMonthly && productPrices[tier.productIdMonthly]) {
            return productPrices[tier.productIdMonthly]!;
        }
        return tier.fallbackPrice;
    };

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
                            const displayPrice = priceFor(tier);

                            return (
                                <TouchableOpacity
                                    key={tier.id}
                                    activeOpacity={0.9}
                                    onPress={() => setSelectedTier(tier.id)}
                                >
                                    <LinearGradient
                                        colors={isSelected ? tier.gradient : [colors.background.secondary, colors.background.secondary]}
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
                                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 40 }]}>{displayPrice}</Text>
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

                                        <TouchableOpacity
                                            disabled={isActive || purchaseInFlight || tier.id === 'free'}
                                            activeOpacity={0.85}
                                            onPress={() => handleUpgrade(tier)}
                                            style={[
                                                styles.actionBtn,
                                                {
                                                    backgroundColor: isActive ? 'transparent' : isSelected ? tier.color : colors.background.tertiary,
                                                    borderColor: isActive ? colors.text.tertiary : 'transparent',
                                                    borderWidth: isActive ? 1 : 0,
                                                    opacity: purchaseInFlight ? 0.6 : 1,
                                                },
                                            ]}
                                        >
                                            {purchaseInFlight && isSelected ? (
                                                <ActivityIndicator color="#000" />
                                            ) : (
                                                <Text style={[
                                                    typography.subhead,
                                                    {
                                                        color: isActive ? colors.text.tertiary : (isSelected && tier.id !== 'free') ? '#000' : colors.text.primary,
                                                        fontWeight: 'bold',
                                                    }
                                                ]}>
                                                    {isActive ? 'Current Plan' : (tier.id === 'free' ? 'Downgrade to Free' : `Upgrade to ${tier.name}`)}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </LinearGradient>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Required by Apple guideline 3.1.1: visible "Restore Purchases" + "Manage Subscription". */}
                    <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
                        <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 16 }]}>Subscription Tools</Text>

                        <TouchableOpacity
                            onPress={handleRestore}
                            disabled={restoreInFlight}
                            style={[styles.billingItem, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}
                        >
                            <View>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>Restore Purchases</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                    {Platform.OS === 'ios' ? 'Re-link a subscription tied to your Apple ID' : 'Re-link a subscription tied to your Google account'}
                                </Text>
                            </View>
                            {restoreInFlight ? <ActivityIndicator size="small" color={colors.text.tertiary} /> : <Ionicons name="refresh" size={20} color={colors.text.tertiary} />}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleManage}
                            style={[styles.billingItem, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default, marginTop: 12 }]}
                        >
                            <View>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>Manage Subscription</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                    Cancel, change plan, or update billing in {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}
                                </Text>
                            </View>
                            <Ionicons name="open-outline" size={20} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    </View>

                    {/* Required by Apple guideline 3.1.2(b): subscription terms must be visible AT POINT OF PURCHASE. */}
                    <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, lineHeight: 18 }]}>
                            Subscriptions auto-renew at the same price for the same period unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in {Platform.OS === 'ios' ? 'Apple ID Settings' : 'Google Play subscriptions'}. Payment is charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google'} account on confirmation. Any unused portion of a free trial is forfeited when you upgrade to paid. Prices may vary by region.
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
                            <TouchableOpacity onPress={() => Linking.openURL('https://nightfuel.app/terms')}>
                                <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '600' }]}>Terms of Service</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => Linking.openURL('https://nightfuel.app/privacy')}>
                                <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '600' }]}>Privacy Policy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
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
