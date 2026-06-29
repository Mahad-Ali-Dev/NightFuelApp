import { buildDaySplit, isRestDay } from '../../src/features/coach/plan';

describe('coach buildDaySplit', () => {
  it('produces exactly `duration` days, numbered 1..N', () => {
    for (const d of [3, 7, 15, 30] as const) {
      const days = buildDaySplit('fat-loss', d);
      expect(days).toHaveLength(d);
      expect(days[0]!.day).toBe(1);
      expect(days[d - 1]!.day).toBe(d);
      expect(days.map((x) => x.day)).toEqual(Array.from({ length: d }, (_, i) => i + 1));
    }
  });

  it('opens each goal with its signature day-1 focus', () => {
    expect(buildDaySplit('muscle-gain', 7)[0]!.title).toBe('Chest & triceps');
    expect(buildDaySplit('fat-loss', 7)[0]!.title).toBe('Full body');
    expect(buildDaySplit('endurance', 7)[0]!.title).toBe('Cardio base');
    expect(buildDaySplit('maintain', 7)[0]!.title).toBe('Upper body');
  });

  it('tags every day with one of the 8 cover keys', () => {
    const covers = new Set(['chest', 'back', 'legs', 'shoulders', 'core', 'cardio', 'fullbody', 'recovery']);
    for (const goal of ['muscle-gain', 'fat-loss', 'endurance', 'maintain'] as const) {
      for (const d of buildDaySplit(goal, 30)) expect(covers.has(d.cover)).toBe(true);
    }
    expect(buildDaySplit('muscle-gain', 7)[0]!.cover).toBe('chest');
  });

  it('repeats the 5-day training cycle across longer plans (week N mirrors week 1)', () => {
    const days = buildDaySplit('muscle-gain', 30);
    expect(days[5]!.title).toBe(days[0]!.title); // day 6 == day 1
    expect(days[10]!.title).toBe(days[0]!.title); // day 11 == day 1
    expect(days[5]!.focus).toEqual(days[0]!.focus);
  });

  it('marks the recovery day as a rest day (empty focus)', () => {
    const recovery = buildDaySplit('muscle-gain', 7)[4]!; // 5th day = Active recovery
    expect(recovery.title).toBe('Active recovery');
    expect(isRestDay(recovery.focus)).toBe(true);
    expect(isRestDay(buildDaySplit('muscle-gain', 7)[0]!.focus)).toBe(false);
  });

  it('returns fresh focus arrays (no shared mutable reference between days)', () => {
    const days = buildDaySplit('muscle-gain', 30);
    days[0]!.focus.push('mutated');
    expect(days[5]!.focus).not.toContain('mutated'); // day 6 unaffected
  });
});
