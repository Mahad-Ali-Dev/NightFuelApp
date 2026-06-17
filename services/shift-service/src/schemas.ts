import { z } from 'zod';
import { ShiftType } from '@nightfuel/types';

// Server-side bound: a single commute can't reasonably exceed ~10 hours.
// Caps the field so an absurd value (e.g. 10_000_000) can't reach the DB or
// any downstream circadian/aggregation math.
const MAX_COMMUTE_MINUTES = 600; // ~10h

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

export const getShiftsQuerySchema = z.object({
    // userId injected from JWT — only start/end come from the client
    userId: z.string().uuid().optional(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateShiftBody = z.infer<typeof createShiftSchema>;
export type UpdateShiftBody = z.infer<typeof updateShiftSchema>;
export type GetShiftsQuery = z.infer<typeof getShiftsQuerySchema>;
