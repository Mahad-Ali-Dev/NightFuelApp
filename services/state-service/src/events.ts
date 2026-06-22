import { EventBus } from '@nightfuel/events';
import { Channels } from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import { z } from 'zod';
import { StateMaterializer } from './materializer';

const logger = createLogger('state-service:events');

// ─────────────────────────────────────────────────────────────────────────────
// Event-payload validation (write-surface hardening).
//
// state-service is a read-model materializer: every event it consumes is
// folded straight into the `userState` row (sleep quality, calorie/protein
// targets, weight, cycle week, …). The Redis bus is an internal boundary, but
// a malformed or poisoned event would otherwise be written verbatim — an
// out-of-range `quality`, a negative `calorieTarget`, a NaN weight. These
// guards validate the envelope + the numeric fields we persist BEFORE
// dispatching to the materializer, mirroring the server-side bounds the
// producing services already enforce on their own write endpoints.
//
// Design notes:
//   • `.passthrough()` on every payload — we range-check the known numeric
//     fields but never strip extra/forward-compatible fields the materializer
//     (or a future handler) may read.
//   • On validation failure we LOG and SKIP (return) rather than throw: a bad
//     event must not poison the read model, and the bus consumer should keep
//     draining the channel. Throwing here is swallowed by the bus's per-message
//     try/catch anyway, so an explicit skip is both safer and clearer.
//   • Bounds are deliberately generous (reject the absurd, accept the real).
// ─────────────────────────────────────────────────────────────────────────────

// Shared event envelope. `userId` is the partition key for every upsert, so it
// must be a non-empty string; the rest of the envelope is required by the bus
// contract (see @nightfuel/types NightFuelEvent).
const envelopeShape = {
    eventId: z.string().min(1),
    userId: z.string().min(1),
};

const mealLoggedSchema = z
    .object({
        ...envelopeShape,
        payload: z
            .object({
                mealLogId: z.string().min(1).optional(),
                loggedAt: z.string().optional(),
                // Validate the type if present but do NOT default — the
                // materializer's adherence sampling must see the field exactly
                // as the producer sent it (no synthesized value).
                isAdherent: z.boolean().optional(),
            })
            .passthrough(),
    })
    .passthrough();

const sleepLoggedSchema = z
    .object({
        ...envelopeShape,
        payload: z
            .object({
                sleepSessionId: z.string().min(1).optional(),
                // Sleep quality is a 0–10 score; disturbances is a non-negative
                // count. These feed avgSleepQuality / fatigueLevel directly.
                quality: z.number().min(0).max(10).nullish(),
                // Validate-if-present; the materializer already coalesces a
                // missing value via `?? 0`, so no schema default is added.
                disturbances: z.number().int().min(0).max(1000).optional(),
            })
            .passthrough(),
    })
    .passthrough();

const metricsLoggedSchema = z
    .object({
        ...envelopeShape,
        payload: z
            .object({
                // Persisted as currentWeightKg. Cap at a physiologically
                // plausible maximum; the materializer ignores a falsy value.
                weightKg: z.number().positive().max(1000).nullish(),
            })
            .passthrough(),
    })
    .passthrough();

const planGeneratedSchema = z
    .object({
        ...envelopeShape,
        payload: z
            .object({
                // Daily targets written to currentCalorieTarget /
                // currentProteinTargetG. Non-negative, generously capped.
                calorieTarget: z.number().min(0).max(100000),
                proteinTargetG: z.number().min(0).max(10000),
            })
            .passthrough(),
    })
    .passthrough();

const cycleAdvancedSchema = z
    .object({
        ...envelopeShape,
        payload: z
            .object({
                trainingPhase: z.string().min(1).max(120),
                // Mesocycle week index — a small non-negative integer.
                newCycleWeek: z.number().int().min(0).max(520),
            })
            .passthrough(),
    })
    .passthrough();

/**
 * Validate an inbound event against `schema`. On success returns the parsed
 * value; on failure logs a structured warning (no raw payload echo to any
 * client — this is a server-side consumer) and returns null so the caller skips
 * the write.
 */
function safeParseEvent<T>(schema: z.ZodType<T>, channel: string, event: unknown): T | null {
    const result = schema.safeParse(event);
    if (!result.success) {
        logger.warn(
            { channel, issues: result.error.issues },
            'Dropping malformed event — failed validation before materializing',
        );
        return null;
    }
    return result.data;
}

// Consumer-group name for ALL state-service durable subscriptions. Keeping it a
// single shared group means a state-service restart REPLAYS every stream entry
// unread by this group (xreadgroup backfills the PEL + new entries) — Pub/Sub's
// at-most-once delivery (subscribe) would have permanently LOST any event
// produced while the service was down/reconnecting, silently corrupting the
// read-model twin. The bus dual-writes every publish to a durable Redis Stream,
// so the entries are there to replay.
const STATE_SERVICE_GROUP = 'state-service';

export async function setupEventSubscribers(eventBus: EventBus, materializer: StateMaterializer) {
    // All handlers now consume via subscribeDurable (xreadgroup + XACK + PEL)
    // instead of subscribe (Redis Pub/Sub, at-most-once). subscribeDurable is
    // at-least-once and the bus's processed-marker (nf:processed:<group>:<eventId>,
    // set after handler success, before XACK) makes redelivery idempotent — so a
    // handler throw or a restart with an unacked entry re-runs the handler at
    // most once and never double-applies the stepwise fatigue / adherence folds.
    eventBus.subscribeDurable<any>({
        stream: Channels.Meal.MealLogged,
        group: STATE_SERVICE_GROUP,
        handler: async (event: any) => {
            const valid = safeParseEvent(mealLoggedSchema, Channels.Meal.MealLogged, event);
            if (!valid) return;
            await materializer.handleMealLogged(valid as any);
        },
    });

    eventBus.subscribeDurable<any>({
        stream: Channels.Sleep.SessionLogged,
        group: STATE_SERVICE_GROUP,
        handler: async (event: any) => {
            const valid = safeParseEvent(sleepLoggedSchema, Channels.Sleep.SessionLogged, event);
            if (!valid) return;
            await materializer.handleSleepLogged(valid as any);
        },
    });

    eventBus.subscribeDurable<any>({
        stream: Channels.Progress.MetricsLogged,
        group: STATE_SERVICE_GROUP,
        handler: async (event: any) => {
            const valid = safeParseEvent(metricsLoggedSchema, Channels.Progress.MetricsLogged, event);
            if (!valid) return;
            await materializer.handleMetricsLogged(valid as any);
        },
    });

    eventBus.subscribeDurable<any>({
        stream: Channels.Plan.PlanGenerated,
        group: STATE_SERVICE_GROUP,
        handler: async (event: any) => {
            const valid = safeParseEvent(planGeneratedSchema, Channels.Plan.PlanGenerated, event);
            if (!valid) return;
            await materializer.handlePlanGenerated(valid as any);
        },
    });

    eventBus.subscribeDurable<any>({
        stream: Channels.Progress.CycleAdvanced,
        group: STATE_SERVICE_GROUP,
        handler: async (event: any) => {
            const valid = safeParseEvent(cycleAdvancedSchema, Channels.Progress.CycleAdvanced, event);
            if (!valid) return;
            await materializer.handleCycleAdvanced(valid as any);
        },
    });
}
