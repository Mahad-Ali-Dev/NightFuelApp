/**
 * Tests for the shared meal-log cache invalidator in
 * src/utils/invalidateMealAndProgress.ts.
 *
 * This helper exists to kill the calorie-ring "split-brain": two query keys
 * (['daily-progress', today] on the Nutrition tab and ['today-progress'] on the
 * dashboard) hold the SAME /v1/progress/today data, so every meal writer must
 * refresh BOTH. The contract is therefore "exactly these three keys get
 * invalidated, every time" — which is precisely what we pin below so a future
 * edit can't silently drop one and let a ring go stale again.
 *
 * The helper only ever calls qc.invalidateQueries, so a tiny fake QueryClient
 * with a jest.fn() is sufficient — no real React-Query client, no network, no
 * React. We assert each of the three keys was requested (order-independent) and
 * that NOTHING ELSE was invalidated.
 */
import { invalidateMealAndProgress } from '@/utils/invalidateMealAndProgress';

describe('invalidateMealAndProgress', () => {
  function makeQc() {
    return { invalidateQueries: jest.fn() };
  }

  test('invalidates the meal-logs list key', () => {
    const qc = makeQc();
    invalidateMealAndProgress(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['meal-logs'] });
  });

  test("invalidates the Nutrition tab's daily-progress key (prefix, no date suffix)", () => {
    const qc = makeQc();
    invalidateMealAndProgress(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-progress'] });
  });

  test("invalidates the dashboard's today-progress key", () => {
    const qc = makeQc();
    invalidateMealAndProgress(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['today-progress'] });
  });

  test('invalidates exactly those three keys and nothing else', () => {
    const qc = makeQc();
    invalidateMealAndProgress(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(3);
    // The full set, order-independent: this is the cross-screen contract the four
    // meal-writer screens rely on, so it must not drift.
    const calledKeys = qc.invalidateQueries.mock.calls.map((c: any[]) => c[0].queryKey);
    expect(calledKeys).toEqual(
      expect.arrayContaining([['meal-logs'], ['daily-progress'], ['today-progress']]),
    );
  });

  test('does not throw and returns undefined (void)', () => {
    const qc = makeQc();
    expect(invalidateMealAndProgress(qc as any)).toBeUndefined();
  });
});
