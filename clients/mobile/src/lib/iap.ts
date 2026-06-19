/**
 * In-App Purchase (StoreKit 2 on iOS, Google Play Billing on Android).
 *
 * App Store Review Guideline 3.1.1 requires that any subscription / digital
 * goods purchase from inside the app go through Apple's IAP system (not
 * Stripe Checkout, not a webview to the website). This module is the
 * mobile-side glue.
 *
 * Web continues to use Stripe Checkout — see `clients/web/...`. The web
 * flow is fine because Apple's IAP rule applies to mobile apps only.
 *
 * Purchase flow:
 *   1. App startup: `initializeIap()` connects to the store and sets up
 *      the transaction listener (StoreKit fires for restored purchases,
 *      pending interrupted purchases, and renewals — all need to be drained).
 *   2. User taps a tier on the Subscription screen.
 *   3. `requestSubscription(productId)` opens the system purchase sheet.
 *   4. On success, the listener receives the transaction with a receipt.
 *   5. We POST the receipt to `subscription-service` for server-side
 *      verification with Apple / Google.
 *   6. The server flips the user's tier and acks. The client refetches
 *      `/v1/subscriptions/me` and updates UI.
 *
 * Read PRODUCTION_READINESS.md → "App Store acceptance" for context.
 */
import { Platform } from 'react-native';
import { captureException } from '@/lib/sentry';

// IAP is disabled in native builds for now: react-native-iap@12.x does NOT
// compile against React Native 0.81 (Expo SDK 54) — it references RN APIs
// (currentActivity, ObjectAlreadyConsumedException) removed/made internal in
// RN 0.80+. The only fix is react-native-iap v15, which requires the
// react-native-nitro-modules runtime (a larger migration). Until that
// migration, getIap() returns null and every function below degrades
// gracefully — subscriptions fall back to web checkout. The dependency has
// been removed from package.json so it is never autolinked or compiled.
//
// TODO(monetization): migrate to react-native-iap v15 (+ nitro modules) or
// expo-iap, then restore the lazy require here.
type IapModule = any;
let iap: IapModule | null = null;

function getIap(): IapModule | null {
  return null;
}

// ─── Product IDs ──────────────────────────────────────────────────────
//
// These MUST match what you configure in:
//   - App Store Connect → Features → In-App Purchases (auto-renewable subs)
//   - Google Play Console → Monetize → Products → Subscriptions
//
// Format convention (Apple/Google both accept these):
//   <bundle-id>.<tier>.<period>
//
// Don't change a productId after launch — Apple ties subscription state
// to the productId; renaming creates a new product and existing subscribers
// don't auto-migrate.

export const SUBSCRIPTION_PRODUCT_IDS = {
  PRO_MONTHLY: 'com.zeitra.app.pro.monthly',
  PRO_YEARLY: 'com.zeitra.app.pro.yearly',
  PREMIUM_MONTHLY: 'com.zeitra.app.premium.monthly',
  PREMIUM_YEARLY: 'com.zeitra.app.premium.yearly',
  ENTERPRISE_MONTHLY: 'com.zeitra.app.enterprise.monthly',
  ENTERPRISE_YEARLY: 'com.zeitra.app.enterprise.yearly',
} as const;

export type SubscriptionProductId =
  (typeof SUBSCRIPTION_PRODUCT_IDS)[keyof typeof SUBSCRIPTION_PRODUCT_IDS];

export const ALL_PRODUCT_IDS: SubscriptionProductId[] = Object.values(
  SUBSCRIPTION_PRODUCT_IDS,
);

/**
 * Map product id → internal subscription tier (used by subscription-service).
 * Server side enforces this mapping too — never trust the client to set tier.
 */
export function productIdToTier(
  productId: string,
): 'PRO' | 'PREMIUM' | 'ENTERPRISE' | null {
  if (productId.includes('.pro.')) return 'PRO';
  if (productId.includes('.premium.')) return 'PREMIUM';
  if (productId.includes('.enterprise.')) return 'ENTERPRISE';
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  /** Localized price string with currency symbol — e.g. "$9.99". */
  localizedPrice: string;
  /** Numeric price in the user's currency, for analytics. */
  price: number;
  currency: string;
  /** Subscription period — "P1M" (1 month), "P1Y" (1 year), etc. */
  subscriptionPeriodAndroid?: string;
  subscriptionPeriodNumberIOS?: string;
  subscriptionPeriodUnitIOS?: string;
}

