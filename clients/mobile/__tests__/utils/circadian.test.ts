/**
 * Tests for the pure circadian helpers in src/utils/circadian.ts.
 *
 * This module is a standalone, dependency-free set of pure functions (every
 * output is derived solely from the arguments — no hidden module state, no
 * network/native/React, only an optional `now` default). That makes it ideal
 * for exhaustive golden + edge testing with NO mocks.
 *
 * Two complementary jobs here:
 *
 *   1. GOLDEN equality — for a battery of VALID inputs the functions must return
 *      EXACTLY what the underlying (unguarded) arithmetic produces. The expected
 *      values below are recomputed from the literal formulas (e.g. wake + 14h,
 *      a cos sinusoid centred on 14:00) rather than copied from the
 *      implementation, so they independently pin the math and would catch any
 *      accidental behaviour change introduced alongside the edge guards.
 *
 *   2. EDGE bounding — malformed inputs that can reach these helpers from
 *      upstream (unparseable dates → NaN epochs, a zero-length shift → divide by
 *      zero, a negative / zero / huge mealCount, a NaN/Infinity ms) must yield a
 *      FINITE, in-range, non-explosive result: never NaN, never Infinity, never
 *      an unbounded array, never a `new Date(NaN)`.
 *
 * All timestamps are UTC so the absolute-instant arithmetic is deterministic
 * regardless of the machine timezone. Cases that read wall-clock fields
 * (getHours/getMinutes in estimateAlertness) are constructed from explicit local
 * components so they are timezone-stable too.
 */
import {
    getShiftPhase,
    estimateMelatoninOnset,
    estimateCortisolPeak,
    calculateCaffeineCutoff,
    getOptimalMealWindows,
    formatTimeRemaining,
    estimateAlertness,
} from '@/utils/circadian';

const HOUR = 3_600_000;
const MIN = 60_000;

/** Assert a Date is real (an instance with a finite, non-NaN epoch). */
function expectValidDate(d: Date): void {
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
}

