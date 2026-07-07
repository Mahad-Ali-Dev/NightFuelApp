/**
 * plan-service — concurrency-safe planVersion assignment (work-item GROUP H).
 *
 * Contract locked here:
 *   generateAndStorePlan() and storePlan() assign planVersion via a
 *   read-max-then-create. The DayPlan table has @@unique([userId, planDate,
 *   planVersion]), so two generations racing on the same (userId, date) can read
 *   the same max, compute the same nextVersion, and the second create throws
 *   Prisma P2002 — which, for generateAndStorePlan, surfaces as a 500 AFTER a
 *   PAID AI call. The fix makes the create resilient: on P2002 it recomputes
 *   nextVersion from the now-current max and retries (up to 3 attempts) so the
 *   loser of the race silently takes the next free version instead of failing.
 *
 * What this suite proves (all in-process, NO DB / Redis / network):
 *   1. generateAndStorePlan succeeds despite an initial P2002, recomputing the
 *      version from the bumped max and persisting at that version.
 *   2. storePlan does the same on its own create path.
 *   3. The single-call HAPPY PATH is unchanged — exactly one create, NO retry,
 *      version = max+1.
 *   4. A non-P2002 create error still propagates (we don't swallow real bugs).
 *   5. Retries are bounded — a relentless P2002 eventually throws (no infinite
 *      loop), and the thrown error is the P2002.
 *
 * Test seams:
 *   - global.fetch is mocked to REJECT, so generateAndStorePlan takes its AI
 *     fallback-plan branch (no network) and every cross-service context fetch is
 *     a caught no-op — keeping the suite focused purely on the versioning logic.
 *   - prisma.dayPlan is a hand stub: updateMany no-op, findFirst returns the
 *     current max version row, create throws a {code:'P2002'} error a configurable
 *     number of times before succeeding (mirroring the P2002 shape the
 *     community-service follow suite uses: Object.assign(new Error(), {code})).
 *   - eventBus.publish resolves (the post-create publish is non-fatal anyway).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PlanService } from '../src/plan.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DATE = '2026-06-20';

function p2002(): Error & { code: string } {
    // Same shape Prisma raises and the community-service follow suite simulates.
    return Object.assign(new Error('Unique constraint failed on the fields: (`plan_version`)'), {
        code: 'P2002',
    }) as Error & { code: string };
}

/**
 * Build a prisma.dayPlan stub.
 *   - startMax: the highest existing planVersion (so nextVersion starts at +1).
 *   - failCreates: number of leading create() calls that throw P2002 before one
 *     succeeds. Each simulated collision also bumps the observable max by 1, so a
 *     correct retry must recompute a HIGHER nextVersion (proves it re-reads).
 *   - errorFactory: what create() throws while failing (defaults to P2002).
 */
function buildPrismaStub(opts: {
    startMax: number;
    failCreates: number;
    errorFactory?: () => Error;
}) {
    let currentMax = opts.startMax;
    let createCalls = 0;
    let remainingFailures = opts.failCreates;
    const errorFactory = opts.errorFactory ?? p2002;

    const create = jest.fn(async ({ data }: any) => {
        createCalls++;
        if (remainingFailures > 0) {
            remainingFailures--;
            // A concurrent winner took this version — the visible max advances, so
            // the next read-max sees a higher floor (this is what forces the retry
            // to pick a fresh version rather than re-collide forever).
            currentMax = Math.max(currentMax, data.planVersion);
            throw errorFactory();
        }
        currentMax = Math.max(currentMax, data.planVersion);
        return {
            id: `plan-v${data.planVersion}`,
            userId: data.userId,
            planVersion: data.planVersion,
            planDate: data.planDate,
            status: data.status,
            generationModel: data.generationModel ?? null,
            plan: data.plan ?? {},
        };
    });

    const findFirst = jest.fn(async ({ where, orderBy }: any) => {
        // The AI Cost Guard read (status:'ACTIVE') must NOT short-circuit this
        // suite — return null so a fresh plan is always generated. The version
        // read (no status filter, orderBy planVersion desc) returns the max.
        if (where?.status === 'ACTIVE') return null;
        if (orderBy?.planVersion === 'desc') {
            return currentMax > 0 ? { planVersion: currentMax } : null;
        }
        return null;
    });

    const updateMany = jest.fn(async () => ({ count: 0 }));
    const findUnique = jest.fn(async () => null); // protocolTemplate path unused here

    return {
        prisma: {
            dayPlan: { create, findFirst, updateMany },
            protocolTemplate: { findUnique },
        } as any,
        spies: { create, findFirst, updateMany },
        get createCalls() {
            return createCalls;
        },
    };
}

function buildEventBus() {
    return { publish: jest.fn(async () => undefined) } as any;
}

