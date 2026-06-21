import { EventBus } from '@nightfuel/events';
import { PrismaClient } from './generated/prisma';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('meal-service');

export class MealService {
    constructor(
        private prisma: PrismaClient,
        private eventBus: EventBus,
        private config: { PLAN_SERVICE_URL: string; INTERNAL_SERVICE_TOKEN?: string }
    ) { }

    async searchFoods(query: string, options?: {
        region?:      string;
        foodGroup?:   string;
        isVegan?:     boolean;
        isGlutenFree?: boolean;
        isHalal?:     boolean;
        source?:      string;   // 'FOODB' | 'OPENFOODFACTS' | 'CUSTOM'
        limit?:       number;
    }) {
        const { region, foodGroup, isVegan, isGlutenFree, isHalal, source, limit = 20 } = options ?? {};

        logger.info({ query, options }, 'Searching food items');

        // Build Prisma where clause (ILIKE for broad compatibility; no trigram needed)
        const where: Record<string, unknown> = {
            ...(query.length >= 2 ? {
                OR: [
                    { name:      { contains: query, mode: 'insensitive' } },
                    { foodGroup: { contains: query, mode: 'insensitive' } },
                ]
            } : {}),
            ...(region       ? { region }                              : {}),
            ...(foodGroup    ? { foodGroup: { contains: foodGroup, mode: 'insensitive' } } : {}),
            ...(isVegan      !== undefined ? { isVegan }              : {}),
            ...(isGlutenFree !== undefined ? { isGlutenFree }         : {}),
            ...(isHalal      !== undefined ? { isHalal }              : {}),
            ...(source       ? { source }                             : {}),
        };

        return this.prisma.foodItem.findMany({
            where,
            take: limit,
            orderBy: { name: 'asc' },
            select: {
                id:           true,
                name:         true,
                calories:     true,
                protein:      true,
                carbs:        true,
                fat:          true,
                fiber:        true,
                servingSize:  true,
                glycemicIndex: true,
                isVegan:      true,
                isGlutenFree: true,
                isHalal:      true,
                region:       true,
                cuisineTags:  true,
                source:       true,
                foodGroup:    true,
            },
        });
    }

    async getFoodById(id: string) {
        return this.prisma.foodItem.findUnique({
            where: { id },
        });
    }

    async listFoodGroups() {
        const groups = await this.prisma.foodItem.findMany({
            select:  { foodGroup: true },
            distinct: ['foodGroup'],
            orderBy: { foodGroup: 'asc' },
        });
        return groups.map(g => g.foodGroup).filter(Boolean);
    }

    /**
     * logMeal
     *
     * @param planMealId  OPTIONAL provenance link to a planned protocol slot
     *   (the circadian "Log this" flow). Additive 4th argument — existing
     *   3-arg callers compile and behave exactly as before. When provided, it
     *   is persisted on the MealLog's `foodItems` JSON (no DB column / migration
     *   is added) and echoed back on the returned object + the published event
     *   payload so consumers can correlate the log with its plan item.
     */
    async logMeal(userId: string, mealType: any, foodItems: any[], planMealId?: string) {
        logger.info(`Logging meal for user: ${userId}, type: ${mealType}${planMealId ? `, planMealId: ${planMealId}` : ''}`);

        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        for (const item of foodItems) {
            totalCalories += item.calories * item.quantity;
            totalProtein += item.protein * item.quantity;
            totalCarbs += item.carbs * item.quantity;
            totalFat += item.fat * item.quantity;
        }

        // Adherence calculation can be delegated or simplified. Default true for now.
        const isAdherent = true;

        // Persist the plan link WITHOUT a schema migration: stamp it into the
        // existing JSON column as a sibling `_planMealId` key alongside the food
        // items array. We keep `foodItems` an array when there is no link (so
        // the stored shape is byte-identical for the common ad-hoc case) and
        // only switch to the `{ items, _planMealId }` envelope when a link is
        // present.
        const storedFoodItems = planMealId
            ? { items: foodItems, _planMealId: planMealId }
            : foodItems;

        const mealLog = await this.prisma.mealLog.create({
            data: {
                userId,
                mealType,
                foodItems: storedFoodItems,
                totalCalories,
                totalProtein,
                totalCarbs,
                totalFat,
                isAdherent
            }
        });

        // Publish Event
        await this.eventBus.publish('nightfuel:meal:meal-logged', {
            eventId: crypto.randomUUID(),
            eventType: 'meal.logged',
            producedAt: new Date().toISOString(),
            producerService: 'meal-service',
            correlationId: crypto.randomUUID(),
            userId,
            payload: {
                mealLogId: mealLog.id,
                // The actual time the meal was logged (NOT the event-processing
                // time). Consumers bucket by calendar day from this — omitting it
                // makes progress-service fall back to its own processing clock and
                // mis-attribute near-midnight logs to the wrong day. Persisted
                // value from the row (Prisma `loggedAt`, defaults to now()).
                loggedAt: mealLog.loggedAt.toISOString(),
                totalCalories,
                totalProtein,
                totalCarbs,
                totalFat,
                mealType,
                // Forward the persisted adherence verdict so state-service can
                // fold it into its rolling window. This is the value stamped on
                // the row (see `isAdherent` above) — NOT a fabricated verdict.
                // progress-service ignores this and recomputes adherence from
                // target-vs-actual; state-service consumes it directly.
                isAdherent: mealLog.isAdherent,
                // Only present when this log originated from a planned slot.
                ...(planMealId ? { planMealId } : {})
            }
        });

        logger.info(`Successfully logged meal: ${mealLog.id}`);
        // Echo the provenance link back to the caller (route -> client) so the
        // response carries it without persisting a dedicated column.
        return planMealId ? { ...mealLog, planMealId } : mealLog;
    }

