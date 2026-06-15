/**
 * Tests for computeShiftTransition — the pure circadian "shift transition" math
 * in src/lib/shiftTransition.ts. It maps a shift's ISO start/end timestamps to
 * three readiness anchors: the post-shift sleep window, the caffeine cutoff, and
 * the in-shift bright-light window.
 *
 * The function is pure (no React / native / network / Date.now), so it needs no
 * mocks. Timestamps are expressed in UTC so the absolute-instant arithmetic is
 * deterministic regardless of the machine's timezone.
 *
 * Headline cases:
 *   1. a day shift           (start and end on the same calendar day)
 *   2. an overnight shift    (end on the NEXT calendar day — the night-worker case)
 *   3. malformed timestamps  (missing / unparseable → throws, never NaN anchors)
 *   4. parity with buildShiftReminders (shared offsets must stay in lockstep)
 */
import { computeShiftTransition } from '@/lib/shiftTransition';
import { buildShiftReminders } from '@/hooks/useCircadianReminders';

const HOUR = 3_600_000;

describe('computeShiftTransition', () => {
  describe('day shift (07:00 → 19:00 same calendar day)', () => {
    const START = '2026-01-02T07:00:00.000Z';
    const END = '2026-01-02T19:00:00.000Z';
    const startMs = new Date(START).getTime();
    const endMs = new Date(END).getTime();

    const t = () => computeShiftTransition({ startTime: START, endTime: END });

    test('every anchor is a valid Date', () => {
      const { sleepWindow, caffeineCutoff, brightLightWindow } = t();
      for (const d of [sleepWindow.start, sleepWindow.end, caffeineCutoff, brightLightWindow.start, brightLightWindow.end]) {
        expect(d).toBeInstanceOf(Date);
        expect(Number.isNaN(d.getTime())).toBe(false);
      }
    });

    test('caffeine cutoff is 6h before shift end', () => {
      expect(t().caffeineCutoff.getTime()).toBe(endMs - 6 * HOUR);
    });

    test('sleep window opens 1h after end and closes 9h after end (~8h opportunity)', () => {
      const { sleepWindow } = t();
      expect(sleepWindow.start.getTime()).toBe(endMs + 1 * HOUR);
      expect(sleepWindow.end.getTime()).toBe(endMs + 9 * HOUR);
      expect(sleepWindow.end.getTime() - sleepWindow.start.getTime()).toBe(8 * HOUR);
    });

    test('bright-light window runs from clock-in to start + 2h', () => {
      const { brightLightWindow } = t();
      expect(brightLightWindow.start.getTime()).toBe(startMs);
      expect(brightLightWindow.end.getTime()).toBe(startMs + 2 * HOUR);
    });

    test('is pure — repeated calls produce equal instants', () => {
      const a = t();
      const b = t();
      expect(a.caffeineCutoff.getTime()).toBe(b.caffeineCutoff.getTime());
      expect(a.sleepWindow.start.getTime()).toBe(b.sleepWindow.start.getTime());
      expect(a.sleepWindow.end.getTime()).toBe(b.sleepWindow.end.getTime());
      expect(a.brightLightWindow.start.getTime()).toBe(b.brightLightWindow.start.getTime());
      expect(a.brightLightWindow.end.getTime()).toBe(b.brightLightWindow.end.getTime());
    });
  });

  describe('overnight shift (22:00 → 06:00 the NEXT calendar day)', () => {
    // The end wall-clock time (06:00) is *earlier* than the start (22:00) and
    // lands on the following date. Because the offsets are absolute-instant Date
    // math, crossing midnight needs no special-casing — the ISO timestamps
    // already encode the correct day.
    const START = '2026-06-13T22:00:00.000Z';
    const END = '2026-06-14T06:00:00.000Z';
    const startMs = new Date(START).getTime();
    const endMs = new Date(END).getTime();

    const t = () => computeShiftTransition({ startTime: START, endTime: END });

    test('end instant is after the start instant despite the earlier wall-clock hour', () => {
      expect(endMs).toBeGreaterThan(startMs);
    });

    test('caffeine cutoff is 6h before shift end (00:00 the next day)', () => {
      expect(t().caffeineCutoff.getTime()).toBe(endMs - 6 * HOUR);
      // 06:00 − 6h = 00:00 on 2026-06-14.
      expect(t().caffeineCutoff.toISOString()).toBe('2026-06-14T00:00:00.000Z');
    });

    test('sleep window straddles the morning after clock-out', () => {
      const { sleepWindow } = t();
      expect(sleepWindow.start.getTime()).toBe(endMs + 1 * HOUR); // 07:00
      expect(sleepWindow.end.getTime()).toBe(endMs + 9 * HOUR); // 15:00
      expect(sleepWindow.start.toISOString()).toBe('2026-06-14T07:00:00.000Z');
      expect(sleepWindow.end.toISOString()).toBe('2026-06-14T15:00:00.000Z');
    });

    test('bright-light window sits at the start of the night shift', () => {
      const { brightLightWindow } = t();
      expect(brightLightWindow.start.getTime()).toBe(startMs); // 22:00
      expect(brightLightWindow.end.getTime()).toBe(startMs + 2 * HOUR); // 00:00 next day
    });

    test('anchors are ordered: bright-light start < caffeine cutoff < sleep start < sleep end', () => {
      const { sleepWindow, caffeineCutoff, brightLightWindow } = t();
      expect(brightLightWindow.start.getTime()).toBeLessThan(caffeineCutoff.getTime());
      expect(caffeineCutoff.getTime()).toBeLessThan(sleepWindow.start.getTime());
      expect(sleepWindow.start.getTime()).toBeLessThan(sleepWindow.end.getTime());
    });
  });

  describe('parity with buildShiftReminders (shared offsets stay in lockstep)', () => {
    const START = '2026-06-13T22:00:00.000Z';
    const END = '2026-06-14T06:00:00.000Z';

    test('caffeine cutoff matches the nf-caffeine-cutoff reminder instant', () => {
      const { caffeineCutoff } = computeShiftTransition({ startTime: START, endTime: END });
      const reminder = buildShiftReminders({ startTime: START, endTime: END }).find((r) => r.id === 'nf-caffeine-cutoff')!;
      expect(caffeineCutoff.getTime()).toBe(reminder.date.getTime());
    });

    test('sleep window edges match the wind-down and log-sleep reminder instants', () => {
      const { sleepWindow } = computeShiftTransition({ startTime: START, endTime: END });
      const reminders = buildShiftReminders({ startTime: START, endTime: END });
      const windDown = reminders.find((r) => r.id === 'nf-winddown')!;
      const logSleep = reminders.find((r) => r.id === 'nf-log-sleep')!;
      expect(sleepWindow.start.getTime()).toBe(windDown.date.getTime());
      expect(sleepWindow.end.getTime()).toBe(logSleep.date.getTime());
    });
  });

  describe('malformed timestamps', () => {
    test('throws when startTime is an empty string', () => {
      expect(() => computeShiftTransition({ startTime: '', endTime: '2026-06-14T06:00:00.000Z' })).toThrow(/startTime/);
    });

    test('throws when endTime is unparseable garbage', () => {
      expect(() => computeShiftTransition({ startTime: '2026-06-13T22:00:00.000Z', endTime: 'not-a-date' })).toThrow(/endTime/);
    });

    test('throws when a field is missing entirely', () => {
      // Exercise the runtime guard against a malformed object (e.g. a partial API
      // response) — deliberately bypass the compile-time type with a cast.
      expect(() => computeShiftTransition({ startTime: '2026-06-13T22:00:00.000Z' } as any)).toThrow(/endTime/);
    });

    test('never returns NaN anchors — it throws instead', () => {
      // Guarantees the failure mode is a loud throw the card can catch, not a
      // silent Invalid Date that would render "NaN" in the UI.
      expect(() => computeShiftTransition({ startTime: 'garbage', endTime: 'garbage' })).toThrow();
    });
  });
});
