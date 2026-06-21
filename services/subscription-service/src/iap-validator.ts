/**
 * Server-side IAP receipt validation for Apple App Store and Google Play.
 *
 * Per Apple guideline 3.1.1 and Google Play policy, the server is the
 * source of truth for subscription state. The mobile app submits the
 * receipt — never the tier — and this module verifies the receipt with
 * Apple/Google, then translates the verified product ID into the
 * NightFuel internal tier.
 *
 * NEVER trust the mobile client's claimed tier. Always derive the tier
 * from the verified product ID returned by Apple/Google.
 */
import { createLogger } from '@nightfuel/config';

const log = createLogger('iap-validator');

// ─────────────────────────────────────────────────────────────────────
// Product ID → tier mapping. Must match clients/mobile/src/lib/iap.ts.
// ─────────────────────────────────────────────────────────────────────

const PRODUCT_ID_TO_TIER: Record<string, 'PRO' | 'PREMIUM' | 'ENTERPRISE'> = {
  'com.zeitra.app.pro.monthly': 'PRO',
  'com.zeitra.app.pro.yearly': 'PRO',
  'com.zeitra.app.premium.monthly': 'PREMIUM',
  'com.zeitra.app.premium.yearly': 'PREMIUM',
  'com.zeitra.app.enterprise.monthly': 'ENTERPRISE',
  'com.zeitra.app.enterprise.yearly': 'ENTERPRISE',
};

