/**
 * Subscription — the "manage your plan" screen (reached from Settings → Manage
 * Subscription), behind a biometric gate.
 *
 * Billing runs through RevenueCat now (src/lib/purchases/revenueCat.ts +
 * app/paywall.tsx). This screen is intentionally simple: it shows the user's
 * CURRENT plan/status (authoritative, from subscription-service via getStatus),
 * routes the upgrade action to the RevenueCat paywall, and offers the
 * Apple/Google-required Restore + Manage actions and subscription terms. The old
 * 4-tier custom-IAP carousel (Free/Pro/Premium/Enterprise + @/lib/iap purchase
 * flow) was retired: the product is ONE Pro plan (7-day trial → $9.99/mo · $59/yr),
 * and RevenueCat owns the purchase, trial and receipt validation.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStatus } from '@/api/subscriptions';
import { LinearGradient } from 'expo-linear-gradient';
import { restorePurchases as restorePurchasesRC } from '@/lib/purchases/revenueCat';
import { BiometricGate } from '@/components/BiometricGate';
import { Skeleton, GlassCard, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';

/** Human renewal date — "12 Jul 2026" — from the ISO `expiresAt`, or null. */
function formatRenewal(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SubscriptionScreenContent() {
  const { colors, typography, borderRadius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: sub, isLoading, isError, refetch } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: getStatus,
  });

  const [restoreInFlight, setRestoreInFlight] = useState(false);

  const isPaid = ((sub?.tier as string | undefined) ?? 'FREE').toUpperCase() !== 'FREE';
  const isActive = !!(sub as { active?: boolean; isActive?: boolean } | undefined)?.active
    || !!(sub as { isActive?: boolean } | undefined)?.isActive;
  const renewalDate = formatRenewal((sub as { expiresAt?: string | null } | undefined)?.expiresAt);
  const planName = isPaid ? 'Pro' : 'Free';

  // The Zeitra Premium modal is the single RevenueCat paywall (reached from every
  // Pro gate); the Settings upgrade action opens the same screen.
  const openPaywall = useCallback(() => router.push('/(modals)/premium' as never), [router]);

  const handleRestore = useCallback(async () => {
    setRestoreInFlight(true);
    try {
      const pro = await restorePurchasesRC();
      if (pro) {
        await queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
        Alert.alert('Restored ✓', 'Your Pro subscription is active again.');
      } else {
        Alert.alert('No purchases found', 'No active subscription was found for this account.');
      }
    } finally {
      setRestoreInFlight(false);
    }
  }, [queryClient]);

  const handleManage = useCallback(() => {
    Linking.openURL(
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions',
    ).catch(() => {});
  }, []);

  // Status pill signal: ACTIVE → cyan, EXPIRING → amber, FREE → muted.
  const isExpiring = isPaid && !isActive;
  const statusLabel = isPaid ? (isActive ? 'ACTIVE' : 'EXPIRING') : 'FREE';
  const statusColor = isExpiring ? colors.accent.amber : isPaid ? colors.accent.cyan : colors.text.secondary;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
        <TouchableOpacity hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Subscription</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl }}>
          <Skeleton width="100%" height={188} radius={borderRadius['2xl']} />
          <Skeleton width="100%" height={56} radius={borderRadius.lg} style={{ marginTop: spacing.lg }} />
        </View>
      ) : isError ? (
        // HONEST error surface: getStatus failed, so we don't know the tier — show
        // a retry rather than defaulting to Free (which could nudge a re-purchase).
        <View style={styles.stateWrap}>
          <GlassCard style={styles.stateCard}>
            <View style={styles.stateInner}>
              <View style={[styles.stateIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) }]}>
                <Ionicons name="cloud-offline-outline" size={36} color={colors.accent.coral} />
              </View>
              <Text style={[typography.h3, { color: colors.text.primary, textAlign: 'center', marginTop: 16 }]}>Couldn’t load your subscription</Text>
              <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
                Check your connection and try again.
              </Text>
              <CtaButton label="Try again" icon="refresh" onPress={() => refetch()} style={{ marginTop: 24, minWidth: 160 }} />
            </View>
          </GlassCard>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 + insets.bottom }} showsVerticalScrollIndicator={false}>
          {/* Current plan hero */}
          <View style={styles.heroWrap}>
            <GlassCard glow={isPaid ? colors.accent.coral : undefined} style={{ width: '100%' }}>
              <LinearGradient
                colors={isPaid ? [withAlpha(colors.accent.coral, 0.12), withAlpha(colors.background.primary, 0)] : [withAlpha(colors.text.primary, 0.04), withAlpha(colors.background.primary, 0)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroInner}
              >
                <View style={styles.heroTopRow}>
                  <Text style={[typography.overline, { color: colors.text.tertiary }]}>Current Plan</Text>
                  <View style={[styles.statusPill, { backgroundColor: withAlpha(statusColor, 0.14), borderColor: withAlpha(statusColor, 0.3) }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[typography.captionMedium, { color: statusColor, letterSpacing: 0.4 }]}>{statusLabel}</Text>
                  </View>
                </View>

                <Text style={[typography.display, { color: colors.text.primary, marginTop: spacing.sm }]}>{planName}</Text>

                <View style={[styles.heroDivider, { backgroundColor: colors.border.default }]} />

                <View style={styles.renewRow}>
                  <Ionicons name={isPaid ? 'sync-outline' : 'sparkles-outline'} size={18} color={isPaid ? colors.accent.cyan : colors.accent.coral} />
                  <Text style={[typography.bodySm, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>
                    {isPaid ? (renewalDate ? `Renews ${renewalDate}` : 'Renews automatically') : 'Upgrade for unlimited AI coaching, scans, plans & insights'}
                  </Text>
                </View>
              </LinearGradient>
            </GlassCard>

            <CtaButton
              label={isPaid ? 'Manage Subscription' : 'Upgrade to Pro'}
              icon={isPaid ? 'settings-outline' : 'rocket-outline'}
              size="lg"
              accessibilityLabel={isPaid ? 'Manage your subscription' : 'Upgrade to the Pro plan'}
              onPress={isPaid ? handleManage : openPaywall}
              style={{ marginTop: spacing.lg, borderRadius: br.lg }}
            />
          </View>

          {/* Billing tools (Apple/Google required) */}
          <View style={{ paddingHorizontal: spacing['2xl'], marginTop: spacing['3xl'] }}>
            <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>Billing</Text>
            <GlassCard style={{ width: '100%' }} radius={borderRadius.xl}>
              <PressableScale onPress={handleRestore} disabled={restoreInFlight} accessibilityRole="button" accessibilityLabel="Restore Purchases" style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                  <Ionicons name="refresh" size={18} color={colors.accent.cyan} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[typography.subhead, { color: colors.text.primary }]}>Restore Purchases</Text>
                  <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                    Re-link a subscription tied to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google account'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
              </PressableScale>

              <View style={[styles.rowDivider, { backgroundColor: colors.border.default }]} />

              <PressableScale onPress={handleManage} accessibilityRole="button" accessibilityLabel="Manage Subscription" style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: withAlpha(colors.accent.blue, 0.12) }]}>
                  <Ionicons name="card-outline" size={18} color={colors.accent.blue} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[typography.subhead, { color: colors.text.primary }]}>Manage & Billing</Text>
                  <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                    View or cancel in {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.text.tertiary} />
              </PressableScale>
            </GlassCard>
          </View>

          {/* Terms (Apple 3.1.2(b)) */}
          <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
            <Text style={[typography.caption, { color: colors.text.secondary, lineHeight: 18 }]}>
              Subscriptions auto-renew at the same price for the same period unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in {Platform.OS === 'ios' ? 'Apple ID Settings' : 'Google Play subscriptions'}. Any unused portion of a free trial is forfeited when you upgrade to paid.
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
              <PressableScale accessibilityRole="link" accessibilityLabel="Terms of Service" onPress={() => Linking.openURL('https://zeitra.app/terms').catch(() => {})}>
                <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '600' }]}>Terms of Service</Text>
              </PressableScale>
              <PressableScale accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => Linking.openURL('https://zeitra.app/privacy').catch(() => {})}>
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
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateCard: { width: '100%', maxWidth: 420 },
  stateInner: { padding: 24, alignItems: 'center' },
  stateIcon: { width: 72, height: 72, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl },
  heroInner: { padding: spacing.xl },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: br.full, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: br.full, marginRight: 6 },
  heroDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.lg },
  renewRow: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, minHeight: 64 },
  rowIcon: { width: 36, height: 36, borderRadius: br.md, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 36 + spacing.md },
});

// Gate the billing screen behind biometric re-auth. Auto-bypasses on devices
// without Face ID / Touch ID enrolled so users are never locked out.
export default function SubscriptionScreen() {
  const router = useRouter();
  return (
    <BiometricGate prompt="Confirm it's you to view and manage your subscription" onSkip={() => router.back()}>
      <SubscriptionScreenContent />
    </BiometricGate>
  );
}
