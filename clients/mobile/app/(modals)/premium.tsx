/**
 * Premium paywall (modal) — the conversion peak.
 *
 * Zeitra premium reskin (mockup: app_images/paywall-preview.html). A cinematic
 * HERO BAND (~226px) opens the screen: a female model (hero-female-2.png) anchored
 * to the right over a lime radial glow and a diagonal lime→ink gradient, faded into
 * the page by a left-to-right ink scrim so the copy stays legible. A left "PREMIUM"
 * pill, the "Zeitra Premium" title and the "Your body, fully in sync." tagline sit
 * bottom-left; the close X floats top-right inside a frosted circle. Below the hero,
 * icon-led benefit rows (lime-tint icon square + bold title + one-line subtext)
 * read as a feature map (Ria coaching / 2,500-exercise library / cycle insights /
 * shift scheduling). A ★★★★★ trust line ("Loved by 12,000+ shift workers") bridges
 * into the two plan cards: Monthly + a highlighted "BEST VALUE" Yearly with
 * per-month framing and a floating badge. A full-width lime CTA (CtaButton,
 * ink-on-lime) drives the trial, with a subscription disclaimer and a subdued
 * Restore · Terms · Privacy footer.
 *
 * BILLING = RevenueCat (StoreKit / Play Billing). The CTA runs a real store
 * purchase on the selected package from the live RevenueCat offering: on success
 * the `pro` entitlement flips immediately (client) and the subscription-service
 * webhook confirms the tier authoritatively, then we invalidate the cached
 * ['subscription-status'] / ['user-profile'] and router.back. When the offering
 * isn't configured yet (dashboard products not set up / Expo Go), the screen
 * degrades to an honest "Available soon" (CTA disabled) rather than a broken
 * purchase — it never crashes. The retired custom `upgrade({tier})` backend call
 * is gone (that was the free tier-flip we replaced). The `selectedPlan` toggle,
 * plan a11y labels, the close handler and Terms/Privacy Linking.openURL handlers
 * are preserved. The displayed prices ($9.99/mo · $4.99/mo yearly = $59.99/year ·
 * 7-day trial) match the locked pricing + the mockup; the real charged price is
 * whatever the store returns for the package. The benefit/plan lists are static
 * consts (never async) so the screen can never be empty.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { CtaButton } from '@/components/ui/CtaButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { withAlpha } from '@/theme/utils';
import { getCurrentOffering, purchase, restorePurchases, isPurchasesReady } from '@/lib/purchases/revenueCat';
import { useSubscription } from '@/hooks/useSubscription';

type Plan = 'annual' | 'monthly';

// Hero model — same require idiom as app/(auth)/login.tsx (parenthesized route
// group at the same depth), anchored to the right edge of the hero band.
const HERO_FEMALE = require('../../assets/images/hero-female-2.png');

// Benefit rows — every icon tile carries the LIME tint (mockup look): the page
// reads as one coherent feature map. Icons map the mockup's Tabler glyphs onto the
// nearest Ionicons (sparkles→sparkles, barbell→barbell, heart→heart, calendar-bolt
// →calendar). LIME stays the brand thread here AND on the CTA + active plan.
const FEATURES = [
    { title: 'Unlimited coaching with Ria', desc: 'Every meal, workout & wind-down planned', icon: 'sparkles' },
    { title: '2,500-exercise video library', desc: "With Ria's spoken form cues",            icon: 'barbell'  },
    { title: 'Cycle insights & phase plans',  desc: 'Training & food tuned to your cycle',     icon: 'heart'    },
    { title: 'Smart shift scheduling',        desc: 'Timed to your circadian clock',           icon: 'calendar' },
] as const;

export default function PremiumScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    // Already-Pro users see a confirmation instead of the plans/CTA — never sell
    // to someone who already has it.
    const { isPro } = useSubscription();

    const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
    const [offering, setOffering] = useState<PurchasesOffering | null>(null);
    const [purchasing, setPurchasing] = useState(false);
    const [restoring, setRestoring] = useState(false);

    // Load the live RevenueCat offering for real store packages. Stays null when
    // products aren't configured yet (dashboard not set up / Expo Go) → the CTA
    // degrades to an honest "Available soon"; the screen never breaks.
    useEffect(() => {
        let alive = true;
        getCurrentOffering().then((o) => { if (alive) setOffering(o); });
        return () => { alive = false; };
    }, []);

    const annualPkg = useMemo(
        () => offering?.availablePackages.find((p) => p.packageType === 'ANNUAL') ?? null,
        [offering],
    );
    const monthlyPkg = useMemo(
        () => offering?.availablePackages.find((p) => p.packageType === 'MONTHLY') ?? null,
        [offering],
    );
    const selectedPkg: PurchasesPackage | null = selectedPlan === 'annual' ? annualPkg : monthlyPkg;
    const canBuy = isPurchasesReady() && !!selectedPkg;

    // Real store purchase via RevenueCat. On success the `pro` entitlement flips
    // immediately (client) and the subscription-service webhook confirms the tier
    // authoritatively; we refresh the cached status everywhere and pop back.
    const onSubscribe = async () => {
        if (!selectedPkg) {
            Alert.alert('Almost ready', 'Subscriptions are being set up — please check back shortly.');
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setPurchasing(true);
        const res = await purchase(selectedPkg);
        setPurchasing(false);
        if (res.pro) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            qc.invalidateQueries({ queryKey: ['subscription-status'] });
            qc.invalidateQueries({ queryKey: ['user-profile'] });
            Alert.alert(
                '🎉 Welcome to Zeitra Pro!',
                'Your 7-day free trial has started. Enjoy all premium features.',
                [{ text: "Let's Go!", onPress: () => router.back() }],
            );
        } else if (!res.cancelled) {
            Alert.alert('Purchase didn’t complete', 'No charge was made. Please try again.');
        }
    };

    const onRestore = async () => {
        setRestoring(true);
        const pro = await restorePurchases();
        setRestoring(false);
        if (pro) {
            qc.invalidateQueries({ queryKey: ['subscription-status'] });
            qc.invalidateQueries({ queryKey: ['user-profile'] });
        }
        Alert.alert(
            pro ? 'Restored ✓' : 'Nothing to restore',
            pro
                ? 'Your Pro subscription is active again.'
                : 'We couldn’t find an active subscription for this account.',
            pro ? [{ text: 'Great', onPress: () => router.back() }] : undefined,
        );
    };

    const annualSelected  = selectedPlan === 'annual';
    const monthlySelected = selectedPlan === 'monthly';

    // Lime is the brand thread: hero glow, benefit icons, the active plan, the CTA.
    const lime = colors.accent.coral;
    const ink = colors.text.inverse;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            <ScrollView
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── HERO BAND ─────────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
                    {/* Neutral vertical base wash (mockup: #15171d → bg); the lime
                        glow is the separate radial element below. */}
                    <LinearGradient
                        colors={['#15171D', colors.background.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />
                    {/* Lime radial glow, upper-right */}
                    <View style={[styles.heroGlow, { backgroundColor: withAlpha(lime, 0.20) }]} />
                    {/* Model anchored to the right edge, bottom-aligned */}
                    <Image source={HERO_FEMALE} style={styles.heroImage} resizeMode="contain" />
                    {/* Left-to-right ink scrim so the copy stays legible over the model */}
                    <LinearGradient
                        colors={[colors.background.primary, withAlpha(colors.background.primary, 0.0)]}
                        locations={[0.16, 0.78]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFillObject}
                    />

                    {/* Close X — frosted circle, top-right, respects the safe area */}
                    <View style={[styles.heroTopBar, { paddingTop: insets.top + 6 }]}>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                            onPress={() => router.back()}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={[styles.closeBtn, { backgroundColor: withAlpha(colors.background.primary, 0.7) }]}
                        >
                            <Ionicons name="close" size={20} color={colors.text.primary} />
                        </TouchableOpacity>
                    </View>

                    {/* Title block — bottom-left, kept clear of the model */}
                    <View style={styles.heroCopy}>
                        <View style={[styles.premiumPill, { backgroundColor: lime }]}>
                            <Text style={[typography.overline, { color: ink, fontSize: 10, letterSpacing: 1.2 }]}>
                                PREMIUM
                            </Text>
                        </View>
                        <Text style={[typography.h1, { color: colors.text.primary, fontSize: 29, letterSpacing: -0.8, marginTop: spacing.md, lineHeight: 30 }]}>
                            Zeitra{'\n'}Premium
                        </Text>
                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.sm }]}>
                            Your body, fully in sync.
                        </Text>
                    </View>
                </Animated.View>

                {/* ── BENEFIT ROWS ─────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(420).delay(60)} style={styles.benefits}>
                    {FEATURES.map((feat) => (
                        <View key={feat.title} style={styles.benefitRow}>
                            <View style={[styles.iconBox, { backgroundColor: '#1E222B' }]}>
                                <Ionicons name={feat.icon as any} size={22} color={lime} />
                            </View>
                            <View style={styles.benefitText}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontSize: 15 }]}>{feat.title}</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 1 }]}>{feat.desc}</Text>
                            </View>
                        </View>
                    ))}
                </Animated.View>

                {isPro ? (
                    <ProActive
                        colors={colors}
                        spacing={spacing}
                        lime={lime}
                        ink={ink}
                        onManage={() => router.push('/(settings)/subscription')}
                    />
                ) : (
                <>
                {/* ── TRUST LINE ───────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(420).delay(120)} style={styles.trustLine}>
                    <Text style={[typography.caption, { color: lime, letterSpacing: 1.5 }]}>★★★★★</Text>
                    <Text style={[typography.caption, { color: colors.text.secondary }]}>Loved by 12,000+ shift workers</Text>
                </Animated.View>

                {/* ── PLAN CARDS ───────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(420).delay(160)} style={styles.pricingRow} accessibilityRole="radiogroup">
                    {/* Monthly */}
                    <PressableScale
                        style={styles.planFlex}
                        pressedScale={0.97}
                        onPress={() => setSelectedPlan('monthly')}
                        accessibilityRole="radio"
                        accessibilityLabel="Monthly plan, $9.99 billed monthly"
                        accessibilityState={{ selected: monthlySelected }}
                    >
                        <View
                            style={[
                                styles.planCard,
                                {
                                    backgroundColor: colors.background.secondary,
                                    borderColor: monthlySelected ? lime : colors.border.default,
                                    borderWidth: monthlySelected ? 1.5 : 1,
                                },
                                monthlySelected && shadows.glow(lime),
                            ]}
                        >
                            <Text style={[typography.captionMedium, { color: colors.text.secondary, fontSize: 13 }]}>Monthly</Text>
                            <Text
                                style={[typography.statSmall, { color: monthlySelected ? lime : colors.text.primary, fontSize: 22, marginTop: spacing.xs }]}
                                maxFontSizeMultiplier={1.3}
                            >
                                $9.99
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]}>per month</Text>
                        </View>
                    </PressableScale>

                    {/* Yearly — highlighted BEST VALUE; floating badge lives on the
                        outer relative wrapper so it is never clipped. */}
                    <View style={styles.planFlex}>
                        <PressableScale
                            pressedScale={0.97}
                            onPress={() => setSelectedPlan('annual')}
                            accessibilityRole="radio"
                            accessibilityLabel="Yearly plan, $4.99 per month, $59.99 billed yearly, save 40%, best value"
                            accessibilityState={{ selected: annualSelected }}
                        >
                            <View
                                style={[
                                    styles.planCard,
                                    styles.planCardYearly,
                                    {
                                        backgroundColor: colors.background.secondary,
                                        borderColor: lime,
                                        borderWidth: 1.5,
                                    },
                                    shadows.glow(lime),
                                ]}
                            >
                                <Text style={[typography.captionMedium, { color: colors.text.primary, fontSize: 13 }]}>Yearly</Text>
                                <Text
                                    style={[typography.statSmall, { color: annualSelected ? lime : colors.text.primary, fontSize: 22, marginTop: spacing.xs }]}
                                    maxFontSizeMultiplier={1.3}
                                >
                                    $4.99
                                </Text>
                                <Text style={[typography.caption, { color: lime, fontWeight: '600', marginTop: 1 }]}>/mo · save 40%</Text>
                                {annualSelected && (
                                    <View style={[styles.checkIcon, { backgroundColor: lime }]}>
                                        <Ionicons name="checkmark" size={11} color={ink} />
                                    </View>
                                )}
                            </View>
                        </PressableScale>
                        <View style={styles.bestBadgeOverlay} pointerEvents="none">
                            <View style={[styles.bestBadge, { backgroundColor: lime }]}>
                                <Text style={[typography.overline, { color: ink, fontSize: 9, letterSpacing: 0.5 }]}>
                                    BEST VALUE
                                </Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* ── CTA ──────────────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(420).delay(200)} style={styles.ctaWrap}>
                    <CtaButton
                        size="lg"
                        flat
                        label={canBuy ? 'Start 7-day free trial' : 'Available soon'}
                        loading={purchasing}
                        disabled={!canBuy || purchasing}
                        onPress={onSubscribe}
                    />
                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: spacing.md }]}>
                        {!canBuy
                            ? 'Subscriptions activate once the store products are live.'
                            : annualSelected ? 'Then $59.99/year · cancel anytime' : 'Then $9.99/month · cancel anytime'}
                    </Text>

                    {/* Restore · Terms · Privacy — subdued, non-destructive links */}
                    <View style={styles.linksRow}>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Restore purchases"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            disabled={restoring}
                            onPress={onRestore}
                        >
                            <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>{restoring ? 'Restoring…' : 'Restore'}</Text>
                        </TouchableOpacity>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>·</Text>
                        <TouchableOpacity
                            accessibilityRole="link"
                            accessibilityLabel="Terms of Service"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => Linking.openURL('https://zeitra.app/terms')}
                        >
                            <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>Terms</Text>
                        </TouchableOpacity>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>·</Text>
                        <TouchableOpacity
                            accessibilityRole="link"
                            accessibilityLabel="Privacy Policy"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => Linking.openURL('https://zeitra.app/privacy')}
                        >
                            <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>Privacy</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
                </>
                )}
            </ScrollView>
        </View>
    );
}

