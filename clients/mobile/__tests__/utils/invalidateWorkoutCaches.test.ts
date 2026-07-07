/**
 * Tests for the shared workout-completion cache invalidator in
 * src/utils/invalidateWorkoutCaches.ts.
 *
 * This helper exists to kill the workout-domain "split-brain": the heatmap grid
 * (['exercise-heatmap'] on the history/analytics screens AND the SEPARATE
 * ['exercises-heatmap'] read by src/components/ActivityHeatmap.tsx) and the
 * analytics summaries (['exercise-analytics', <name>]) all derive from the
 * session/exercise data a FINISH write produces — yet the two workout writers
 * (app/training/workout.tsx and app/(modals)/active-workout.tsx) historically
 * invalidated only ['active-session'] / ['workout-active-session'] /
 * ['exercise-history'], leaving the grid + analytics stale (a just-finished
 * workout missing from the same-screen heatmap until staleTime expires). The
 * contract is therefore "exactly these six keys get invalidated, every time" —
 * which is precisely what we pin below so a future edit can't silently drop one
 * and let a workout surface go stale again.
 *
 * The helper only ever calls qc.invalidateQueries, so a tiny fake QueryClient
 * with a jest.fn() is sufficient — no real React-Query client, no network, no
 * React. We assert each of the six keys was requested (order-independent) and
 * that NOTHING ELSE was invalidated.
 */
import { invalidateWorkoutCaches } from '@/utils/invalidateWorkoutCaches';

describe('invalidateWorkoutCaches', () => {
  function makeQc() {
    return { invalidateQueries: jest.fn() };
  }

  test('invalidates the active-session key', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['active-session'] });
  });

  test('invalidates the workout-active-session key', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workout-active-session'] });
  });

  test('invalidates the exercise-history list key', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['exercise-history'] });
  });

  test('invalidates the exercise-heatmap key (history/analytics screens)', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['exercise-heatmap'] });
  });

  test('invalidates the SEPARATE exercises-heatmap key (ActivityHeatmap widget)', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    // Note the trailing "s": this is a distinct cache entry from
    // ['exercise-heatmap'], read by src/components/ActivityHeatmap.tsx.
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['exercises-heatmap'] });
  });

  test('prefix-invalidates exercise-analytics (no name suffix → every variant)', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    // Passed WITHOUT the exercise-name suffix so React-Query's prefix match
    // catches every ['exercise-analytics', <name>] entry.
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['exercise-analytics'] });
  });

  test('invalidates exactly those six keys and nothing else', () => {
    const qc = makeQc();
    invalidateWorkoutCaches(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(6);
    // The full set, order-independent: this is the cross-screen contract both
    // workout-writer screens rely on, so it must not drift.
    const calledKeys = qc.invalidateQueries.mock.calls.map((c: any[]) => c[0].queryKey);
    expect(calledKeys).toEqual(
      expect.arrayContaining([
        ['active-session'],
        ['workout-active-session'],
        ['exercise-history'],
        ['exercise-heatmap'],
        ['exercises-heatmap'],
        ['exercise-analytics'],
      ]),
    );
  });

  test('does not throw and returns undefined (void)', () => {
    const qc = makeQc();
    expect(invalidateWorkoutCaches(qc as any)).toBeUndefined();
  });
});