describe('getShiftPhase', () => {
    // --- GOLDEN: valid day shift (07:00 → 19:00 UTC, 12h) -------------------
    describe('day shift 07:00 → 19:00 UTC (golden)', () => {
        const START = '2026-01-02T07:00:00.000Z';
        const END = '2026-01-02T19:00:00.000Z';

        test('before start → pre-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T06:59:00.000Z'))).toBe('pre-shift');
        });
        test('after end → post-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T19:01:00.000Z'))).toBe('post-shift');
        });
        test('progress < 0.25 → early-shift (08:00, 1/12)', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T08:00:00.000Z'))).toBe('early-shift');
        });
        test('progress just under 0.25 boundary → early-shift', () => {
            // 0.25 * 12h = 3h → 09:59:59 is still < 0.25
            expect(getShiftPhase(START, END, new Date('2026-01-02T09:59:59.000Z'))).toBe('early-shift');
        });
        test('progress at 0.25 boundary → mid-shift (10:00)', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T10:00:00.000Z'))).toBe('mid-shift');
        });
        test('progress at 0.5 → mid-shift (13:00)', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T13:00:00.000Z'))).toBe('mid-shift');
        });
        test('progress at 0.75 boundary → late-shift (16:00)', () => {
            // 0.75 * 12h = 9h → 16:00 is NOT < 0.75 → late
            expect(getShiftPhase(START, END, new Date('2026-01-02T16:00:00.000Z'))).toBe('late-shift');
        });
        test('exactly at end → late-shift (current === end, not > end)', () => {
            expect(getShiftPhase(START, END, new Date(END))).toBe('late-shift');
        });
        test('accepts Date objects as well as ISO strings', () => {
            expect(getShiftPhase(new Date(START), new Date(END), new Date('2026-01-02T13:00:00.000Z'))).toBe('mid-shift');
        });
    });

    // --- WRAP-AROUND: overnight shift crossing midnight --------------------
    describe('overnight shift 22:00 → 06:00 next day (wrap-around)', () => {
        const START = '2026-01-02T22:00:00.000Z';
        const END = '2026-01-03T06:00:00.000Z'; // +8h, next calendar day

        test('one hour in (23:00, 1/8) → early-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T23:00:00.000Z'))).toBe('early-shift');
        });
        test('past midnight, half way (02:00 next day, 4/8) → mid-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-03T02:00:00.000Z'))).toBe('mid-shift');
        });
        test('past midnight, near end (05:30 next day, 7.5/8) → late-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-03T05:30:00.000Z'))).toBe('late-shift');
        });
        test('before the (previous-evening) start → pre-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-02T21:00:00.000Z'))).toBe('pre-shift');
        });
        test('after the (next-morning) end → post-shift', () => {
            expect(getShiftPhase(START, END, new Date('2026-01-03T07:00:00.000Z'))).toBe('post-shift');
        });
    });

    // --- EDGE: malformed / degenerate inputs -------------------------------
    describe('edge cases', () => {
        const VALID = '2026-01-02T07:00:00.000Z';

        test('zero-length shift (start === end) → late-shift, never NaN', () => {
            const t = '2026-01-02T12:00:00.000Z';
            // current === start === end (passes both < start / > end guards),
            // duration 0 would divide-by-zero → must resolve deterministically.
            const phase = getShiftPhase(t, t, new Date(t));
            expect(phase).toBe('late-shift');
        });

        test('inverted shift (end before start), now between → late-shift', () => {
            const start = '2026-01-02T19:00:00.000Z';
            const end = '2026-01-02T07:00:00.000Z';
            // now <= end? 06:00 < 07:00(end) is not > end, and 06:00 < 19:00(start)
            // so it is caught by the pre-shift guard.
            expect(getShiftPhase(start, end, new Date('2026-01-02T06:00:00.000Z'))).toBe('pre-shift');
            // now strictly between end and start → not < start? 10:00 < 19:00 → pre-shift
            expect(getShiftPhase(start, end, new Date('2026-01-02T10:00:00.000Z'))).toBe('pre-shift');
        });

        test('unparseable start → pre-shift sentinel (not NaN compare)', () => {
            expect(getShiftPhase('not-a-date', VALID, new Date(VALID))).toBe('pre-shift');
        });
        test('unparseable end → pre-shift sentinel', () => {
            expect(getShiftPhase(VALID, 'garbage', new Date(VALID))).toBe('pre-shift');
        });
        test('Invalid Date object for now → pre-shift sentinel', () => {
            expect(getShiftPhase(VALID, '2026-01-02T19:00:00.000Z', new Date(NaN))).toBe('pre-shift');
        });

        test('always returns a member of the ShiftPhase union (never NaN/undefined)', () => {
            const phases: ReadonlyArray<string> = [
                'pre-shift', 'early-shift', 'mid-shift', 'late-shift', 'post-shift', 'sleep-window',
            ];
            const samples: Array<[string, string, Date]> = [
                ['not-a-date', 'x', new Date(NaN)],
                [VALID, VALID, new Date(VALID)],
                [VALID, '2026-01-02T19:00:00.000Z', new Date('2026-01-02T13:00:00.000Z')],
            ];
            for (const [s, e, n] of samples) {
                expect(phases).toContain(getShiftPhase(s, e, n));
            }
        });
    });
});

describe('estimateMelatoninOnset / estimateCortisolPeak / calculateCaffeineCutoff (golden offsets)', () => {
    const WAKE = '2026-01-02T07:00:00.000Z';
    const wakeMs = new Date(WAKE).getTime();

    test('melatonin onset is wake + 14h', () => {
        const out = estimateMelatoninOnset(WAKE);
        expectValidDate(out);
        expect(out.getTime()).toBe(wakeMs + 14 * HOUR);
    });
    test('cortisol peak is wake + 30 min', () => {
        const out = estimateCortisolPeak(WAKE);
        expectValidDate(out);
        expect(out.getTime()).toBe(wakeMs + 30 * MIN);
    });
    test('caffeine cutoff is target sleep - 8h', () => {
        const SLEEP = '2026-01-02T23:00:00.000Z';
        const out = calculateCaffeineCutoff(SLEEP);
        expectValidDate(out);
        expect(out.getTime()).toBe(new Date(SLEEP).getTime() - 8 * HOUR);
    });
    test('accepts Date objects identically to ISO strings', () => {
        expect(estimateMelatoninOnset(new Date(WAKE)).getTime()).toBe(wakeMs + 14 * HOUR);
        expect(estimateCortisolPeak(new Date(WAKE)).getTime()).toBe(wakeMs + 30 * MIN);
    });
});