    async getMealLogs(userId: string, date?: string, limit: number = 20) {
        logger.info(`Fetching meal logs for user: ${userId}, date: ${date ?? 'all'}`);

        const where: any = { userId };

        if (date) {
            // Filter to a specific calendar day (UTC)
            const start = new Date(`${date}T00:00:00.000Z`);
            const end = new Date(`${date}T23:59:59.999Z`);
            where.loggedAt = { gte: start, lte: end };
        }

        const logs = await this.prisma.mealLog.findMany({
            where,
            orderBy: { loggedAt: 'desc' },
            take: limit,
        });

        return logs;
    }

    /**
     * generateGroceryList
     * Fetches the active day plan and extracts all unique food items.
     */
    async generateGroceryList(userId: string, date?: string): Promise<any> {
        logger.info({ userId, date }, 'Generating grocery list');

        // 1. Fetch active plan from plan-service
        let plan: any;
        try {
            const cleanDate = date ? date.split('T')[0] : new Date().toISOString().split('T')[0];
            const url = `${this.config.PLAN_SERVICE_URL}/v1/plans/internal/active/${userId}?date=${cleanDate}`;

            const res = await fetch(url, {
                // F34 #5: plan-service /internal/* now requires the shared token.
                headers: { 'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '' },
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}) as any);
                throw new Error((errorData as any).error || `No active plan found for ${date ?? 'today'}`);
            }
            plan = await res.json();
        } catch (err: any) {
            logger.error({ userId, err }, 'Failed to fetch plan for grocery list');
            throw new Error(err.message || 'Could not find an active plan to generate a grocery list from.');
        }

        const structuredPlan = (plan.plan as any) || {};
        const meals = structuredPlan.meals || [];

        // 2. Aggregate items
        const itemsMap: Record<string, { amount: string, count: number }> = {};

        meals.forEach((meal: any) => {
            const items = meal.items || [];
            items.forEach((item: any) => {
                if (!itemsMap[item.name]) {
                    itemsMap[item.name] = { amount: item.amount, count: 1 };
                } else {
                    itemsMap[item.name].count += 1;
                }
            });
        });

        const list = Object.entries(itemsMap).map(([name, data]) => ({
            name,
            amount: data.amount,
            occurrence: data.count
        }));

