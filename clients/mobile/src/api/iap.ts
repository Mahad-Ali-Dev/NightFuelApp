/**
 * Receipt validation API — talks to subscription-service for
 * server-side validation of a StoreKit / Google Play receipt.
 *
 * Per Apple guideline 3.1.1 + Google Play policy: the server is the
 * source of truth for subscription state. The client is NEVER allowed
 * to flip its own tier; it submits the receipt and the server tells
 * it what tier it now has.
 */
import { Platform } from 'react-native';
import { apiClient } from './client';

export interface ValidateReceiptPayload {
  /** Platform that issued the receipt. */
  platform: 'ios' | 'android';
  /** Apple receipt-data (base64) or Google purchaseToken (JWT-ish). */
  receipt: string;
  /** The product the user subscribed to. */
  productId: string;
  /** Apple `transactionId` or Google `orderId`. Used for de-duping. */
  transactionId?: string;
  /** Apple `originalTransactionId` — the immutable identity of a recurring sub. */
  originalTransactionId?: string;
}

export interface ValidateReceiptResponse {
  /** True if the receipt validated against Apple/Google. */
  valid: boolean;
  /** New tier the server placed the user on. */
  tier?: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  /** ISO8601 expiry (auto-renews — refresh the user UI nightly). */
  currentPeriodEnd?: string;
  /** Failure reason for diagnostics. Don't surface to user verbatim. */
  errorCode?:
    | 'invalid_receipt'
    | 'product_id_mismatch'
    | 'subscription_expired'
    | 'duplicate_transaction'
    | 'apple_environment_mismatch'
    | 'server_error';
  errorMessage?: string;
}

/**
 * Server-side validate a freshly-completed IAP transaction.
 *
 * @param receipt
 *   - iOS: the base64 string from `purchase.transactionReceipt` (StoreKit 1)
 *     or `purchase.jwsRepresentationIos` (StoreKit 2).
 *   - Android: `purchase.purchaseToken`.
 *
 * Best practice: call this BEFORE acknowledging the purchase. If the
 * server rejects (e.g. tampered receipt), don't acknowledge so the
 * platform refunds.
 */
export async function validateReceipt(
  payload: ValidateReceiptPayload,
): Promise<ValidateReceiptResponse> {
  // 60s timeout — Apple's verifyReceipt can be slow; better to wait
  // than show a confusing error.
  const { data } = await apiClient.post<ValidateReceiptResponse>(
    '/v1/subscriptions/iap/validate',
    payload,
    { timeout: 60_000 },
  );
  return data;
}

/**
 * Helper: derive the current platform automatically.
 * Avoids the call site importing react-native just for Platform.
 */
export function currentIapPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}
