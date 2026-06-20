/**
 * Shared sleep-log cache invalidation.
 *
 * After ANY write that records a sleep session (the full Log-Sleep modal, the
 * shift Sleep-Optimizer's quick "log 8h block" button) three separate
 * React-Query caches must be refreshed so every sleep surface updates at once:
 *
 *   • ['sleep-sessions']   — the Recovery-History session list
 *   • ['sleep-analytics']  — the analytics / quality summary payload
 *   • ['today-progress']   — the dashboard ring (a harmless preserved no-op here)
 *
 * Why ['sleep-analytics'] MUST be invalidated by every writer: on the backend
 * both GET /v1/sleep/analytics (sleep.service.ts getAnalytics) and
 * GET /v1/sleep/quality (getQuality) derive ENTIRELY from
 * `prisma.sleepSession.findMany`, so every logged session changes those
 * payloads. A writer that refreshes only the session list (or only analytics)
 * leaves the other surface stale — the sleep-domain "split-brain" this helper
 * exists to prevent. Centralising the full key set here means each sleep-writer
 * screen stays a disjoint single-owner (it imports only this helper) yet the two
 * writers can never drift apart again: they refresh the exact same set of keys.
 *
 * Notes on the keys:
 *   • ['sleep-sessions'] and ['sleep-analytics'] are matched by prefix, so any
 *     entry nested under them (e.g. a paginated/parametrised variant) refreshes
 *     too — no need to know the exact suffix here.
 *   • ['today-progress'] is a HARMLESS PRESERVED no-op for sleep: the dashboard
 *     ring is backed by /v1/progress/today (progress.service.ts getTodayProgress
 *     returns only the DailyProgress row), and sleep lives in a SEPARATE
 *     sleepSession table that never rolls into DailyProgress. It is kept here —
 *     exactly as the meal helper documents its own preserved key — purely for
 *     safety / symmetry, so a writer migrating onto this helper loses no
 *     invalidation it previously performed.
 *   • Re-invalidating a key that is already fresh / not mounted is a harmless
 *     no-op in React-Query, so calling this from every writer is always safe.
 *
 * Dependency-free: imports only the QueryClient TYPE from @tanstack/react-query
 * (already a direct dependency of the app), adds no new package.
 */
import type { QueryClient } from '@tanstack/react-query';

export function invalidateSleep(qc: QueryClient): void {
    qc.invalidateQueries({ queryKey: ['sleep-sessions'] });
    qc.invalidateQueries({ queryKey: ['sleep-analytics'] });
    qc.invalidateQueries({ queryKey: ['today-progress'] });
}
