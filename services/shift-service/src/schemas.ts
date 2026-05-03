import { z } from 'zod';
import { ShiftType } from '@nightfuel/types';

export const createShiftSchema = z.object({
    // userId is NOT accepted from the client — injected from JWT in the route handler
    shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    shiftType: z.nativeEnum(ShiftType),
    isDayOff: z.boolean().default(false),
    commuteMinutes: z.number().nonnegative().default(0),
});

export const updateShiftSchema = createShiftSchema.partial();

export const getShiftsQuerySchema = z.object({
    // userId injected from JWT — only start/end come from the client
    userId: z.string().uuid().optional(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateShiftBody = z.infer<typeof createShiftSchema>;
export type UpdateShiftBody = z.infer<typeof updateShiftSchema>;
export type GetShiftsQuery = z.infer<typeof getShiftsQuerySchema>;
