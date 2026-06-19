/**
 * Unit suite — `MealService.logMeal` additive `planMealId` provenance link.
 *
 * The plan->meal "Log this" flow lets the mobile app log a meal directly from a
 * planned circadian protocol slot, carrying the originating plan-meal id. The
 * service signature was extended with an OPTIONAL 4th argument so this stays
 * additive: every existing 3-arg call site must compile and behave exactly as
 * before, and a 4th-arg `planMealId` must be persisted (into the existing
 * `foodItems` JSON column — NO schema migration) and echoed back on both the
 * returned object and the published `meal.logged` event.
 *
 * These assertions drive the real `MealService` (src/meal.service.ts) with a
 * lightweight in-memory Prisma stub and a recording EventBus, so the test is
 * independent of the DB/Redis the service bootstrap opens at import time. We
 * import ONLY the service class (no `src/index.ts`), matching the isolation
 * approach the sibling suites use.
 *
 * If anyone makes `planMealId` required, drops the echo, or stops stamping it
 * into the persisted JSON, this file goes red.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MealService } from '../src/meal.service';

// A normal, in-bounds set of food items — the same shape the route forwards
// after `logMealBodySchema` validation.
function foodItems() {
    return [
        { foodId: 'food-1', name: 'Chicken Breast', quantity: 2, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
        { foodId: 'food-2', name: 'Brown Rice', quantity: 1, calories: 215, protein: 5, carbs: 45, fat: 1.8 },
    ];
}

// Recording stubs. The Prisma stub captures the exact `data` handed to
// `mealLog.create` (so we can assert what got persisted) and returns a row with
// a generated id, mirroring Prisma's create return. The EventBus stub records
// every published (stream, event) pair.
function buildService() {
    const created: any[] = [];
    const published: Array<{ stream: string; event: any }> = [];

    const prisma: any = {
        mealLog: {
            create: async ({ data }: any) => {
                const row = { id: 'meal-log-1', loggedAt: new Date('2026-06-20T12:00:00.000Z'), ...data };
                created.push(data);
                return row;
            },
        },
    };

    const eventBus: any = {
        publish: async (stream: string, event: any) => {
            published.push({ stream, event });
        },
    };

    const service = new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
    return { service, created, published };
}

describe('meal-service — MealService.logMeal additive planMealId', () => {
    let ctx: ReturnType<typeof buildService>;

    beforeEach(() => {
        ctx = buildService();
    });

    // ── 3-arg (existing) call path — must be completely unchanged ────────────
    describe('existing 3-arg call (no planMealId)', () => {
        it('still logs a meal and returns aggregated totals', async () => {
            const result: any = await ctx.service.logMeal('user-1', 'LUNCH', foodItems());

            expect(result.id).toBe('meal-log-1');
            expect(result.userId).toBe('user-1');
            expect(result.mealType).toBe('LUNCH');
            // 165*2 + 215*1 = 545
            expect(result.totalCalories).toBe(545);
            // 31*2 + 5*1 = 67
            expect(result.totalProtein).toBe(67);
        });

        it('persists foodItems as a bare array (storage shape unchanged)', async () => {
            await ctx.service.logMeal('user-1', 'LUNCH', foodItems());

            const persisted = ctx.created[0];
            expect(Array.isArray(persisted.foodItems)).toBe(true);
            expect(persisted.foodItems).toHaveLength(2);
            // No envelope key leaks into the bare-array path.
            expect(persisted.foodItems).not.toHaveProperty('_planMealId');
        });

        it('does NOT echo planMealId on the returned object', async () => {
            const result: any = await ctx.service.logMeal('user-1', 'LUNCH', foodItems());
            expect(result).not.toHaveProperty('planMealId');
        });

        it('does NOT include planMealId in the published event payload', async () => {
            await ctx.service.logMeal('user-1', 'LUNCH', foodItems());

            expect(ctx.published).toHaveLength(1);
            expect(ctx.published[0]!.stream).toBe('nightfuel:meal:meal-logged');
            expect(ctx.published[0]!.event.payload).not.toHaveProperty('planMealId');
        });
    });

    // ── 4-arg call path — planMealId persisted + echoed ──────────────────────
    describe('4-arg call with planMealId', () => {
        const PLAN_MEAL_ID = 'plan-meal-abc-123';

        it('echoes planMealId back on the returned object', async () => {
            const result: any = await ctx.service.logMeal('user-1', 'DINNER', foodItems(), PLAN_MEAL_ID);
            expect(result.planMealId).toBe(PLAN_MEAL_ID);
            // Totals still computed identically.
            expect(result.totalCalories).toBe(545);
        });

        it('persists planMealId inside the foodItems JSON (no DB column added)', async () => {
            await ctx.service.logMeal('user-1', 'DINNER', foodItems(), PLAN_MEAL_ID);

            const persisted = ctx.created[0];
            // Envelope shape: { items: [...], _planMealId }
            expect(persisted.foodItems._planMealId).toBe(PLAN_MEAL_ID);
            expect(Array.isArray(persisted.foodItems.items)).toBe(true);
            expect(persisted.foodItems.items).toHaveLength(2);
        });

        it('includes planMealId in the published event payload', async () => {
            await ctx.service.logMeal('user-1', 'DINNER', foodItems(), PLAN_MEAL_ID);

            expect(ctx.published).toHaveLength(1);
            expect(ctx.published[0]!.event.payload.planMealId).toBe(PLAN_MEAL_ID);
            // The rest of the payload contract is intact.
            expect(ctx.published[0]!.event.payload.mealLogId).toBe('meal-log-1');
            expect(ctx.published[0]!.event.payload.mealType).toBe('DINNER');
        });
    });
});
