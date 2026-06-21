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
        private config: { AI_PIPELINE_URL: string, USER_SERVICE_URL: string, STATE_SERVICE_URL: string, DECISION_ENGINE_URL: string, MEAL_SERVICE_URL: string, EXERCISE_SERVICE_URL: string, INTERNAL_SERVICE_TOKEN?: string }
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

    /**
     * Map the decision-engine / protocol `planParams` (snake_case, top-level) into
     * the EXACT logicTargets shape ai-pipeline's DayPlanRequest expects.
     *
     * WHY THIS EXISTS (the wiring-gap fix): plan-service historically sent only a
     * top-level `planParams` ({calories, protein_g, volume_modifier, ...}), but
     * DayPlanRequest has NO `planParams` field — Pydantic silently dropped it. So
     * `request.logicTargets` was always None and the prompt's "DETERMINISTIC
     * TARGETS (STRICT ADHERENCE REQUIRED)" block NEVER fired: the engine's numeric
     * (and phase-adjusted) calories/volume never reached the LLM. We now translate
     * planParams -> logicTargets so that block fires for EVERY plan.
     *
     * Mapping (mirrors models.py LogicTargets, all ints + a float multiplier):
     *   calories         -> calorieTarget
     *   protein_g        -> proteinTargetG
     *   carbs/fat        -> carbsTargetG / fatTargetG (derived the SAME way the
     *                       plan.generated event already derives them, so there is
     *                       one canonical macro derivation)
     *   volume_modifier  -> trainingVolumeMultiplier
     *
     * Returns null when calories/protein aren't usable numbers, so a malformed
     * planParams degrades to "no deterministic block" (the prior behaviour) rather
     * than emitting NaN targets. cyclePhase stays a separate top-level field.
     */
    private buildLogicTargets(planParams: any): {
        calorieTarget: number;
        proteinTargetG: number;
        carbsTargetG: number;
        fatTargetG: number;
        trainingVolumeMultiplier: number;
    } | null {
        const p = planParams ?? {};
        const calories = Number(p.calories);
        const proteinG = Number(p.protein_g);
        if (!Number.isFinite(calories) || !Number.isFinite(proteinG)) return null;

        // Fat: explicit if provided, else the same 65g default the event payload uses.
        const fatTargetG = Number.isFinite(Number(p.fat_g)) ? Number(p.fat_g) : 65;
        // Carbs: explicit if provided, else remaining-calorie derivation
        // (cal - protein*4 - fat*9) / 4 — identical to the plan.generated payload.
        const carbsTargetG = Number.isFinite(Number(p.carbs_g))
            ? Number(p.carbs_g)
            : (calories - proteinG * 4 - fatTargetG * 9) / 4;

        const volume = Number(p.volume_modifier);
        const trainingVolumeMultiplier = Number.isFinite(volume) ? volume : 1.0;

        return {
            calorieTarget: Math.round(calories),
            proteinTargetG: Math.round(proteinG),
            // Carbs can go negative for absurd inputs; clamp at 0 so the prompt
            // never shows a nonsensical negative macro target.
            carbsTargetG: Math.max(0, Math.round(carbsTargetG)),
            fatTargetG: Math.max(0, Math.round(fatTargetG)),
            trainingVolumeMultiplier,
        };
    }

    private async makeAIRequest(userId: string, date: string, shiftType: string, planParams: any, circadianProfile?: any, context?: any, cyclePhase: string = 'UNKNOWN'): Promise<any> {
        logger.info(`Making HTTP request to ai-pipeline at ${this.config.AI_PIPELINE_URL}/v1/ai/generate-plan`);

        // Translate planParams -> logicTargets in the EXACT shape DayPlanRequest
        // expects so the prompt's DETERMINISTIC TARGETS block fires (see
        // buildLogicTargets). planParams is still sent for backward compatibility
        // (extra fields are ignored by Pydantic).
        const logicTargets = this.buildLogicTargets(planParams);

        const response = await fetch(`${this.config.AI_PIPELINE_URL}/v1/ai/generate-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // F22 #8: authorize this server-to-server call to ai-pipeline.
                'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '',
            },
            body: JSON.stringify({
                userId,
                date,
                shiftType,
                circadianProfile,
                planParams,    // legacy passthrough (Pydantic ignores unknown fields)
                logicTargets,  // canonical deterministic targets the prompt reads
                context,       // Pass meal/exercise context here
                // Derived menstrual-cycle phase (UNKNOWN if unavailable). The
                // ai-pipeline applies a SMALL phase-aware prompt nudge only when
                // != UNKNOWN, so non-tracking users see no change.
                cyclePhase
            })
        });

        if (!response.ok) {
            const text = await response.text();
            logger.error(`AI pipeline failed with HTTP ${response.status}: ${text}`);
            throw new Error(`AI pipeline error: ${response.statusText}`);
        }

        return (await response.json()) as any;
    }

    /**
     * Supersede the user's ACTIVE plans for `date` and create the next-versioned
     * row, concurrency-safe.
     *
     * planVersion is a read-max-then-create value guarded by
     * @@unique([userId, planDate, planVersion]). Two generations racing on the
     * same (userId, date) can read the same max and both compute the same
     * nextVersion — the second create then throws P2002, surfacing as a 500
     * *after* a paid AI call. We recompute nextVersion from the current max and
     * retry the create on P2002 (up to MAX_VERSION_RETRIES times) so the loser of
     * the race simply takes the next free version instead of failing.
     *
     * The single-call happy path is unchanged: first attempt reads the max,
     * creates version max+1, and returns — no extra round-trips on success beyond
     * the (already present) max lookup.
     */
    private async createNextVersionedPlan(
        userId: string,
        date: string,
        buildData: (nextVersion: number) => any,
    ): Promise<any> {
        const MAX_VERSION_RETRIES = 3;
        const planDate = new Date(date);

        // Supersede once — this is idempotent across retries (already-SUPERSEDED
        // rows are simply not re-matched by the status:'ACTIVE' filter).
        await this.prisma.dayPlan.updateMany({
            where: { userId, planDate, status: 'ACTIVE' },
            data: { status: 'SUPERSEDED' },
        });

        let lastErr: any;
        for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
            const maxPlan = await this.prisma.dayPlan.findFirst({
                where: { userId, planDate },
                orderBy: { planVersion: 'desc' },
                select: { planVersion: true },
            });
            const nextVersion = (maxPlan?.planVersion ?? 0) + 1;

            try {
                return await this.prisma.dayPlan.create({ data: buildData(nextVersion) });
            } catch (err: any) {
                // P2002 = unique constraint collision on the version: a concurrent
                // generation grabbed this version first. Recompute + retry.
                if (err?.code === 'P2002') {
                    lastErr = err;
                    logger.warn(
                        { userId, date, attempt: attempt + 1, nextVersion },
                        'planVersion collision (P2002) — recomputing next version and retrying',
                    );
                    continue;
                }
                throw err;
            }
        }

        logger.error({ userId, date }, 'Exhausted planVersion retries after repeated P2002 collisions');
        throw lastErr;
    }

    async generateAndStorePlan(profileData: any, userId: string, date: string, shiftId: string | null = null, shiftType: string = 'ROTATING', aiGenerated: boolean = false): Promise<any> {
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
            const prefRes = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/preferences/${userId}`, {
                // F34 #5: user-service /internal/* now requires the shared token.
                headers: { 'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '' },
            });
            if (prefRes.ok) {
                preferences = await prefRes.json();
                logger.info({ userId }, 'Fetched user preferences for AI plan');
            }
        } catch (err) {
            logger.warn({ userId, err }, 'Failed to fetch user preferences');
        }

        // 2b. Fetch the derived menstrual-cycle phase from user-service's status
        // (digital twin). Defaults to 'UNKNOWN' if the status is missing/unreachable
        // or has no phase yet — UNKNOWN is a strict no-op downstream (decision-engine
        // modifiers + ai-pipeline prompt), so a fetch failure NEVER changes the plan
        // for non-tracking users (or anyone). This is best-effort and non-fatal.
        let cyclePhase = 'UNKNOWN';
        try {
            const statusRes = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/status/${userId}`, {
                // F34 #5: user-service /internal/* now requires the shared token.
                headers: { 'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '' },
            });
            if (statusRes.ok) {
                const status = await statusRes.json() as any;
                if (typeof status?.cyclePhase === 'string' && status.cyclePhase) {
                    cyclePhase = status.cyclePhase;
                }
                logger.debug({ userId, cyclePhase }, 'Fetched cycle phase for plan');
            }
        } catch (err) {
            logger.warn({ userId, err }, 'Failed to fetch cycle phase, defaulting to UNKNOWN');
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
                        userState: {
                            ...(userState ?? {
                                userId,
                                currentWeightKg: 80,
                                last7DaysAdherence: 1.0,
                                avgSleepQuality: 7,
                                fatigueLevel: 3,
                                currentCalorieTarget: 2000,
                                currentProteinTargetG: 150,
                                trainingPhase: 'HYPERTROPHY',
                                cycleWeek: 1
                            }),
                            // Inject the derived cycle phase (UNKNOWN if unavailable —
                            // a strict no-op in the engine, so this is safe for everyone).
                            cyclePhase,
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
            planResult = await this.breaker.fire(userId, date, shiftType, planParams, profileData, context, cyclePhase) as any;
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

        // 8. Supersede existing plans + persist the new version.
        // Versioning is concurrency-safe: supersede, recompute nextVersion from the
        // current max, and create — retrying on P2002 (the @@unique([userId,
        // planDate, planVersion]) collision two racing generations would otherwise
        // surface as a 500 AFTER the paid AI call). See createNextVersionedPlan.
        const createdPlan = await this.createNextVersionedPlan(userId, date, (nextVersion) => ({
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
            aiGenerated,
        }));

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

        // Supersede existing plans + persist the new version with the same
        // concurrency-safe versioning as generateAndStorePlan (retry on the
        // @@unique([userId, planDate, planVersion]) P2002 collision).
        const createdPlan = await this.createNextVersionedPlan(userId, date, (nextVersion) => ({
            userId,
            planDate: new Date(date),
            shiftId,
            planVersion: nextVersion,
            plan: structuredPlan,
            generationModel: providerUsed,
            generationLatencyMs: null,
            generationTokens: tokensUsed,
            status: 'ACTIVE',
        }));

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

    /**
     * GDPR purge — PERMANENTLY delete EVERY plan-service row owned by `userId`.
     *
     * This service has exactly two user-owned tables (verified against
     * prisma/schema.prisma — no other user-id columns exist):
     *   • day_plans          — owned via user_id      (DayPlan.userId)
     *   • protocol_templates — owned via creator_id   (ProtocolTemplate.creatorId)
     *
     * day_plans has an optional FK to protocol_templates (protocol_id). Deleting
     * day_plans FIRST avoids any FK contention before the templates go. Both run
     * inside a single $transaction so the purge is all-or-nothing.
     *
     * IDEMPOTENT: deleteMany never throws on zero rows, so purging a user with no
     * data returns all-zero counts and re-purging is a safe no-op.
     */
    async purgeUser(userId: string): Promise<{ day_plans: number; protocol_templates: number }> {
        const [dayPlans, protocolTemplates] = await this.prisma.$transaction([
            // The user's day plans (user_id).
            this.prisma.dayPlan.deleteMany({ where: { userId } }),
            // Protocol templates the user authored (creator_id).
            this.prisma.protocolTemplate.deleteMany({ where: { creatorId: userId } }),
        ]);

        return {
            day_plans: dayPlans.count,
            protocol_templates: protocolTemplates.count,
        };
    }

    /**
     * GDPR data export (right-to-access) — READ every plan-service row owned by
     * `userId`, returned as a JSON object keyed by table name. This is the
     * read-only counterpart of purgeUser and MUST mirror its table set EXACTLY so
     * right-to-access and right-to-erasure cover identical data:
     *   • day_plans          — owned via user_id      (DayPlan.userId)
     *   • protocol_templates — owned via creator_id   (ProtocolTemplate.creatorId)
     *
     * SECURITY: neither table holds a password/token/secret/raw-key column — they
     * store plan JSON, generation metadata, and protocol parameters — so the FULL
     * rows are safe to export verbatim (nothing to redact). The no-secret-leak
     * test locks this in: if a credential-looking column is ever added to either
     * model, that test fails and forces an explicit redaction decision here.
     *
     * READ-ONLY & IDEMPOTENT: only findMany, no writes; a user with no rows yields
     * empty arrays (never throws), and repeated calls return identical output.
     *
     * BOUNDED: each per-user table is capped at EXPORT_ROW_LIMIT rows (newest
     * first). `take: cap + 1` lets us detect and flag truncation via `_meta` so a
     * pathological user cannot force an unbounded read.
     */
    async exportUser(userId: string): Promise<{
        day_plans: any[];
        protocol_templates: any[];
        _meta: { dayPlansTruncated: boolean; protocolTemplatesTruncated: boolean; rowLimit: number };
    }> {
        const cap = EXPORT_ROW_LIMIT;
        const [dayPlans, protocolTemplates] = await Promise.all([
            // The user's day plans (user_id), newest first.
            this.prisma.dayPlan.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: cap + 1,
            }),
            // Protocol templates the user authored (creator_id), newest first.
            this.prisma.protocolTemplate.findMany({
                where: { creatorId: userId },
                orderBy: { createdAt: 'desc' },
                take: cap + 1,
            }),
        ]);

        const dayPlansTruncated = dayPlans.length > cap;
        const protocolTemplatesTruncated = protocolTemplates.length > cap;

        return {
            day_plans: dayPlansTruncated ? dayPlans.slice(0, cap) : dayPlans,
            protocol_templates: protocolTemplatesTruncated ? protocolTemplates.slice(0, cap) : protocolTemplates,
            _meta: { dayPlansTruncated, protocolTemplatesTruncated, rowLimit: cap },
        };
    }
}

// Per-table row cap for the GDPR export. Generous enough that a real user's full
// plan/protocol history is returned, but bounds the payload so a pathological user
// cannot force an unbounded read. `take: cap + 1` lets exportUser detect (and flag)
// truncation.
const EXPORT_ROW_LIMIT = 50_000;
