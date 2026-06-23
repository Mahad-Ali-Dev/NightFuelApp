import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, Alert, Linking, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { colors as palette } from '@/theme/colors';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStatus } from '@/api/subscriptions';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
} from '@/lib/iap';
import { validateReceipt } from '@/api/iap';
import { captureException } from '@/lib/sentry';
import { BiometricGate } from '@/components/BiometricGate';
import { Skeleton, GlassCard, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';

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
        color: palette.text.secondary,
        gradient: [withAlpha(palette.text.secondary, 0.1), withAlpha(palette.background.primary, 0)],
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
        color: palette.accent.coral,
        gradient: [withAlpha(palette.accent.coral, 0.12), withAlpha(palette.background.primary, 0)],
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
        color: palette.accent.blue,
        gradient: [withAlpha(palette.accent.blue, 0.12), withAlpha(palette.background.primary, 0)],
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
        color: palette.accent.purpleLight,
        gradient: [withAlpha(palette.accent.purpleLight, 0.12), withAlpha(palette.background.primary, 0)],
        features: [
            'Client Management Dashboard (For Coaches)',
            'Global Template Creation',
            'Advanced Fleet Analytics & API Access',
            'Dedicated Account Manager',
        ],
    },
];

// Definite (never-undefined) handles into TIERS for the hero card + primary
// CTA. The `!` satisfies `noUncheckedIndexedAccess` — TIERS is a non-empty
// literal, so index 0 always exists.
const FREE_TIER: TierUI = TIERS[0]!;
const PRO_TIER: TierUI = TIERS.find((t) => t.id === 'pro') ?? FREE_TIER;

/** Split a localized price ("$9.99", "£19.99", "Free") into a leading symbol,
 *  the dominant numeric value and any trailing fraction so the VALUE can be the
 *  largest glyph on the current-plan card (value > label). Falls back to
 *  rendering the whole string as the value when it doesn't parse. */
function splitPrice(raw: string): { symbol: string; value: string; suffix: string } {
    const m = raw.match(/^([^\d]*)(\d[\d.,]*)(.*)$/);
    if (!m) return { symbol: '', value: raw, suffix: '' };
    return { symbol: (m[1] ?? '').trim(), value: m[2] ?? raw, suffix: (m[3] ?? '').trim() };
}

