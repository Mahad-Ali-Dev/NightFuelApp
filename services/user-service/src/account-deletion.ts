// ── GDPR account-deletion fan-out (orchestrator side) ─────────────────────────
// user-service owns the GDPR "delete my account" ORCHESTRATOR (DELETE
// /v1/users/me). After it authoritatively purges its OWN user-owned tables, it
// must fan out to EVERY other owning service's internal purge endpoint
// (DELETE /v1/<svc>/internal/user/:userId) so the user is erased everywhere.
//
// This module is the inter-service client for that fan-out. It mirrors the
// existing inter-service HTTP pattern already used in the codebase
// (community-service/src/author-resolver.ts): native `fetch`, an
// AbortController per-call timeout, and graceful per-call error handling — but
// here every call carries the shared X-Internal-Token header (the server-to-
// server credential the target's makeInternalAuthGuard preHandler verifies),
// NOT a JWT, because these are /internal/* routes.
//
// RESILIENCE: the fan-out NEVER throws. Each service is attempted independently
// and its outcome (ok / failed, with status + error) is collected, so a single
// unreachable service cannot abort the whole deletion or leave the caller
// without a report of what still needs retrying.

import { createLogger } from '@nightfuel/config';

const logger = createLogger('user-service:account-deletion');

// Per-call timeout for an internal purge. Generous (purges run deleteMany over
// potentially many rows) but bounded so one hung service can't stall the fan-out.
const PURGE_TIMEOUT_MS = 10_000;

// ── The owning services to fan out to ─────────────────────────────────────────
// key       — stable identifier used in the per-service result summary.
// envKey    — env var that overrides the base URL (e.g. AUTH_SERVICE_URL).
// defaultUrl— Docker-network DNS default (every service is reachable as
//             http://<svc>-service:<port> on the compose network).
// path      — the EXACT internal purge route the target mounts. NOTE the
//             prefixes are NOT uniform (`/v1/auth`, `/v1/plans`, `/v1/meals`,
//             `/v1/exercises`, `/v1/subscriptions`, …) — each entry encodes the
//             real path that service registered, verified against its routes.
//
// auth-service is included here (not deleted directly from user-service): it is
// the canonical AUTH store with its OWN database, and exposes its own
// DELETE /v1/auth/internal/user/:userId. user-service holds NO password — it
// only owns profile/preference/status PII — so credentials are erased by
// calling auth's purge over the same guarded internal channel as everyone else.
export interface OwningService {
    key: string;
    envKey: string;
    defaultUrl: string;
    path: (userId: string) => string;
}

export const OWNING_SERVICES: OwningService[] = [
    { key: 'auth-service', envKey: 'AUTH_SERVICE_URL', defaultUrl: 'http://auth-service:3001', path: (u) => `/v1/auth/internal/user/${u}` },
    { key: 'chat-service', envKey: 'CHAT_SERVICE_URL', defaultUrl: 'http://chat-service:3014', path: (u) => `/v1/chat/internal/user/${u}` },
    { key: 'community-service', envKey: 'COMMUNITY_SERVICE_URL', defaultUrl: 'http://community-service:3013', path: (u) => `/v1/community/internal/user/${u}` },
    { key: 'exercise-service', envKey: 'EXERCISE_SERVICE_URL', defaultUrl: 'http://exercise-service:3011', path: (u) => `/v1/exercises/internal/user/${u}` },
    { key: 'meal-service', envKey: 'MEAL_SERVICE_URL', defaultUrl: 'http://meal-service:3006', path: (u) => `/v1/meals/internal/user/${u}` },
    { key: 'notification-service', envKey: 'NOTIFICATION_SERVICE_URL', defaultUrl: 'http://notification-service:3008', path: (u) => `/v1/notifications/internal/user/${u}` },
    { key: 'plan-service', envKey: 'PLAN_SERVICE_URL', defaultUrl: 'http://plan-service:3005', path: (u) => `/v1/plans/internal/user/${u}` },
    { key: 'progress-service', envKey: 'PROGRESS_SERVICE_URL', defaultUrl: 'http://progress-service:3007', path: (u) => `/v1/progress/internal/user/${u}` },
    { key: 'shift-service', envKey: 'SHIFT_SERVICE_URL', defaultUrl: 'http://shift-service:3002', path: (u) => `/v1/shifts/internal/user/${u}` },
    { key: 'sleep-service', envKey: 'SLEEP_SERVICE_URL', defaultUrl: 'http://sleep-service:3012', path: (u) => `/v1/sleep/internal/user/${u}` },
    { key: 'state-service', envKey: 'STATE_SERVICE_URL', defaultUrl: 'http://state-service:3015', path: (u) => `/v1/state/internal/user/${u}` },
    { key: 'subscription-service', envKey: 'SUBSCRIPTION_SERVICE_URL', defaultUrl: 'http://subscription-service:3010', path: (u) => `/v1/subscriptions/internal/user/${u}` },
];

export interface ServicePurgeResult {
    service: string;
    ok: boolean;
    status?: number;
    error?: string;
}

function resolveBaseUrl(svc: OwningService): string {
    const fromEnv = process.env[svc.envKey];
    const base = (fromEnv && fromEnv.trim()) || svc.defaultUrl;
    return base.replace(/\/+$/, '');
}

/**
 * Call ONE owning service's internal purge endpoint with the X-Internal-Token.
 * Never throws — any failure (non-2xx, network error, timeout/abort, bad token
 * → the target replies 404) is captured as { ok:false, status?, error }.
 *
 * IDEMPOTENT by construction: every target purge uses deleteMany under the hood,
 * so a 2xx is returned even when the user has no rows there (re-deleting an
 * already-purged user is a success, not an error).
 */
export async function purgeOneService(
    svc: OwningService,
    userId: string,
    internalToken: string,
    fetchImpl: typeof fetch = fetch,
): Promise<ServicePurgeResult> {
    const url = `${resolveBaseUrl(svc)}${svc.path(userId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PURGE_TIMEOUT_MS);

    try {
        const res = await fetchImpl(url, {
            method: 'DELETE',
            headers: {
                'x-internal-token': internalToken,
                accept: 'application/json',
            },
            signal: controller.signal,
        });

        if (!res.ok) {
            // A guarded route replies 404 on a missing/wrong token; any non-2xx
            // is a failure we must surface for retry (do NOT silently swallow).
            logger.error({ service: svc.key, userId, status: res.status }, 'Internal purge returned non-2xx');
            return { service: svc.key, ok: false, status: res.status, error: `HTTP ${res.status}` };
        }

        logger.info({ service: svc.key, userId, status: res.status }, 'Internal purge succeeded');
        return { service: svc.key, ok: true, status: res.status };
    } catch (err: any) {
        // Network error / timeout / abort — captured, never thrown.
        const error = err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'request failed');
        logger.error({ service: svc.key, userId, err }, 'Internal purge request failed');
        return { service: svc.key, ok: false, error };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fan out the purge to EVERY owning service concurrently and collect a
 * per-service result. RESILIENT: attempts all services regardless of individual
 * failures and ALWAYS resolves (Promise.all over per-call helpers that never
 * reject). The caller uses the returned list to decide the HTTP status (all-ok
 * → 200, any-failure → 207 multi-status) and to log the failures for retry.
 */
export async function fanOutPurge(
    userId: string,
    internalToken: string,
    services: OwningService[] = OWNING_SERVICES,
    fetchImpl: typeof fetch = fetch,
): Promise<ServicePurgeResult[]> {
    return Promise.all(services.map((svc) => purgeOneService(svc, userId, internalToken, fetchImpl)));
}
