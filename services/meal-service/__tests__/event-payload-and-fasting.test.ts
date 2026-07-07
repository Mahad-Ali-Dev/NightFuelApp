/**
 * Locking suite for two F23 correctness fixes in `MealService`
 * (src/meal.service.ts), driving the REAL service with a lightweight in-memory
 * Prisma stub + a recording EventBus — the same isolation approach the sibling
 * `log-planned-meal.test.ts` uses (import ONLY the service class, never
 * src/index.ts whose bootstrap opens DB/Redis at import time).
 *
 * 1. The published `nightfuel:meal:meal-logged` event MUST carry:
 *      - `loggedAt`  = the row's loggedAt as an ISO string (so progress-service
 *        buckets by the meal's calendar day, not the event-processing time —
 *        the near-midnight wrong-day adherence bug), and
 *      - `isAdherent` = the persisted row verdict (so state-service can fold it
 *        into its rolling adherence window).
 *    These match `MealLoggedPayload` in packages/types. If anyone drops either
 *    field from the payload, this file goes red.
 *
 * 2. `endFasting` MUST compute the terminal status from elapsed-vs-target:
 *      - reaching/exceeding `targetHours`  -> 'COMPLETED' ("COMPLETE FAST")
 *      - ending before the target          -> 'CANCELLED' ("END FAST EARLY")
 *    The previous hard-coded 'COMPLETED' mislabelled every early-ended fast.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MealService } from '../src/meal.service';

function foodItems() {
    return [
        { foodId: 'food-1', name: 'Chicken Breast', quantity: 2, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
        { foodId: 'food-2', name: 'Brown Rice', quantity: 1, calories: 215, protein: 5, carbs: 45, fat: 1.8 },
    ];
}

// Fixed loggedAt the Prisma stub stamps onto the created row, so we can assert
// the exact ISO string forwarded onto the event.
const ROW_LOGGED_AT = new Date('2026-06-20T23:59:30.000Z');

function buildService(opts?: { rowIsAdherent?: boolean }) {
    const published: Array<{ stream: string; event: any }> = [];

    const prisma: any = {
        mealLog: {
            create: async ({ data }: any) => ({
                id: 'meal-log-1',
                loggedAt: ROW_LOGGED_AT,
                ...data,
                // The row's persisted verdict wins for the assertion (data already
                // carries isAdherent, but make the override explicit + intentional).
                ...(opts?.rowIsAdherent !== undefined ? { isAdherent: opts.rowIsAdherent } : {}),
            }),
        },
    };

    const eventBus: any = {
        publish: async (stream: string, event: any) => {
            published.push({ stream, event });
        },
    };

    const service = new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
    return { service, published };
}

describe('meal-service — meal-logged event carries loggedAt + isAdherent', () => {
    let ctx: ReturnType<typeof buildService>;

    beforeEach(() => {
        ctx = buildService();
    });

    it('publishes loggedAt as the row loggedAt ISO string (not processing time)', async () => {
        await ctx.service.logMeal('user-1', 'DINNER', foodItems());

        expect(ctx.published).toHaveLength(1);
        const payload = ctx.published[0]!.event.payload;
        expect(payload.loggedAt).toBe(ROW_LOGGED_AT.toISOString());
        // Must be a string (consumers Date.parse it), not a Date instance.
        expect(typeof payload.loggedAt).toBe('string');
    });

    it('publishes isAdherent forwarded from the persisted row verdict', async () => {
        const c = buildService({ rowIsAdherent: false });
        await c.service.logMeal('user-1', 'LUNCH', foodItems());

        const payload = c.published[0]!.event.payload;
        expect(payload.isAdherent).toBe(false);
        expect(typeof payload.isAdherent).toBe('boolean');
    });

    it('keeps the rest of the MealLoggedPayload contract intact', async () => {
        await ctx.service.logMeal('user-1', 'DINNER', foodItems());

        const payload = ctx.published[0]!.event.payload;
        expect(payload).toMatchObject({
            mealLogId: 'meal-log-1',
            mealType: 'DINNER',
            totalCalories: 545, // 165*2 + 215
            totalProtein: 67,   // 31*2 + 5
        });
    });
});

describe('meal-service — endFasting status (elapsed vs target)', () => {
    // Builds a service whose FastingLog stub returns one active fast with the
    // given start offset (hours ago) and target, and records the update data.
    function buildFastingService(startedHoursAgo: number, targetHours: number) {
        const updates: any[] = [];
        const active = {
            id: 'fast-1',
            userId: 'user-1',
            status: 'ACTIVE',
            targetHours,
            startTime: new Date(Date.now() - startedHoursAgo * 60 * 60 * 1000),
            endTime: null,
        };

        const prisma: any = {
            fastingLog: {
                findFirst: async () => active,
                update: async ({ where, data }: any) => {
                    updates.push({ where, data });
                    return { ...active, ...data };
                },
            },
        };
        const eventBus: any = { publish: async () => {} };
        const service = new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
        return { service, updates };
    }

    it('marks a fast that reached its target as COMPLETED', async () => {
        const { service, updates } = buildFastingService(16.5, 16);
        const result: any = await service.endFasting('user-1');

        expect(result.status).toBe('COMPLETED');
        expect(updates[0].data.status).toBe('COMPLETED');
        expect(updates[0].data.endTime).toBeInstanceOf(Date);
    });

    it('marks a fast ended early (before target) as CANCELLED', async () => {
        const { service, updates } = buildFastingService(4, 16);
        const result: any = await service.endFasting('user-1');

        expect(result.status).toBe('CANCELLED');
        expect(updates[0].data.status).toBe('CANCELLED');
    });

    it('treats reaching the target exactly as COMPLETED (boundary)', async () => {
        const { service, updates } = buildFastingService(16, 16);
        await service.endFasting('user-1');
        expect(updates[0].data.status).toBe('COMPLETED');
    });

    it('throws when there is no active fast', async () => {
        const prisma: any = { fastingLog: { findFirst: async () => null } };
        const eventBus: any = { publish: async () => {} };
        const service = new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
        await expect(service.endFasting('user-1')).rejects.toThrow('No active fast found');
    });
});
