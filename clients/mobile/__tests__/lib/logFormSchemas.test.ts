/**
 * logFormSchemas.test.ts
 *
 * Pure-validator tests for the log-shift and log-sleep form schemas. No React,
 * no network — every case exercises a function in src/lib/logFormSchemas.ts
 * in isolation, so the suite is fully deterministic.
 *
 * The cases listed in the work-item are pinned with comments below so a future
 * reader can map each assertion back to the original acceptance criterion.
 */

import {
  isValidCalendarDate,
  isValidWallTime,
  isOvernightShift,
  daysFromUtc,
  isImplausibleFutureDate,
  MAX_FUTURE_DAYS,
  humanizeFieldError,
  validateLogShiftForm,
  validateLogSleepForm,
  fieldErrorsFromAxiosError,
  SHIFT_FUTURE_DATE_MSG,
  SHIFT_END_ORDER_MSG,
  SHIFT_ZERO_LENGTH_MSG,
  SHIFT_TOO_LONG_MSG,
  MAX_SHIFT_HOURS,
  SLEEP_FUTURE_DAY_MSG,
  SLEEP_FUTURE_END_MSG,
  SLEEP_TOO_LONG_MSG,
  MAX_SLEEP_HOURS,
  type LogShiftFormInput,
  type LogSleepFormInput,
} from '@/lib/logFormSchemas';

// A fixed "now" used by every future-date assertion so the suite never depends
// on the real wall clock. Chosen to sit one day after the factory default day
// (2026-06-16) so "today" / "yesterday" logging is comfortably valid.
const NOW = new Date('2026-06-17T12:00:00Z');

// ── Factories ────────────────────────────────────────────────────────────────

function shiftInput(overrides: Partial<LogShiftFormInput> = {}): LogShiftFormInput {
  return {
    shiftDate: '2026-06-16',
    startTime: '19:00',
    endTime: '07:00',
    shiftType: 'FIXED_NIGHT',
    isDayOff: false,
    commuteMinutes: '30',
    ...overrides,
  };
}

function sleepInput(overrides: Partial<LogSleepFormInput> = {}): LogSleepFormInput {
  return {
    startDay: '2026-06-16',
    startTime: '23:00',
    endDay: '2026-06-16',
    endTime: '07:00',
    quality: 7,
    disturbances: 0,
    notes: '',
    ...overrides,
  };
}

// ── isValidCalendarDate ──────────────────────────────────────────────────────

describe('isValidCalendarDate', () => {
  test.each([
    ['2026-06-16', true],
    ['1999-01-01', true],
    ['2024-02-29', true], // leap year
    ['2026-02-30', false], // not a real day
    ['2026-13-01', false], // month overflow
    ['2026-6-16', false], // not zero-padded
    ['2026/06/16', false],
    ['', false],
    ['not a date', false],
  ])('"%s" -> %s', (input, expected) => {
    expect(isValidCalendarDate(input)).toBe(expected);
  });
});

// ── isValidWallTime ──────────────────────────────────────────────────────────

describe('isValidWallTime', () => {
  test.each([
    ['00:00', true],
    ['23:59', true],
    ['09:30', true],
    ['24:00', false], // hour overflow
    ['12:60', false], // minute overflow
    ['9:30', false], // not zero-padded
    ['09-30', false],
    ['', false],
  ])('"%s" -> %s', (input, expected) => {
    expect(isValidWallTime(input)).toBe(expected);
  });
});

// ── isOvernightShift ─────────────────────────────────────────────────────────

describe('isOvernightShift', () => {
  // Work-item case: isOvernightShift('22:00','06:00') true
  test("22:00 -> 06:00 is overnight", () => {
    expect(isOvernightShift('22:00', '06:00')).toBe(true);
  });

  // Work-item case: isOvernightShift('07:00','15:00') false
  test('07:00 -> 15:00 is NOT overnight', () => {
    expect(isOvernightShift('07:00', '15:00')).toBe(false);
  });

  test('equal start and end is NOT overnight (zero-length shift, not a roll)', () => {
    expect(isOvernightShift('19:00', '19:00')).toBe(false);
  });

  test('19:00 -> 07:00 (the default shift) is overnight', () => {
    expect(isOvernightShift('19:00', '07:00')).toBe(true);
  });
});