const SERVICE_CONFIG = {
    AI_PIPELINE_URL: 'http://ai-pipeline:3000',
    USER_SERVICE_URL: 'http://user-service:3009',
    STATE_SERVICE_URL: 'http://state-service:3000',
    DECISION_ENGINE_URL: 'http://decision-engine:3000',
    MEAL_SERVICE_URL: 'http://meal-service:3000',
    EXERCISE_SERVICE_URL: 'http://exercise-service:3000',
};

function makeService(prisma: any, eventBus: any): PlanService {
    return new PlanService(prisma, eventBus, SERVICE_CONFIG);
}

describe('plan-service planVersion — concurrency-safe (P2002 retry)', () => {
    const realFetch = global.fetch;

    beforeEach(() => {
        // Every cross-service fetch (state/prefs/meals/exercise/decision) and the
        // AI pipeline call rejects → generateAndStorePlan uses safe defaults and
        // its built-in fallback plan. Keeps the suite network-free and focused on
        // versioning. storePlan never fetches at all.
        (global as any).fetch = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        });
    });

    afterEach(() => {
        (global as any).fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('generateAndStorePlan: HAPPY PATH does exactly one create at max+1 (no retry)', async () => {
        const stub = buildPrismaStub({ startMax: 4, failCreates: 0 });
        const service = makeService(stub.prisma, buildEventBus());

        const result = await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(stub.createCalls).toBe(1);
        expect(stub.spies.create).toHaveBeenCalledTimes(1);
        expect(result.planVersion).toBe(5); // 4 + 1
    });

    it('generateAndStorePlan: an initial P2002 is retried and the plan persists at the recomputed (higher) version', async () => {
        // startMax 4 → first create attempts v5 and P2002s (winner took 5, max→5);
        // retry recomputes v6 and succeeds. Proves it RE-READS the max, not reuses.
        const stub = buildPrismaStub({ startMax: 4, failCreates: 1 });
        const service = makeService(stub.prisma, buildEventBus());

        const result = await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(stub.createCalls).toBe(2); // one failed + one succeeded
        expect(result.planVersion).toBe(6); // recomputed after the collision bump
    });

    it('storePlan: HAPPY PATH does exactly one create at max+1 (no retry)', async () => {
        const stub = buildPrismaStub({ startMax: 0, failCreates: 0 });
        const service = makeService(stub.prisma, buildEventBus());

        const result = await service.storePlan({ calorieTarget: 2000 }, USER_ID, DATE);

        expect(stub.createCalls).toBe(1);
        expect(result.planVersion).toBe(1); // first version
    });

    it('storePlan: an initial P2002 is retried and the plan persists at the recomputed version', async () => {
        const stub = buildPrismaStub({ startMax: 2, failCreates: 1 });
        const service = makeService(stub.prisma, buildEventBus());

        const result = await service.storePlan({ calorieTarget: 2000 }, USER_ID, DATE);

        expect(stub.createCalls).toBe(2);
        expect(result.planVersion).toBe(4); // 2→ attempt v3 collides (max→3) → retry v4
    });

    it('two consecutive P2002 collisions still resolve within the retry budget (3 attempts)', async () => {
        const stub = buildPrismaStub({ startMax: 1, failCreates: 2 });
        const service = makeService(stub.prisma, buildEventBus());

        const result = await service.generateAndStorePlan({}, USER_ID, DATE);

        expect(stub.createCalls).toBe(3); // 2 collisions + 1 success
        expect(result.planVersion).toBe(4); // 1→ v2 collide → v3 collide → v4 ok
    });

    it('a NON-P2002 create error propagates (real bugs are not swallowed)', async () => {
        const boom = () => Object.assign(new Error('connection terminated'), { code: 'P1001' });
        const stub = buildPrismaStub({ startMax: 0, failCreates: 1, errorFactory: boom });
        const service = makeService(stub.prisma, buildEventBus());

        await expect(service.storePlan({ calorieTarget: 2000 }, USER_ID, DATE)).rejects.toMatchObject({
            code: 'P1001',
        });
        // No retry on a non-collision error: exactly one create attempt.
        expect(stub.createCalls).toBe(1);
    });

    it('a relentless P2002 eventually throws the P2002 (bounded retries, no infinite loop)', async () => {
        // failCreates far exceeds the retry budget → it must give up and surface
        // the P2002 rather than loop forever.
        const stub = buildPrismaStub({ startMax: 0, failCreates: 99 });
        const service = makeService(stub.prisma, buildEventBus());

        await expect(service.storePlan({ calorieTarget: 2000 }, USER_ID, DATE)).rejects.toMatchObject({
            code: 'P2002',
        });
        // Bounded to MAX_VERSION_RETRIES (3) create attempts.
        expect(stub.createCalls).toBe(3);
    });
});
