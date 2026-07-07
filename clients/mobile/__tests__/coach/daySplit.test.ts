import {
  buildDaySplit,
  buildCircadianSplit,
  buildCycleSyncSplit,
  isRestDay,
  PHASE_INTENSITY,
} from '../../src/features/coach/plan';

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

const COVER_KEYS = new Set(['chest', 'back', 'legs', 'shoulders', 'core', 'cardio', 'fullbody', 'recovery']);

describe('coach buildDaySplit — themed split routing', () => {
  it('routes split:circadian and split:cycle-sync to their builders (goal is ignored)', () => {
    expect(buildDaySplit('maintain', 7, { split: 'circadian' })[0]!.title).toBe('Pre-shift strength');
    expect(
      buildDaySplit('maintain', 7, { split: 'cycle-sync', cyclePhases: ['follicular'] })[0]!.title,
    ).toBe('Follicular · Strength');
  });

  it('leaves the goal path byte-identical (and note-free) when no split is given', () => {
    expect(buildDaySplit('fat-loss', 7, {})).toEqual(buildDaySplit('fat-loss', 7));
    expect(buildDaySplit('fat-loss', 7)[0]!.note).toBeUndefined();
  });
});

describe('coach buildCircadianSplit (Night-Shift Reset)', () => {
  it('produces exactly `duration` days numbered 1..N, all with valid covers', () => {
    for (const d of [3, 7, 15, 30]) {
      const days = buildCircadianSplit(d);
      expect(days).toHaveLength(d);
      expect(days.map((x) => x.day)).toEqual(Array.from({ length: d }, (_, i) => i + 1));
      for (const x of days) expect(COVER_KEYS.has(x.cover)).toBe(true);
    }
  });

  it('opens with a pre-shift training day (not a rest day)', () => {
    const days = buildCircadianSplit(7, { sleepWindow: { start: '07:00', end: '15:00' } });
    expect(days[0]!.title).toBe('Pre-shift strength');
    expect(isRestDay(days[0]!.focus)).toBe(false);
  });

  it('anchors day notes to the passed sleep window (no setup invite)', () => {
    const days = buildCircadianSplit(7, { sleepWindow: { start: '07:00', end: '15:00' } });
    expect(days[0]!.note).toContain('15:00'); // wake = window end
    expect(days[3]!.note).toContain('07:00'); // recovery day cites both bounds
    expect(days[3]!.note).toContain('15:00');
    expect(days.some((d) => d.note!.includes('Preferences'))).toBe(false);
  });

  it('falls back to a canonical window and invites setup on day 1 when none is given', () => {
    const days = buildCircadianSplit(7);
    expect(days[0]!.note).toContain('16:00'); // default wake time
    expect(days[0]!.note).toContain('set your sleep window');
    expect(days.slice(1).some((d) => d.note!.includes('set your sleep window'))).toBe(false);
  });

  it('returns fresh focus arrays (no shared mutable reference)', () => {
    const days = buildCircadianSplit(7);
    days[0]!.focus.push('mutated');
    expect(days[4]!.focus).not.toContain('mutated'); // day 5 reuses day 1's template
  });
});

describe('coach buildCycleSyncSplit (Cycle Sync)', () => {
  const STRENGTH = ['chest', 'back', 'legs', 'shoulders', 'fullbody'];
  const hasStrength = (focus: string[]) => focus.some((f) => STRENGTH.includes(f));

  it('reuses the decision-engine direction (menstrual/luteal ease, follicular/ovulatory push)', () => {
    expect(PHASE_INTENSITY).toEqual({ follicular: 'push', ovulatory: 'push', menstrual: 'ease', luteal: 'ease' });
  });

  it('pushes in follicular/ovulatory and eases in menstrual/luteal', () => {
    const phases = ['follicular', 'follicular', 'ovulatory', 'luteal', 'luteal', 'menstrual', 'menstrual'] as const;
    const days = buildCycleSyncSplit(phases.length, { cyclePhases: [...phases] });
    days.forEach((d, i) => {
      const push = phases[i] === 'follicular' || phases[i] === 'ovulatory';
      expect(hasStrength(d.focus)).toBe(push); // push ⇒ resistance/full-body, ease ⇒ never
      expect(COVER_KEYS.has(d.cover)).toBe(true);
    });
  });

  it('labels each day by phase and explains the push/ease rationale', () => {
    const days = buildCycleSyncSplit(2, { cyclePhases: ['follicular', 'menstrual'] });
    expect(days[0]!.title.startsWith('Follicular')).toBe(true);
    expect(days[0]!.note).toContain('Push');
    expect(days[1]!.title.startsWith('Menstrual')).toBe(true);
    expect(days[1]!.note!.toLowerCase()).toContain('ease');
  });

  it('varies consecutive same-phase days via the per-phase rotation', () => {
    const days = buildCycleSyncSplit(3, { cyclePhases: ['follicular', 'follicular', 'follicular'] });
    expect(days[0]!.title).not.toBe(days[1]!.title);
    expect(days[1]!.title).not.toBe(days[2]!.title);
  });

  it('fills every day from the default progression (sync invite on day 1) when no phases are known', () => {
    const days = buildCycleSyncSplit(7);
    expect(days).toHaveLength(7);
    expect(days[0]!.note).toContain('typical cycle');
    for (const d of days) expect(COVER_KEYS.has(d.cover)).toBe(true);
  });

  it('fills holes past the known phases from the default progression', () => {
    const days = buildCycleSyncSplit(3, { cyclePhases: ['menstrual'] }); // days 2-3 are holes
    expect(days[0]!.title.startsWith('Menstrual')).toBe(true);
    expect(days[1]).toBeDefined();
    expect(days[2]).toBeDefined();
  });

  it('returns fresh focus arrays', () => {
    const days = buildCycleSyncSplit(4, { cyclePhases: ['follicular', 'follicular', 'follicular', 'follicular'] });
    days[0]!.focus.push('mutated');
    expect(days[1]!.focus).not.toContain('mutated');
  });
});
