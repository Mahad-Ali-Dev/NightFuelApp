/**
 * Regression suite — HIGH #3: generateWeeklyAudit's ai-pipeline call must NOT be
 * an unbounded bare fetch().
 *
 * generateWeeklyAudit (src/progress.service.ts) is invoked synchronously from
 * the user-facing POST /v1/progress/weekly-audit and hits ai-pipeline's heaviest
 * (slow quality-model) LLM endpoint. It previously called fetch() with no
 * timeout, no circuit breaker and no retry, so a provider brownout pinned the
 * Fastify worker on a hung socket indefinitely.
 *
 * The fix wraps that call in an opossum circuit breaker (mirroring
 * plan-service: 30s timeout, 50% error threshold, 30s reset) AND an inner
 * AbortSignal.timeout(30s). This suite proves, with FAKE TIMERS so it never
 * actually waits 30s, that:
 *
 *   1. TIMEOUT PATH — when ai-pipeline never responds, the call REJECTS once the
 *      breaker timeout elapses (it does not hang forever), and the route's
 *      existing behaviour (rethrow -> friendly 500) is preserved by the rethrow.
 *   2. OPEN-BREAKER PATH — after enough failures trip the breaker, a subsequent
 *      call fails FAST via the breaker fallback WITHOUT issuing another fetch
 *      (load is shed instead of piling onto a struggling provider).
 *
 * Like the other src/-importing suites, progress.service.ts is a pure class
 * module (no DB/Redis at import time); we drive it with a fake Prisma + EventBus
 * and a mocked global.fetch.
 */
import { ProgressService } from '../src/progress.service';

const USER = 'user-1';

// Minimal preferences payload the audit path fetches first (must succeed so we
// reach the AI call). getStats / getWeeklyStats read dailyProgress/bodyMetrics
// findMany, stubbed to empty arrays below.
const PREFS = { primaryGoal: 'MAINTENANCE' };

function makeService(fetchImpl: jest.Mock): ProgressService {
    const fakePrisma: any = {
        dailyProgress: { findMany: async () => [] },
        bodyMetrics: { findMany: async () => [] },
        performanceReport: { create: async (args: any) => ({ id: 'rep-1', ...args.data }) },
    };
    const fakeEventBus: any = { publish: async () => {} };
    const fakeConfig: any = {
        USER_SERVICE_URL: 'http://user-service.invalid',
        AI_PIPELINE_URL: 'http://ai-pipeline.invalid',
        INTERNAL_SERVICE_TOKEN: 'tok',
    };
    (global as any).fetch = fetchImpl;
    return new ProgressService(fakePrisma, fakeEventBus, fakeConfig);
}

// A fetch mock: preferences URL -> ok; the weekly-audit URL -> delegate to
// `aiBehavior` so each test controls the AI leg independently.
function buildFetch(aiBehavior: (url: string, init: any) => Promise<any>): jest.Mock {
    return jest.fn(async (url: string, init: any) => {
        if (url.includes('/v1/users/internal/preferences/')) {
            return { ok: true, json: async () => PREFS };
        }
        if (url.includes('/v1/ai/weekly-audit')) {
            return aiBehavior(url, init);
        }
        throw new Error(`unexpected fetch: ${url}`);
    });
}

describe('progress-service generateWeeklyAudit — timeout + circuit breaker (HIGH #3)', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('does not hang on a stalled ai-pipeline: rejects once the breaker timeout elapses', async () => {
        jest.useFakeTimers();

        // AI leg never resolves on its own — it only settles if the request is
        // aborted (AbortSignal.timeout) — modelling a provider brownout.
        const aiFetch = buildFetch((_url, init) => new Promise((_resolve, reject) => {
            const signal: AbortSignal | undefined = init?.signal;
            if (signal) {
                signal.addEventListener('abort', () =>
                    reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                );
            }
        }));
        const svc = makeService(aiFetch);

        const promise = svc.generateWeeklyAudit(USER);
        // Surface rejection without an unhandled-rejection warning while timers run.
        const settled = promise.then(() => 'resolved').catch((e: any) => e);

        // Advance past the 30s breaker timeout (and the inner AbortSignal).
        await jest.advanceTimersByTimeAsync(31000);

        const result = await settled;
        expect(result).toBeInstanceOf(Error); // rethrown — route turns this into a friendly 500
        // The AI endpoint was attempted exactly once (no infinite retry loop).
        expect(aiFetch.mock.calls.filter((c) => String(c[0]).includes('/v1/ai/weekly-audit')))
            .toHaveLength(1);
    });

    it('sheds load once the breaker is open: a later call fails fast without hitting ai-pipeline', async () => {
        // AI leg always errors (HTTP 503) so the breaker trips after a few calls.
        const aiFetch = buildFetch(async () => ({
            ok: false,
            status: 503,
            text: async () => 'overloaded',
        }));
        const svc = makeService(aiFetch);

        // Drive failures until the breaker opens. opossum needs a few requests
        // (volumeThreshold) before it can trip; loop until a call fails purely
        // via the fallback (no new fetch issued).
        let openObserved = false;
        for (let i = 0; i < 25 && !openObserved; i++) {
            const before = aiFetch.mock.calls.length;
            await svc.generateWeeklyAudit(USER).catch(() => {});
            const after = aiFetch.mock.calls.length;
            // When the breaker is open, generateWeeklyAudit still runs the two
            // upstream fetches (prefs) but the AI fetch is skipped entirely.
            const aiCallsThisRound = aiFetch.mock.calls
                .slice(before, after)
                .filter((c) => String(c[0]).includes('/v1/ai/weekly-audit')).length;
            if (aiCallsThisRound === 0) openObserved = true;
        }

        expect(openObserved).toBe(true);

        // Confirm steady-state fast-fail: one more call issues NO further AI fetch.
        const aiCallsBefore = aiFetch.mock.calls
            .filter((c) => String(c[0]).includes('/v1/ai/weekly-audit')).length;
        await expect(svc.generateWeeklyAudit(USER)).rejects.toBeInstanceOf(Error);
        const aiCallsAfter = aiFetch.mock.calls
            .filter((c) => String(c[0]).includes('/v1/ai/weekly-audit')).length;
        expect(aiCallsAfter).toBe(aiCallsBefore); // breaker shed the load
    });
});
