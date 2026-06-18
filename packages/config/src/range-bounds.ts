// ── Shared date-range bound helper ────────────────────────────────────────────
// The "366-day / reversed-range" guard for list/range query endpoints currently
// lives only inside shift-service/src/schemas.ts (getShiftsQuerySchemaBounded /
// getShiftsRouteQuerySchema). The security brief asks to bound every list/range
// endpoint UNIFORMLY, so the math is extracted here once — pure and
// dependency-free — and re-used verbatim instead of re-implemented per service.
//
// Two semantics, byte-for-byte identical to the shift-service version:
//   (a) reversed-range guard — `end` must be on or after `start`.
//   (b) span guard           — the whole-day span must not exceed `maxDays`.
//
// Both bounds parse each YYYY-MM-DD date as explicit UTC midnight
// (`+ 'T00:00:00.000Z'`) so the comparison and the whole-day span are
// deterministic regardless of the host machine's timezone — a server in
// America/Los_Angeles and one in UTC must reject/accept exactly the same ranges.
//
// This module imports NOTHING at runtime (no Fastify, no top-level zod import).
// The optional zod factory takes `z` as a PARAMETER so callers in any framework
// can build a bounded schema without this file pulling zod into their bundle,
// and so the module stays trivially tree-shakeable / composable.

/**
 * The widest start..end window a client may request from a list/range endpoint
 * in a single call. 366 days covers any full calendar year (including a leap
 * year) of history while capping a reversed or absurd multi-decade range that
 * would otherwise force an unbounded DB scan / downstream aggregation.
 */
export const MAX_QUERY_RANGE_DAYS = 366; // ~1 leap year

/**
 * Number of milliseconds in one whole UTC day. Used to convert the
 * end-minus-start delta into a whole-day count. Named so the span math reads
 * intent-first instead of repeating the magic 86_400_000 literal.
 */
const MS_PER_DAY = 86400000;

/**
 * Cross-field message for a reversed range (`end` before `start`). Kept
 * identical to shift-service's existing literal so clients see the same error
 * no matter which endpoint validated the range.
 */
export const RANGE_REVERSED_MSG = 'end must be on or after start';

/**
 * Cross-field message for a range that exceeds the day cap. A factory (not a
 * constant) so the cap value is interpolated into the text — callers that pass
 * a custom `maxDays` get an accurate message rather than a hard-coded "366".
 *
 * @param n The effective day cap that was exceeded.
 */
export const rangeTooLongMsg = (n: number) => `date range must not exceed ${n} days`;

/**
 * Pure predicate: is [start, end] a valid, in-bounds YYYY-MM-DD range?
 *
 * Both dates are parsed as explicit UTC midnight so the result is timezone-
 * independent. Returns `false` (never throws) when either date is unparseable,
 * when the range is reversed (`end` before `start`), or when the whole-day span
 * exceeds `maxDays`.
 *
 * Framework-agnostic: callers that aren't using zod (plain handlers, scripts,
 * tests) can gate on this directly without building a schema.
 *
 * @param start   Range start as `YYYY-MM-DD`.
 * @param end     Range end as `YYYY-MM-DD`.
 * @param maxDays Inclusive whole-day cap; defaults to {@link MAX_QUERY_RANGE_DAYS}.
 * @returns       `true` iff both parse, `end >= start`, and span <= `maxDays`.
 */
export function isValidDateRange(start: string, end: string, maxDays = MAX_QUERY_RANGE_DAYS): boolean {
    const startMs = Date.parse(start + 'T00:00:00.000Z');
    const endMs = Date.parse(end + 'T00:00:00.000Z');

    // Unparseable input → reject. Date.parse returns NaN for a malformed date,
    // and NaN comparisons are always false, but we check explicitly so the
    // intent is obvious and a single bad bound can't slip through a later
    // arithmetic comparison.
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;

    // (a) reversed-range guard.
    if (endMs < startMs) return false;

    // (b) whole-day span guard. Math.round (not floor/ceil) so a span that lands
    // a hair off an exact day boundary due to floating point still rounds to the
    // intended whole-day count — though with UTC-midnight inputs the delta is
    // always an exact multiple of MS_PER_DAY anyway.
    return Math.round((endMs - startMs) / MS_PER_DAY) <= maxDays;
}

/**
 * zod factory: build a bounded `{ start, end }` query schema applying the SAME
 * two cross-field guards as {@link isValidDateRange}, with field-level error
 * messages attached to `path: ['end']` so a client surfaces them on the field
 * it would adjust.
 *
 * `z` is passed in as a parameter (rather than imported at the top of this
 * module) so this file adds no runtime zod import of its own and stays
 * composable — a caller supplies its own already-imported `z`. zod is already a
 * declared dependency of @nightfuel/config, so the `typeof import('zod')` type
 * annotation adds no new dependency.
 *
 * The returned schema is a `.refine()`-wrapped ZodEffects; if a caller needs an
 * `.omit()`/`.partial()`-friendly bare object, build the object first and apply
 * the refines last (see shift-service's getShiftsRouteQuerySchema for the
 * pattern).
 *
 * @param z    The caller's imported zod module (`import { z } from 'zod'` → pass `z`).
 * @param opts Optional overrides. `maxDays` defaults to {@link MAX_QUERY_RANGE_DAYS}.
 * @returns    A zod schema validating `{ start: YYYY-MM-DD, end: YYYY-MM-DD }`
 *             with the reversed-range and span guards applied.
 */
export function boundedDateRange(z: typeof import('zod'), opts?: { maxDays?: number }) {
    const max = opts?.maxDays ?? MAX_QUERY_RANGE_DAYS;
    return z
        .object({
            start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
            end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        })
        // (a) reversed-range guard — UTC-midnight parse keeps it timezone-safe.
        .refine((d) => new Date(d.end + 'T00:00:00.000Z') >= new Date(d.start + 'T00:00:00.000Z'), {
            message: RANGE_REVERSED_MSG,
            path: ['end'],
        })
        // (b) whole-day span guard — same Math.round(delta / MS_PER_DAY) <= cap
        // math as isValidDateRange, mirroring shift-service exactly.
        .refine(
            (d) =>
                Math.round(
                    (Date.parse(d.end + 'T00:00:00.000Z') - Date.parse(d.start + 'T00:00:00.000Z')) / MS_PER_DAY
                ) <= max,
            {
                message: rangeTooLongMsg(max),
                path: ['end'],
            }
        );
}
