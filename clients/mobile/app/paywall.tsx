/**
 * paywall.tsx — the Zeitra Pro subscription screen.
 *
 * Pushed when a user taps "Upgrade" or hits a Pro-gated feature. Reads the current
 * RevenueCat offering for real store prices; if the offering isn't configured yet
 * (RevenueCat dashboard products/offering not set up), it degrades to the static
 * $9.99/mo · $59/yr copy with the purchase CTA disabled + an honest note, so the
 * screen is never broken during setup. On a successful purchase the `pro`
 * entitlement flips (RevenueCat listener elsewhere + the backend webhook confirm
 * authoritatively) and we pop back.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useTheme } from '@/theme';
import { CtaButton } from '@/components/ui/CtaButton';
import { getCurrentOffering, purchase, restorePurchases, isPurchasesReady } from '@/lib/purchases/revenueCat';

const PRO_FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'sparkles', text: 'AI coach Ria — all-day chat & guidance' },
  { icon: 'scan', text: 'Scan any meal or barcode for instant macros' },
  { icon: 'barbell', text: 'Personalized AI meal & workout plans' },
  { icon: 'trending-up', text: 'Full history, trends & advanced analytics' },
  { icon: 'heart', text: 'Cycle, sleep & heart-rate insights' },
];

type PlanKey = 'annual' | 'monthly';

export default function PaywallScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanKey>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let alive = true;
    getCurrentOffering().then((o) => {
      if (alive) {
        setOffering(o);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const annualPkg = useMemo(
    () => offering?.availablePackages.find((p) => p.packageType === 'ANNUAL') ?? null,
    [offering],
  );
  const monthlyPkg = useMemo(
    () => offering?.availablePackages.find((p) => p.packageType === 'MONTHLY') ?? null,
    [offering],
  );

  // Real store prices when the offering exists; the decided fallback copy otherwise.
  const annualPrice = annualPkg?.product.priceString ?? '$59';
  const monthlyPrice = monthlyPkg?.product.priceString ?? '$9.99';
  const selectedPkg: PurchasesPackage | null = selected === 'annual' ? annualPkg : monthlyPkg;
  const canBuy = isPurchasesReady() && !!selectedPkg;

  const onSubscribe = async () => {
    if (!selectedPkg) {
      Alert.alert('Almost ready', "Subscriptions are being set up — please check back shortly.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPurchasing(true);
    const res = await purchase(selectedPkg);
    setPurchasing(false);
    if (res.pro) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Welcome to Pro 🎉', 'Everything is unlocked. Enjoy!', [
        { text: 'Let’s go', onPress: () => router.back() },
      ]);
    } else if (!res.cancelled) {
      Alert.alert('Purchase didn’t complete', 'No charge was made. Please try again.');
    }
  };

  const onRestore = async () => {
    setRestoring(true);
    const pro = await restorePurchases();
    setRestoring(false);
    Alert.alert(
      pro ? 'Restored ✓' : 'Nothing to restore',
      pro ? 'Your Pro subscription is active again.' : 'We couldn’t find an active subscription for this account.',
      pro ? [{ text: 'Great', onPress: () => router.back() }] : undefined,
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Close */}
      <Pressable
        style={[styles.close, { top: insets.top + 6 }]}
        hitSlop={12}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={26} color={colors.text.secondary} />
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.crown, { backgroundColor: 'rgba(194,240,60,0.14)' }]}>
            <Ionicons name="star" size={30} color={colors.accent.coral} />
          </View>
          <Text style={[typography.h1, styles.title, { color: colors.text.primary }]}>Zeitra Pro</Text>
          <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 6 }]}>
            One plan. Every feature. Your whole day, optimized.
          </Text>
        </View>

        {/* Features */}
        <View style={{ marginTop: 26, gap: 14 }}>
          {PRO_FEATURES.map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: 'rgba(194,240,60,0.12)' }]}>
                <Ionicons name={f.icon} size={17} color={colors.accent.coral} />
              </View>
              <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Plans */}
        <View style={{ marginTop: 28, gap: 12 }}>
          <PlanCard
            colors={colors}
            typography={typography}
            selected={selected === 'annual'}
            onPress={() => setSelected('annual')}
            title="Yearly"
            price={annualPrice}
            period="/year"
            sub={`7-day free trial, then ${annualPrice}/yr`}
            badge="BEST VALUE · SAVE ~50%"
          />
          <PlanCard
            colors={colors}
            typography={typography}
            selected={selected === 'monthly'}
            onPress={() => setSelected('monthly')}
            title="Monthly"
            price={monthlyPrice}
            period="/month"
            sub={`7-day free trial, then ${monthlyPrice}/mo`}
          />
        </View>

        {/* CTA */}
        <View style={{ marginTop: 22 }}>
          {loading ? (
            <ActivityIndicator color={colors.accent.coral} style={{ paddingVertical: 16 }} />
          ) : (
            <>
              <CtaButton
                label={canBuy ? 'Start 7-day free trial' : 'Available soon'}
                icon="lock-open"
                size="lg"
                flat
                loading={purchasing}
                disabled={!canBuy || purchasing}
                onPress={onSubscribe}
              />
              {!canBuy ? (
                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
                  Subscriptions activate once the store products are live.
                </Text>
              ) : (
                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 10 }]}>
                  Free for 7 days, then {selected === 'annual' ? `${annualPrice}/year` : `${monthlyPrice}/month`}. Cancel anytime.
                </Text>
              )}
            </>
          )}
        </View>

        {/* Restore + legal */}
        <View style={{ marginTop: 18, alignItems: 'center', gap: 10 }}>
          <Pressable onPress={onRestore} hitSlop={8} disabled={restoring}>
            <Text style={[typography.caption, { color: colors.accent.coral }]}>
              {restoring ? 'Restoring…' : 'Restore purchases'}
            </Text>
          </Pressable>
          <View style={styles.legalRow}>
            <Pressable onPress={() => Linking.openURL('https://zeitra.app/terms').catch(() => {})} hitSlop={6}>
              <Text style={[typography.caption, { color: colors.text.secondary }]}>Terms</Text>
            </Pressable>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>·</Text>
            <Pressable onPress={() => Linking.openURL('https://zeitra.app/privacy').catch(() => {})} hitSlop={6}>
              <Text style={[typography.caption, { color: colors.text.secondary }]}>Privacy</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PlanCard({
  colors,
  typography,
  selected,
  onPress,
  title,
  price,
  period,
  sub,
  badge,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  period: string;
  sub: string;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.plan,
        {
          borderColor: selected ? colors.accent.coral : colors.border.default,
          backgroundColor: selected ? 'rgba(194,240,60,0.08)' : 'transparent',
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      <View style={styles.radio}>
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={selected ? colors.accent.coral : colors.text.secondary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[typography.subtitle, { color: colors.text.primary, fontSize: 16 }]}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: colors.accent.coral }]}>
              <Text style={styles.badgeTxt}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[typography.subtitle, { color: colors.text.primary, fontSize: 18, fontWeight: '800' }]}>{price}</Text>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{period}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  close: { position: 'absolute', right: 14, zIndex: 10, padding: 6 },
  hero: { alignItems: 'center', marginTop: 18 },
  crown: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '800' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  featureIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 15 },
  radio: {},
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeTxt: { color: '#0A0C12', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