export interface PurchaseResult {
  success: boolean;
  productId?: string;
  transactionId?: string;
  /** Platform-specific receipt blob (server-side validates this). */
  receipt?: string;
  /** Error code if !success. Common: "user_cancelled", "billing_unavailable". */
  errorCode?: string;
  errorMessage?: string;
}

// ─── Lifecycle ────────────────────────────────────────────────────────

let initialized = false;
let purchaseUpdateSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;

/**
 * Connect to the platform store. Call ONCE at app startup before the
 * Subscription screen is reachable. Idempotent.
 *
 * On failure (e.g. Play Store not installed on a device), we log to
 * Sentry and let the app continue — the Subscription screen will show
 * "billing unavailable" and direct users to the web checkout.
 */
export async function initializeIap(): Promise<{ available: boolean }> {
  if (Platform.OS === 'web') return { available: false };
  if (initialized) return { available: true };

  const mod = getIap();
  if (!mod) {
    return { available: false };
  }

  try {
    await mod.initConnection();
    initialized = true;

    // Drain any pending Android purchases (interrupted upgrades, refunds).
    if (Platform.OS === 'android' && typeof mod.flushFailedPurchasesCachedAsPendingAndroid === 'function') {
      await mod.flushFailedPurchasesCachedAsPendingAndroid().catch(() => undefined);
    }

    return { available: true };
  } catch (err) {
    captureException(err, { source: 'iap.initializeIap' });
    return { available: false };
  }
}

/**
 * Subscribe to purchase events. Pass a callback that:
 *   1. Sends the receipt to your backend for server-side verification
 *   2. On server-ack, refetches the user's subscription tier
 *   3. Calls finishTransaction() so the platform stops re-delivering
 *
 * Failure to call finishTransaction() means StoreKit will keep firing
 * the same purchase on every app launch — a silent footgun.
 */
export type PurchaseListener = (purchase: any) => Promise<void>;
export type PurchaseErrorListener = (err: any) => void;

export function listenForPurchases(
  onPurchase: PurchaseListener,
  onError?: PurchaseErrorListener,
): () => void {
  const mod = getIap();
  if (!mod) return () => undefined;

  // Clean up any previous listener — multiple subscribers leak.
  purchaseUpdateSub?.remove();
  purchaseErrorSub?.remove();

  purchaseUpdateSub = mod.purchaseUpdatedListener(async (purchase: any) => {
    try {
      await onPurchase(purchase);
    } catch (err) {
      captureException(err, {
        source: 'iap.purchaseUpdatedListener',
        productId: purchase?.productId,
      });
    }
  });

  purchaseErrorSub = mod.purchaseErrorListener((err: any) => {
    if (onError) onError(err);
    // user_cancelled is normal — don't capture as an error
    if (err?.code !== 'E_USER_CANCELLED') {
      captureException(err, { source: 'iap.purchaseErrorListener' });
    }
  });

  return () => {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
  };
}

/**
 * Fetch product metadata + localized prices from the store. Required
 * before showing prices in the UI — never hardcode prices, the user's
 * currency / regional pricing comes from here.
 */
export async function getSubscriptionProducts(): Promise<SubscriptionProduct[]> {
  const mod = getIap();
  if (!mod || !initialized) return [];

  try {
    const products = (await mod.getSubscriptions({
      skus: ALL_PRODUCT_IDS as any,
    })) as any[];

    return products.map((p) => ({
      productId: p.productId,
      title: p.title ?? '',
      description: p.description ?? '',
      localizedPrice: p.localizedPrice ?? '',
      price: typeof p.price === 'string' ? parseFloat(p.price) : (p.price ?? 0),
      currency: p.currency ?? 'USD',
      subscriptionPeriodAndroid: p.subscriptionPeriodAndroid,
      subscriptionPeriodNumberIOS: p.subscriptionPeriodNumberIOS,
      subscriptionPeriodUnitIOS: p.subscriptionPeriodUnitIOS,
    }));
  } catch (err) {
    captureException(err, { source: 'iap.getSubscriptionProducts' });
    return [];
  }
}