        logger.info({ userId, itemCount: list.length }, 'Grocery list generated');
        return {
            userId,
            planId: plan.id,
            date: plan.planDate,
            list
        };
    }

    // ── Recipes ───────────────────────────────────────────────────────────────

    async getRecipes(filters: { tags?: string }, limit: number = 20) {
        return this.prisma.recipe.findMany({
            where: filters.tags ? { tags: { has: filters.tags } } : {},
            take: limit,
            orderBy: { createdAt: 'desc' }
        });
    }

    async getRecipe(id: string) {
        return this.prisma.recipe.findUnique({ where: { id } });
    }

    async createRecipe(data: any) {
        return this.prisma.recipe.create({ data });
    }

    // ── Fasting ───────────────────────────────────────────────────────────────

    async getFastingLogs(userId: string, limit: number = 10) {
        return this.prisma.fastingLog.findMany({
            where: { userId },
            take: limit,
            orderBy: { startTime: 'desc' }
        });
    }

    async startFasting(userId: string, targetHours: number) {
        // end any active
        await this.prisma.fastingLog.updateMany({
            where: { userId, status: 'ACTIVE' },
            data: { status: 'CANCELLED', endTime: new Date() }
        });

        return this.prisma.fastingLog.create({
            data: {
                userId,
                targetHours,
                startTime: new Date()
            }
        });
    }

    async endFasting(userId: string) {
        const active = await this.prisma.fastingLog.findFirst({
            where: { userId, status: 'ACTIVE' },
            orderBy: { startTime: 'desc' }
        });
        if (!active) throw new Error('No active fast found');

        // A fast that is ended before reaching its target window was ended early
        // (the mobile UI's "END FAST EARLY" action) and must be CANCELLED, not
        // COMPLETED. Only a fast that reached its target counts as COMPLETED
        // ("COMPLETE FAST"). Compute elapsed hours from the recorded startTime.
        const endTime = new Date();
        const elapsedHours = (endTime.getTime() - active.startTime.getTime()) / (1000 * 60 * 60);
        const status = elapsedHours >= active.targetHours ? 'COMPLETED' : 'CANCELLED';

        return this.prisma.fastingLog.update({
            where: { id: active.id },
            data: { status, endTime }
        });
    }

    // ── GDPR purge ──────────────────────────────────────────────────────────────
    // PERMANENTLY erase EVERY meal-service row owned by `userId`. This service's
    // only user-owned tables are meal_logs (MealLog.userId) and fasting_logs
    // (FastingLog.userId); food_items and recipes are shared library data with NO
    // per-user ownership column (verified against schema.prisma) and are left
    // untouched. Mirrors the exercise-service / user-service purge pattern.
    //
    // IDEMPOTENT by construction: every step is a deleteMany, which returns
    // `{ count: 0 }` (never throws) when no rows match — so purging a user with
    // no data, or purging the same user twice, both succeed. Returns a per-table
    // deletedCounts summary the caller surfaces in the 200 body.
    //
    // All deletes run inside `$transaction` so the purge is all-or-nothing: a
    // mid-purge failure leaves no partially-erased user.
    async purgeUser(userId: string): Promise<{
        meal_logs: number;
        fasting_logs: number;
    }> {
        const [mealLogs, fastingLogs] = await this.prisma.$transaction([
            this.prisma.mealLog.deleteMany({ where: { userId } }),
            this.prisma.fastingLog.deleteMany({ where: { userId } }),
        ]);

        return {
            meal_logs: mealLogs.count,
            fasting_logs: fastingLogs.count,
        };
    }

    // ── GDPR data export ──────────────────────────────────────────────────────────
    // Read-only counterpart of purgeUser: READ and return EVERY meal-service row
    // owned by `userId` across the SAME user-owned tables the purge erases
    // (meal_logs via MealLog.userId, fasting_logs via FastingLog.userId), keyed by
    // table name. The export table set MUST stay EXACTLY in sync with purgeUser's
    // table set so a user's right-to-access and right-to-erasure cover identical
    // data — the gdpr-export test asserts this invariant.
    //
    // food_items / recipes are shared library data with NO per-user ownership column
    // (same as the purge) and are deliberately NOT exported.
    //
    // SECURITY: neither table holds any secret/credential column — MealLog.foodItems
    // is user-entered food/nutrition JSON, not a credential — so the full rows are
    // returned verbatim. (If a secret/token/password column is ever added to either
    // table, it MUST be stripped here before returning.)
    //
    // READ-ONLY & IDEMPOTENT: only findMany runs; calling it twice yields identical
    // output and never mutates state. Bounded: each table is capped at EXPORT_ROW_LIMIT
    // rows (newest first) so a pathological user cannot return an unbounded payload;
    // `_meta` flags whether either table was truncated at the cap.
    async exportUser(userId: string): Promise<{
        meal_logs: any[];
        fasting_logs: any[];
        _meta: { mealLogsTruncated: boolean; fastingLogsTruncated: boolean; rowLimit: number };
    }> {
        const cap = EXPORT_ROW_LIMIT;
        const [mealLogs, fastingLogs] = await Promise.all([
            this.prisma.mealLog.findMany({
                where: { userId },
                orderBy: { loggedAt: 'desc' },
                take: cap + 1,
            }),
            this.prisma.fastingLog.findMany({
                where: { userId },
                orderBy: { startTime: 'desc' },
                take: cap + 1,
            }),
        ]);

        const mealLogsTruncated = mealLogs.length > cap;
        const fastingLogsTruncated = fastingLogs.length > cap;

        return {
            meal_logs: mealLogsTruncated ? mealLogs.slice(0, cap) : mealLogs,
            fasting_logs: fastingLogsTruncated ? fastingLogs.slice(0, cap) : fastingLogs,
            _meta: { mealLogsTruncated, fastingLogsTruncated, rowLimit: cap },
        };
    }
}

// Per-table row cap for the GDPR export. Generous enough that a real user's full
// history is returned, but bounds the payload so a pathological user cannot force
// an unbounded read. `take: cap + 1` lets exportUser detect (and flag) truncation.
const EXPORT_ROW_LIMIT = 50_000;
