/**
 * Tests for buildShiftReminders — the pure time-deriving core of
 * useCircadianReminders. It maps a shift's ISO start/end timestamps to the
 * six circadian-coach reminders and their fire times.
 *
 * buildShiftReminders is a pure function with no React / native dependencies,
 * so it needs no mocks. We assert both the shape (6 reminders, ids, prefKeys,
 * titles) and the exact derived Date for each reminder relative to the shift.
 *
 * The 'nf-bright-light' reminder is the reconciliation anchor with the coach
 * card's brightLightWindow — see the parity test in __tests__/lib/shiftTransition.test.ts
 * for the bit-identical assertion that the reminder fires at the same instant
 * the card advertises.
 */
import { buildShiftReminders } from '@/hooks/useCircadianReminders';
import { OFFSETS } from '@/lib/shiftTransition';

const HOUR = 3_600_000;

// A concrete night shift: 22:00 -> 06:00 next day, expressed in UTC so the
// arithmetic is deterministic regardless of the machine's timezone. The
// function uses Date math (getTime), so absolute instants are what matter.
const START = '2026-06-13T22:00:00.000Z';
const END = '2026-06-14T06:00:00.000Z';
const startMs = new Date(START).getTime();
const endMs = new Date(END).getTime();

function build() {
  return buildShiftReminders({ startTime: START, endTime: END });
}

