import { EventBus } from '@nightfuel/events';
import { PrismaClient } from './generated/prisma';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('meal-service');

export class MealService {
    constructor(
        private prisma: PrismaClient,
        private eventBus: EventBus,
        private config: { PLAN_SERVICE_URL: string }
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

    async logMeal(userId: string, mealType: any, foodItems: any[]) {
        logger.info(`Logging meal for user: ${userId}, type: ${mealType}`);

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

        const mealLog = await this.prisma.mealLog.create({
            data: {
                userId,
                mealType,
                foodItems,
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
                totalCalories,
                totalProtein,
                totalCarbs,
                totalFat,
                mealType
            }
        });

        logger.info(`Successfully logged meal: ${mealLog.id}`);
        return mealLog;
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

            const res = await fetch(url);
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

        return this.prisma.fastingLog.update({
            where: { id: active.id },
            data: { status: 'COMPLETED', endTime: new Date() }
        });
    }
}
