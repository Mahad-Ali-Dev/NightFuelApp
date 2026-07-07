/**
 * plan-service — planParams -> logicTargets wiring (the DETERMINISTIC TARGETS fix).
 *
 * Contract locked here: when plan-service calls ai-pipeline /v1/ai/generate-plan,
 * the request body MUST carry a `logicTargets` object in the EXACT shape
 * ai-pipeline's DayPlanRequest.LogicTargets expects:
 *   { calorieTarget, proteinTargetG, carbsTargetG, fatTargetG, trainingVolumeMultiplier }
 * Previously plan-service sent only top-level `planParams` (snake_case), which
 * DayPlanRequest has no field for, so Pydantic dropped it and the prompt's
 * "DETERMINISTIC TARGETS (STRICT ADHERENCE REQUIRED)" block NEVER fired. This
 * suite proves the mapping (calories->calorieTarget, protein_g->proteinTargetG,
 * volume_modifier->trainingVolumeMultiplier, derived carbs/fat) and that
 * cyclePhase stays a separate top-level field.
 *
 * Test seam: only the ai-pipeline fetch is mocked to SUCCEED (capturing its body);
 * every other cross-service fetch rejects so planParams falls to safe defaults and
 * the suite stays network-free. prisma.dayPlan is a minimal stub.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PlanService } from '../src/plan.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DATE = '2026-06-20';

const SERVICE_CONFIG = {
    AI_PIPELINE_URL: 'http://ai-pipeline:3000',
    USER_SERVICE_URL: 'http://user-service:3009',
    STATE_SERVICE_URL: 'http://state-service:3000',
    DECISION_ENGINE_URL: 'http://decision-engine:3000',
    MEAL_SERVICE_URL: 'http://meal-service:3000',
    EXERCISE_SERVICE_URL: 'http://exercise-service:3000',
};

function buildPrismaStub() {
    const create = jest.fn(async ({ data }: any) => ({
        id: 'plan-1',
        userId: data.userId,
        planVersion: data.planVersion,
        planDate: data.planDate,
        status: data.status,
        generationModel: data.generationModel ?? 'openai',
        plan: data.plan ?? {},
    }));
    const findFirst = jest.fn(async () => null); // no cost-guard short-circuit, no prior versions
    const updateMany = jest.fn(async () => ({ count: 0 }));
    const findUnique = jest.fn(async () => null);
    return {
        prisma: {
            dayPlan: { create, findFirst, updateMany },
            protocolTemplate: { findUnique },
        } as any,
    };
}

function buildEventBus() {
    return { publish: jest.fn(async () => undefined) } as any;
}

/**
 * Mock fetch: the ai-pipeline /generate-plan POST succeeds and the body is
 * captured; everything else rejects. The decision-engine call also rejects, so
 * planParams falls back to the safe-default template the service builds from the
 * (also-rejected) preferences fetch -> { calories:2000, protein_g:150,
 * volume_modifier:1.0, ... }.
 */
function mockFetchCapture(captured: { body?: any }) {
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
        if (typeof url === 'string' && url.includes('/v1/ai/generate-plan')) {
            captured.body = JSON.parse(init.body);
            return {
                ok: true,
                json: async () => ({
                    structuredPlan: { calorieTarget: 2000, proteinTargetG: 150, carbsTargetG: 200, fatTargetG: 65 },
                    providerUsed: 'openai',
                    tokensUsed: 100,
                }),
            } as any;
        }
        throw new Error('ECONNREFUSED');
    });
}

describe('plan-service — request carries logicTargets in the DayPlanRequest shape', () => {
    const realFetch = global.fetch;
    let captured: { body?: any };

    beforeEach(() => {
        captured = {};
        mockFetchCapture(captured);
    });

    afterEach(() => {
        (global as any).fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('maps the safe-default planParams into logicTargets (carbs/fat derived)', async () => {
        const { prisma } = buildPrismaStub();
        const service = new PlanService(prisma, buildEventBus(), SERVICE_CONFIG);

        await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(captured.body).toBeDefined();
        const lt = captured.body.logicTargets;
        expect(lt).toBeDefined();
        // calories 2000 -> calorieTarget, protein_g 150 -> proteinTargetG
        expect(lt.calorieTarget).toBe(2000);
        expect(lt.proteinTargetG).toBe(150);
        // volume_modifier 1.0 -> trainingVolumeMultiplier
        expect(lt.trainingVolumeMultiplier).toBe(1.0);
        // fat defaults to 65; carbs = (2000 - 150*4 - 65*9)/4 = (2000-600-585)/4 = 203.75 -> 204
        expect(lt.fatTargetG).toBe(65);
        expect(lt.carbsTargetG).toBe(204);
        // exact LogicTargets shape (no extra/missing keys)
        expect(Object.keys(lt).sort()).toEqual(
            ['calorieTarget', 'carbsTargetG', 'fatTargetG', 'proteinTargetG', 'trainingVolumeMultiplier'].sort(),
        );
    });

    it('keeps cyclePhase a SEPARATE top-level field (UNKNOWN for non-tracking)', async () => {
        const { prisma } = buildPrismaStub();
        const service = new PlanService(prisma, buildEventBus(), SERVICE_CONFIG);

        await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(captured.body.cyclePhase).toBe('UNKNOWN');
        // cyclePhase is NOT smuggled into logicTargets
        expect(captured.body.logicTargets.cyclePhase).toBeUndefined();
    });

    it('still sends the legacy planParams passthrough alongside logicTargets', async () => {
        const { prisma } = buildPrismaStub();
        const service = new PlanService(prisma, buildEventBus(), SERVICE_CONFIG);

        await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(captured.body.planParams).toBeDefined();
        expect(captured.body.planParams.calories).toBe(2000);
    });
});