// ── daysFromUtc ──────────────────────────────────────────────────────────────

describe('daysFromUtc', () => {
  test('same day is 0', () => {
    expect(daysFromUtc('2026-06-16', '2026-06-16')).toBe(0);
  });

  test('one day forward is +1', () => {
    expect(daysFromUtc('2026-06-16', '2026-06-17')).toBe(1);
  });

  test('one day backward is -1', () => {
    expect(daysFromUtc('2026-06-17', '2026-06-16')).toBe(-1);
  });

  test('crosses a month boundary correctly', () => {
    expect(daysFromUtc('2026-06-30', '2026-07-01')).toBe(1);
  });

  test('crosses a leap day correctly', () => {
    expect(daysFromUtc('2024-02-28', '2024-03-01')).toBe(2); // 29th exists
  });

  test('returns null when either side is not a real date', () => {
    expect(daysFromUtc('2026-13-01', '2026-06-16')).toBeNull();
    expect(daysFromUtc('2026-06-16', 'nope')).toBeNull();
  });
});

// ── isImplausibleFutureDate ──────────────────────────────────────────────────

describe('isImplausibleFutureDate', () => {
  test('today is not implausible', () => {
    expect(isImplausibleFutureDate('2026-06-17', NOW)).toBe(false);
  });

  test('yesterday (the past) is never implausible', () => {
    expect(isImplausibleFutureDate('2026-06-16', NOW)).toBe(false);
    expect(isImplausibleFutureDate('1999-01-01', NOW)).toBe(false);
  });

  test('exactly MAX_FUTURE_DAYS ahead is allowed (boundary inclusive)', () => {
    // NOW is 2026-06-17, MAX_FUTURE_DAYS = 2 → 2026-06-19 is still OK.
    expect(MAX_FUTURE_DAYS).toBe(2);
    expect(isImplausibleFutureDate('2026-06-19', NOW)).toBe(false);
  });

  test('one day past the tolerance is implausible', () => {
    expect(isImplausibleFutureDate('2026-06-20', NOW)).toBe(true);
  });

  test('a wildly future year (typo) is implausible', () => {
    expect(isImplausibleFutureDate('2062-06-17', NOW)).toBe(true);
  });

  test('a non-calendar string is not flagged (format check owns that)', () => {
    expect(isImplausibleFutureDate('2026-13-40', NOW)).toBe(false);
    expect(isImplausibleFutureDate('', NOW)).toBe(false);
  });
});

// ── humanizeFieldError ───────────────────────────────────────────────────────

describe('humanizeFieldError', () => {
  test('maps commuteMinutes to friendly copy', () => {
    expect(humanizeFieldError('commuteMinutes', '')).toBe('Commute must be 0-180 minutes');
  });

  test('maps quality to its friendly copy', () => {
    expect(humanizeFieldError('quality', '')).toBe('Quality must be between 1 and 10');
  });

  test('maps an unknown path to the raw message', () => {
    expect(humanizeFieldError('mystery', 'go away')).toBe('go away');
  });

  test('passes through a range-style endTime message rather than the generic format copy', () => {
    expect(humanizeFieldError('endTime', 'Sleep start must be before sleep end')).toBe(
      'Sleep start must be before sleep end',
    );
  });

  test('passes through a future-date message on a date path rather than the format copy', () => {
    expect(humanizeFieldError('shiftDate', SHIFT_FUTURE_DATE_MSG)).toBe(
      SHIFT_FUTURE_DATE_MSG,
    );
    expect(humanizeFieldError('startDay', SLEEP_FUTURE_DAY_MSG)).toBe(
      SLEEP_FUTURE_DAY_MSG,
    );
  });

  test('an empty message on a date path still yields the generic format copy', () => {
    expect(humanizeFieldError('shiftDate', '')).toBe('Enter a real date (YYYY-MM-DD)');
    expect(humanizeFieldError('endDay', '')).toBe('Enter a real date (YYYY-MM-DD)');
  });

  test('passes through the shift end-order message on the endTime path', () => {
    // The shift overnight convention means end<start is always overnight, so
    // this exact copy is only ever surfaced if that convention is later
    // refined — but the humanizer must still forward it verbatim.
    expect(humanizeFieldError('endTime', SHIFT_END_ORDER_MSG)).toBe(SHIFT_END_ORDER_MSG);
  });

  test('passes through the too-long duration messages verbatim on the endTime path', () => {
    // Both contain "cannot", so they already match the /cannot/ branch of the
    // endTime case and forward unchanged — no new switch case was added.
    expect(humanizeFieldError('endTime', SHIFT_TOO_LONG_MSG)).toBe(SHIFT_TOO_LONG_MSG);
    expect(humanizeFieldError('endTime', SLEEP_TOO_LONG_MSG)).toBe(SLEEP_TOO_LONG_MSG);
  });
});

