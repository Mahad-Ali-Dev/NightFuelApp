/**
 * calculateAge() correctness suite — locks the age-from-DOB logic that feeds
 * BMR/TDEE/calorie targets (src/user.service.ts:recalc path → calculateBMR).
 *
 * Background: calculateAge() previously derived age by reinterpreting an
 * elapsed-duration epoch as a calendar year
 * (`new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970`). Because that
 * duration accumulates the extra day from every intervening leap year, it
 * over-counts and yields an off-by-one on/near birthdays for anyone born after a
 * Feb 29 — silently corrupting every downstream BMR/TDEE/calorie figure. The fix
 * uses calendar-field math on the SAME UTC basis the DOB is stored with (the
 * `YYYY-MM-DD` profile field is parsed via `new Date(...)`, i.e. UTC midnight).
 *
 * Strategy: pin "now" with jest fake timers so each assertion is deterministic,
 * then assert exact integer ages across birthday boundaries — including the
 * leap-day-accumulation case (DOB 1952-03-01 viewed on 2027-03-01 -> 75) that
 * the old implementation got wrong.
 *
 * No DB / Redis / Fastify is touched — this is a pure unit suite over
 * src/utils/calculators.ts.
 */
import { calculateAge } from '../src/utils/calculators';

// DOB is stored/parsed on a UTC basis, so construct DOBs as UTC and freeze
// "now" as a UTC instant to mirror production exactly.
function utcDob(y: number, mZeroBased: number, d: number): Date {
    return new Date(Date.UTC(y, mZeroBased, d, 0, 0, 0, 0));
}
function freezeNowUTC(y: number, mZeroBased: number, d: number): void {
    jest.setSystemTime(new Date(Date.UTC(y, mZeroBased, d, 12, 0, 0, 0)));
}

describe('calculateAge() — calendar-field UTC age from DOB', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    // ── Regression: leap-day accumulation off-by-one ────────────────────────────
    // The prompt's canonical case. Born 1952-03-01 (the day AFTER a leap day),
    // viewed on the exact birthday 75 years later. The old duration-epoch math
    // over-counted accumulated leap days and returned 76 here.
    it('DOB 1952-03-01 viewed on 2027-03-01 -> 75 (leap-day accumulation regression)', () => {
        freezeNowUTC(2027, 2, 1); // 2027-03-01
        expect(calculateAge(utcDob(1952, 2, 1))).toBe(75);
    });

    // The day before that birthday must still be 74 (turns 75 the next day).
    it('DOB 1952-03-01 viewed on 2027-02-28 -> 74 (day before birthday)', () => {
        freezeNowUTC(2027, 1, 28); // 2027-02-28
        expect(calculateAge(utcDob(1952, 2, 1))).toBe(74);
    });

    // ── Birthday-boundary behaviour ────────────────────────────────────────────
    it('returns one less the day BEFORE the birthday', () => {
        freezeNowUTC(2026, 5, 19); // 2026-06-19
        expect(calculateAge(utcDob(2000, 5, 20))).toBe(25);
    });

    it('increments ON the birthday', () => {
        freezeNowUTC(2026, 5, 20); // 2026-06-20
        expect(calculateAge(utcDob(2000, 5, 20))).toBe(26);
    });

    it('stays incremented the day AFTER the birthday', () => {
        freezeNowUTC(2026, 5, 21); // 2026-06-21
        expect(calculateAge(utcDob(2000, 5, 20))).toBe(26);
    });

    // ── Month-boundary behaviour ───────────────────────────────────────────────
    it('returns one less when current month is before the birth month', () => {
        freezeNowUTC(2026, 0, 15); // 2026-01-15, birthday is in December
        expect(calculateAge(utcDob(1990, 11, 1))).toBe(35);
    });

    it('returns full years when current month is after the birth month', () => {
        freezeNowUTC(2026, 11, 15); // 2026-12-15, birthday was in January
        expect(calculateAge(utcDob(1990, 0, 1))).toBe(36);
    });

    // ── Leap-day-born edge ─────────────────────────────────────────────────────
    // Born on a Feb 29. In a non-leap year the birthday "lands" on Mar 1, but on
    // Feb 28 the person has not yet completed the year (Feb 28 < Feb 29).
    it('DOB 2000-02-29 viewed on 2026-02-28 -> 25 (not yet "had" the birthday)', () => {
        freezeNowUTC(2026, 1, 28); // 2026-02-28
        expect(calculateAge(utcDob(2000, 1, 29))).toBe(25);
    });

    it('DOB 2000-02-29 viewed on 2026-03-01 -> 26 (past the Feb 29 anchor)', () => {
        freezeNowUTC(2026, 2, 1); // 2026-03-01
        expect(calculateAge(utcDob(2000, 1, 29))).toBe(26);
    });

    // ── Sanity: returns a plain non-negative integer ───────────────────────────
    it('returns a whole-number, non-negative age', () => {
        freezeNowUTC(2026, 5, 20);
        const age = calculateAge(utcDob(1995, 3, 10));
        expect(Number.isInteger(age)).toBe(true);
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBe(31);
    });
});
