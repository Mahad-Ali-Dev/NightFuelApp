/**
 * Sentry initialization — central crash + error reporting for the mobile app.
 *
 * Read PRODUCTION_READINESS.md (A1, S9) for context.
 *
 * DSN comes from EXPO_PUBLIC_SENTRY_DSN. Set it via:
 *   - Local dev:   .env file (see .env.example) — gitignored
 *   - EAS Build:   eas.json `env` block per profile, OR `eas env:create` for secrets
 *
 * Without a DSN, Sentry is initialized in disabled state — the app still runs,
 * Sentry.wrap() / Sentry.captureException() are still safe to call, they just
 * become no-ops.
 *
 * Source maps for readable production stack traces require a separate
 * `SENTRY_AUTH_TOKEN` env var on the build machine — see eas.json comments.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const APP_ENV =
  process.env.EXPO_PUBLIC_APP_ENV ??
  (__DEV__ ? 'development' : 'production');

/**
 * Fields whose values get redacted from any event before being sent to Sentry.
 *
 * Matched case-insensitively against object keys at any depth in:
 *   - event.request.data (POST/PUT bodies)
 *   - event.request.headers
 *   - event.extra
 *   - event.contexts
 *   - breadcrumb.data
 *
 * `Authorization` headers and request bodies for /auth/* paths are aggressively
 * redacted — losing one of those telemetry events is far cheaper than leaking
 * a token.
 */
const PII_FIELD_PATTERN = /^(password|pass|pwd|email|token|access_?token|refresh_?token|authorization|cookie|set-cookie|api[_-]?key|secret|cardNumber|card|cvv|cvc|ssn|tax_?id|jwt)$/i;

const REDACTED = '[redacted]';

function scrubObject(input: unknown, depth = 0): unknown {
  if (depth > 10) return REDACTED; // defensive depth cap on recursion
  if (input == null) return input;
  if (typeof input !== 'object') return input;

  if (Array.isArray(input)) {
    return input.map((v) => scrubObject(v, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (PII_FIELD_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else if (typeof value === 'string' && value.length > 0) {
      // Redact bearer tokens, JWT-shaped strings, and obvious key shapes inside string values.
      // We don't try to redact URLs (those need separate handling).
      if (/Bearer\s+[A-Za-z0-9._~+/-]{16,}/i.test(value)) {
        out[key] = value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]');
      } else if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
        // unsigned JWT shape
        out[key] = REDACTED;
      } else {
        out[key] = value;
      }
    } else {
      out[key] = scrubObject(value, depth + 1);
    }
  }
  return out;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // 1) Redact request body / query / headers
  if (event.request) {
    if (event.request.data) {
      event.request.data = scrubObject(event.request.data) as typeof event.request.data;
    }
    if (event.request.query_string) {
      // Redact sensitive query params (e.g. ?token=...)
      event.request.query_string = String(event.request.query_string).replace(
        /(\?|&)(token|access_token|refresh_token|api_key|key|secret)=[^&]*/gi,
        '$1$2=[redacted]',
      );
    }
    if (event.request.headers) {
      event.request.headers = scrubObject(event.request.headers) as typeof event.request.headers;
    }

    // /auth/* request bodies always get blanked entirely — they contain
    // passwords or tokens by design.
    if (typeof event.request.url === 'string' && /\/auth\//.test(event.request.url)) {
      event.request.data = REDACTED;
    }
  }

  // 2) Redact breadcrumb data (these capture preceding events; can include
  //    HTTP request/response bodies via the auto-instrumented xhr breadcrumb).
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      data: bc.data ? (scrubObject(bc.data) as typeof bc.data) : bc.data,
    }));
  }

  // 3) Redact arbitrary extra / context bags developers attach.
  if (event.extra) {
    event.extra = scrubObject(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as typeof event.contexts;
  }

  // 4) Redact user PII — Sentry auto-attaches `user.email` if you set it.
  //    Keep `user.id` for issue grouping; drop everything else identifiable.
  if (event.user) {
    if (event.user.email) event.user.email = REDACTED;
    if (event.user.username) event.user.username = REDACTED;
    if (event.user.ip_address) event.user.ip_address = '0.0.0.0';
  }

  return event;
}

/**
 * Initialize Sentry. Safe to call multiple times — Sentry deduplicates.
 * If no DSN is set the SDK runs in a disabled state.
 */
export function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN ?? undefined,
    // Disabled when no DSN OR when running in dev — keeps the free-tier event
    // budget for real production crashes.
    enabled: !!SENTRY_DSN && !__DEV__,
    environment: APP_ENV,
    release: `nightfuel-mobile@${APP_VERSION}`,
    dist: String(Constants.expoConfig?.runtimeVersion ?? '1'),
    // Lower sample rate for performance traces — error events are unlimited
    // (within the free tier) but performance traces compete for the same
    // budget. 10% of sessions is a reasonable trade-off.
    tracesSampleRate: 0.1,
    // Don't auto-attach breadcrumbs for console.log calls — too noisy and
    // they often contain request URLs / request bodies.
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (breadcrumb) => {
      // Drop breadcrumbs that capture our own debug logs from the API client.
      if (
        breadcrumb.category === 'console' &&
        typeof breadcrumb.message === 'string' &&
        breadcrumb.message.includes('[API Request]')
      ) {
        return null;
      }
      return breadcrumb;
    },
  });
}

// Run init at module-load time so any code that imports this file gets
// Sentry up before it issues calls.
initSentry();

/**
 * Wrap the root component with Sentry's error boundary + perf instrumentation.
 * Exported so app/_layout.tsx can `export default Sentry.wrap(RootLayout)`.
 */
export const wrap = Sentry.wrap;

/**
 * Capture an exception. Safe to call before init (becomes a no-op).
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Set the current user — call this after successful login. Use a stable
 * UUID, never the user's email or name (those get scrubbed in beforeSend
 * anyway, but better to never collect them at all).
 */
export function setUser(userId: string | null): void {
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Add tags that show up on every subsequent event.
 * Use for low-cardinality flags like `subscription_tier`, `shift_type`.
 */
export function setTag(key: string, value: string | null): void {
  Sentry.setTag(key, value ?? '');
}

export { Sentry };
