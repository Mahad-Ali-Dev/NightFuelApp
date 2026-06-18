import { PrismaClient } from './generated/prisma';
import { EventBus } from '@nightfuel/events';
import { Channels, PlanGeneratedPayload, PlanRatingSubmittedPayload } from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import CircuitBreaker from 'opossum';
import crypto from 'crypto';

const logger = createLogger('plan-service');

export class PlanService {
    private breaker: CircuitBreaker;

    constructor(
        private prisma: PrismaClient,
        private eventBus: EventBus,
        private config: { AI_PIPELINE_URL: string, USER_SERVICE_URL: string, STATE_SERVICE_URL: string, DECISION_ENGINE_URL: string, MEAL_SERVICE_URL: string, EXERCISE_SERVICE_URL: string }
    ) {
        const breakerOptions = {
            timeout: 30000,           // 30s — LLM calls can be slow
            errorThresholdPercentage: 50,
            resetTimeout: 30000
        };
        this.breaker = new CircuitBreaker(this.makeAIRequest.bind(this), breakerOptions);
        this.breaker.fallback(() => {
            throw new Error('AI Pipeline is currently unavailable (Circuit Breaker Tripped)');
        });
    }

    private async makeAIRequest(userId: string, date: string, shiftType: string, planParams: any, circadianProfile?: any, context?: any): Promise<any> {
        logger.info(`Making HTTP request to ai-pipeline at ${this.config.AI_PIPELINE_URL}/v1/ai/generate-plan`);
        const response = await fetch(`${this.config.AI_PIPELINE_URL}/v1/ai/generate-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                date,
                shiftType,
                circadianProfile,
                planParams, // Pass deterministic parameters here
                context    // Pass meal/exercise context here
            })
        });

        if (!response.ok) {
            const text = await response.text();
            logger.error(`AI pipeline failed with HTTP ${response.status}: ${text}`);
            throw new Error(`AI pipeline error: ${response.statusText}`);
        }

        return (await response.json()) as any;
    }

    async generateAndStorePlan(profileData: any, userId: string, date: string, shiftId: string | null = null, shiftType: string = 'ROTATING'): Promise<any> {
        logger.info(`Generating plan for user ${userId} on ${date}`);

        // 1. Fetch user state from state-service
        let userState = null;
        try {
            const stateRes = await fetch(`${this.config.STATE_SERVICE_URL}/v1/state/${userId}`);
            if (stateRes.ok) {
                userState = await stateRes.json();
                logger.info({ userId }, 'Fetched user state for decision engine');
            }
        } catch (err) {
            logger.warn({ userId, err }, 'Failed to fetch user state, falling back to defaults');
        }

        // 2. Fetch user preferences
        let preferences = null;
        try {
            const prefRes = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/preferences/${userId}`);
            if (prefRes.ok) {
                preferences = await prefRes.json();
                logger.info({ userId }, 'Fetched user preferences for AI plan');
            }
        } catch (err) {
            logger.warn({ userId, err }, 'Failed to fetch user preferences');
        }

        // 3. Fetch Meal Context
        let mealContext = [];
        try {
            const mealRes = await fetch(`${this.config.MEAL_SERVICE_URL}/v1/meals/${userId}?date=${date}`);
            if (mealRes.ok) {
                mealContext = await mealRes.json() as any[];
                logger.debug({ userId }, 'Fetched meal context for AI');
            }
        } catch (err) {
            logger.warn({ userId, err }, 'Failed to fetch meal context');
        }

        // 4. Fetch Exercise Context
        let exerciseContext = [];
        try {
            // Fetch recent workouts (limit 5 for context)
            const exerciseRes = await fetch(`${this.config.EXERCISE_SERVICE_URL}/v1/workouts/${userId}?limit=5`);
            if (exerciseRes.ok) {
                exerciseContext = await exerciseRes.json() as any[];
                logger.debug({ userId }, 'Fetched exercise context for AI');
            }
        } catch (err) {
            logger.warn({ userId, err }, 'Failed to fetch exercise context');
        }

        const context = {
            meals: mealContext,
            workouts: exerciseContext
        };

        // 5. Determine Plan Parameters (Protocol Override vs. Decision Engine)
        let planParams = null;
        const prefs = preferences as any;

