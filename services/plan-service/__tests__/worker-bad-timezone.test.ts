/**
 * plan-service PlanWorker — MEDIUM #13: a single user's invalid timezone must
 * NOT abort the whole daily-regeneration sweep.
 *
 * `new Intl.DateTimeFormat({ timeZone })` throws a RangeError for an invalid IANA
 * timezone. That construction used to live inside the per-user loop but OUTSIDE
 * the per-user try/catch, so one bad timezone threw out of the loop and skipped
 * every subsequent user. The fix moves it inside the per-user try/catch so a bad
 * timezone skips ONLY that user.
 *
 * We mock global.fetch to serve one page containing a user with a bad timezone
 * SANDWICHED between two valid-timezone users, and assert the loop reaches the
 * users after the bad one (i.e. the sweep is not aborted).
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { PlanWorker } from '../src/worker';

const USER_SERVICE_URL = 'http://user-service:3009';
const INTERNAL_TOKEN = 'plan-internal-token-value';

function makeStubPlanService() {
    return {
        generateAndStorePlan: jest.fn(() => Promise.resolve({})),
    } as any;
}

function makeSinglePageFetch(users: Array<{ userId: string; timezone: string }>) {
    return jest.fn(async () => ({
        ok: true,
        json: async () => ({ users, nextCursor: null }),
    } as any));
}

describe('PlanWorker — a bad timezone skips only that user (does not abort the sweep)', () => {
    const realFetch = global.fetch;

    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('continues processing users listed after a user with an invalid timezone', async () => {
        // The invalid IANA zone makes new Intl.DateTimeFormat(...) throw RangeError.
        const users = [
            { userId: 'before', timezone: 'UTC' },
            { userId: 'bad', timezone: 'Not/AReal_Zone' },
            { userId: 'after', timezone: 'Asia/Tokyo' },
        ];
        global.fetch = makeSinglePageFetch(users) as any;

        const tzSpy = jest.spyOn(Intl, 'DateTimeFormat');

        const worker = new PlanWorker(makeStubPlanService(), {
            USER_SERVICE_URL,
            INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
        });

        // Must NOT throw — the bad timezone is caught per-user.
        await expect((worker as any).checkAndRegenerate()).resolves.toBeUndefined();

        // The user AFTER the bad one is still reached: its timezone is consulted,
        // proving the loop was not aborted by the RangeError.
        const consultedZones = tzSpy.mock.calls
            .map((c) => (c[1] as any)?.timeZone)
            .filter((t): t is string => typeof t === 'string');
        expect(consultedZones).toContain('Asia/Tokyo');
        tzSpy.mockRestore();
    });
});