/** Human renewal date — "12 Jul 2026" — from the ISO `expiresAt`, or null. */
function formatRenewal(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Exported (additive — the default export below still wraps this in
// BiometricGate) so screen tests can mount the content directly, without the
// biometric gate's async capability check standing between the test and the
// loading / error / loaded states it asserts.
export function SubscriptionScreenContent() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: sub, isLoading, isError, refetch } = useQuery({
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
                'In-app purchases aren\'t available on this device. You can subscribe at zeitra.app instead.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open website', onPress: () => Linking.openURL('https://zeitra.app/pricing') },
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

    // Resolve the user's CURRENT plan + its visual identity for the hero card.
    const activeTier: TierUI = TIERS.find((t) => t.id === activeTierId) ?? FREE_TIER;
    const isPaid = activeTierId !== 'free';
    const renewalDate = formatRenewal(sub?.expiresAt);
    const activePrice = priceFor(activeTier);
    const { symbol: priceSymbol, value: priceValue, suffix: priceSuffix } = splitPrice(activePrice);

    // Status pill — colour must MATCH its meaning (color carries the signal):
    // ACTIVE → cyan (success/active), EXPIRING → amber (caution, NOT the
    // success green), FREE → muted secondary. Never colour a caution state with
    // the success hue.
    const isExpiring = isPaid && !sub?.active;
    const statusLabel = isPaid ? (sub?.active ? 'ACTIVE' : 'EXPIRING') : 'FREE';
    const statusColor = isExpiring
        ? colors.accent.amber
        : isPaid
            ? colors.accent.cyan
            : colors.text.secondary;
    // The single primary action lives in the thumb zone. For a paying member it
    // manages the live subscription; for a free member it starts the upgrade to
    // the recommended (Pro) plan via the same handler the carousel uses.

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Subscription</Text>
                <View style={{ width: 32 }} />
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} scrollEnabled={false}>
                    {/* Current-plan hero placeholder */}
                    <View style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl }}>
                        <Skeleton width="100%" height={188} radius={borderRadius['2xl']} />
                        <Skeleton width="100%" height={56} radius={borderRadius.lg} style={{ marginTop: spacing.lg }} />
                    </View>

                    {/* Plan carousel placeholders */}
                    <View style={{ marginTop: spacing['3xl'] }}>
                        <Skeleton width="45%" height={16} radius={borderRadius.sm} style={{ marginLeft: spacing['2xl'], marginBottom: spacing.lg }} />
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            scrollEnabled={false}
                            contentContainerStyle={{ paddingHorizontal: 20 }}
                        >
                            {[0, 1].map((i) => (
                                <Skeleton
                                    key={i}
                                    width={width * 0.72}
                                    height={420}
                                    radius={borderRadius['2xl']}
                                    style={{ marginRight: spacing.lg }}
                                />
                            ))}
                        </ScrollView>
                    </View>

                    {/* Billing tools placeholders */}
                    <View style={{ paddingHorizontal: spacing['2xl'], marginTop: spacing['3xl'] }}>
                        <Skeleton width="40%" height={14} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                        <Skeleton width="100%" height={68} radius={borderRadius.xl} />
                        <Skeleton width="100%" height={68} radius={borderRadius.xl} style={{ marginTop: spacing.md }} />
                    </View>
                </ScrollView>
            ) : isError ? (
                // HONEST error surface: getStatus failed, so we DON'T know the
                // user's tier. Defaulting activeTierId to 'free' here would render
                // the plan grid with Free as the "CURRENT PLAN" even for a paying
                // Pro/Premium member and could nudge a re-purchase — so instead we
                // show a retry surface (the same coral CtaButton + GlassCard recipe
                // as the requests inbox) wired to the query's refetch, and only that.
                <View style={styles.stateWrap}>
                    <GlassCard style={styles.stateCard}>
                        <View style={styles.stateInner}>
                            <View
                                style={[
                                    styles.stateIconCircle,
                                    {
                                        backgroundColor: withAlpha(colors.accent.coral, 0.12),
                                        borderColor: withAlpha(colors.accent.coral, 0.24),
                                    },
                                ]}
                            >
                                <Ionicons name="cloud-offline-outline" size={36} color={colors.accent.coral} />
                            </View>
                            <Text style={[typography.h3, { color: colors.text.primary, textAlign: 'center', marginTop: 16 }]}>
                                Couldn't load your subscription
                            </Text>
                            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
                                We couldn't check your plan status. Check your connection and try again.
                            </Text>
                            <CtaButton
                                label="Try Again"
                                icon="refresh"
                                accessibilityLabel="Retry loading your subscription status"
                                onPress={() => refetch()}
                                style={styles.stateRetryBtn}
                            />
                        </View>
                    </GlassCard>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
                    {/* ───────── CURRENT PLAN — the hero. Tier + status + renewal,
                        price as the dominant condensed number. ───────── */}
                    <Animated.View
                        entering={FadeInDown.duration(420).springify().damping(18)}
                        style={styles.heroWrap}
                    >
                        <GlassCard
                            glow={isPaid ? activeTier.color : undefined}
                            style={styles.heroCard}
                            testID="subscription-current-plan"
                        >
                            <LinearGradient
                                colors={isPaid ? activeTier.gradient : [withAlpha(colors.text.primary, 0.04), withAlpha(colors.background.primary, 0)]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.heroInner}
                            >
                                <View style={styles.heroTopRow}>
                                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                        Current Plan
                                    </Text>
                                    <View
                                        style={[
                                            styles.statusPill,
                                            {
                                                backgroundColor: withAlpha(statusColor, 0.14),
                                                borderColor: withAlpha(statusColor, 0.3),
                                            },
                                        ]}
                                    >
                                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                                        <Text style={[typography.captionMedium, { color: statusColor, letterSpacing: 0.4 }]}>
                                            {statusLabel}
                                        </Text>
                                    </View>
                                </View>

                                <Text style={[typography.display, { color: colors.text.primary, marginTop: spacing.sm }]}>
                                    {activeTier.name}
                                </Text>

                                {/* The VALUE dominates — big condensed numeral, small symbol + period. */}
                                <View style={styles.priceRow}>
                                    {priceSymbol ? (
                                        <Text style={[typography.statSmall, { color: isPaid ? activeTier.color : colors.text.secondary, marginRight: 2 }]}>{priceSymbol}</Text>
                                    ) : null}
                                    {/* The dominant numeral stays white so the single solid-lime hero
                                        CtaButton is the only full-lime focal point. Tier identity rides
                                        on the small currency symbol tint only. */}
                                    <Text style={[typography.statLarge, { color: colors.text.primary }]}>
                                        {priceValue}
                                    </Text>
                                    {priceSuffix ? (
                                        <Text style={[typography.h3, { color: colors.text.secondary, marginLeft: 4 }]}>{priceSuffix}</Text>
                                    ) : null}
                                    {isPaid ? (
                                        <Text style={[typography.subhead, { color: colors.text.tertiary, marginLeft: 6 }]}>{activeTier.period}</Text>
                                    ) : null}
                                </View>

                                <View style={[styles.heroDivider, { backgroundColor: colors.border.default }]} />

                                {/* Renewal — visual row, never a bare date list. Empty (free)
                                    state gets a one-line nudge instead of a blank slot. */}
                                <View style={styles.renewRow}>
                                    <Ionicons
                                        name={isPaid ? 'sync-outline' : 'sparkles-outline'}
                                        size={18}
                                        color={isPaid ? colors.accent.cyan : colors.accent.coral}
                                    />
                                    <Text style={[typography.bodySm, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>
                                        {isPaid
                                            ? renewalDate
                                                ? `Renews ${renewalDate}`
                                                : 'Renews automatically'
                                            : 'Upgrade to unlock analytics, AI meal planning & more'}
                                    </Text>
                                </View>
                            </LinearGradient>
                        </GlassCard>

                        {/* PRIMARY ACTION — thumb-reachable, single full-lime CTA. */}
                        <CtaButton
                            label={isPaid ? 'Manage Subscription' : 'Upgrade to Pro'}
                            icon={isPaid ? 'settings-outline' : 'rocket-outline'}
                            size="lg"
                            accessibilityLabel={isPaid ? 'Manage your subscription' : 'Upgrade to the Pro plan'}
                            onPress={() => (isPaid ? handleManage() : handleUpgrade(PRO_TIER))}
                            style={styles.heroCta}
                        />
                    </Animated.View>

                    {/* ───────── PLANS — compare & upgrade. ───────── */}
                    <Animated.View entering={FadeInDown.delay(80).duration(420).springify().damping(18)}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                {isPaid ? 'Change Plan' : 'Choose Your Plan'}
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

                                // Tier identity is a RESTRAINED hint only — a thin accent
                                // border + small badge + reduced-opacity check tint. The card
                                // body and its action button are NEVER filled with the tier's
                                // solid colour; the one solid-lime fill on the screen is the
                                // thumb-zone hero CtaButton.
                                const isFree = tier.id === 'free';
                                return (
                                    <PressableScale
                                        key={tier.id}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${tier.name} plan, ${displayPrice} ${tier.period}${isActive ? ', current plan' : ''}`}
                                        accessibilityState={{ selected: isSelected }}
                                        onPress={() => setSelectedTier(tier.id)}
                                    >
                                        <LinearGradient
                                            colors={isSelected ? tier.gradient : [colors.background.secondary, colors.background.secondary]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={[
                                                styles.tierCard,
                                                {
                                                    width: width * 0.75,
                                                    borderRadius: borderRadius['2xl'],
                                                    borderColor: isSelected ? withAlpha(tier.color, 0.55) : colors.border.default,
                                                    borderWidth: isSelected ? 1.5 : 1,
                                                    backgroundColor: colors.background.secondary,
                                                },
                                                isSelected && shadows.glow(tier.color),
                                            ]}
                                        >
                                            {tier.recommended && !isActive && (
                                                <View style={[styles.badgeTop, { backgroundColor: withAlpha(tier.color, 0.16), borderColor: withAlpha(tier.color, 0.4), borderWidth: 1 }]}>
                                                    <Text style={[typography.caption, { color: tier.color, fontWeight: '900', letterSpacing: 0.5 }]}>RECOMMENDED</Text>
                                                </View>
                                            )}
                                            {isActive && (
                                                <View style={[styles.badgeTop, { backgroundColor: withAlpha(colors.accent.cyan, 0.16), borderColor: withAlpha(colors.accent.cyan, 0.4), borderWidth: 1 }]}>
                                                    <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '900', letterSpacing: 0.5 }]}>CURRENT PLAN</Text>
                                                </View>
                                            )}

                                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: (tier.recommended || isActive) ? 10 : 0 }]}>
                                                {tier.name}
                                            </Text>

                                            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.sm }}>
                                                <Text style={[typography.statMedium, { color: colors.text.primary }]}>{displayPrice}</Text>
                                                <Text style={[typography.body, { color: colors.text.secondary, marginLeft: spacing.xs, fontWeight: 'bold' }]}>{tier.period}</Text>
                                            </View>

                                            <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                                            <View style={{ gap: 14 }}>
                                                {tier.features.map((feat, idx) => (
                                                    <View key={idx} style={styles.featureRow}>
                                                        <Ionicons name="checkmark-circle" size={20} color={withAlpha(tier.color, 0.7)} />
                                                        <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: 12, flex: 1 }]}>
                                                            {feat}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>

                                            <View style={{ flex: 1 }} />

                                            {/* SUBORDINATE selection affordance — outline / tertiary fill
                                                with accent-tinted ink, NOT a second solid-lime CTA. The one
                                                solid primary lives in the thumb zone (hero). Free is not a
                                                purchasable SKU, so it shows no action button at all — a paid
                                                user downgrades via the red Danger Zone "Cancel" row below. */}
                                            {isFree ? null : (
                                                <PressableScale
                                                    disabled={isActive || purchaseInFlight}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={isActive ? 'Current Plan' : `Upgrade to ${tier.name}`}
                                                    accessibilityState={{ disabled: isActive || purchaseInFlight, busy: purchaseInFlight && isSelected }}
                                                    onPress={() => handleUpgrade(tier)}
                                                    style={[
                                                        styles.actionBtn,
                                                        {
                                                            backgroundColor: isActive ? 'transparent' : colors.background.tertiary,
                                                            borderColor: isActive ? colors.border.light : withAlpha(tier.color, 0.4),
                                                            borderWidth: 1,
                                                            opacity: purchaseInFlight ? 0.6 : 1,
                                                        },
                                                    ]}
                                                >
                                                    {purchaseInFlight && isSelected ? (
                                                        <ActivityIndicator color={tier.color} />
                                                    ) : (
                                                        <Text style={[
                                                            typography.subhead,
                                                            {
                                                                color: isActive ? colors.text.tertiary : tier.color,
                                                                fontWeight: 'bold',
                                                            }
                                                        ]}>
                                                            {isActive ? 'Current Plan' : `Upgrade to ${tier.name}`}
                                                        </Text>
                                                    )}
                                                </PressableScale>
                                            )}
                                        </LinearGradient>
                                    </PressableScale>
                                );
                            })}
                        </ScrollView>
                    </Animated.View>

                    {/* ───────── BILLING & TOOLS — grouped rows with chevrons.
                        Required by Apple guideline 3.1.1: visible "Restore
                        Purchases" + "Manage Subscription". ───────── */}
                    <Animated.View
                        entering={FadeInDown.delay(140).duration(420).springify().damping(18)}
                        style={{ paddingHorizontal: spacing['2xl'], marginTop: spacing['3xl'] }}
                    >
                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>Billing & History</Text>

                        <GlassCard style={styles.groupCard} radius={borderRadius.xl}>
                            <PressableScale
                                onPress={handleRestore}
                                disabled={restoreInFlight}
                                accessibilityRole="button"
                                accessibilityLabel="Restore Purchases"
                                accessibilityState={{ disabled: restoreInFlight, busy: restoreInFlight }}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                style={styles.row}
                            >
                                <View style={[styles.rowIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                    <Ionicons name="refresh" size={18} color={colors.accent.cyan} />
                                </View>
                                <View style={styles.rowText}>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>Restore Purchases</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                        {Platform.OS === 'ios' ? 'Re-link a subscription tied to your Apple ID' : 'Re-link a subscription tied to your Google account'}
                                    </Text>
                                </View>
                                {restoreInFlight ? <ActivityIndicator size="small" color={colors.text.tertiary} /> : <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />}
                            </PressableScale>

                            <View style={[styles.rowDivider, { backgroundColor: colors.border.default }]} />

                            <PressableScale
                                onPress={handleManage}
                                accessibilityRole="button"
                                accessibilityLabel="Manage Subscription"
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                style={styles.row}
                            >
                                <View style={[styles.rowIcon, { backgroundColor: withAlpha(colors.accent.blue, 0.12) }]}>
                                    <Ionicons name="card-outline" size={18} color={colors.accent.blue} />
                                </View>
                                <View style={styles.rowText}>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>Manage & Billing History</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                        View invoices or change plan in {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}
                                    </Text>
                                </View>
                                <Ionicons name="open-outline" size={18} color={colors.text.tertiary} />
                            </PressableScale>
                        </GlassCard>
                    </Animated.View>

                    {/* ───────── DANGER — cancel, red + visually separated. The store
                        sheet is also where cancellation happens, so we route there. ───────── */}
                    {isPaid ? (
                        <Animated.View
                            entering={FadeInDown.delay(200).duration(420).springify().damping(18)}
                            style={{ paddingHorizontal: spacing['2xl'], marginTop: spacing['3xl'] }}
                        >
                            <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>Danger Zone</Text>
                            <PressableScale
                                onPress={handleManage}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel Subscription"
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                style={[
                                    styles.dangerRow,
                                    {
                                        backgroundColor: withAlpha(colors.accent.red, 0.08),
                                        borderColor: withAlpha(colors.accent.red, 0.28),
                                        borderRadius: borderRadius.xl,
                                    },
                                ]}
                            >
                                <View style={[styles.rowIcon, { backgroundColor: withAlpha(colors.accent.red, 0.14) }]}>
                                    <Ionicons name="close-circle-outline" size={18} color={colors.accent.red} />
                                </View>
                                <View style={styles.rowText}>
                                    <Text style={[typography.subhead, { color: colors.accent.red }]}>Cancel Subscription</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                        Keep access until {renewalDate ?? 'the end of your billing period'}
                                    </Text>
                                </View>
                                <Ionicons name="open-outline" size={18} color={withAlpha(colors.accent.red, 0.8)} />
                            </PressableScale>
                        </Animated.View>
                    ) : null}

                    {/* Required by Apple guideline 3.1.2(b): subscription terms must be visible AT POINT OF PURCHASE. */}
                    <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
                        <Text style={[typography.caption, { color: colors.text.secondary, lineHeight: 18 }]}>
                            Subscriptions auto-renew at the same price for the same period unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in {Platform.OS === 'ios' ? 'Apple ID Settings' : 'Google Play subscriptions'}. Payment is charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google'} account on confirmation. Any unused portion of a free trial is forfeited when you upgrade to paid. Prices may vary by region.
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
                            <PressableScale accessibilityRole="link" accessibilityLabel="Terms of Service" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} onPress={() => Linking.openURL('https://zeitra.app/terms')}>
                                <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '600' }]}>Terms of Service</Text>
                            </PressableScale>
                            <PressableScale accessibilityRole="link" accessibilityLabel="Privacy Policy" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} onPress={() => Linking.openURL('https://zeitra.app/privacy')}>
                                <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '600' }]}>Privacy Policy</Text>
                            </PressableScale>
                        </View>
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // Centered honest-error retry surface (mirrors (community)/requests.tsx).
    stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    stateCard: { width: '100%', maxWidth: 420 },
    stateInner: { padding: 24, alignItems: 'center' },
    stateIconCircle: { width: 72, height: 72, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    stateRetryBtn: { marginTop: 24, minWidth: 160, borderRadius: 14 },

    // Current-plan hero
    heroWrap: { paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl },
    heroCard: { width: '100%' },
    heroInner: { padding: spacing.xl },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: br.full, borderWidth: 1 },
    statusDot: { width: 7, height: 7, borderRadius: br.full, marginRight: 6 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
    heroDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.lg },
    renewRow: { flexDirection: 'row', alignItems: 'center' },
    heroCta: { marginTop: spacing.lg, borderRadius: br.lg },

    // Section header (overline) row
    sectionHeaderRow: { paddingHorizontal: spacing['2xl'], marginTop: spacing['3xl'], marginBottom: spacing.lg },

    // Plan carousel cards
    tierCard: { padding: spacing['2xl'], marginRight: spacing.lg, minHeight: 450, display: 'flex' },
    badgeTop: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: br.full, marginBottom: spacing.lg },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xl },
    featureRow: { flexDirection: 'row', alignItems: 'center' },
    actionBtn: { width: '100%', paddingVertical: spacing.lg, borderRadius: br.lg, alignItems: 'center', marginTop: spacing['3xl'] },

    // Grouped billing rows
    groupCard: { width: '100%' },
    row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, minHeight: 64 },
    rowIcon: { width: 36, height: 36, borderRadius: br.md, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
    rowText: { flex: 1, marginRight: spacing.sm },
    rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 36 + spacing.md },

    // Danger zone
    dangerRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, minHeight: 64, borderWidth: 1 },

    // Legacy (kept for any external style reference)
    billingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, borderWidth: 1 },
    heroTextContainer: { paddingHorizontal: spacing['3xl'], paddingTop: spacing.xl, paddingBottom: spacing['3xl'] },
});

// Gate the billing screen behind biometric re-auth (S3). Auto-bypasses on
// devices without Face ID / Touch ID enrolled so users are never locked out
// of their own subscription.
export default function SubscriptionScreen() {
    const router = useRouter();
    return (
        <BiometricGate
            prompt="Confirm it's you to view and manage your subscription"
            onSkip={() => router.back()}
        >
            <SubscriptionScreenContent />
        </BiometricGate>
    );
}
