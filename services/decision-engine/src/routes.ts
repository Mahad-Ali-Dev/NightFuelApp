import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DecisionEngine, type DecisionInput } from './engine';

// ── Input-bounds hardening for POST /v1/decision/compute-params ─────────────────
// `engine.ts` exports a LOOSE `DecisionInputSchema` (kept exported, unchanged, for
// its `DecisionInput` type and any other importer): every numeric field is an
// unbounded `z.number()`, `userId`/`trainingPhase` are unbounded free strings, and
// `planHistory` is an unbounded array. That lets a single request carry a
// 10-million-entry `planHistory`, a megabyte `userId`, NaN/±Infinity metrics, or a
// blizzard of unknown fields straight into the engine. The engine math is pure and
// deterministic, but absurd input still wastes CPU/allocations and muddies logs.
//
// This BOUNDED schema is what the ROUTE validates against. It only TIGHTENS the
// loose schema — every field that a well-formed client already sends within its
// documented range (the inline `// 0 to 1`, `// 1 to 10` comments in engine.ts)
// stays valid, so valid behaviour is unchanged; only malformed / out-of-range /
// over-long / unknown-field / oversized-array input is newly rejected with a clean
// 400 from the shared validator + shared error handler (no engine code runs, so no
// raw stack / internal detail can leak — see __tests__/input-bounds.test.ts).
//
// `.strict()` on both objects rejects unknown/extra fields (a 400, not a silent
// pass-through), closing the oversized-payload / field-smuggling vector.

// A request may carry at most this many plan-history entries. Far beyond any real
// client (the engine only ever reads a handful) while blocking array-flood abuse.
const MAX_PLAN_HISTORY = 366;
// `userId` is an opaque identifier; `trainingPhase` is a short enum-like tag. Bound
// both so neither can carry an unbounded free-text blob.
const MAX_USER_ID_LEN = 128;
// Generous physical bounds — every real human value sits comfortably inside these,
// so valid input is preserved while NaN/±Infinity and absurd magnitudes are
// rejected (z.number() with a finite min/max also rejects NaN and ±Infinity).
const MAX_WEIGHT_KG = 1000;
const MAX_CALORIES = 100000;
const MAX_PROTEIN_G = 100000;
const MAX_CYCLE_WEEK = 520; // ~10 years of weekly cycles — an effectively-unreachable cap.

// `trainingPhase` is compared by the engine against 'HYPERTROPHY' / 'STRENGTH' /
// 'DELOAD'; any other string falls through to the default branch (no modifier).
// Keeping it an enum (with the same 'HYPERTROPHY' default the loose schema used)
// tightens the surface without changing behaviour for the recognised phases. The
// resulting literal-union type is assignable to the engine's `string` field.
const userStateSchema = z
    .object({
        userId: z.string().min(1).max(MAX_USER_ID_LEN),
        // Nullable: a user who has not set their weight sends null. Bounds still
        // apply when a value IS present; null/undefined pass (the engine guards
        // every weight-derived calc). Previously this 400-ed every weightless user.
        currentWeightKg: z.number().positive().max(MAX_WEIGHT_KG).nullish(),
        targetWeightKg: z.number().positive().max(MAX_WEIGHT_KG).optional(),
        last7DaysAdherence: z.number().min(0).max(1), // 0 to 1 (now enforced)
        avgSleepQuality: z.number().min(1).max(10), // 1 to 10 (now enforced)
        fatigueLevel: z.number().min(1).max(10), // 1 to 10 (now enforced)
        currentCalorieTarget: z.number().min(0).max(MAX_CALORIES),
        currentProteinTargetG: z.number().min(0).max(MAX_PROTEIN_G),
        trainingPhase: z
            .enum(['HYPERTROPHY', 'STRENGTH', 'DELOAD'])
            .default('HYPERTROPHY'),
        cycleWeek: z.number().int().min(1).max(MAX_CYCLE_WEEK).default(1),
        // Derived menstrual-cycle phase. UNKNOWN default => phase modifiers are a
        // strict no-op (non-tracking users unaffected). Bounded to the exact enum
        // so any other value is a clean 400, mirroring the engine's loose schema.
        cyclePhase: z
            .enum(['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL', 'UNKNOWN'])
            .default('UNKNOWN'),
    })
    .strict();

const boundedDecisionInputSchema = z
    .object({
        userState: userStateSchema,
        // Must match engine.ts's goal enum — GENERAL_HEALTH and ENERGY are real
        // mobile onboarding goals (behave like MAINTENANCE in the engine). Omitting
        // them here 400-ed every user who picked those two goals.
        goal: z.enum(['FAT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_HEALTH', 'ENERGY']),
        planHistory: z
            .array(
                z
                    .object({
                        date: z.string().datetime(),
                        adherence: z.boolean(),
                        weightKg: z.number().positive().max(MAX_WEIGHT_KG).optional(),
                    })
                    .strict(),
            )
            .max(MAX_PLAN_HISTORY)
            .optional(),
    })
    .strict();

// Exported so the regression suite validates against the EXACT schema the route
// uses (no drift between test and runtime). Compile-time guarantee that the
// tightened input is still structurally a `DecisionInput` — if a future edit makes
// the two diverge, `tsc` (gate step: check-types) fails here rather than at the
// `engine.computeParams(...)` call site.
export const BoundedDecisionInputSchema = boundedDecisionInputSchema;
export type BoundedDecisionInput = z.infer<typeof boundedDecisionInputSchema>;
const _assertAssignable: (input: BoundedDecisionInput) => DecisionInput = (input) => input;
void _assertAssignable;

export async function decisionRoutes(fastify: FastifyInstance) {
    const engine = new DecisionEngine();
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    typedFastify.post('/compute-params', {
        schema: {
            body: boundedDecisionInputSchema,
        },
    }, async (request, reply) => {
        // request.body is the validated, bounded input. We do NOT wrap this in a
        // try/catch that echoes error text: any throw propagates to the SHARED
        // registerFastifyErrorHandler (wired in index.ts), which logs the real
        // cause server-side and returns a fixed, redacted body. A validation
        // failure is converted to a redacted 400 by the same shared handler before
        // the handler body ever runs.
        const output = engine.computeParams(request.body);
        return reply.send(output);
    });
}
