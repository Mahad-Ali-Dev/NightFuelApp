/**
 * revenueCat.ts — the ONE module that touches `react-native-purchases` (RevenueCat).
 *
 * Mirrors the availability-seam discipline of src/lib/ppg/ppgCamera.ts and
 * src/lib/ble/bleManager.ts: RevenueCat is a native module that only exists in an
 * EAS dev/release build. In Expo Go and the jest gate the native side is absent,
 * so everything here degrades to a safe no-op (isPurchasesReady() → false) instead
 * of crashing. Billing must NEVER take down the app: every call is wrapped so a
 * missing SDK, missing key, or store error resolves quietly.
 *
 * Source of truth for tier stays the backend `subscription-service`; RevenueCat is
 * the purchase + entitlement layer. The flow: mobile buys via RevenueCat →
 * RevenueCat webhook → subscription-service sets tier=PRO. Client-side we read the
 * `pro` entitlement for immediate UI unlock, and the backend confirms authoritatively.
 */
import { Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

// Lazy-require the whole module so a missing native side (Expo Go / jest) can't
// throw at import time. `Purchases` is the default export; the namespace also
// carries value enums like LOG_LEVEL.
let RNPurchases: typeof import('react-native-purchases') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNPurchases = require('react-native-purchases');
} catch {
  RNPurchases = null;
}
const Purchases = RNPurchases?.default ?? null;

/**
 * RevenueCat PUBLIC SDK key. Per-platform (Android `goog_…`, iOS `appl_…`) with a
 * shared fallback (the `test_…` Test Store key works for both while wiring up).
 * Public keys are safe to ship in the binary — set via EXPO_PUBLIC_* build env.
 */
const API_KEY =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) ||
  process.env.EXPO_PUBLIC_REVENUECAT_KEY ||
  '';

/** Entitlement id that unlocks Pro (configured in the RevenueCat dashboard). */
export const PRO_ENTITLEMENT = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'pro';

let configured = false;

/** True only when the native SDK loaded AND a key is present. */
export function isPurchasesReady(): boolean {
  return !!(Purchases && API_KEY);
}

/** Does this CustomerInfo carry an ACTIVE Pro entitlement? */
export function hasProEntitlement(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements?.active?.[PRO_ENTITLEMENT];
}

/**
 * Configure RevenueCat exactly once, tying purchases to the signed-in user id so
 * the same subscription follows them across devices and the webhook can map it to
 * the backend user. If already configured and the user changed, logs in instead.
 * Never throws.
 */
export async function configureRevenueCat(userId?: string | null): Promise<void> {
  if (!isPurchasesReady()) return;
  try {
    if (!configured) {
      if (__DEV__ && RNPurchases) Purchases!.setLogLevel(RNPurchases.LOG_LEVEL.WARN);
      Purchases!.configure({ apiKey: API_KEY, appUserID: userId ?? undefined });
      configured = true;
    } else if (userId) {
      await Purchases!.logIn(userId);
    }
  } catch {
    /* billing init must never crash the app */
  }
}

/** Latest CustomerInfo, or null if unavailable. Never throws. */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isPurchasesReady()) return null;
  try {
    return await Purchases!.getCustomerInfo();
  } catch {
    return null;
  }
}

/** Convenience: is Pro currently active for this user? */
export async function isProActive(): Promise<boolean> {
  return hasProEntitlement(await getCustomerInfo());
}

/** The current offering (the set of purchasable packages) for the paywall. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchasesReady()) return null;
  try {
    return (await Purchases!.getOfferings()).current ?? null;
  } catch {
    return null;
  }
}

/** Result of a purchase attempt. `cancelled` distinguishes user-abort from failure. */
export interface PurchaseResult {
  ok: boolean;
  pro: boolean;
  cancelled?: boolean;
}

/** Buy a package. Returns whether Pro is now active. Never throws. */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!isPurchasesReady()) return { ok: false, pro: false };
  try {
    const { customerInfo } = await Purchases!.purchasePackage(pkg);
    return { ok: true, pro: hasProEntitlement(customerInfo) };
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) {
      return { ok: false, pro: false, cancelled: true };
    }
    return { ok: false, pro: false };
  }
}

/** Restore previous purchases (e.g. after reinstall). Returns whether Pro is active. */
export async function restorePurchases(): Promise<boolean> {
  if (!isPurchasesReady()) return false;
  try {
    return hasProEntitlement(await Purchases!.restorePurchases());
  } catch {
    return false;
  }
}

/** Detach the RevenueCat identity on sign-out (back to an anonymous id). */
export async function logOutRevenueCat(): Promise<void> {
  if (!isPurchasesReady() || !configured) return;
  try {
    await Purchases!.logOut();
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to entitlement changes (purchases, renewals, expirations, restores).
 * Fires with the current Pro state immediately and on every update. Returns an
 * unsubscribe fn. No-op when the SDK isn't ready.
 */
export function addProListener(cb: (isPro: boolean) => void): () => void {
  if (!isPurchasesReady()) return () => {};
  const handler = (info: CustomerInfo) => cb(hasProEntitlement(info));
  Purchases!.addCustomerInfoUpdateListener(handler);
  return () => {
    try {
      Purchases!.removeCustomerInfoUpdateListener(handler);
    } catch {
      /* ignore */
    }
  };
}