describe('getOptimalMealWindows', () => {
    // --- GOLDEN: valid day shift, default + explicit counts ----------------
    describe('day shift 07:00 → 19:00 UTC (golden spacing)', () => {
        const START = '2026-01-02T07:00:00.000Z';
        const END = '2026-01-02T19:00:00.000Z';
        const startMs = new Date(START).getTime();
        const DURATION = new Date(END).getTime() - startMs; // 12h

        test('default 3 meals are evenly spaced at interval = duration/4', () => {
            const out = getOptimalMealWindows(START, END);
            expect(out).toHaveLength(3);
            const interval = DURATION / 4; // 3h
            expect(out[0]!.getTime()).toBe(startMs + interval * 1); // 10:00
            expect(out[1]!.getTime()).toBe(startMs + interval * 2); // 13:00
            expect(out[2]!.getTime()).toBe(startMs + interval * 3); // 16:00
            out.forEach(expectValidDate);
        });

        test('explicit mealCount = 5 → 5 windows at duration/6 spacing', () => {
            const out = getOptimalMealWindows(START, END, 5);
            expect(out).toHaveLength(5);
            const interval = DURATION / 6;
            out.forEach((d, i) => expect(d.getTime()).toBe(startMs + interval * (i + 1)));
            out.forEach(expectValidDate);
        });

        test('mealCount = 1 → single window at the midpoint (duration/2)', () => {
            const out = getOptimalMealWindows(START, END, 1);
            expect(out).toHaveLength(1);
            expect(out[0]!.getTime()).toBe(startMs + DURATION / 2); // 13:00
        });
    });

    // --- WRAP-AROUND: overnight meal windows cross midnight ----------------
    test('overnight shift meal windows cross midnight correctly', () => {
        const START = '2026-01-02T22:00:00.000Z';
        const END = '2026-01-03T06:00:00.000Z'; // +8h
        const startMs = new Date(START).getTime();
        const out = getOptimalMealWindows(START, END, 3);
        expect(out).toHaveLength(3);
        const interval = 8 * HOUR / 4; // 2h
        expect(out[0]!.getTime()).toBe(startMs + interval * 1); // 00:00 next day
        expect(out[1]!.getTime()).toBe(startMs + interval * 2); // 02:00 next day
        expect(out[2]!.getTime()).toBe(startMs + interval * 3); // 04:00 next day
        // Sanity: the windows actually landed on the next calendar day.
        expect(out[0]!.toISOString()).toBe('2026-01-03T00:00:00.000Z');
        out.forEach(expectValidDate);
    });

    // --- EDGE: malformed mealCount / dates ---------------------------------
    describe('edge cases', () => {
        const START = '2026-01-02T07:00:00.000Z';
        const END = '2026-01-02T19:00:00.000Z';

        test('mealCount = 0 → empty array', () => {
            expect(getOptimalMealWindows(START, END, 0)).toEqual([]);
        });
        test('mealCount = -1 (negative) → empty array, never an explosive/negative-length array', () => {
            expect(getOptimalMealWindows(START, END, -1)).toEqual([]);
        });
        test('mealCount = 9999 (huge) → clamped to MAX (12), bounded array of valid Dates', () => {
            const out = getOptimalMealWindows(START, END, 9999);
            expect(out).toHaveLength(12);
            expect(out.length).toBeLessThanOrEqual(12);
            out.forEach(expectValidDate);
        });
        test('fractional mealCount is floored (2.9 → 2)', () => {
            expect(getOptimalMealWindows(START, END, 2.9)).toHaveLength(2);
        });
        test('NaN mealCount → empty array (Math.floor(NaN) → NaN → clamp 0)', () => {
            expect(getOptimalMealWindows(START, END, Number.NaN)).toEqual([]);
        });
        test('unparseable start date → empty array, never new Date(NaN) entries', () => {
            const out = getOptimalMealWindows('not-a-date', END, 3);
            expect(out).toEqual([]);
        });
        test('unparseable end date → empty array', () => {
            expect(getOptimalMealWindows(START, 'garbage', 3)).toEqual([]);
        });
        test('every produced window is always a valid (non-NaN) Date across counts', () => {
            for (const count of [1, 3, 7, 12, 9999]) {
                const out = getOptimalMealWindows(START, END, count);
                expect(out.length).toBeLessThanOrEqual(12);
                out.forEach((d) => expect(Number.isFinite(d.getTime())).toBe(true));
            }
        });
    });
});

