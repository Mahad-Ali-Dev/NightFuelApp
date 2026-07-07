// Tests for @nightfuel/dates inter-shift recovery-window helper.
// Every case fixes both shift boundaries at explicit UTC instants so the
// whole-hour gap (and therefore the classification) is deterministic
// regardless of the host machine's time zone. `shiftRecoveryGap` must be
// fail-safe: bad / reversed / absurd input returns the invalid sentinel and
// never throws.

import {
    shiftRecoveryGap,
    RECOVERY_CRITICAL_HOURS,
    RECOVERY_TIGHT_HOURS,
} from '../src/index';

describe('shiftRecoveryGap', () => {
    // (a) A 6h turnaround is below the 8h critical threshold — the headline
    // "quick return" fatigue case we want to surface.
    it("(a) a 6h gap is 'critical'", () => {
        const result = shiftRecoveryGap('2026-06-15T00:00:00Z', '2026-06-15T06:00:00Z');
        expect(result).toEqual({ hours: 6, classification: 'critical' });
    });

    // (b) Exactly 8h sits ON the critical boundary. Classification is
    // `hours < CRITICAL`, so 8h is NOT critical — it rolls up to 'tight'.
    it("(b) exactly 8h (the critical boundary) is 'tight', not 'critical'", () => {
        const result = shiftRecoveryGap('2026-06-15T00:00:00Z', '2026-06-15T08:00:00Z');
        expect(result).toEqual({ hours: RECOVERY_CRITICAL_HOURS, classification: 'tight' });
    });

    // (c) Exactly 11h sits ON the tight boundary. `hours < TIGHT` is false at
    // 11h, so it becomes 'adequate'.
    it("(c) exactly 11h (the tight boundary) is 'adequate', not 'tight'", () => {
        const result = shiftRecoveryGap('2026-06-15T00:00:00Z', '2026-06-15T11:00:00Z');
        expect(result).toEqual({ hours: RECOVERY_TIGHT_HOURS, classification: 'adequate' });
    });

    // (d) A comfortable 16h turnaround is firmly 'adequate'.
    it("(d) a 16h gap is 'adequate'", () => {
        const result = shiftRecoveryGap('2026-06-15T00:00:00Z', '2026-06-15T16:00:00Z');
        expect(result).toEqual({ hours: 16, classification: 'adequate' });
    });

    // (e) Sub-hour gaps floor toward zero whole hours and are 'critical'. The
    // 30-minute gap proves we floor (not round) and still classify safely.
    it("(e) a 30-minute gap floors to 0h and is 'critical'", () => {
        const result = shiftRecoveryGap('2026-06-15T00:00:00Z', '2026-06-15T00:30:00Z');
        expect(result).toEqual({ hours: 0, classification: 'critical' });
    });

    // (f) Reversed pair: the next shift starts BEFORE the previous one ended.
    // That is a data error, so we return the sentinel rather than a negative
    // gap — and crucially we do not throw.
    it("(f) reversed inputs return the invalid sentinel without throwing", () => {
        const call = () => shiftRecoveryGap('2026-06-15T12:00:00Z', '2026-06-15T06:00:00Z');
        expect(call).not.toThrow();
        expect(call()).toEqual({ hours: -1, classification: 'invalid' });
    });

    // (g) Unparseable inputs (either side) fall back to the sentinel.
    it("(g) unparseable inputs return the invalid sentinel", () => {
        expect(shiftRecoveryGap('not-a-date', '2026-06-15T06:00:00Z')).toEqual({
            hours: -1,
            classification: 'invalid',
        });
        expect(shiftRecoveryGap('2026-06-15T00:00:00Z', 'garbage')).toEqual({
            hours: -1,
            classification: 'invalid',
        });
        expect(shiftRecoveryGap('', '')).toEqual({ hours: -1, classification: 'invalid' });
    });

    // (h) An absurd multi-week gap is treated as a bad row, not 'adequate'.
    // 30 days is well beyond the 14-day sanity bound.
    it("(h) an absurd multi-week gap returns the invalid sentinel", () => {
        const result = shiftRecoveryGap('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z');
        expect(result).toEqual({ hours: -1, classification: 'invalid' });
    });
});
