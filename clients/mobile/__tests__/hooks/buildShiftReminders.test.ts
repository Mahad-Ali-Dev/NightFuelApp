/**
 * Tests for buildShiftReminders — the pure time-deriving core of
 * useCircadianReminders. It maps a shift's ISO start/end timestamps to the
 * eight circadian-coach reminders and their fire times.
 *
 * buildShiftReminders is a pure function with no React / native dependencies,
 * so it needs no mocks. We assert both the shape (8 reminders, ids, prefKeys,
 * titles) and the exact derived Date for each reminder relative to the shift.
 *
 * The 'nf-bright-light' reminder is the reconciliation anchor with the coach
 * card's brightLightWindow, the 'nf-avoid-light' reminder is the analogous
 * anchor for the card's avoidLight (blue-blocker) window, and the new
 * 'nf-anchor-sleep' reminder is the anchor for the AnchorSleepCard's core-sleep
 * block — see the parity tests in __tests__/lib/shiftTransition.test.ts and
 * __tests__/lib/lightPlanReminderParity.test.ts for the bit-identical assertions
 * that each reminder fires at the same instant the card advertises.
 */
import { buildShiftReminders } from '@/hooks/useCircadianReminders';
import { OFFSETS } from '@/lib/shiftTransition';
import { BLUE_BLOCKER_LEAD_HOURS } from '@/lib/lightPlan';

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
  test('returns exactly eight reminders', () => {
    expect(build()).toHaveLength(8);
  });

  test('emits the expected reminder ids in order', () => {
    expect(build().map((r) => r.id)).toEqual([
      'nf-preshift-meal',
      'nf-bright-light',
      'nf-midshift-fuel',
      'nf-caffeine-cutoff',
      'nf-winddown',
      'nf-log-sleep',
      'nf-avoid-light',
      'nf-anchor-sleep',
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
    expect(byId['nf-avoid-light']).toBe('sleepReminderEnabled');
    expect(byId['nf-anchor-sleep']).toBe('sleepReminderEnabled');
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

  test('avoid-light reminder uses sleepReminderEnabled pref key (no new pref this sprint)', () => {
    // Like nf-bright-light, the new blue-blocker nudge piggy-backs on the
    // existing sleep toggle rather than introducing a dedicated pref — users who
    // opted out of sleep nudges aren't surprised by a new alert channel.
    const avoidLight = build().find((r) => r.id === 'nf-avoid-light');
    expect(avoidLight).toBeDefined();
    expect(avoidLight!.prefKey).toBe('sleepReminderEnabled');
  });

  test('anchor-sleep reminder uses sleepReminderEnabled pref key (no new pref this sprint)', () => {
    // Like nf-bright-light / nf-avoid-light, the anchor-sleep nudge piggy-backs on
    // the existing sleep toggle rather than introducing a dedicated pref — and
    // crucially adds NO new key to NotificationPreferences (src/api/notifications.ts).
    const anchorSleep = build().find((r) => r.id === 'nf-anchor-sleep');
    expect(anchorSleep).toBeDefined();
    expect(anchorSleep!.prefKey).toBe('sleepReminderEnabled');
  });

  test('anchor-sleep reminder body mentions the anchor-sleep block', () => {
    // Acceptance: the body must reference the anchor-sleep concept so the user
    // understands the nudge maps to the AnchorSleepCard's core-sleep window.
    const anchorSleep = build().find((r) => r.id === 'nf-anchor-sleep')!;
    expect(anchorSleep.body.toLowerCase()).toContain('anchor-sleep');
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

    test('anchor-sleep fires at end + OFFSETS.sleepStartAfterEnd h (== sleepWindow.start)', () => {
      // Bit-identical to computeAnchorSleep(shift).anchor.start (== sleepWindow.start)
      // — asserted bit-for-bit in the lib parity test. The anchor opens at the
      // recovery-sleep opportunity, the SAME instant as nf-winddown above.
      expect(byId()['nf-anchor-sleep']).toBe(endMs + OFFSETS.sleepStartAfterEnd * HOUR);
      expect(byId()['nf-anchor-sleep']).toBe(byId()['nf-winddown']);
    });

    test('log-sleep nudge fires 9 hours after shift end', () => {
      expect(byId()['nf-log-sleep']).toBe(endMs + 9 * HOUR);
    });

    test('avoid-light reminder fires at end + (sleepStartAfterEnd − BLUE_BLOCKER_LEAD_HOURS)h', () => {
      // Bit-identical to the card's avoidLight.start (== sleepWindow.start −
      // BLUE_BLOCKER_LEAD_HOURS) — asserted bit-for-bit in the lib parity test.
      // For this fixture (sleepStartAfterEnd=1, lead=2) that is end − 1h.
      expect(byId()['nf-avoid-light']).toBe(
        endMs + (OFFSETS.sleepStartAfterEnd - BLUE_BLOCKER_LEAD_HOURS) * HOUR,
      );
    });

    test('fire times are distinct EXCEPT the intentional anchor↔winddown tie at end+1h', () => {
      // The reminders are emitted in a logical (not strictly chronological)
      // order — e.g. for a short night shift the caffeine cutoff (end-6h) can
      // precede the midpoint. The bright-light reminder fires at clock-in
      // (start + OFFSETS.brightLightStartAfterStart), which on a real shift
      // ties only with anchors derived from `start` at the same offset — and
      // we have none others at offset 0 from start. The avoid-light reminder
      // fires at end-1h (sleepStartAfterEnd − BLUE_BLOCKER_LEAD_HOURS), distinct
      // from caffeine-cutoff (end-6h) and winddown (end+1h).
      //
      // DELIBERATE TIE: nf-anchor-sleep and nf-winddown BOTH fire at
      // end + OFFSETS.sleepStartAfterEnd h (== sleepWindow.start). That is by
      // design — wind-down and the anchor-sleep block both open at the
      // recovery-sleep opportunity, so they share the exact instant. We therefore
      // assert that the ONLY collision is that pair: removing one of them makes
      // the remaining seven fire times unique.
      const reminders = build();
      const anchor = reminders.find((r) => r.id === 'nf-anchor-sleep')!;
      const winddown = reminders.find((r) => r.id === 'nf-winddown')!;
      expect(anchor.date.getTime()).toBe(winddown.date.getTime());

      const withoutAnchor = reminders
        .filter((r) => r.id !== 'nf-anchor-sleep')
        .map((r) => r.date.getTime());
      expect(new Set(withoutAnchor).size).toBe(withoutAnchor.length);
    });

    test('the earliest reminder is the pre-shift meal and the latest is log-sleep', () => {
      // preshift-meal at start-1h is still earlier than bright-light at start+0h,
      // and log-sleep at end+9h is still latest. Bright-light slots in second,
      // avoid-light at end-1h sits between caffeine-cutoff (end-6h) and winddown
      // (end+1h), and anchor-sleep at end+1h coincides with winddown in the middle
      // — none of these displaces the earliest/latest extremes.
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
    expect(byId['nf-avoid-light']).toBe(eMs + (OFFSETS.sleepStartAfterEnd - BLUE_BLOCKER_LEAD_HOURS) * HOUR);
    expect(byId['nf-anchor-sleep']).toBe(eMs + OFFSETS.sleepStartAfterEnd * HOUR);
  });
});
