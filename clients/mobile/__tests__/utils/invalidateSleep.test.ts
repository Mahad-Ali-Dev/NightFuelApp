/**
 * Tests for the shared sleep-log cache invalidator in
 * src/utils/invalidateSleep.ts.
 *
 * This helper exists to kill the sleep-domain "split-brain": both the analytics
 * (/v1/sleep/analytics) and quality (/v1/sleep/quality) payloads derive entirely
 * from prisma.sleepSession.findMany, so every sleep writer must refresh
 * ['sleep-analytics'] alongside the ['sleep-sessions'] history list — yet the two
 * writers historically invalidated DISJOINT subsets. The contract is therefore
 * "exactly these three keys get invalidated, every time" — which is precisely
 * what we pin below so a future edit can't silently drop one and let a sleep
 * surface go stale again. (['today-progress'] is a harmless preserved no-op, but
 * it is part of the contract and is asserted too.)
 *
 * The helper only ever calls qc.invalidateQueries, so a tiny fake QueryClient
 * with a jest.fn() is sufficient — no real React-Query client, no network, no
 * React. We assert each of the three keys was requested (order-independent) and
 * that NOTHING ELSE was invalidated.
 */
import { invalidateSleep } from '@/utils/invalidateSleep';

describe('invalidateSleep', () => {
  function makeQc() {
    return { invalidateQueries: jest.fn() };
  }

  test('invalidates the Recovery-History sleep-sessions list key', () => {
    const qc = makeQc();
    invalidateSleep(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['sleep-sessions'] });
  });

  test('invalidates the sleep-analytics key (every session changes the analytics/quality payload)', () => {
    const qc = makeQc();
    invalidateSleep(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['sleep-analytics'] });
  });

  test("invalidates the dashboard's today-progress key (harmless preserved no-op)", () => {
    const qc = makeQc();
    invalidateSleep(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['today-progress'] });
  });

  test('invalidates exactly those three keys and nothing else', () => {
    const qc = makeQc();
    invalidateSleep(qc as any);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(3);
    // The full set, order-independent: this is the cross-screen contract the two
    // sleep-writer screens rely on, so it must not drift.
    const calledKeys = qc.invalidateQueries.mock.calls.map((c: any[]) => c[0].queryKey);
    expect(calledKeys).toEqual(
      expect.arrayContaining([['sleep-sessions'], ['sleep-analytics'], ['today-progress']]),
    );
  });

  test('does not throw and returns undefined (void)', () => {
    const qc = makeQc();
    expect(invalidateSleep(qc as any)).toBeUndefined();
  });
});
