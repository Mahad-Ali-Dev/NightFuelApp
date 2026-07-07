/**
 * useSubscription — the single client-side source of truth for "is this user Pro".
 *
 * Reconciles the two truths so the UI is both immediate and correct:
 *   - RevenueCat entitlement (the `pro` entitlement on CustomerInfo) flips the
 *     INSTANT a purchase / restore completes, before any server round-trip — so
 *     the app unlocks without waiting for the webhook;
 *   - the backend `subscription-service` tier (GET /v1/subscriptions/me via
 *     getStatus) is AUTHORITATIVE and cross-device — the RevenueCat webhook keeps
 *     it in sync, and a user who bought on another device (or whose local SDK
 *     isn't configured yet) still reads Pro here.
 *
 * `isPro` is true when EITHER says so. Server-enforced limits (AI/scan quota) are
 * still gated server-side by the real tier; this hook drives client UX — hiding
 * upgrade nags for Pro users, Pro badges, and the paywall's "already Pro" state.
 *
 * Billing-safe: when the native SDK isn't present (Expo Go / tests) the RevenueCat
 * side resolves to false and the hook falls back to the backend tier alone.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStatus, type SubscriptionStatus } from '@/api/subscriptions';
import { isProActive, addProListener, isPurchasesReady } from '@/lib/purchases/revenueCat';

export type SubscriptionTier = SubscriptionStatus['tier'];

export interface UseSubscriptionResult {
  /** True if Pro is active per RevenueCat (immediate) OR the backend tier (authoritative). */
  isPro: boolean;
  /** The backend tier ('FREE' until loaded). */
  tier: SubscriptionTier;
  /** Raw backend status (undefined while loading / on error). */
  status: SubscriptionStatus | undefined;
  /** True while the initial backend status query is in flight. */
  isLoading: boolean;
  /** Re-fetch the backend status (e.g. after a purchase, to pull the webhook-synced tier). */
  refetch: () => void;
}

export function useSubscription(): UseSubscriptionResult {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: getStatus,
    // Tier changes rarely; keep it warm to avoid refetch churn but let a manual
    // refetch (post-purchase) pull the freshly webhook-synced tier.
    staleTime: 60_000,
  });

  // RevenueCat entitlement — client-side, immediate. null = not yet resolved.
  const [rcPro, setRcPro] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isPurchasesReady()) {
      setRcPro(false);
      return;
    }
    let alive = true;
    void isProActive().then((p) => {
      if (alive) setRcPro(p);
    });
    // Fires on purchase / renewal / expiration / restore, keeping isPro live.
    const unsubscribe = addProListener((p) => setRcPro(p));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const serverPro = !!data && data.tier !== 'FREE' && data.active;
  const isPro = rcPro === true || serverPro;

  return {
    isPro,
    tier: data?.tier ?? 'FREE',
    status: data,
    isLoading,
    refetch: () => {
      void refetch();
    },
  };
}