export function productIdToTier(
  productId: string,
): 'PRO' | 'PREMIUM' | 'ENTERPRISE' | null {
  return PRODUCT_ID_TO_TIER[productId] ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  tier?: 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  productId?: string;
  /** ISO8601 expiry of the current billing period. */
  expiresAt?: string;
  /** Stable identifier across renewals — what we link the subscription record to. */
  originalTransactionId?: string;
  errorCode?:
    | 'invalid_receipt'
    | 'product_id_mismatch'
    | 'subscription_expired'
    | 'apple_environment_mismatch'
    | 'google_play_unavailable'
    | 'config_missing'
    | 'server_error';
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Apple App Store
// ─────────────────────────────────────────────────────────────────────

const APPLE_PRODUCTION_VERIFY_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_VERIFY_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

/**
 * Validate an iOS receipt with Apple's verifyReceipt endpoint.
 *
 * This is the LEGACY endpoint — still supported as of 2026 but Apple
 * recommends migrating to the App Store Server API for new
 * integrations (better signed JWT auth, more granular fields). For
 * NightFuel v1 the legacy endpoint is sufficient and avoids the JWT
 * cert chain setup. TODO: migrate to App Store Server API after launch.
 *
 * Required env: `APPLE_SHARED_SECRET` — find at App Store Connect → My Apps
 * → [your app] → App Information → App-Specific Shared Secret.
 *
 * Apple's quirk: production receipts get sent to the production URL,
 * sandbox receipts to the sandbox URL. We try production first; if Apple
 * returns status `21007` (sandbox receipt sent to production), we retry
 * against sandbox automatically. This is the standard documented flow.
 *
 * SECURITY (HIGH #3 — sandbox receipts accepted in production): the 21007
 * sandbox retry, and any receipt whose response `environment` is "Sandbox",
 * are ONLY honoured when sandbox is explicitly allowed (see `isSandboxAllowed`).
 * In production this is OFF by default, so a free StoreKit-test / TestFlight
 * sandbox receipt can NEVER upgrade a real account.
 */
export async function validateAppleReceipt(receipt: string): Promise<ValidationResult> {
  const sharedSecret = process.env.APPLE_SHARED_SECRET;
  if (!sharedSecret) {
    log.error('APPLE_SHARED_SECRET not set — cannot validate iOS receipts');
    return { valid: false, errorCode: 'config_missing', errorMessage: 'Server not configured for iOS receipts' };
  }

  const body = JSON.stringify({
    'receipt-data': receipt,
    password: sharedSecret,
    'exclude-old-transactions': true,
  });

  // Try production first (most common in real users)
  const prodResp = await postJson(APPLE_PRODUCTION_VERIFY_URL, body);
  if (prodResp.status === 21007) {
    // 21007 = sandbox receipt sent to production. Retrying against the sandbox
    // URL is ONLY legitimate when sandbox is allowed; in production we refuse so
    // a sandbox receipt cannot be laundered into a real upgrade.
    if (!isSandboxAllowed()) {
      log.warn('Apple sandbox receipt (status 21007) rejected in production (IAP_ALLOW_SANDBOX is off)');
      return {
        valid: false,
        errorCode: 'apple_environment_mismatch',
        errorMessage: 'Sandbox receipts are not accepted in production',
      };
    }
    const sandboxResp = await postJson(APPLE_SANDBOX_VERIFY_URL, body);
    return parseAppleResponse(sandboxResp);
  }
  return parseAppleResponse(prodResp);
}

/**
 * Whether Sandbox-environment IAP receipts may be honoured.
 *
 * Default CLOSED: in production a sandbox receipt is rejected. Set
 * `IAP_ALLOW_SANDBOX=true` (non-prod testing) to accept them. As a convenience,
 * sandbox is also allowed when NODE_ENV is not 'production', so local/test runs
 * work without extra config — but the flag, when set, is authoritative.
 */
export function isSandboxAllowed(): boolean {
  const flag = (process.env.IAP_ALLOW_SANDBOX ?? '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

interface AppleVerifyResponse {
  status: number;
  environment?: 'Sandbox' | 'Production';
  receipt?: any;
  latest_receipt_info?: AppleReceiptInfo[];
  pending_renewal_info?: any[];
}

interface AppleReceiptInfo {
  product_id: string;
  transaction_id: string;
  original_transaction_id: string;
  /** ms since epoch as a string (Apple's classic format). */
  expires_date_ms?: string;
  /** Cancellation/refund flag. */
  cancellation_date_ms?: string;
}

function parseAppleResponse(resp: AppleVerifyResponse): ValidationResult {
  // SECURITY (HIGH #3): reject Sandbox-environment receipts unless sandbox is
  // explicitly allowed. Apple stamps every verifyReceipt response with the
  // environment it was issued in; a real App Store purchase is "Production".
  // Without this check a sandbox receipt that happens to validate at the
  // production endpoint (or a sandbox URL retry) would silently upgrade a real
  // account. We gate even though validateAppleReceipt already guards the 21007
  // retry, so direct/edge responses are covered too (defense in depth).
  if (resp.environment === 'Sandbox' && !isSandboxAllowed()) {
    log.warn('Apple receipt rejected: Sandbox environment in production (IAP_ALLOW_SANDBOX is off)');
    return {
      valid: false,
      errorCode: 'apple_environment_mismatch',
      errorMessage: 'Sandbox receipts are not accepted in production',
    };
  }

  if (resp.status !== 0) {
    log.warn({ status: resp.status }, 'Apple receipt validation failed');
    // 21002 = malformed, 21003 = couldn't authenticate, 21004 = wrong shared secret,
    // 21010 = receipt could not be authorized.
    return {
      valid: false,
      errorCode: 'invalid_receipt',
      errorMessage: `Apple status ${resp.status}`,
    };
  }

  const items = resp.latest_receipt_info ?? [];
  if (items.length === 0) {
    return { valid: false, errorCode: 'invalid_receipt', errorMessage: 'No transactions in receipt' };
  }

  // Pick the most recent non-cancelled subscription transaction.
  const active = items
    .filter((it) => !it.cancellation_date_ms)
    .sort((a, b) => Number(b.expires_date_ms ?? '0') - Number(a.expires_date_ms ?? '0'))[0];

  if (!active) {
    return { valid: false, errorCode: 'subscription_expired', errorMessage: 'All subscriptions cancelled or expired' };
  }

  const tier = productIdToTier(active.product_id);
  if (!tier) {
    return { valid: false, errorCode: 'product_id_mismatch', errorMessage: `Unknown product ${active.product_id}` };
  }

  const expiresMs = Number(active.expires_date_ms ?? '0');
  if (expiresMs && expiresMs < Date.now()) {
    return { valid: false, errorCode: 'subscription_expired', errorMessage: 'Subscription expired' };
  }

  return {
    valid: true,
    tier,
    productId: active.product_id,
    expiresAt: expiresMs ? new Date(expiresMs).toISOString() : undefined,
    originalTransactionId: active.original_transaction_id,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Google Play
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate an Android Google Play purchase token via the Google Play
 * Developer API.
 *
 * STATUS: Stub. Implementation requires the `googleapis` npm package
 * and a service account JSON with the `androidpublisher` scope. The
 * service account also needs to be invited as a Play Console user with
 * the "View financial data" + "Manage orders" permissions.
 *
 * To finish:
 *   1. `npm install googleapis` in subscription-service
 *   2. Create a service account in Google Cloud Console
 *   3. Grant it the `androidpublisher` scope
 *   4. Set `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` env var (base64 of the
 *      service-account JSON) — DO NOT commit the JSON file
 *   5. Replace this stub with a call to:
 *        google.androidpublisher('v3').purchases.subscriptionsv2.get({
 *          packageName: 'com.zeitra.app',
 *          token: purchaseToken,
 *        });
 *   6. Translate the response to a ValidationResult
 *
 * Until then, Android purchases will fail validation with a clear
 * error rather than silently grant a tier.
 */
export async function validateGoogleReceipt(
  purchaseToken: string,
  productId: string,
): Promise<ValidationResult> {
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    log.error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set — Android receipts can\'t be validated');
    return {
      valid: false,
      errorCode: 'config_missing',
      errorMessage: 'Server not configured for Google Play receipts',
    };
  }

  // TODO: full Google Play Developer API integration. See JSDoc above.
  log.warn({ productId, purchaseTokenPrefix: purchaseToken.slice(0, 16) }, 'Google Play validation not yet implemented');

  return {
    valid: false,
    errorCode: 'google_play_unavailable',
    errorMessage: 'Google Play receipt validation is not yet wired. See iap-validator.ts → validateGoogleReceipt for setup instructions.',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────

async function postJson(url: string, body: string): Promise<AppleVerifyResponse> {
  // Node 22+ has fetch as a global. Subscribers to subscription-service
  // are running on Node 22 LTS per the monorepo engines field.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    log.error({ url, status: res.status }, 'IAP HTTP request failed');
    throw new Error(`IAP HTTP ${res.status}`);
  }
  return (await res.json()) as AppleVerifyResponse;
}
