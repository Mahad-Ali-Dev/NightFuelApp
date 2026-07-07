/**
 * plan-service PlanWorker — HIGH #3 cursor paging of GET /v1/users/internal/all.
 *
 * The worker used to fetch EVERY user in a single unbounded request. It now
 * pages through the cursor-paginated endpoint ({ users, nextCursor }) until
 * exhausted, sending the shared X-Internal-Token on every page request, and
 * processes the union of all pages (equivalent to "all users", but bounded per
 * query).
 *
 * We mock global.fetch to serve a multi-page dataset and assert:
 *   1. the worker issues one request per page, each carrying X-Internal-Token,
 *   2. subsequent requests carry the previous page's nextCursor,
 *   3. paging stops when nextCursor is null,
 *   4. EVERY user across all pages is processed (timezone consulted for each).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PlanWorker } from '../src/worker';

const USER_SERVICE_URL = 'http://user-service:3009';
const INTERNAL_TOKEN = 'plan-internal-token-value';

function makeStubPlanService() {
    return {
        generateAndStorePlan: jest.fn(() => Promise.resolve({})),
    } as any;
}

// Build a fetch stub that serves `pages` in order. Each call returns the next
// page; we record the URL + headers for assertions.
function makePagedFetch(pages: Array<{ users: Array<{ userId: string; timezone: string }>; nextCursor: string | null }>) {
    const calls: Array<{ url: string; token: string | undefined }> = [];
    let i = 0;
    const fetchStub = jest.fn(async (input: any, init: any) => {
        const url = String(input);
        const token = init?.headers?.['X-Internal-Token'];
        calls.push({ url, token });
        const body = pages[Math.min(i, pages.length - 1)];
        i++;
        return {
            ok: true,
            json: async () => body,
        } as any;
    });
    return { fetchStub, calls };
}

describe('PlanWorker — cursor paging through /v1/users/internal/all', () => {
    const realFetch = global.fetch;

    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
        global.fetch = realFetch;
    });

    it('pages until nextCursor is null, sending the token + cursor on each page', async () => {
        const pages = [
            { users: [{ userId: 'u1', timezone: 'UTC' }, { userId: 'u2', timezone: 'UTC' }], nextCursor: 'u2' },
            { users: [{ userId: 'u3', timezone: 'UTC' }], nextCursor: null },
        ];
        const { fetchStub, calls } = makePagedFetch(pages);
        global.fetch = fetchStub as any;

        const worker = new PlanWorker(makeStubPlanService(), {
            USER_SERVICE_URL,
            INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
        });

        await (worker as any).checkAndRegenerate();

        // One request per page, then stop (2 pages => 2 requests).
        expect(fetchStub).toHaveBeenCalledTimes(2);

        // Every page request carries the shared internal token.
        for (const c of calls) {
            expect(c.token).toBe(INTERNAL_TOKEN);
            expect(c.url).toContain('/v1/users/internal/all');
        }

        // First page has no cursor; second page resumes from the first's nextCursor.
        expect(calls[0].url).not.toContain('cursor=');
        expect(calls[1].url).toContain('cursor=u2');
    });

    it('processes every user across all pages (timezone consulted per user)', async () => {
        const tzSpy = jest.spyOn(Intl, 'DateTimeFormat');
        const pages = [
            { users: [{ userId: 'u1', timezone: 'UTC' }, { userId: 'u2', timezone: 'Europe/London' }], nextCursor: 'u2' },
            { users: [{ userId: 'u3', timezone: 'Asia/Tokyo' }], nextCursor: null },
        ];
        const { fetchStub } = makePagedFetch(pages);
        global.fetch = fetchStub as any;

        const worker = new PlanWorker(makeStubPlanService(), {
            USER_SERVICE_URL,
            INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
        });

        await (worker as any).checkAndRegenerate();

        // The worker formats local time per user => one DateTimeFormat per user
        // across BOTH pages (3 users total).
        const tzArgs = tzSpy.mock.calls
            .map((c) => (c[1] as any)?.timeZone)
            .filter((t) => t === 'UTC' || t === 'Europe/London' || t === 'Asia/Tokyo');
        expect(tzArgs).toEqual(expect.arrayContaining(['UTC', 'Europe/London', 'Asia/Tokyo']));
        tzSpy.mockRestore();
    });

    it('a single short page (nextCursor null) issues exactly one request', async () => {
        const { fetchStub } = makePagedFetch([
            { users: [{ userId: 'only', timezone: 'UTC' }], nextCursor: null },
        ]);
        global.fetch = fetchStub as any;

        const worker = new PlanWorker(makeStubPlanService(), {
            USER_SERVICE_URL,
            INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
        });

        await (worker as any).checkAndRegenerate();
        expect(fetchStub).toHaveBeenCalledTimes(1);
    });
});
