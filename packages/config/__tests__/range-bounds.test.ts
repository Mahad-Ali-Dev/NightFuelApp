// Tests for the shared date-range bound helper in @nightfuel/config.
//
// These lock the exact semantics extracted from shift-service's
// getShiftsQuerySchemaBounded: a UTC-midnight parse, an end>=start (reversed)
// guard, and a whole-day span <= cap guard. Every case is computed in UTC so the
// result is deterministic regardless of the machine the suite runs on.
//
// The import is the package entrypoint (NOT a deep src/ path) so this also
// asserts the acceptance contract: `import { boundedDateRange, isValidDateRange }
// from '@nightfuel/config'` resolves through the built dist/index.js.
import { boundedDateRange, isValidDateRange, MAX_QUERY_RANGE_DAYS, RANGE_REVERSED_MSG, rangeTooLongMsg } from '@nightfuel/config';
import { z } from 'zod';

describe('isValidDateRange', () => {
    // (a) Exactly MAX_QUERY_RANGE_DAYS apart is the inclusive boundary — it must
    // be accepted. 2024 is a leap year, so 2024-01-01 + 366 whole days lands on
    // 2025-01-01 (366 UTC-midnight steps). If this regresses to `< cap` the
    // legitimate full-leap-year window would be wrongly rejected.
    it('(a) a span of exactly maxDays (default 366) is valid', () => {
        expect(isValidDateRange('2024-01-01', '2025-01-01')).toBe(true);
        // Span check: the two dates really are 366 whole UTC days apart.
        const span = Math.round(
            (Date.parse('2025-01-01T00:00:00.000Z') - Date.parse('2024-01-01T00:00:00.000Z')) / 86400000
        );
        expect(span).toBe(MAX_QUERY_RANGE_DAYS);
    });

    // (b) One day past the cap (maxDays + 1) must be rejected — this is the
    // unbounded-scan guard doing its job at the boundary.
    it('(b) a span of maxDays + 1 is invalid', () => {
        // 2024-01-01 + 367 whole UTC days → 2025-01-02.
        expect(isValidDateRange('2024-01-01', '2025-01-02')).toBe(false);
        const span = Math.round(
            (Date.parse('2025-01-02T00:00:00.000Z') - Date.parse('2024-01-01T00:00:00.000Z')) / 86400000
        );
        expect(span).toBe(MAX_QUERY_RANGE_DAYS + 1);
    });

    // (c) A reversed range (end strictly before start) must be rejected even
    // though its absolute span is tiny — the end>=start guard, not the span
    // guard, is what catches this.
    it('(c) a reversed range (end before start) is invalid', () => {
        expect(isValidDateRange('2026-06-18', '2026-06-17')).toBe(false);
    });

    // (d) A single-day range (start === end) is the smallest legitimate window
    // and must be accepted: span is 0 days, which satisfies both 0 >= 0 and
    // 0 <= cap.
    it('(d) a single-day range (start === end) is valid', () => {
        expect(isValidDateRange('2026-06-18', '2026-06-18')).toBe(true);
    });

    // (e) A custom (smaller) maxDays is honored: 31 days apart passes at cap=31
    // but the 32nd day is rejected — proves the optional bound is wired, not
    // ignored in favor of the default 366.
    it('(e) honors a custom maxDays bound', () => {
        expect(isValidDateRange('2026-01-01', '2026-02-01', 31)).toBe(true); // 31 whole days
        expect(isValidDateRange('2026-01-01', '2026-02-02', 31)).toBe(false); // 32 whole days
    });

    // (f) Unparseable input is rejected (returns false, never throws) so a
    // malformed bound cannot slip through into the span arithmetic.
    it('(f) returns false for an unparseable date instead of throwing', () => {
        expect(isValidDateRange('not-a-date', '2026-06-18')).toBe(false);
        expect(isValidDateRange('2026-06-18', 'nope')).toBe(false);
    });
});

describe('boundedDateRange (zod factory)', () => {
    // The factory takes the caller's own `z` so the module imports no zod of its
    // own. A well-formed, in-bounds range parses cleanly.
    it('accepts a valid in-bounds range', () => {
        const schema = boundedDateRange(z);
        const parsed = schema.safeParse({ start: '2026-01-01', end: '2026-02-01' });
        expect(parsed.success).toBe(true);
    });

    // Reversed range fails on path ['end'] with the shared reversed message —
    // identical to shift-service so clients see one consistent error.
    it('rejects a reversed range with the reversed message on path ["end"]', () => {
        const schema = boundedDateRange(z);
        const parsed = schema.safeParse({ start: '2026-06-18', end: '2026-06-17' });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            const issue = parsed.error.issues.find((i) => i.path.join('.') === 'end');
            expect(issue?.message).toBe(RANGE_REVERSED_MSG);
        }
    });

    // A span past a custom cap fails with the interpolated too-long message that
    // names the effective cap (proving rangeTooLongMsg is wired to opts.maxDays).
    it('rejects an over-long range with the cap-aware message', () => {
        const schema = boundedDateRange(z, { maxDays: 31 });
        const parsed = schema.safeParse({ start: '2026-01-01', end: '2026-02-02' }); // 32 whole days
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            const issue = parsed.error.issues.find((i) => i.path.join('.') === 'end');
            expect(issue?.message).toBe(rangeTooLongMsg(31));
        }
    });

    // The regex shape guard still applies — a non-YYYY-MM-DD string is rejected
    // before the cross-field refines even run.
    it('rejects a malformed (non-YYYY-MM-DD) date string', () => {
        const schema = boundedDateRange(z);
        expect(schema.safeParse({ start: '2026-1-1', end: '2026-02-01' }).success).toBe(false);
    });
});