/**
 * Initiate a subscription purchase. Returns immediately; the actual result
 * arrives via the {@link listenForPurchases} callback (StoreKit is
 * asynchronous by design — the user might background the app, get a
 * captcha, etc.).
 */
export async function requestSubscription(
  productId: SubscriptionProductId,
): Promise<{ requested: boolean; error?: string }> {
  const mod = getIap();
  if (!mod || !initialized) {
    return { requested: false, error: 'iap_not_initialized' };
  }

  try {
    if (Platform.OS === 'ios') {
      await mod.requestSubscription({ sku: productId });
    } else {
      // Android Google Play Billing requires the subscription offer token
      // — fetched from the product itself. Use IAP's helper which picks
      // the default offer (you can extend this for promo codes later).
      await mod.requestSubscription({
        sku: productId,
        subscriptionOffers: [{ sku: productId, offerToken: '' }],
      });
    }
    return { requested: true };
  } catch (err: any) {
    if (err?.code === 'E_USER_CANCELLED') {
      return { requested: false, error: 'user_cancelled' };
    }
    captureException(err, { source: 'iap.requestSubscription', productId });
    return {
      requested: false,
      error: err?.code ?? err?.message ?? 'unknown_error',
    };
  }
}

/**
 * Restore previously-purchased subscriptions. App Store guideline 3.1.1
 * requires a "Restore purchases" button on every screen offering IAP.
 *
 * StoreKit replays each owned subscription through the purchase listener.
 * The server is the source of truth — duplicate calls are idempotent
 * because each transactionId is recorded.
 */
export async function restorePurchases(): Promise<{ count: number; error?: string }> {
  const mod = getIap();
  if (!mod || !initialized) {
    return { count: 0, error: 'iap_not_initialized' };
  }

  try {
    const purchases = (await mod.getAvailablePurchases()) as any[];
    return { count: purchases.length };
  } catch (err) {
    captureException(err, { source: 'iap.restorePurchases' });
    return { count: 0, error: 'restore_failed' };
  }
}

/**
 * Acknowledge a purchase to the platform after server-side validation
 * succeeds. MUST be called or:
 *   - iOS: the transaction stays in the queue and re-fires every launch
 *   - Android: the purchase auto-refunds after 3 days (Google's
 *     anti-fraud mechanism)
 */
export async function acknowledgePurchase(purchase: any): Promise<void> {
  const mod = getIap();
  if (!mod) return;

  try {
    await mod.finishTransaction({ purchase, isConsumable: false });
  } catch (err) {
    captureException(err, {
      source: 'iap.acknowledgePurchase',
      productId: purchase?.productId,
      transactionId: purchase?.transactionId,
    });
  }
}

/**
 * Disconnect from the store. Call on app teardown — good citizenship,
 * not strictly required.
 */
export async function tearDownIap(): Promise<void> {
  if (!initialized) return;
  const mod = getIap();
  if (!mod) return;

  purchaseUpdateSub?.remove();
  purchaseErrorSub?.remove();
  purchaseUpdateSub = null;
  purchaseErrorSub = null;

  try {
    await mod.endConnection();
  } catch {
    // Best-effort
  }
  initialized = false;
}

/**
 * Open the system subscription management screen. App Store guideline
 * 3.1.1 requires a "Manage Subscription" affordance; clicking it should
 * land the user on the subscriptions sheet.
 */
export async function openManageSubscriptions(): Promise<void> {
  const mod = getIap();
  if (!mod) return;

  try {
    if (Platform.OS === 'ios' && typeof mod.deepLinkToSubscriptionsIos === 'function') {
      await mod.deepLinkToSubscriptionsIos();
    } else if (typeof mod.deepLinkToSubscriptionsAndroid === 'function') {
      // Android: deep-links to Play Store subscription management; pass
      // the productId so it lands on the right subscription.
      await mod.deepLinkToSubscriptionsAndroid({
        sku: SUBSCRIPTION_PRODUCT_IDS.PRO_MONTHLY,
      });
    }
  } catch (err) {
    captureException(err, { source: 'iap.openManageSubscriptions' });
  }
}