// ── validateLogShiftForm ─────────────────────────────────────────────────────

describe('validateLogShiftForm', () => {
  test('happy path validates and coerces commute', () => {
    const result = validateLogShiftForm(shiftInput({ commuteMinutes: '45' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.commuteMinutes).toBe(45);
      expect(result.value.shiftDate).toBe('2026-06-16');
    }
  });

  test('empty commute defaults to 0 (matches the previous parseInt-or-0 behaviour)', () => {
    const result = validateLogShiftForm(shiftInput({ commuteMinutes: '' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.commuteMinutes).toBe(0);
    }
  });

  // Work-item case: commute 9999 → 'Commute must be 0-180 minutes'
  test('commute 9999 surfaces "Commute must be 0-180 minutes"', () => {
    const result = validateLogShiftForm(shiftInput({ commuteMinutes: '9999' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.commuteMinutes).toBe('Commute must be 0-180 minutes');
    }
  });

  test('non-numeric commute is rejected', () => {
    const result = validateLogShiftForm(shiftInput({ commuteMinutes: 'lots' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.commuteMinutes).toBe('Commute must be 0-180 minutes');
    }
  });

  test('malformed shift date is rejected with friendly copy', () => {
    const result = validateLogShiftForm(shiftInput({ shiftDate: '2026-13-01' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.shiftDate).toBe('Enter a real date (YYYY-MM-DD)');
    }
  });

  test('malformed start/end times are rejected independently', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '9:00', endTime: '25:00' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.startTime).toBeDefined();
      expect(result.fieldErrors.endTime).toBeDefined();
    }
  });

  test('unknown shift type is rejected', () => {
    const result = validateLogShiftForm(shiftInput({ shiftType: 'INVALID' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.shiftType).toBe('Pick a shift type');
    }
  });

  // ── additive guards: overnight / end-before-start / zero-length ────────────

  test('overnight shift (19:00 → 07:00) still passes — end before start is legitimate', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '19:00', endTime: '07:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  test('normal same-day shift (07:00 → 15:00) still passes', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '07:00', endTime: '15:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  test('zero-length shift (start === end) is rejected with the dedicated message', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '09:00', endTime: '09:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).toBe(SHIFT_ZERO_LENGTH_MSG);
    }
  });

  test('malformed time skips the ordering check (only the format error shows)', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '09:00', endTime: 'oops' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).toBe('Enter a time as HH:MM (24-hour)');
    }
  });

  // ── additive guard: implausible future date ────────────────────────────────

  test('a shift date well in the future is rejected with a humanized message', () => {
    const result = validateLogShiftForm(
      shiftInput({ shiftDate: '2062-06-17' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.shiftDate).toBe(SHIFT_FUTURE_DATE_MSG);
    }
  });

  test('a shift date just past the tolerance is rejected', () => {
    // NOW = 2026-06-17, tolerance = 2 days → 2026-06-20 is one day too far.
    const result = validateLogShiftForm(
      shiftInput({ shiftDate: '2026-06-20' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.shiftDate).toBe(SHIFT_FUTURE_DATE_MSG);
    }
  });

  test('a shift date within the small future tolerance still passes (pre-logging an upcoming shift)', () => {
    const result = validateLogShiftForm(
      shiftInput({ shiftDate: '2026-06-19' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  test('a malformed date surfaces the format error, not the future-date message', () => {
    const result = validateLogShiftForm(
      shiftInput({ shiftDate: '2026-13-01' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.shiftDate).toBe('Enter a real date (YYYY-MM-DD)');
    }
  });

  // ── additive guard: upper duration bound (<= 24h) ──────────────────────────

  test('MAX_SHIFT_HOURS is 24', () => {
    expect(MAX_SHIFT_HOURS).toBe(24);
  });

  // Re-assert the work-item happy paths under a pinned now: the new bound must
  // not touch them.
  test('overnight 19:00 → 07:00 (12h) still passes under the duration bound', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '19:00', endTime: '07:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  test('same-day 07:00 → 15:00 (8h) still passes under the duration bound', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '07:00', endTime: '15:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  // A shift has a single date with the end rolled forward at most +24h on an
  // overnight, so the rolled span is mathematically capped below 24h for every
  // valid HH:MM pair (the maximal overnight, e.g. 00:01 → 00:00, is 23h59m).
  // The bound therefore future-proofs the rolled value rather than rejecting any
  // currently-reachable input — these two cases prove it does NOT over-clamp the
  // near-24h edge and the rationale's own 19:00 → 18:59 example.
  test('the maximal overnight span (00:01 → 00:00, 23h59m) stays valid — not over-clamped', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '00:01', endTime: '00:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Guard against a future regression that wrongly clamps the legitimate edge.
      expect(result.fieldErrors.endTime).not.toBe(SHIFT_TOO_LONG_MSG);
    }
  });

  test('the rationale 19:00 → 18:59 "overnight" edge (23h59m) stays valid, not flagged too-long', () => {
    const result = validateLogShiftForm(
      shiftInput({ startTime: '19:00', endTime: '18:59' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).not.toBe(SHIFT_TOO_LONG_MSG);
    }
  });
});

// ── validateLogSleepForm ─────────────────────────────────────────────────────

describe('validateLogSleepForm', () => {
  test('happy path validates same-day sleep', () => {
    const result = validateLogSleepForm(
      sleepInput({ startTime: '01:00', endTime: '08:00' }),
    );
    expect(result.ok).toBe(true);
  });

  // Work-item case: sleep start at 23:00 / end at 22:00 same day → does NOT
  // error (overnight rolls in the mutationFn).
  test('sleep start 23:00 / end 22:00 same day passes validation (overnight rolls)', () => {
    const result = validateLogSleepForm(
      sleepInput({ startTime: '23:00', endTime: '22:00' }),
    );
    expect(result.ok).toBe(true);
  });

  // Work-item case: sleep start equal to end → 'Sleep start must be before
  // sleep end'.
  test('sleep start equal to end surfaces "Sleep start must be before sleep end"', () => {
    const result = validateLogSleepForm(
      sleepInput({ startTime: '23:00', endTime: '23:00' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).toBe('Sleep start must be before sleep end');
    }
  });

  test('end day before start day is rejected', () => {
    const result = validateLogSleepForm(
      sleepInput({ startDay: '2026-06-16', endDay: '2026-06-15' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endDay).toBe(
        'Sleep end day cannot be before sleep start day',
      );
    }
  });

  test('quality out of range is rejected', () => {
    const result = validateLogSleepForm(sleepInput({ quality: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.quality).toBe('Quality must be between 1 and 10');
    }

    const result2 = validateLogSleepForm(sleepInput({ quality: 11 }));
    expect(result2.ok).toBe(false);
  });

  test('disturbances out of range is rejected', () => {
    const result = validateLogSleepForm(sleepInput({ disturbances: 51 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.disturbances).toBe('Wake-ups must be between 0 and 50');
    }

    const result2 = validateLogSleepForm(sleepInput({ disturbances: -1 }));
    expect(result2.ok).toBe(false);
  });

  test('notes over 1000 chars are rejected', () => {
    const result = validateLogSleepForm(sleepInput({ notes: 'x'.repeat(1001) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.notes).toBe('Notes are limited to 1000 characters');
    }
  });

  test('notes at exactly 1000 chars pass', () => {
    const result = validateLogSleepForm(sleepInput({ notes: 'x'.repeat(1000) }));
    expect(result.ok).toBe(true);
  });

  test('malformed time skips the range check (errors stay on the format field)', () => {
    // If startTime is not HH:MM the range check would parse NaN and
    // possibly surface a misleading "Sleep start must be before sleep end".
    // We want the user to see ONLY the format error and fix that first.
    const result = validateLogSleepForm(sleepInput({ startTime: 'oops' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.startTime).toBeDefined();
      expect(result.fieldErrors.endTime).toBeUndefined();
    }
  });

  // ── additive guards: future days / future wake-time ────────────────────────

  test('the default overnight sleep logged "this morning" still passes with a pinned now', () => {
    // start 2026-06-16 23:00 → end 2026-06-16 07:00 rolls to 2026-06-17, which
    // equals NOW's day — comfortably inside the tolerance.
    const result = validateLogSleepForm(sleepInput(), { now: NOW });
    expect(result.ok).toBe(true);
  });

  test('a start day well in the future is rejected with a humanized message', () => {
    const result = validateLogSleepForm(
      sleepInput({ startDay: '2062-06-16', endDay: '2062-06-16' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.startDay).toBe(SLEEP_FUTURE_DAY_MSG);
    }
  });

  test('an end day just past the tolerance is rejected', () => {
    // NOW = 2026-06-17, tolerance = 2 → 2026-06-20 is one day too far. Use a
    // non-overnight (later) end time so endDay is taken at face value.
    const result = validateLogSleepForm(
      sleepInput({
        startDay: '2026-06-20',
        endDay: '2026-06-20',
        startTime: '01:00',
        endTime: '08:00',
      }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Both days are out of tolerance; assert the one the user is most likely
      // editing surfaced a humanized future message.
      expect(result.fieldErrors.startDay).toBe(SLEEP_FUTURE_DAY_MSG);
      expect(result.fieldErrors.endDay).toBe(SLEEP_FUTURE_DAY_MSG);
    }
  });

  test('a day within the small future tolerance still passes', () => {
    const result = validateLogSleepForm(
      sleepInput({
        startDay: '2026-06-18',
        endDay: '2026-06-18',
        startTime: '01:00',
        endTime: '08:00',
      }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  test('an overnight sleep whose rolled-forward end lands well in the future is rejected on endTime', () => {
    // Same future day for start+end, overnight (end <= start) so it rolls one
    // more day forward. Both days are within tolerance individually here so the
    // day guards stay quiet and the effective-end guard is what fires.
    const result = validateLogSleepForm(
      sleepInput({
        startDay: '2026-06-19',
        endDay: '2026-06-19',
        startTime: '23:00',
        endTime: '07:00', // rolls effective end to 2026-06-20 → > tolerance
      }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).toBe(SLEEP_FUTURE_END_MSG);
      // Day-level guards did NOT fire (2026-06-19 is exactly at tolerance).
      expect(result.fieldErrors.startDay).toBeUndefined();
      expect(result.fieldErrors.endDay).toBeUndefined();
    }
  });

  test('a malformed start day surfaces the format error, not the future-day message', () => {
    const result = validateLogSleepForm(
      sleepInput({ startDay: '2026-13-01' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.startDay).toBe('Enter a real date (YYYY-MM-DD)');
    }
  });

  test('overnight roll-forward semantics are preserved (23:00 → 22:00 same day still valid)', () => {
    // Re-assert the pre-existing valid case under a pinned now to prove the new
    // future guards did not regress it.
    const result = validateLogSleepForm(
      sleepInput({ startTime: '23:00', endTime: '22:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  // ── additive guard: upper duration bound (<= 24h) ──────────────────────────

  test('MAX_SLEEP_HOURS is 24', () => {
    expect(MAX_SLEEP_HOURS).toBe(24);
  });

  // Work-item case: a multi-day span (startDay 2026-06-16 23:00 → endDay
  // 2026-06-18 06:00, ~31h) is rejected on endTime with SLEEP_TOO_LONG_MSG.
  // endDay is only +1 day from NOW (2026-06-17), inside MAX_FUTURE_DAYS=2, so
  // neither the future-day nor future-wake guard fires — the duration bound is
  // what catches it.
  test('a >24h sleep (~31h across two days) is rejected on endTime with SLEEP_TOO_LONG_MSG', () => {
    const result = validateLogSleepForm(
      sleepInput({
        startDay: '2026-06-16',
        startTime: '23:00',
        endDay: '2026-06-18',
        endTime: '06:00',
      }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).toBe(SLEEP_TOO_LONG_MSG);
      // The day-level and future-wake guards stayed quiet (endDay is within
      // tolerance), so the too-long message is the one that surfaced.
      expect(result.fieldErrors.startDay).toBeUndefined();
      expect(result.fieldErrors.endDay).toBeUndefined();
    }
  });

  // Re-assert the work-item happy paths under a pinned now: the default
  // overnight 23:00 → 07:00 (~8h) and same-day 01:00 → 08:00 (7h) must stay
  // valid under the new bound.
  test('the default overnight 23:00 → 07:00 sleep (~8h) still passes under the duration bound', () => {
    const result = validateLogSleepForm(sleepInput(), { now: NOW });
    expect(result.ok).toBe(true);
  });

  test('a same-day 01:00 → 08:00 sleep (7h) still passes under the duration bound', () => {
    const result = validateLogSleepForm(
      sleepInput({ startTime: '01:00', endTime: '08:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  test('a zero-length sleep still wins the dedicated message over the too-long bound', () => {
    // Priority check: when start === end the zero-length copy must surface, not
    // the duration bound (which only fires once endTime is otherwise clean).
    const result = validateLogSleepForm(
      sleepInput({ startTime: '23:00', endTime: '23:00' }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.endTime).toBe('Sleep start must be before sleep end');
    }
  });
});

// ── fieldErrorsFromAxiosError ────────────────────────────────────────────────

describe('fieldErrorsFromAxiosError', () => {
  test('extracts paths from a Zod ValidationError 400 and humanizes them', () => {
    const err = {
      response: {
        status: 400,
        data: {
          error: 'ValidationError',
          details: [
            { path: ['commuteMinutes'], message: 'Too big' },
            { path: ['shiftDate'], message: 'Bad date' },
          ],
        },
      },
    };
    expect(fieldErrorsFromAxiosError(err)).toEqual({
      commuteMinutes: 'Commute must be 0-180 minutes',
      shiftDate: 'Enter a real date (YYYY-MM-DD)',
    });
  });

  test('flattens nested paths to the leaf field name', () => {
    const err = {
      response: {
        status: 400,
        data: {
          error: 'ValidationError',
          details: [{ path: ['body', 'quality'], message: 'Out of range' }],
        },
      },
    };
    expect(fieldErrorsFromAxiosError(err)).toEqual({
      quality: 'Quality must be between 1 and 10',
    });
  });

  test('returns null for non-400 errors', () => {
    expect(
      fieldErrorsFromAxiosError({
        response: { status: 500, data: { error: 'InternalError' } },
      }),
    ).toBeNull();
  });

  test('returns null for malformed payloads', () => {
    expect(fieldErrorsFromAxiosError(null)).toBeNull();
    expect(fieldErrorsFromAxiosError(undefined)).toBeNull();
    expect(fieldErrorsFromAxiosError({})).toBeNull();
    expect(
      fieldErrorsFromAxiosError({
        response: { status: 400, data: { error: 'ValidationError', details: [] } },
      }),
    ).toBeNull();
  });
});
