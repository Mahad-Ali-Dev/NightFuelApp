/**
 * Unit suite — bounded input validation on the shift schemas (src/schemas.ts).
 *
 * These assertions test the Zod schemas DIRECTLY (via safeParse), independent of
 * Fastify and the DB, because schemas.ts is a standalone module whose job is to
 * reject malformed input before it ever reaches a route handler or Prisma. They
 * lock two server-side invariants added in this sprint:
 *
 *   1. commuteMinutes is capped at 600 (~10h). Previously it was
 *      `z.number().nonnegative()` with NO upper bound, so a value like
 *      10_000_000 sailed through into the DB and downstream circadian math.
 *   2. createShiftSchema enforces endTime > startTime — a cross-field invariant
 *      that did not exist before. On a partial UPDATE the same check runs only
 *      when BOTH times are present, so a single-field patch still passes.
 *
 * If anyone loosens or removes either bound, this file goes red.
 */
import { describe, it, expect } from '@jest/globals';
import { ShiftType } from '@nightfuel/types';
import { createShiftSchema, updateShiftSchema } from '../src/schemas';

// The documented cap, kept as a named constant so each boundary case reads
// unambiguously against the schema's own `.max(600)`.
const MAX_COMMUTE_MINUTES = 600;

// A well-formed base create payload with endTime strictly after startTime. Each
// test clones-and-overrides only the field under examination so the *reason* a
// payload passes or fails is never in doubt.
function baseCreate(overrides: Record<string, unknown> = {}) {
    return {
        shiftDate: '2026-06-17',
        startTime: '2026-06-17T09:00:00.000Z',
        endTime: '2026-06-17T17:00:00.000Z',
        shiftType: ShiftType.FIXED_NIGHT,
        isDayOff: false,
        commuteMinutes: 30,
        ...overrides,
    };
}

describe('shift-service schemas — bounded input validation', () => {
    describe('createShiftSchema', () => {
        it('accepts a valid in-bounds payload (commuteMinutes < cap, endTime > startTime)', () => {
            const result = createShiftSchema.safeParse(baseCreate());
            expect(result.success).toBe(true);
        });

        it('accepts commuteMinutes exactly at the 600 cap (boundary)', () => {
            const result = createShiftSchema.safeParse(
                baseCreate({ commuteMinutes: MAX_COMMUTE_MINUTES })
            );
            expect(result.success).toBe(true);
        });

        it('rejects commuteMinutes above the 600 cap', () => {
            const result = createShiftSchema.safeParse(
                baseCreate({ commuteMinutes: MAX_COMMUTE_MINUTES + 1 })
            );
            expect(result.success).toBe(false);
        });

        it('rejects an absurd commuteMinutes (10_000_000) that the old unbounded schema accepted', () => {
            const result = createShiftSchema.safeParse(
                baseCreate({ commuteMinutes: 10_000_000 })
            );
            expect(result.success).toBe(false);
        });

        it('still rejects a negative commuteMinutes (nonnegative preserved)', () => {
            const result = createShiftSchema.safeParse(baseCreate({ commuteMinutes: -1 }));
            expect(result.success).toBe(false);
        });

        it('defaults commuteMinutes to 0 when omitted', () => {
            const { commuteMinutes, ...withoutCommute } = baseCreate();
            const result = createShiftSchema.safeParse(withoutCommute);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.commuteMinutes).toBe(0);
            }
        });

        it('rejects endTime equal to startTime (must be strictly after)', () => {
            const sameInstant = '2026-06-17T09:00:00.000Z';
            const result = createShiftSchema.safeParse(
                baseCreate({ startTime: sameInstant, endTime: sameInstant })
            );
            expect(result.success).toBe(false);
        });

        it('rejects endTime before startTime, flagging the endTime path', () => {
            const result = createShiftSchema.safeParse(
                baseCreate({
                    startTime: '2026-06-17T17:00:00.000Z',
                    endTime: '2026-06-17T09:00:00.000Z',
                })
            );
            expect(result.success).toBe(false);
            if (!result.success) {
                // The refine attaches the error to `endTime` so the client can
                // surface it on the right field.
                expect(result.error.issues.some((i) => i.path.includes('endTime'))).toBe(true);
            }
        });
    });

    describe('updateShiftSchema (partial)', () => {
        it('accepts a single-field patch of commuteMinutes (no times present)', () => {
            const result = updateShiftSchema.safeParse({ commuteMinutes: 45 });
            expect(result.success).toBe(true);
        });

        it('accepts a single-field patch of startTime only (cross-field check skipped)', () => {
            const result = updateShiftSchema.safeParse({
                startTime: '2026-06-17T09:00:00.000Z',
            });
            expect(result.success).toBe(true);
        });

        it('accepts a single-field patch of endTime only (cross-field check skipped)', () => {
            const result = updateShiftSchema.safeParse({
                endTime: '2026-06-17T17:00:00.000Z',
            });
            expect(result.success).toBe(true);
        });

        it('accepts an empty patch ({})', () => {
            const result = updateShiftSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it('still caps commuteMinutes on a partial update (rejects over-cap)', () => {
            const result = updateShiftSchema.safeParse({
                commuteMinutes: MAX_COMMUTE_MINUTES + 1,
            });
            expect(result.success).toBe(false);
        });

        it('enforces endTime > startTime when BOTH are present in the patch', () => {
            const result = updateShiftSchema.safeParse({
                startTime: '2026-06-17T17:00:00.000Z',
                endTime: '2026-06-17T09:00:00.000Z',
            });
            expect(result.success).toBe(false);
        });

        it('accepts a both-times patch when endTime > startTime', () => {
            const result = updateShiftSchema.safeParse({
                startTime: '2026-06-17T09:00:00.000Z',
                endTime: '2026-06-17T17:00:00.000Z',
            });
            expect(result.success).toBe(true);
        });
    });
});