describe('buildShiftReminders', () => {
  test('returns exactly six reminders', () => {
    expect(build()).toHaveLength(6);
  });

  test('emits the expected reminder ids in order', () => {
    expect(build().map((r) => r.id)).toEqual([
      'nf-preshift-meal',
      'nf-bright-light',
      'nf-midshift-fuel',
      'nf-caffeine-cutoff',
      'nf-winddown',
      'nf-log-sleep',
    ]);
  });

  test('every reminder has a non-empty title and body', () => {
    for (const r of build()) {
      expect(typeof r.title).toBe('string');
      expect(r.title.length).toBeGreaterThan(0);
      expect(typeof r.body).toBe('string');
      expect(r.body.length).toBeGreaterThan(0);
    }
  });

  test('maps each reminder to the correct preference gate key', () => {
    const byId = Object.fromEntries(build().map((r) => [r.id, r.prefKey]));
    expect(byId['nf-preshift-meal']).toBe('mealReminderEnabled');
    expect(byId['nf-bright-light']).toBe('sleepReminderEnabled');
    expect(byId['nf-midshift-fuel']).toBe('mealReminderEnabled');
    expect(byId['nf-caffeine-cutoff']).toBe('sleepReminderEnabled');
    expect(byId['nf-winddown']).toBe('sleepReminderEnabled');
    expect(byId['nf-log-sleep']).toBe('sleepReminderEnabled');
  });

  test('bright-light reminder uses sleepReminderEnabled pref key (no new pref this sprint)', () => {
    // Piggy-backs on the existing sleep-toggle so users who already opted out
    // of sleep nudges aren't surprised by a new alert channel. When/if we add a
    // dedicated 'lightReminderEnabled' preference, this test should flip.
    const brightLight = build().find((r) => r.id === 'nf-bright-light');
    expect(brightLight).toBeDefined();
    expect(brightLight!.prefKey).toBe('sleepReminderEnabled');
  });

  test('bright-light reminder body mentions bright light', () => {
    // Acceptance: the body must contain "bright light" so the user understands
    // the anchor maps to the coach card's brightLightWindow guidance.
    const brightLight = build().find((r) => r.id === 'nf-bright-light')!;
    expect(brightLight.body.toLowerCase()).toContain('bright light');
  });

  test('every reminder fire time is a valid Date', () => {
    for (const r of build()) {
      expect(r.date).toBeInstanceOf(Date);
      expect(Number.isNaN(r.date.getTime())).toBe(false);
    }
  });

  describe('derived fire times', () => {
    const byId = () => Object.fromEntries(build().map((r) => [r.id, r.date.getTime()]));

    test('pre-shift meal fires 1 hour before clock-in', () => {
      expect(byId()['nf-preshift-meal']).toBe(startMs - 1 * HOUR);
    });

    test('bright-light reminder fires at start + OFFSETS.brightLightStartAfterStart', () => {
      // Bit-identical to the card's brightLightWindow.start (asserted in lib parity test).
      expect(byId()['nf-bright-light']).toBe(startMs + OFFSETS.brightLightStartAfterStart * HOUR);
    });

    test('mid-shift fuel fires at the exact midpoint of the shift', () => {
      expect(byId()['nf-midshift-fuel']).toBe((startMs + endMs) / 2);
    });

    test('caffeine cutoff fires 6 hours before shift end', () => {
      expect(byId()['nf-caffeine-cutoff']).toBe(endMs - 6 * HOUR);
    });

    test('wind-down fires 1 hour after shift end', () => {
      expect(byId()['nf-winddown']).toBe(endMs + 1 * HOUR);
    });

    test('log-sleep nudge fires 9 hours after shift end', () => {
      expect(byId()['nf-log-sleep']).toBe(endMs + 9 * HOUR);
    });

    test('all six fire times are distinct or document the exact tie', () => {
      // The reminders are emitted in a logical (not strictly chronological)
      // order — e.g. for a short night shift the caffeine cutoff (end-6h) can
      // precede the midpoint. The bright-light reminder fires at clock-in
      // (start + OFFSETS.brightLightStartAfterStart), which on a real shift
      // ties only with anchors derived from `start` at the same offset — and
      // we have none others at offset 0 from start. For this night fixture
      // every fire time should be unique; if a future offset change introduces
      // a tie, this test should be relaxed with a deliberate comment.
      const times = build().map((r) => r.date.getTime());
      expect(new Set(times).size).toBe(times.length);
    });

    test('the earliest reminder is the pre-shift meal and the latest is log-sleep', () => {
      // preshift-meal at start-1h is still earlier than bright-light at start+0h,
      // and log-sleep at end+9h is still latest. Bright-light slots in second.
      const reminders = build();
      const sorted = [...reminders].sort((a, b) => a.date.getTime() - b.date.getTime());
      expect(sorted[0]!.id).toBe('nf-preshift-meal');
      expect(sorted[sorted.length - 1]!.id).toBe('nf-log-sleep');
    });
  });

  test('mid-shift point sits strictly between start and end', () => {
    const mid = build().find((r) => r.id === 'nf-midshift-fuel')!.date.getTime();
    expect(mid).toBeGreaterThan(startMs);
    expect(mid).toBeLessThan(endMs);
  });

  test('is pure — repeated calls produce equal instants', () => {
    const a = build().map((r) => r.date.getTime());
    const b = build().map((r) => r.date.getTime());
    expect(a).toEqual(b);
  });

  test('respects the actual instants for a different (day) shift duration', () => {
    // 07:00 -> 19:00 same day (12h day shift). Verify the offsets hold for any window.
    const s = '2026-01-02T07:00:00.000Z';
    const e = '2026-01-02T19:00:00.000Z';
    const sMs = new Date(s).getTime();
    const eMs = new Date(e).getTime();
    const reminders = buildShiftReminders({ startTime: s, endTime: e });
    const byId = Object.fromEntries(reminders.map((r) => [r.id, r.date.getTime()]));
    expect(byId['nf-preshift-meal']).toBe(sMs - HOUR);
    expect(byId['nf-bright-light']).toBe(sMs + OFFSETS.brightLightStartAfterStart * HOUR);
    expect(byId['nf-midshift-fuel']).toBe((sMs + eMs) / 2);
    expect(byId['nf-caffeine-cutoff']).toBe(eMs + OFFSETS.caffeineCutoffBeforeEnd * HOUR);
    expect(byId['nf-winddown']).toBe(eMs + OFFSETS.sleepStartAfterEnd * HOUR);
    expect(byId['nf-log-sleep']).toBe(eMs + OFFSETS.sleepEndAfterEnd * HOUR);
  });
});