        if (prefs?.activeProtocolId) {
            try {
                const protocol = await this.prisma.protocolTemplate.findUnique({
                    where: { id: prefs.activeProtocolId }
                });
                if (protocol) {
                    planParams = protocol.parameters as any;
                    logger.info({ userId, protocolId: protocol.id }, 'Using assigned specialist protocol for plan parameters');
                }
            } catch (err) {
                logger.error({ userId, protocolId: prefs.activeProtocolId, err }, 'Failed to fetch assigned protocol');
            }
        }

        if (!planParams) {
            try {
                const decisionRes = await fetch(`${this.config.DECISION_ENGINE_URL}/v1/decision/compute-params`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userState: userState ?? {
                            userId,
                            currentWeightKg: 80,
                            last7DaysAdherence: 1.0,
                            avgSleepQuality: 7,
                            fatigueLevel: 3,
                            currentCalorieTarget: 2000,
                            currentProteinTargetG: 150,
                            trainingPhase: 'HYPERTROPHY',
                            cycleWeek: 1
                        },
                        goal: (preferences as any)?.primaryGoal ?? 'MAINTENANCE'
                    })
                });
                if (decisionRes.ok) {
                    planParams = await decisionRes.json() as any;
                    logger.info({ userId, planParams }, 'Decision engine computed parameters');
                }
            } catch (err) {
                logger.error({ userId, err }, 'Decision engine call failed');
            }
        }

        // Fallback to safe defaults if everything else fails
        if (!planParams) {
            planParams = {
                calories: (preferences as any)?.targetCalories ?? 2000,
                protein_g: (preferences as any)?.targetProteinG ?? 150,
                volume_modifier: 1.0,
                training_split: 'PUSH_PULL_LEGS',
                deload: false
            };
        }

        // 6. AI Cost Guard
        const lastPlan = await this.prisma.dayPlan.findFirst({
            where: { userId, planDate: new Date(date), status: 'ACTIVE' },
            orderBy: { planVersion: 'desc' },
        });

        if (lastPlan) {
            const lastPlanParams = (lastPlan.plan as any)?.parameters;
            const isSignificantChange = !lastPlanParams ||
                Math.abs(lastPlanParams.calories - planParams.calories) > 50 ||
                Math.abs(lastPlanParams.protein_g - planParams.protein_g) > 10 ||
                lastPlanParams.volume_modifier !== planParams.volume_modifier ||
                lastPlanParams.deload !== planParams.deload;

            if (!isSignificantChange) {
                logger.info({ userId, date }, 'AI Cost Guard: No significant state change, reusing existing plan');
                return lastPlan;
            }
        }

        // 7. Call AI Pipeline
        const startMs = Date.now();
        let planResult: any;
        let latencyMs = 0;

        try {
            planResult = await this.breaker.fire(userId, date, shiftType, planParams, profileData, context) as any;
            latencyMs = Date.now() - startMs;
            logger.info(`AI plan received in ${latencyMs}ms for user ${userId}`);
        } catch (aiErr: any) {
            latencyMs = Date.now() - startMs;
            logger.warn({ userId, err: aiErr.message }, 'AI pipeline unavailable, using fallback plan');
            // Fallback plan template when AI is unreachable
            planResult = {
                structuredPlan: {
                    meals: [
                        { time: '07:00', label: 'Breakfast', description: 'Oatmeal with banana, honey & mixed nuts', macros: { calories: 450, protein: 15, carbs: 65, fat: 16 } },
                        { time: '10:00', label: 'Snack', description: 'Greek yogurt with berries', macros: { calories: 200, protein: 20, carbs: 22, fat: 5 } },
                        { time: '13:00', label: 'Lunch', description: 'Grilled chicken breast with rice & vegetables', macros: { calories: 550, protein: 45, carbs: 55, fat: 12 } },
                        { time: '16:00', label: 'Snack', description: 'Protein shake with almond butter', macros: { calories: 300, protein: 30, carbs: 15, fat: 14 } },
                        { time: '19:00', label: 'Dinner', description: 'Salmon with sweet potato & steamed broccoli', macros: { calories: 500, protein: 40, carbs: 40, fat: 18 } },
                    ],
                    supplements: ['Vitamin D3 (2000 IU)', 'Magnesium (400mg)', 'Omega-3 (1000mg)'],
                    hydrationTargetMl: 3000,
                    calorieTarget: planParams.calories ?? 2000,
                    proteinTargetG: planParams.protein_g ?? 150,
                    carbsTargetG: 200,
                    fatTargetG: 65,
                },
                providerUsed: 'fallback',
                tokensUsed: 0,
            };
        }

        // 8. Supersede existing plans
        await this.prisma.dayPlan.updateMany({
            where: { userId, planDate: new Date(date), status: 'ACTIVE' },
            data: { status: 'SUPERSEDED' },
        });

        const nextVersion = (lastPlan?.planVersion ?? 0) + 1;

        const createdPlan = await this.prisma.dayPlan.create({
            data: {
                userId,
                planDate: new Date(date),
                shiftId,
                planVersion: nextVersion,
                plan: {
                    ...planResult.structuredPlan,
                    parameters: planParams
                },
                generationModel: planResult.providerUsed ?? 'openai',
                generationLatencyMs: latencyMs,
                generationTokens: planResult.tokensUsed ?? null,
                status: 'ACTIVE',
            },
        });

        // 9. Publish event (non-blocking — don't crash on Redis failure)
        try {
            const sp = (planResult.structuredPlan as any) ?? {};
            const planPayload: PlanGeneratedPayload = {
                planId: createdPlan.id,
                planDate: date,
                shiftId: shiftId ?? null,
                calorieTarget: planParams.calories,
                proteinTargetG: planParams.protein_g,
                carbsTargetG: sp.carbsTargetG ?? (planParams.calories - planParams.protein_g * 4 - (sp.fatTargetG ?? 65) * 9) / 4,
                fatTargetG: sp.fatTargetG ?? 65,
                generationModel: createdPlan.generationModel,
                generationLatencyMs: latencyMs,
            };

            await this.eventBus.publish<PlanGeneratedPayload>(Channels.Plan.PlanGenerated, {
                eventId: crypto.randomUUID(),
                eventType: 'plan.generated',
                producedAt: new Date().toISOString(),
                producerService: 'plan-service',
                correlationId: crypto.randomUUID(),
                userId,
                payload: planPayload,
            });
        } catch (pubErr: any) {
            logger.warn({ err: pubErr.message }, 'Failed to publish plan.generated event (non-fatal)');
        }

        logger.info({ planId: createdPlan.id }, 'Plan stabilized and published');
        return createdPlan;
    }

    /**
     * storePlan — persist a pre-generated plan that was already produced by the AI pipeline.
     * Used by the frontend to avoid a duplicate AI call while still recording the plan.
     */
    async storePlan(
        structuredPlan: any,
        userId: string,
        date: string,
        shiftId: string | null = null,
        shiftType: string = 'ROTATING',
        providerUsed = 'openai',
        tokensUsed: number | null = null,
    ): Promise<any> {
        logger.info({ userId, date }, 'Storing pre-generated plan');

        await this.prisma.dayPlan.updateMany({
            where: { userId, planDate: new Date(date), status: 'ACTIVE' },
            data: { status: 'SUPERSEDED' },
        });

        // Get highest current version
        const lastPlan = await this.prisma.dayPlan.findFirst({
            where: { userId, planDate: new Date(date) },
            orderBy: { planVersion: 'desc' },
            select: { planVersion: true }
        });
        const nextVersion = (lastPlan?.planVersion ?? 0) + 1;

        const createdPlan = await this.prisma.dayPlan.create({
            data: {
                userId,
                planDate: new Date(date),
                shiftId,
                planVersion: nextVersion,
                plan: structuredPlan,
                generationModel: providerUsed,
                generationLatencyMs: null,
                generationTokens: tokensUsed,
                status: 'ACTIVE',
            },
        });

        const sp = (structuredPlan as any) ?? {};
        const planPayload: PlanGeneratedPayload = {
            planId: createdPlan.id,
            planDate: date,
            shiftId: shiftId ?? null,
            calorieTarget: sp.calorieTarget ?? 2000,
            proteinTargetG: sp.proteinTargetG ?? 150,
            carbsTargetG: sp.carbsTargetG ?? 200,
            fatTargetG: sp.fatTargetG ?? 65,
            generationModel: providerUsed,
            generationLatencyMs: 0,
        };

        await this.eventBus.publish<PlanGeneratedPayload>(Channels.Plan.PlanGenerated, {
            eventId: crypto.randomUUID(),
            eventType: 'plan.generated',
            producedAt: new Date().toISOString(),
            producerService: 'plan-service',
            correlationId: crypto.randomUUID(),
            userId,
            payload: planPayload,
        });

        logger.info({ planId: createdPlan.id }, 'Plan stored and event published');
        return createdPlan;
    }

    async getPlanByDate(userId: string, date: string) {
        return this.prisma.dayPlan.findFirst({
            where: { userId, planDate: new Date(date), status: 'ACTIVE' },
            orderBy: { planVersion: 'desc' },
        });
    }

    async getPlanHistory(userId: string, range?: { start?: string; end?: string }) {
        // Always scope to the caller. When BOTH bounds are supplied (the schema
        // has already validated start <= end), narrow to that inclusive
        // planDate window; otherwise the where-clause and take:30 cap are
        // byte-identical to the original no-params query.
        const where: { userId: string; planDate?: { gte: Date; lte: Date } } = { userId };
        if (range?.start !== undefined && range?.end !== undefined) {
            where.planDate = { gte: new Date(range.start), lte: new Date(range.end) };
        }
        return this.prisma.dayPlan.findMany({
            where,
            orderBy: { planDate: 'desc' },
            take: 30,
        });
    }

    async ratePlan(planId: string, userId: string, rating: number): Promise<void> {
        const plan = await this.prisma.dayPlan.findFirst({ where: { id: planId, userId } });
        if (!plan) throw new Error('Plan not found or not owned by user');

        await this.prisma.dayPlan.update({
            where: { id: planId },
            data: { userRating: rating },
        });

        const ratingPayload: PlanRatingSubmittedPayload = {
            planId,
            planDate: plan.planDate.toISOString().split('T')[0],
            rating,
        };

        await this.eventBus.publish<PlanRatingSubmittedPayload>(Channels.Plan.RatingSubmitted, {
            eventId: crypto.randomUUID(),
            eventType: 'plan.rating-submitted',
            producedAt: new Date().toISOString(),
            producerService: 'plan-service',
            correlationId: crypto.randomUUID(),
            userId,
            payload: ratingPayload,
        });

        logger.info({ planId, rating }, 'Plan rating saved and event published');
    }

    // ── Protocol Template Management ──────────────────────────────────────────

    async createProtocolTemplate(creatorId: string, data: any) {
        return this.prisma.protocolTemplate.create({
            data: {
                ...data,
                creatorId,
            }
        });
    }

    async getProtocolTemplates(creatorId: string) {
        return this.prisma.protocolTemplate.findMany({
            where: {
                OR: [
                    { creatorId },
                    { isPublic: true }
                ]
            }
        });
    }

    async getProtocolTemplateById(id: string, creatorId: string) {
        const protocol = await this.prisma.protocolTemplate.findUnique({
            where: { id }
        });

        if (!protocol) throw new Error('Protocol not found');
        if (protocol.creatorId !== creatorId && !protocol.isPublic) {
            throw new Error('Unauthorized access to protocol');
        }

        return protocol;
    }

    async updateProtocolTemplate(id: string, creatorId: string, data: any) {
        const protocol = await this.prisma.protocolTemplate.findUnique({
            where: { id }
        });

        if (!protocol) throw new Error('Protocol not found');
        if (protocol.creatorId !== creatorId) {
            throw new Error('Unauthorized: Only creator can update protocol');
        }

        return this.prisma.protocolTemplate.update({
            where: { id },
            data
        });
    }

    async deleteProtocolTemplate(id: string, creatorId: string) {
        const protocol = await this.prisma.protocolTemplate.findUnique({
            where: { id }
        });

        if (!protocol) throw new Error('Protocol not found');
        if (protocol.creatorId !== creatorId) {
            throw new Error('Unauthorized: Only creator can delete protocol');
        }

        return this.prisma.protocolTemplate.delete({
            where: { id }
        });
    }
}