/**
 * The "already Pro" state — shown in place of the plans/CTA when useSubscription
 * reports an active entitlement, so a subscriber is thanked + routed to manage
 * rather than sold the plan again.
 */
function ProActive({
    colors,
    spacing,
    lime,
    ink,
    onManage,
}: {
    colors: ReturnType<typeof useTheme>['colors'];
    spacing: ReturnType<typeof useTheme>['spacing'];
    lime: string;
    ink: string;
    onManage: () => void;
}) {
    return (
        <View style={styles.proWrap}>
            <View style={[styles.proCheck, { backgroundColor: lime }]}>
                <Ionicons name="checkmark" size={34} color={ink} />
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' }}>
                You’re on Zeitra Premium
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 14, marginTop: spacing.xs, textAlign: 'center', lineHeight: 20 }}>
                Every feature is unlocked. Thanks for supporting Zeitra 💚
            </Text>
            <View style={{ width: '100%', marginTop: spacing.xl }}>
                <CtaButton size="lg" flat label="Manage subscription" onPress={onManage} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Hero band — ~226px, clips the model + glow to the rounded-free top edge.
    hero: {
        height: 226,
        overflow: 'hidden',
        position: 'relative',
    },
    heroGlow: {
        position: 'absolute',
        top: -20,
        right: 30,
        width: 230,
        height: 230,
        borderRadius: 115,
    },
    heroImage: {
        position: 'absolute',
        right: -30,
        bottom: 0,
        height: 232,
        width: 220,
    },
    heroTopBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 18,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroCopy: {
        position: 'absolute',
        left: 20,
        bottom: 20,
        right: 130,
    },
    premiumPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 20,
    },

    // Benefit rows.
    benefits: {
        paddingHorizontal: 22,
        paddingTop: 16,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 7,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 13,
    },
    benefitText: { flex: 1 },

    // Trust line.
    trustLine: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingTop: 16,
    },

    // Plan cards.
    pricingRow: {
        flexDirection: 'row',
        gap: 11,
        paddingHorizontal: 16,
        paddingTop: 13,
        alignItems: 'stretch',
    },
    planFlex: {
        flex: 1,
        position: 'relative',
    },
    planCard: {
        borderRadius: 16,
        paddingVertical: 13,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 92,
    },
    planCardYearly: {
        // extra top room so the floating BEST VALUE badge never crowds the label
        paddingTop: 18,
    },
    checkIcon: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bestBadgeOverlay: {
        position: 'absolute',
        top: -10,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 2,
    },
    bestBadge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },

    // Already-Pro confirmation (shown instead of plans/CTA).
    proWrap: {
        paddingHorizontal: 22,
        paddingTop: 24,
        alignItems: 'center',
    },
    proCheck: {
        width: 68,
        height: 68,
        borderRadius: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // CTA + footer.
    ctaWrap: {
        paddingHorizontal: 16,
        paddingTop: 15,
    },
    linksRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        marginTop: 11,
    },
});