describe('formatTimeRemaining', () => {
    // --- GOLDEN: valid millisecond spans -----------------------------------
    test('hours + minutes', () => {
        expect(formatTimeRemaining(2 * HOUR + 15 * MIN)).toBe('2h 15m');
    });
    test('exactly one hour → "1h 0m"', () => {
        expect(formatTimeRemaining(HOUR)).toBe('1h 0m');
    });
    test('sub-hour → minutes only', () => {
        expect(formatTimeRemaining(45 * MIN)).toBe('45m');
    });
    test('floors partial minutes', () => {
        expect(formatTimeRemaining(90 * 1000 + 30 * 1000)).toBe('2m'); // 2m 0s → 2m
        expect(formatTimeRemaining(59 * 1000)).toBe('0m'); // < 1 min, but > 0 → 0m
    });

    // --- EDGE: non-positive / non-finite -----------------------------------
    test('zero → "0m"', () => {
        expect(formatTimeRemaining(0)).toBe('0m');
    });
    test('negative → "0m"', () => {
        expect(formatTimeRemaining(-5000)).toBe('0m');
    });
    test('NaN → "0m" (never "NaNh NaNm")', () => {
        const out = formatTimeRemaining(Number.NaN);
        expect(out).toBe('0m');
        expect(out).not.toContain('NaN');
    });
    test('Infinity → "0m" (never "Infinityh")', () => {
        const out = formatTimeRemaining(Number.POSITIVE_INFINITY);
        expect(out).toBe('0m');
        expect(out).not.toContain('Infinity');
    });
    test('-Infinity → "0m"', () => {
        expect(formatTimeRemaining(Number.NEGATIVE_INFINITY)).toBe('0m');
    });
});

describe('estimateAlertness', () => {
    // --- GOLDEN: sinusoid centred on 14:00, clamped [0,100] ----------------
    // raw = round(clamp(cos(((h-14)/24)*2π) * 50 + 50, 0, 100))
    const golden = (h: number, m = 0): number => {
        const hour = h + m / 60;
        const radians = ((hour - 14) / 24) * 2 * Math.PI;
        return Math.round(Math.max(0, Math.min(100, Math.cos(radians) * 50 + 50)));
    };

    // Build a Date with explicit LOCAL wall-clock components so getHours/
    // getMinutes are timezone-stable (estimateAlertness reads local fields).
    const at = (h: number, m = 0): Date => new Date(2026, 0, 2, h, m, 0, 0);

    test('peak near 14:00 (2 PM) ≈ 100', () => {
        expect(estimateAlertness(at(14))).toBe(golden(14));
        expect(estimateAlertness(at(14))).toBe(100);
    });
    test('trough near 02:00 ≈ 0', () => {
        expect(estimateAlertness(at(2))).toBe(golden(2));
        expect(estimateAlertness(at(2))).toBe(0);
    });
    test('matches the golden sinusoid across the full day', () => {
        for (let h = 0; h < 24; h++) {
            expect(estimateAlertness(at(h))).toBe(golden(h));
        }
    });
    test('honours minutes (14:30)', () => {
        expect(estimateAlertness(at(14, 30))).toBe(golden(14, 30));
    });
    test('output is always an integer in [0,100] for valid times', () => {
        for (let h = 0; h < 24; h++) {
            const v = estimateAlertness(at(h));
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
        }
    });

    // --- EDGE: invalid now -------------------------------------------------
    test('Invalid Date → neutral 50 (never NaN)', () => {
        const v = estimateAlertness(new Date(NaN));
        expect(v).toBe(50);
        expect(Number.isNaN(v)).toBe(false);
    });
});
