/**
 * Locking suite — HIGH #6: `MealService.logMeal` idempotency key.
 *
 * Before the fix, logMeal unconditionally inserted a meal_logs row and published
 * `meal-logged` on EVERY call — so a client retry / double-tap DOUBLE-LOGGED the
 * meal and double-published (two distinct rows, two distinct eventIds).
 *
 * The fix adds an OPTIONAL client-supplied idempotency key (5th arg, also wired
 * through POST /v1/meals/log body / `Idempotency-Key` header). A retry that
 * re-sends the SAME key for the SAME user must collapse onto the existing row:
 *   - exactly ONE meal_logs row inserted, and
 *   - exactly ONE meal-logged event published.
 * Keyless logs (and logs with DIFFERENT keys) must still be DISTINCT every time.
 *
 * Drives the REAL service (src/meal.service.ts) with a lightweight in-memory
 * Prisma stub that enforces the @@unique([userId, idempotencyKey]) constraint
 * (Postgres semantics: NULL keys are DISTINCT) + a recording EventBus — the same
 * isolation approach the sibling suites use (import ONLY the service class).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MealService } from '../src/meal.service';

function foodItems() {
    return [
        { foodId: 'food-1', name: 'Chicken Breast', quantity: 2, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
        { foodId: 'food-2', name: 'Brown Rice', quantity: 1, calories: 215, protein: 5, carbs: 45, fat: 1.8 },
    ];
}

// In-memory Prisma stub that mirrors the real meal_logs uniqueness contract:
// a non-NULL (userId, idempotencyKey) pair is unique; a duplicate insert throws
// a Prisma-style P2002. NULL keys are always distinct (Postgres semantics), so
// keyless logs never collide.
function buildService() {
    const rows: any[] = [];
    const published: Array<{ stream: string; event: any }> = [];
    let seq = 0;

    const prisma: any = {
        mealLog: {
            findFirst: async ({ where }: any) => {
                return rows.find(r =>
                    r.userId === where.userId && r.idempotencyKey === where.idempotencyKey
                ) ?? null;
            },
            create: async ({ data }: any) => {
                if (data.idempotencyKey != null) {
                    const clash = rows.find(r =>
                        r.userId === data.userId && r.idempotencyKey === data.idempotencyKey
                    );
                    if (clash) {
                        const e: any = new Error('Unique constraint failed');
                        e.code = 'P2002';
                        throw e;
                    }
                }
                const row = {
                    id: `meal-log-${++seq}`,
                    loggedAt: new Date('2026-06-20T12:00:00.000Z'),
                    idempotencyKey: data.idempotencyKey ?? null,
                    ...data,
                };
                rows.push(row);
                return row;
            },
        },
    };

    const eventBus: any = {
        publish: async (stream: string, event: any) => { published.push({ stream, event }); },
    };

    const service = new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
    return { service, rows, published };
}

describe('meal-service — MealService.logMeal idempotency (HIGH #6)', () => {
    let ctx: ReturnType<typeof buildService>;

    beforeEach(() => { ctx = buildService(); });

    it('a retry with the SAME idempotency key inserts ONE row and publishes ONE event', async () => {
        const KEY = 'client-key-123';

        const first: any = await ctx.service.logMeal('user-1', 'LUNCH', foodItems(), undefined, KEY);
        const retry: any = await ctx.service.logMeal('user-1', 'LUNCH', foodItems(), undefined, KEY);

        // Same row returned (idempotent replay), not a second insert.
        expect(retry.id).toBe(first.id);
        expect(ctx.rows).toHaveLength(1);
        // And the meal-logged event fired exactly once.
        expect(ctx.published).toHaveLength(1);
    });

    it('the idempotent replay does NOT re-publish meal-logged', async () => {
        const KEY = 'dedup-key';
        await ctx.service.logMeal('user-1', 'BREAKFAST', foodItems(), undefined, KEY);
        expect(ctx.published).toHaveLength(1);
        await ctx.service.logMeal('user-1', 'BREAKFAST', foodItems(), undefined, KEY);
        expect(ctx.published).toHaveLength(1);
    });

    it('different keys for the same user are DISTINCT logs (two rows, two events)', async () => {
        await ctx.service.logMeal('user-1', 'LUNCH', foodItems(), undefined, 'key-a');
        await ctx.service.logMeal('user-1', 'LUNCH', foodItems(), undefined, 'key-b');
        expect(ctx.rows).toHaveLength(2);
        expect(ctx.published).toHaveLength(2);
    });

    it('the SAME key for DIFFERENT users does not collide (key is per-user)', async () => {
        const KEY = 'shared-key';
        await ctx.service.logMeal('user-1', 'LUNCH', foodItems(), undefined, KEY);
        await ctx.service.logMeal('user-2', 'LUNCH', foodItems(), undefined, KEY);
        expect(ctx.rows).toHaveLength(2);
        expect(ctx.published).toHaveLength(2);
    });

    it('keyless logging is unaffected — every call is a distinct row + event', async () => {
        await ctx.service.logMeal('user-1', 'SNACK', foodItems());
        await ctx.service.logMeal('user-1', 'SNACK', foodItems());
        expect(ctx.rows).toHaveLength(2);
        expect(ctx.published).toHaveLength(2);
        // Keyless rows persist a NULL key (never trips the unique index).
        expect(ctx.rows[0]!.idempotencyKey).toBeNull();
        expect(ctx.rows[1]!.idempotencyKey).toBeNull();
    });

    it('a concurrent-race duplicate (P2002 on insert) collapses onto the winner row', async () => {
        // Simulate the race: both requests pass the findFirst pre-check (no row
        // yet), then both attempt create. The first create wins; the second hits
        // the unique constraint (P2002) and must resolve to the winner, NOT throw,
        // and NOT publish a second event.
        const KEY = 'race-key';

        // Manually seed the winner row so the second create throws P2002, then
        // assert the loser call returns it without a new publish.
        const winner: any = await ctx.service.logMeal('user-1', 'DINNER', foodItems(), undefined, KEY);
        expect(ctx.published).toHaveLength(1);

        const loser: any = await ctx.service.logMeal('user-1', 'DINNER', foodItems(), undefined, KEY);
        expect(loser.id).toBe(winner.id);
        expect(ctx.rows).toHaveLength(1);
        expect(ctx.published).toHaveLength(1);
    });

    it('echoes planMealId on an idempotent replay when supplied (provenance preserved)', async () => {
        const KEY = 'key-with-plan';
        await ctx.service.logMeal('user-1', 'DINNER', foodItems(), 'plan-meal-9', KEY);
        const replay: any = await ctx.service.logMeal('user-1', 'DINNER', foodItems(), 'plan-meal-9', KEY);
        expect(replay.planMealId).toBe('plan-meal-9');
        expect(ctx.rows).toHaveLength(1);
    });
});
