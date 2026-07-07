/**
 * streaks.test.ts
 *
 * Tests for computeStreaks — the pure, timezone-safe streak math in
 * src/lib/streaks.ts. No React, no network, no Date.now() (the caller passes
 * `today`), so every case is fully deterministic.
 *
 * The four headline cases the resolver must get right:
 *   1. empty input            → { current: 0, longest: 0 }
 *   2. a broken run           → current resets to 0, longest still measured
 *   3. a run ending today     → current includes today
 *   4. a run ending yesterday → current still "alive" (today not logged yet)
 */
import { computeStreaks } from '@/lib/streaks';

const TODAY = '2026-06-16';

describe('computeStreaks — headline cases', () => {
  test('empty input yields zero current and longest', () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, longest: 0 });
  });

  test('a broken run: current is 0 but longest reflects the best past streak', () => {
    // A 3-day run that ended well before today → no live streak, longest = 3.
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-10'];
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 0, longest: 3 });
  });

  test('a run ending today counts today in the current streak', () => {
    const dates = ['2026-06-14', '2026-06-15', '2026-06-16'];
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 3, longest: 3 });
  });

  test('a run ending yesterday is still alive (today not logged yet)', () => {
    const dates = ['2026-06-13', '2026-06-14', '2026-06-15'];
    // Anchor is yesterday (06-15); current run = 3, even though today is absent.
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 3, longest: 3 });
  });
});

describe('computeStreaks — edge cases', () => {
  test('a single active day today gives current 1, longest 1', () => {
    expect(computeStreaks(['2026-06-16'], TODAY)).toEqual({ current: 1, longest: 1 });
  });

  test('activity two days ago (gap at yesterday) breaks the current streak', () => {
    // Most recent is 06-14, but 06-15 (yesterday) is missing → current 0.
    expect(computeStreaks(['2026-06-13', '2026-06-14'], TODAY)).toEqual({ current: 0, longest: 2 });
  });

  test('duplicate dates are de-duplicated and do not inflate the streak', () => {
    const dates = ['2026-06-16', '2026-06-16', '2026-06-15', '2026-06-15'];
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 2, longest: 2 });
  });

  test('unordered input is handled (sorted internally)', () => {
    const dates = ['2026-06-16', '2026-06-14', '2026-06-15'];
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 3, longest: 3 });
  });

  test('the longest streak can exceed the current streak', () => {
    // Past 5-day run (Jan), then a live 2-day run ending today.
    const dates = [
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
      '2026-06-15', '2026-06-16',
    ];
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 2, longest: 5 });
  });

  test('a streak spanning a month boundary is counted as consecutive', () => {
    // 2026-05-31 → 2026-06-01 are adjacent calendar days.
    const dates = ['2026-05-30', '2026-05-31', '2026-06-01'];
    expect(computeStreaks(dates, '2026-06-01')).toEqual({ current: 3, longest: 3 });
  });

  test('future dates relative to today do not extend the current streak', () => {
    // 06-17 is in the future; the live anchor is today (06-16).
    const dates = ['2026-06-15', '2026-06-16', '2026-06-17'];
    const result = computeStreaks(dates, TODAY);
    expect(result.current).toBe(2); // 06-15 + 06-16 only
  });

  test('malformed / empty date strings are ignored', () => {
    const dates = ['', 'not-a-date', '2026-13-40', '2026-06-16', '2026-06-15'];
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 2, longest: 2 });
  });

  test('an unparseable today yields zero current and longest', () => {
    expect(computeStreaks(['2026-06-16'], 'garbage')).toEqual({ current: 0, longest: 0 });
  });
});

describe('computeStreaks — cross-midnight night-shift bucketing (tz)', () => {
  // A night-shift worker logs activity at 23:30 local on four consecutive
  // evenings in America/New_York (EDT, UTC-4). Each 23:30 local instant falls on
  // the *next* day in UTC:
  //   2026-06-13 23:30 EDT → 2026-06-14 03:30 UTC
  //   2026-06-14 23:30 EDT → 2026-06-15 03:30 UTC
  //   2026-06-15 23:30 EDT → 2026-06-16 03:30 UTC
  //   2026-06-16 23:30 EDT → 2026-06-17 03:30 UTC
  // The user's calendar says they worked out on the 13th–16th, so with
  // today = 2026-06-16 their current streak is 4 (LOCAL days). The OLD UTC-only
  // day math (slice(0,10) / Date.UTC) buckets these on the 14th–17th UTC — the
  // 17th is "tomorrow", so that run reads as only 3 and the streak mis-rolls.
  const NIGHT_SHIFT = [
    '2026-06-14T03:30:00Z', // 2026-06-13 23:30 EDT  (anchor-3 local)
    '2026-06-15T03:30:00Z', // 2026-06-14 23:30 EDT
    '2026-06-16T03:30:00Z', // 2026-06-15 23:30 EDT
    '2026-06-17T03:30:00Z', // 2026-06-16 23:30 EDT  (today, local)
  ];

  test('with a tz, late-night activity is counted on the correct LOCAL day', () => {
    // Local days: 06-13, 06-14, 06-15, 06-16 → unbroken run of 4 ending today.
    expect(computeStreaks(NIGHT_SHIFT, '2026-06-16', 'America/New_York')).toEqual({
      current: 4,
      longest: 4,
    });
  });

  test('the same timestamps mis-roll under the legacy UTC bucketing (no tz)', () => {
    // Regression guard: without a tz the ISO timestamps bucket to their UTC days
    // (06-14..06-17). 06-17 is tomorrow relative to today (06-16), so the live
    // anchor is 06-16 and the run reads as 3 — and would read differently again
    // were today itself logged only at 23:30 local. This is the WRONG, pre-fix
    // answer and proves the tz path above is doing real work.
    const utcResult = computeStreaks(NIGHT_SHIFT, '2026-06-16');
    expect(utcResult.current).toBe(3);
    expect(utcResult.current).not.toBe(4);
  });

  test('a tz-bucketed today (ISO timestamp) anchors on the local day', () => {
    // today passed as an ISO instant that is itself cross-midnight: 03:30 UTC on
    // 06-17 is 23:30 EDT on 06-16 locally. It must anchor the streak on 06-16.
    expect(
      computeStreaks(NIGHT_SHIFT, '2026-06-17T03:30:00Z', 'America/New_York'),
    ).toEqual({ current: 4, longest: 4 });
  });

  test('plain YYYY-MM-DD inputs are unaffected by a tz argument', () => {
    // Passing a tz must not change behavior for already-bucketed day strings.
    const dates = ['2026-06-14', '2026-06-15', '2026-06-16'];
    expect(computeStreaks(dates, TODAY, 'America/New_York')).toEqual({ current: 3, longest: 3 });
    expect(computeStreaks(dates, TODAY, 'Pacific/Auckland')).toEqual({ current: 3, longest: 3 });
  });
});
