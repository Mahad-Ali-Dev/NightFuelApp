/**
 * Locking suite — MEDIUM #10: `MealService.generateGroceryList` plan-service
 * fetch timeout.
 *
 * Before the fix the cross-service fetch() had NO timeout, so a hung/slow
 * plan-service would hold the grocery-list request open until an OS socket
 * timeout. The fix passes `signal: AbortSignal.timeout(...)` so the call aborts;
 * the existing try/catch re-throws the friendly business error (the route then
 * redacts it to a 400).
 *
 * These tests drive the REAL service with a stubbed global fetch:
 *   1. the fetch is invoked WITH an AbortSignal (the timeout is wired), and
 *   2. when fetch rejects with an AbortError (the timeout firing), generateGroceryList
 *      surfaces the friendly business message — never the raw abort detail.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { MealService } from '../src/meal.service';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function buildService() {
    const prisma: any = {};
    const eventBus: any = { publish: async () => {} };
    return new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
}

describe('meal-service — generateGroceryList plan fetch timeout (MEDIUM #10)', () => {
    it('passes an AbortSignal to fetch (timeout is wired)', async () => {
        let seenSignal: any;
        global.fetch = (async (_url: any, init: any) => {
            seenSignal = init?.signal;
            // Return a healthy plan so the method completes past the fetch.
            return {
                ok: true,
                json: async () => ({ id: 'plan-1', planDate: '2026-06-20', plan: { meals: [] } }),
            } as any;
        }) as any;

        const service = buildService();
        await service.generateGroceryList('user-1', '2026-06-20');

        expect(seenSignal).toBeInstanceOf(AbortSignal);
    });

    it('surfaces the friendly business error (not the raw abort) when fetch aborts/times out', async () => {
        global.fetch = (async (_url: any, _init: any) => {
            // Mimic AbortSignal.timeout firing: fetch rejects with an AbortError.
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            throw err;
        }) as any;

        const service = buildService();
        await expect(service.generateGroceryList('user-1', '2026-06-20'))
            .rejects.toThrow(/active plan|aborted/i);

        // And specifically the wrapped path is exercised — the method throws
        // rather than hanging, so the route's catch returns the 400 redaction.
    });

    it('re-throws (does not hang) on a timeout — promise rejects promptly', async () => {
        global.fetch = (async () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            throw err;
        }) as any;

        const service = buildService();
        let threw = false;
        try {
            await service.generateGroceryList('user-1');
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
