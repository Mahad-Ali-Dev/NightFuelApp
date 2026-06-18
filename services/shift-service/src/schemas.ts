import { z } from 'zod';
import { ShiftType } from '@nightfuel/types';

// Server-side bound: a single commute can't reasonably exceed ~10 hours.
// Caps the field so an absurd value (e.g. 10_000_000) can't reach the DB or
// any downstream circadian/aggregation math.
const MAX_COMMUTE_MINUTES = 600; // ~10h

// Server-side bound: the widest shift-history window a client may request in a
// single call. Caps the start..end span so a reversed or absurd multi-decade
// range can't force an unbounded DB scan / downstream circadian aggregation.
// 366 days covers any full calendar year (incl. a leap year) of shift history.
const MAX_QUERY_RANGE_DAYS = 366; // ~1 leap year

// Cross-field invariant message reused by create + update so the client sees
// an identical, unambiguous error regardless of which path validated it.
const END_AFTER_START_MESSAGE = 'endTime must be after startTime';

// The raw shape, shared by the create and update schemas. Kept as a plain
// object literal so `updateShiftSchema` can build its own `.partial()` form
// (a `.refine()`-wrapped schema is a ZodEffects and exposes no `.partial()`).
const shiftShape = {
    // userId is NOT accepted from the client — injected from JWT in the route handler
    shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    shiftType: z.nativeEnum(ShiftType),
    isDayOff: z.boolean().default(false),
    commuteMinutes: z.number().nonnegative().max(MAX_COMMUTE_MINUTES).default(0),
};

export const createShiftSchema = z
    .object(shiftShape)
    // On create, both times are always present, so the invariant always applies.
    .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
        message: END_AFTER_START_MESSAGE,
        path: ['endTime'],
    });

// Partial update: every field is optional. The endTime>startTime invariant can
// only be evaluated when BOTH times are supplied — a single-field patch (e.g.
// just commuteMinutes, or just startTime) must still pass.
export const updateShiftSchema = z
    .object(shiftShape)
    .partial()
    .refine(
        (data) =>
            data.startTime === undefined ||
            data.endTime === undefined ||
            new Date(data.endTime) > new Date(data.startTime),
        {
            message: END_AFTER_START_MESSAGE,
            path: ['endTime'],
        }
    );

// Raw shape for the list-shifts query. Kept as a plain object literal (mirroring
// `shiftShape`) so `getShiftsQuerySchema` stays a ZodObject — the route layer
// calls `getShiftsQuerySchema.omit({ userId: true })`, and `.omit()` does NOT
// exist on a `.refine()`-wrapped schema (a ZodEffects).
const getShiftsQueryShape = {
    // userId injected from JWT — only start/end come from the client
    userId: z.string().uuid().optional(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
};

// Public, omit-friendly schema consumed by routes.ts. Left as a bare ZodObject
// so existing `.omit({ userId: true })` keeps type-checking — DO NOT wrap this
// export in `.refine()`/`.superRefine()` (that would turn it into a ZodEffects
// and break the route's `.omit` call).
export const getShiftsQuerySchema = z.object(getShiftsQueryShape);

// Bounded variant: the same shape PLUS two cross-field range guards. Parse the
// dates as explicit UTC midnight (`+ 'T00:00:00.000Z'`) so the comparison and
// the whole-day span are deterministic regardless of the host timezone.
//   (a) end must be on or after start  — rejects a reversed range.
//   (b) span (in whole days) <= MAX_QUERY_RANGE_DAYS — rejects an absurd
//       multi-decade window that would force an unbounded DB scan.
// Both errors are attached to path ['end'] so the client can surface them on
// the field the caller would adjust.
export const getShiftsQuerySchemaBounded = z
    .object(getShiftsQueryShape)
    .refine((data) => new Date(data.end + 'T00:00:00.000Z') >= new Date(data.start + 'T00:00:00.000Z'), {
        message: 'end must be on or after start',
        path: ['end'],
    })
    .refine(
        (data) =>
            Math.round(
                (Date.parse(data.end + 'T00:00:00.000Z') -
                    Date.parse(data.start + 'T00:00:00.000Z')) /
                    86400000
            ) <= MAX_QUERY_RANGE_DAYS,
        {
            message: `date range must not exceed ${MAX_QUERY_RANGE_DAYS} days`,
            path: ['end'],
        }
    );

// Route-facing query schema for GET / (list shifts). userId is NOT a field here
// (it's injected from the JWT in the handler), so this is built from a bare
// start/end object and then bounded with the SAME two cross-field guards as
// getShiftsQuerySchemaBounded. We can't reuse that export via `.omit({ userId })`
// because it's a `.refine()`-wrapped ZodEffects (no `.omit()`), so the omit must
// happen on the object FIRST — done here by simply not declaring userId — then
// the refines chain on. UTC-midnight parse (`+ 'T00:00:00.000Z'`) keeps the
// comparison and whole-day span deterministic regardless of host timezone.
//   (a) end on or after start — rejects a reversed range.
//   (b) span (whole days) <= MAX_QUERY_RANGE_DAYS — rejects an absurd window.
// Both errors attach to path ['end'] for consistent client-side surfacing.
export const getShiftsRouteQuerySchema = z
    .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    })
    .refine((data) => new Date(data.end + 'T00:00:00.000Z') >= new Date(data.start + 'T00:00:00.000Z'), {
        message: 'end must be on or after start',
        path: ['end'],
    })
    .refine(
        (data) =>
            Math.round(
                (Date.parse(data.end + 'T00:00:00.000Z') -
                    Date.parse(data.start + 'T00:00:00.000Z')) /
                    86400000
            ) <= MAX_QUERY_RANGE_DAYS,
        {
            message: `date range must not exceed ${MAX_QUERY_RANGE_DAYS} days`,
            path: ['end'],
        }
    );

export type CreateShiftBody = z.infer<typeof createShiftSchema>;
export type UpdateShiftBody = z.infer<typeof updateShiftSchema>;
export type GetShiftsQuery = z.infer<typeof getShiftsQuerySchema>;
