/**
 * Shared meal-log cache invalidation.
 *
 * After ANY write that changes today's eaten food (logging a free-form meal,
 * logging a planned meal, building a plate, an encyclopedia quick-add) two
 * separate React-Query caches must be refreshed so BOTH calorie/macro progress
 * rings update at once:
 *
 *   • ['daily-progress', today]  — the Nutrition tab's ring (nutrition.tsx)
 *   • ['today-progress']         — the dashboard ring (index.tsx) and the
 *                                  performance / hydration / log-sleep screens
 *
 * Both keys are backed by the SAME `/v1/progress/today` payload (the identical
 * `getTodayProgress` query fn), so a writer that invalidates only one leaves the
 * other ring stale — the "split-brain" this helper exists to prevent. Centralis-
 * ing the dual-key invalidation here means the four meal-writer screens stay
 * disjoint (each owns only its own import) yet can never let the contract drift
 * apart again: they all refresh the exact same set of keys.
 *
 * Notes on the keys:
 *   • ['daily-progress'] is passed WITHOUT the date suffix on purpose. React-
 *     Query matches query keys by prefix, so the partial key invalidates every
 *     ['daily-progress', <date>] entry (including the Nutrition tab's
 *     ['daily-progress', today]) — no need to know today's date string here.
 *   • ['meal-logs'] (the per-day meal list) is likewise invalidated by prefix so
 *     the list under it refreshes too.
 *   • Re-invalidating a key that is already fresh / not mounted is a harmless
 *     no-op in React-Query, so calling this from every writer is always safe.
 *
 * Dependency-free: imports only the QueryClient TYPE from @tanstack/react-query
 * (already a direct dependency of the app), adds no new package.
 */
import type { QueryClient } from '@tanstack/react-query';

export function invalidateMealAndProgress(qc: QueryClient): void {
    qc.invalidateQueries({ queryKey: ['meal-logs'] });
    qc.invalidateQueries({ queryKey: ['daily-progress'] });
    qc.invalidateQueries({ queryKey: ['today-progress'] });
}
