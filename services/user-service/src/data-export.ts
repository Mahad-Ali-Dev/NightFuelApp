// ── GDPR data-export fan-out (orchestrator side) ──────────────────────────────
// user-service owns the GDPR "export my data" ORCHESTRATOR (GET
// /v1/users/me/export — Art. 20 portability). After it gathers its OWN
// user-owned data, it fans out to EVERY other owning service's internal export
// endpoint (GET /v1/<svc>/internal/user/:userId/export) so the calling user
// gets a SINGLE machine-readable bundle of all their data across the platform.
//
// This module is the inter-service client for that fan-out. It is the read-only
// twin of account-deletion.ts: same inter-service HTTP pattern (native `fetch`,
// an AbortController per-call timeout, graceful per-call error handling), the
// SAME owning-service set, and the SAME base-URL resolution — but it issues GET
// (not DELETE) against the per-service `/export` route, and returns the fetched
// JSON body rather than a deletion count.
//
// Every call carries the shared X-Internal-Token header (the server-to-server
// credential the target's makeInternalAuthGuard preHandler verifies), NOT a
// JWT, because these are /internal/* routes.
//
// RESILIENCE: the fan-out NEVER throws. Each service is attempted independently
// and its outcome (the parsed data, or { error } on failure) is collected, so a
// single unreachable service degrades that service's slot to { error } instead
// of failing the whole export (best-effort completeness — the user still gets
// every service that DID respond, and can see which slots need a retry).
//
// SECRETS: this client only relays whatever JSON the per-service /export route
// returns. Those endpoints are responsible for excluding credentials/secrets
// (e.g. auth-service exports profile/account metadata, NEVER password hashes).
// The orchestrator never injects, augments, or logs the returned bodies.

import { createLogger } from '@nightfuel/config';
import { OWNING_SERVICES, OwningService } from './account-deletion';

const logger = createLogger('user-service:data-export');

// Per-call timeout for an internal export. Bounded so one hung service can't
// stall the whole bundle assembly.
const EXPORT_TIMEOUT_MS = 10_000;

// ── The owning services to fan out to ─────────────────────────────────────────
// REUSE the exact same owning-service inventory + base-URL resolution as the
// deletion orchestrator (account-deletion.ts: OWNING_SERVICES), so the export
// fan-out can never drift out of sync with the deletion fan-out — the two MUST
// cover the identical set of services. We only swap the per-service path suffix
// (DELETE `/internal/user/:id` → GET `/internal/user/:id/export`) by appending
// `/export` to each service's canonical purge path. This keeps the prefixes
// (`/v1/auth`, `/v1/plans`, `/v1/meals`, `/v1/exercises`, `/v1/subscriptions`,
// …) exactly aligned with what each target actually mounts.
export interface ExportService {
    key: string;
    envKey: string;
    defaultUrl: string;
    path: (userId: string) => string;
}

export const EXPORT_SERVICES: ExportService[] = OWNING_SERVICES.map((svc: OwningService) => ({
    key: svc.key,
    envKey: svc.envKey,
    defaultUrl: svc.defaultUrl,
    // `${purgePath}/export` — the read-only export sibling of the purge route.
    path: (u: string) => `${svc.path(u)}/export`,
}));

export interface ServiceExportResult {
    service: string;
    // The parsed JSON the service returned (on success), OR an error marker
    // describing why this slot couldn't be filled. Exactly one is populated.
    data?: unknown;
    error?: string;
    status?: number;
}

function resolveBaseUrl(svc: ExportService): string {
    const fromEnv = process.env[svc.envKey];
    const base = (fromEnv && fromEnv.trim()) || svc.defaultUrl;
    return base.replace(/\/+$/, '');
}

/**
 * Call ONE owning service's internal export endpoint with the X-Internal-Token.
 * Never throws — any failure (non-2xx, network error, timeout/abort, bad token
 * → the target replies 404, malformed JSON) is captured as { error, status? }.
 *
 * On success returns { service, data, status } where `data` is the parsed JSON
 * the service exported. The orchestrator relays this verbatim into the bundle;
 * it never inspects, mutates, or logs the body (it may contain Art.9 health PII).
 */
export async function exportOneService(
    svc: ExportService,
    userId: string,
    internalToken: string,
    fetchImpl: typeof fetch = fetch,
): Promise<ServiceExportResult> {
    const url = `${resolveBaseUrl(svc)}${svc.path(userId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);

    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: {
                'x-internal-token': internalToken,
                accept: 'application/json',
            },
            signal: controller.signal,
        });

        if (!res.ok) {
            // A guarded route replies 404 on a missing/wrong token; any non-2xx
            // is a failure we surface as this slot's { error } (best-effort: the
            // rest of the bundle is still returned). Never throw.
            logger.error({ service: svc.key, userId, status: res.status }, 'Internal export returned non-2xx');
            return { service: svc.key, error: `HTTP ${res.status}`, status: res.status };
        }

        // Parse the exported body. A malformed body is captured as an error slot,
        // not a hard failure of the whole export.
        const data = await res.json();
        logger.info({ service: svc.key, userId, status: res.status }, 'Internal export succeeded');
        return { service: svc.key, data, status: res.status };
    } catch (err: any) {
        // Network error / timeout / abort / JSON parse error — captured, never thrown.
        const error = err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'request failed');
        logger.error({ service: svc.key, userId, err }, 'Internal export request failed');
        return { service: svc.key, error };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fan out the export to EVERY owning service concurrently and collect a
 * per-service result. RESILIENT: attempts all services regardless of individual
 * failures and ALWAYS resolves (Promise.all over per-call helpers that never
 * reject). The caller folds each result into the bundle's `services` map —
 * either the exported data, or { error } for a slot that couldn't be filled.
 */
export async function fanOutExport(
    userId: string,
    internalToken: string,
    services: ExportService[] = EXPORT_SERVICES,
    fetchImpl: typeof fetch = fetch,
): Promise<ServiceExportResult[]> {
    return Promise.all(services.map((svc) => exportOneService(svc, userId, internalToken, fetchImpl)));
}

/**
 * Shape of the assembled GDPR data-portability bundle.
 *   exportedAt — ISO timestamp the bundle was produced.
 *   userId     — the CALLING user (from the verified JWT only — never a param).
 *   self       — user-service's OWN user-owned data (profile/prefs/status/cycle).
 *   services   — one slot per owning service: either its exported JSON, or
 *                { error } if that service's export couldn't be gathered.
 */
export interface DataExportBundle {
    exportedAt: string;
    userId: string;
    self: unknown;
    services: Record<string, unknown>;
}

/**
 * Fold the flat per-service results into the bundle's `services` map keyed by
 * service name. Each slot is the exported data on success, or { error } on
 * failure (so a per-service failure degrades that slot, not the whole bundle).
 */
export function assembleServicesMap(results: ServiceExportResult[]): Record<string, unknown> {
    const services: Record<string, unknown> = {};
    for (const r of results) {
        services[r.service] = r.error !== undefined ? { error: r.error } : r.data;
    }
    return services;
}
