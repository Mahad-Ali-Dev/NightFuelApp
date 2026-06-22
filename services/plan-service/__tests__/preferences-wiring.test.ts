/**
 * plan-service — user dietaryPreference + allergies wiring into the AI plan.
 *
 * Contract locked here: when plan-service calls ai-pipeline /v1/ai/generate-plan,
 * the request body MUST carry a `preferences` object shaped to ai-pipeline's
 * GoalPreferences, carrying AT LEAST the user's `dietaryPreference` and
 * `allergies`. Previously the fetched user preferences were used only for the
 * decision-engine and NEVER sent to the AI, so generated plans ignored
 * vegan/halal/allergies. This suite proves they now reach the prompt — and that
 * a failed preferences fetch degrades to safe defaults (ANY diet, [] allergies)
 * instead of throwing.
 *
 * Test seam: the user-service preferences fetch is mocked to SUCCEED with a
 * realistic profile row; the ai-pipeline fetch succeeds and its body is captured;
 * every other cross-service fetch rejects so planParams falls to safe defaults and
 * the suite stays network-free. prisma.dayPlan is a minimal stub.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
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
 * Mock fetch:
 *  - user-service /internal/preferences/* SUCCEEDS with `prefRow` so we can assert
 *    those values reach the AI body.
 *  - ai-pipeline /generate-plan POST SUCCEEDS and its body is captured.
 *  - everything else (state, status, meals, workouts, decision-engine) rejects,
 *    so planParams falls back to the safe-default template.
 */
function mockFetchCapture(captured: { body?: any }, prefRow: any) {
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
        if (typeof url === 'string' && url.includes('/v1/users/internal/preferences/')) {
            return { ok: true, json: async () => prefRow } as any;
        }
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

describe('plan-service — request carries user dietaryPreference + allergies for the AI plan', () => {
    const realFetch = global.fetch;
    let captured: { body?: any };

    afterEach(() => {
        (global as any).fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('forwards dietaryPreference + allergies (and goal/diet-mode/region) from the fetched profile', async () => {
        captured = {};
        const prefRow = {
            primaryGoal: 'MUSCLE_GAIN',
            dietaryPreference: 'VEGAN',
            dietMode: 'BALANCED',
            allergies: ['peanuts', 'shellfish'],
            healthConditions: ['DIABETES'],
            experienceLevel: 'INTERMEDIATE',
            region: 'eu',
        };
        mockFetchCapture(captured, prefRow);

        const { prisma } = buildPrismaStub();
        const service = new PlanService(prisma, buildEventBus(), SERVICE_CONFIG);
        await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(captured.body).toBeDefined();
        const prefs = captured.body.preferences;
        expect(prefs).toBeDefined();
        // The two fields the whole fix exists for:
        expect(prefs.dietaryPreference).toBe('VEGAN');
        expect(prefs.allergies).toEqual(['peanuts', 'shellfish']);
        // The supporting fields shaped to GoalPreferences:
        expect(prefs.primaryGoal).toBe('MUSCLE_GAIN');
        expect(prefs.dietMode).toBe('BALANCED');
        expect(prefs.healthConditions).toEqual(['DIABETES']);
        expect(prefs.experienceLevel).toBe('INTERMEDIATE');
        expect(prefs.region).toBe('eu');
    });

    it("maps user-service 'NONE' diet to 'ANY' and missing allergies to [] (no constraint)", async () => {
        captured = {};
        // A freshly-provisioned user: NONE diet, no allergies field at all.
        const prefRow = { primaryGoal: 'GENERAL_HEALTH', dietaryPreference: 'NONE' };
        mockFetchCapture(captured, prefRow);

        const { prisma } = buildPrismaStub();
        const service = new PlanService(prisma, buildEventBus(), SERVICE_CONFIG);
        await service.generateAndStorePlan({}, USER_ID, DATE);

        const prefs = captured.body.preferences;
        expect(prefs.dietaryPreference).toBe('ANY');
        expect(prefs.allergies).toEqual([]);
    });

    it('degrades to safe defaults when the preferences fetch FAILS (never blocks generation)', async () => {
        captured = {};
        // prefRow=null path: the /internal/preferences/ branch returns a non-ok
        // response so plan-service's catch leaves `preferences` null.
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
            throw new Error('ECONNREFUSED'); // includes the preferences fetch
        });

        const { prisma } = buildPrismaStub();
        const service = new PlanService(prisma, buildEventBus(), SERVICE_CONFIG);
        // Must resolve (not throw) and still send a benign preferences object.
        await service.generateAndStorePlan({}, USER_ID, DATE);

        const prefs = captured.body.preferences;
        expect(prefs).toBeDefined();
        expect(prefs.dietaryPreference).toBe('ANY');
        expect(prefs.allergies).toEqual([]);
    });
});
