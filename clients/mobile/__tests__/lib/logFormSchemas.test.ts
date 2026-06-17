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
  humanizeFieldError,
  validateLogShiftForm,
  validateLogSleepForm,
  fieldErrorsFromAxiosError,
  type LogShiftFormInput,
  type LogSleepFormInput,
} from '@/lib/logFormSchemas';

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
