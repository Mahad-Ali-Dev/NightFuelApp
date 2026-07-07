/**
 * Shared workout-completion cache invalidation.
 *
 * After ANY write that finishes a workout session (the full-screen
 * app/training/workout.tsx FINISH, the shift-prep app/(modals)/active-workout.tsx
 * Finish) several separate React-Query caches must be refreshed so every
 * workout-derived surface updates at once:
 *
 *   • ['active-session']          — the in-progress session query
 *   • ['workout-active-session']  — the alternate active-session key the shift
 *                                   flow reads
 *   • ['exercise-history']        — the Recovery/exercise history list
 *                                   (app/(exercises)/history.tsx)
 *   • ['exercise-heatmap']        — the per-screen heatmap on the history and
 *                                   analytics screens
 *                                   (app/(exercises)/history.tsx,
 *                                    app/(exercises)/analytics.tsx)
 *   • ['exercises-heatmap']       — the SEPARATE key (note the trailing "s")
 *                                   read by the reusable ActivityHeatmap widget
 *                                   (src/components/ActivityHeatmap.tsx) — a
 *                                   distinct cache entry from ['exercise-heatmap']
 *   • ['exercise-analytics']      — every ['exercise-analytics', <name>] variant
 *                                   (app/(exercises)/[id].tsx,
 *                                    app/(exercises)/analytics.tsx)
 *
 * Why the heatmap/analytics keys MUST be invalidated by every workout writer:
 * the heatmap grid and the analytics summaries derive ENTIRELY from the same
 * logged session/exercise data the FINISH write just produced. A writer that
 * refreshes only ['active-session'] / ['exercise-history'] leaves the heatmap
 * grid and analytics stale — the workout-domain "split-brain" this helper exists
 * to prevent (e.g. a just-finished workout missing from the same-screen heatmap
 * grid until staleTime expires / a cold refetch). Centralising the full key set
 * here means each workout-writer screen stays a disjoint single-owner (it imports
 * only this helper) yet the two writers can never drift apart again: they refresh
 * the exact same set of keys.
 *
 * Notes on the keys:
 *   • ['exercise-history'], ['exercise-heatmap'] and ['exercises-heatmap'] are
 *     matched by prefix, so any nested/parametrised variant under them refreshes
 *     too — no need to know the exact suffix here.
 *   • ['exercise-analytics'] is passed WITHOUT the exercise-name suffix on
 *     purpose. React-Query matches query keys by prefix, so the partial key
 *     invalidates every ['exercise-analytics', <name>] entry — no need to know
 *     which exercise's analytics are mounted here.
 *   • ['workout-active-session'] is kept here for symmetry/safety: the
 *     full-screen writer historically invalidated it, so centralising it means a
 *     writer migrating onto this helper loses no invalidation it previously
 *     performed. Re-invalidating a key that is already fresh / not mounted is a
 *     harmless no-op in React-Query, so calling this from every writer is always
 *     safe.
 *
 * Dependency-free: imports only the QueryClient TYPE from @tanstack/react-query
 * (already a direct dependency of the app), adds no new package.
 */
import type { QueryClient } from '@tanstack/react-query';

export function invalidateWorkoutCaches(qc: QueryClient): void {
    qc.invalidateQueries({ queryKey: ['active-session'] });
    qc.invalidateQueries({ queryKey: ['workout-active-session'] });
    qc.invalidateQueries({ queryKey: ['exercise-history'] });
    qc.invalidateQueries({ queryKey: ['exercise-heatmap'] });
    qc.invalidateQueries({ queryKey: ['exercises-heatmap'] });
    qc.invalidateQueries({ queryKey: ['exercise-analytics'] });
}
