/**
 * Tests for src/lib/nextShift.ts — the pure "next upcoming shift" selection +
 * countdown formatting helpers backing the dashboard's NextShiftCard.
 *
 *   - getNextShift(shifts, now)  → the shift whose startTime is the soonest
 *                                  instant STRICTLY AFTER `now`, or null.
 *   - formatStartsIn(target, now)→ the absolute-instant "Xh Ym" countdown, or
 *                                  null when target is not in the future.
 *
 * Both are pure (no React / native / network / implicit Date.now), so they need
 * no mocks. `now` is always injected, so every case is deterministic regardless
 * of the runner's timezone. Timestamps are expressed in UTC.
 *
 * Acceptance coverage:
 *   - empty list → null
 *   - all-past → null
 *   - picks the EARLIEST future among several (order-independent)
 *   - skips '' / 'garbage' / Invalid-Date startTime WITHOUT throwing
 *   - deterministic for a fixed injected `now`
 */
import { getNextShift, formatStartsIn, type ShiftLike } from '@/lib/nextShift';

const HOUR = 3_600_000;
// A fixed reference "now" so every assertion is deterministic and tz-portable.
const NOW = new Date('2026-06-13T12:00:00.000Z');

/** Build a ShiftLike `hours` from NOW (negative = in the past). */
function shiftAt(hoursFromNow: number, type = 'day'): ShiftLike {
  return { type, startTime: new Date(NOW.getTime() + hoursFromNow * HOUR).toISOString() };
}

describe('getNextShift', () => {
  test('empty list → null', () => {
    expect(getNextShift([], NOW)).toBeNull();
  });

  test('null / undefined input → null (never throws)', () => {
    expect(getNextShift(null, NOW)).toBeNull();
    expect(getNextShift(undefined, NOW)).toBeNull();
  });

  test('all-past shifts → null', () => {
    const shifts = [shiftAt(-48), shiftAt(-12), shiftAt(-1)];
    expect(getNextShift(shifts, NOW)).toBeNull();
  });

  test('a shift starting exactly at `now` is NOT upcoming (strictly after)', () => {
    // startTime === now → excluded; the +2h shift is the only future one.
    const atNow: ShiftLike = { type: 'now', startTime: NOW.toISOString() };
    const future = shiftAt(2, 'future');
    const picked = getNextShift([atNow, future], NOW);
    expect(picked).toBe(future);
  });

  test('picks the EARLIEST future shift among several (input order shuffled)', () => {
    const soon = shiftAt(2, 'soon'); // +2h — the answer
    const later = shiftAt(10, 'later'); // +10h
    const past = shiftAt(-5, 'past'); // already started
    const muchLater = shiftAt(72, 'muchLater'); // +3d
    // Deliberately NOT in chronological order to prove selection, not "first".
    const picked = getNextShift([later, past, muchLater, soon], NOW);
    expect(picked).toBe(soon);
    expect(picked?.type).toBe('soon');
  });

  test('returns the exact same reference object from the input array', () => {
    const soon = shiftAt(3, 'soon');
    const picked = getNextShift([shiftAt(-1), soon, shiftAt(20)], NOW);
    // Identity, not a copy — callers read .type/.startTime off the live object.
    expect(picked).toBe(soon);
  });

  describe('malformed startTimes are skipped without throwing', () => {
    test("skips '' / 'garbage' / Invalid-Date and still returns the valid future shift", () => {
      const good = shiftAt(4, 'good');
      const bad: ShiftLike[] = [
        { type: 'empty', startTime: '' },
        { type: 'blank', startTime: '   ' },
        { type: 'garbage', startTime: 'garbage' },
        { type: 'notdate', startTime: 'not-a-date' },
        // an explicitly Invalid Date's ISO-ish string
        { type: 'invalid', startTime: 'Invalid Date' },
      ];
      let picked: ShiftLike | null = null;
      expect(() => {
        picked = getNextShift([...bad, good], NOW);
      }).not.toThrow();
      expect(picked).toBe(good);
    });

    test('a list of ONLY malformed shifts → null (no throw)', () => {
      const bad: ShiftLike[] = [
        { type: 'a', startTime: '' },
        { type: 'b', startTime: 'garbage' },
        { type: 'c', startTime: 'Invalid Date' },
      ];
      expect(() => getNextShift(bad, NOW)).not.toThrow();
      expect(getNextShift(bad, NOW)).toBeNull();
    });

    test('a missing startTime field (partial object) is skipped, not fatal', () => {
      // Bypass the compile-time type to simulate a malformed API row.
      const partial = { type: 'partial' } as unknown as ShiftLike;
      const good = shiftAt(6, 'good');
      expect(() => getNextShift([partial, good], NOW)).not.toThrow();
      expect(getNextShift([partial, good], NOW)).toBe(good);
    });
  });

  test('is deterministic — repeated calls with the same fixed `now` return the same shift', () => {
    const shifts = [shiftAt(8), shiftAt(2), shiftAt(-3), shiftAt(40)];
    const a = getNextShift(shifts, NOW);
    const b = getNextShift(shifts, NOW);
    expect(a).toBe(b);
    expect(a?.startTime).toBe(shiftAt(2).startTime);
  });

  test('handles an overnight shift whose ISO crosses midnight (absolute-instant)', () => {
    // start 22:00 → its instant is +10h from a noon `now`, comfortably future.
    const overnight: ShiftLike = { type: 'night', startTime: '2026-06-13T22:00:00.000Z' };
    expect(getNextShift([overnight], NOW)).toBe(overnight);
  });
});

describe('formatStartsIn', () => {
  test('formats hours+minutes as "Xh Ym"', () => {
    const target = new Date(NOW.getTime() + (7 * 60 + 20) * 60_000); // +7h20m
    expect(formatStartsIn(target, NOW)).toBe('7h 20m');
  });

  test('floors sub-minute remainder (same math as the dashboard getCountdown)', () => {
    // +2h 5m 59s → floors to 2h 5m.
    const target = new Date(NOW.getTime() + 2 * HOUR + 5 * 60_000 + 59_000);
    expect(formatStartsIn(target, NOW)).toBe('2h 5m');
  });

  test('sub-hour windows render as "0h Ym"', () => {
    const target = new Date(NOW.getTime() + 45 * 60_000);
    expect(formatStartsIn(target, NOW)).toBe('0h 45m');
  });

  test('a target at or before `now` → null (nothing to count down to)', () => {
    expect(formatStartsIn(NOW, NOW)).toBeNull();
    expect(formatStartsIn(new Date(NOW.getTime() - HOUR), NOW)).toBeNull();
  });

  test('an Invalid Date target/now → null (never NaN)', () => {
    expect(formatStartsIn(new Date('garbage'), NOW)).toBeNull();
    expect(formatStartsIn(new Date(NOW.getTime() + HOUR), new Date('garbage'))).toBeNull();
  });
});
