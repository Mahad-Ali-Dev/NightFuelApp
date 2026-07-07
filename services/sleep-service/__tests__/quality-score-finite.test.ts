/**
 * Regression suite — sleep-service derived-analytics INPUT-EDGE hardening
 * (src/sleep.service.ts: getQuality + getAnalytics).
 *
 * This is deliberately separate from error-redaction.test.ts (shared Fastify
 * 5xx handler) and inline-404-redaction.test.ts (inline PATCH catch). Neither
 * of those can cover the two invariants locked here, both of which live INSIDE
 * the service methods rather than in a route:
 *
 *   (1) FINITE-NESS — getQuality's duration/quality sub-scores feed a blended
 *       `score`. On an empty or null-only history the averages are null and the
 *       score MUST be null (never NaN). The duration term is `(avg/480)*100`;
 *       the work guards every intermediate with Number.isFinite so a poisoned
 *       value can only ever collapse to null — it can never surface a NaN /
 *       Infinity into the analytics summary string. We assert the score fields
 *       are null (not NaN) on empty and null-only histories, and that a normal
 *       480-min / quality-8 history still yields the SAME finite score as the
 *       pre-hardening arithmetic (88 = round(0.6*80 + 0.4*100)).
 *
 *   (2) REDACTED ERROR — getAnalytics wraps its body in try/catch: a thrown
 *       findMany error is logged server-side and re-thrown as a FIXED generic
 *       Error('Failed to compute sleep analytics'). The thrown message must
 *       carry NO raw cause text, so the route's catch can only ever surface its
 *       fixed generic 500 body. We inject a leaky cause and assert the thrown
 *       message equals the generic string and contains none of the injected
 *       internal detail.
 *
 * Why this can import src/ when the other two suites can't: sleep.service.ts is
 * a pure class module — unlike src/index.ts it opens NO DB/Redis connection at
 * import time. We drive it with a fake PrismaClient (only sleepSession.findMany
 * is exercised by getQuality/getAnalytics) and a minimal fake EventBus (never
 * touched by either read path), so no real infra is required.
 */
import { SleepService } from '../src/sleep.service';

// A row shape loose enough for the read paths: getQuality/getAnalytics read
// quality, durationMins, startTime, circadianAlignmentScore off each row.
interface FakeRow {
    id?: string;
    durationMins: number | null;
    quality: number | null;
    startTime: Date;
    circadianAlignmentScore: number | null;
}

/**
 * Build a SleepService whose sleepSession.findMany resolves to `rows` (or
 * rejects with `rejectWith` when provided). Every other Prisma method is a
 * never-called stub — getQuality/getAnalytics only call findMany. The EventBus
 * is the minimal fake the work-item specifies; neither read path publishes.
 */
function makeService(rows: FakeRow[], rejectWith?: unknown): SleepService {
    const fakePrisma: any = {
        sleepSession: {
            findMany: async () => {
                if (rejectWith !== undefined) throw rejectWith;
                return rows;
            },
        },
    };
    const fakeEventBus: any = { publish: async () => {} };
    return new SleepService(fakePrisma, fakeEventBus);
}

const USER = 'user-1';

describe('sleep-service getQuality — finite-ness invariant', () => {
    it('empty history → all score fields are null (never NaN)', async () => {
        const svc = makeService([]);
        const q = await svc.getQuality(USER);

        expect(q.score).toBeNull();
        expect(q.avgQuality).toBeNull();
        expect(q.avgDurationMins).toBeNull();
        expect(q.sessionsLogged).toBe(0);
        expect(q.lastNight).toBeNull();

        // Explicit not-NaN guards: a NaN leak would still be `!= null`, so the
        // null assertions above already exclude it, but assert directly too.
        expect(Number.isNaN(q.score as any)).toBe(false);
        expect(Number.isNaN(q.avgDurationMins as any)).toBe(false);
        expect(Number.isNaN(q.avgQuality as any)).toBe(false);
    });

    it('null-duration / null-quality only history → no NaN leaks (score null)', async () => {
        const svc = makeService([
            { durationMins: null, quality: null, startTime: new Date('2026-06-17T22:30:00.000Z'), circadianAlignmentScore: null },
        ]);
        const q = await svc.getQuality(USER);

        // One session logged (so NOT the 0-session early return), but every
        // numeric input is null → every sub-score collapses to null.
        expect(q.sessionsLogged).toBe(1);
        expect(q.score).toBeNull();
        expect(q.avgQuality).toBeNull();
        expect(q.avgDurationMins).toBeNull();

        expect(Number.isNaN(q.score as any)).toBe(false);
        expect(Number.isNaN(q.avgQuality as any)).toBe(false);
        expect(Number.isNaN(q.avgDurationMins as any)).toBe(false);
    });

    it('normal 480-min / quality-8 history → finite score, unchanged from pre-hardening arithmetic', async () => {
        const svc = makeService([
            { durationMins: 480, quality: 8, startTime: new Date('2026-06-17T22:30:00.000Z'), circadianAlignmentScore: 100 },
        ]);
        const q = await svc.getQuality(USER);

        // qScore = (8/10)*100 = 80; dScore = min(100,(480/480)*100) = 100;
        // score = round(0.6*80 + 0.4*100) = round(88) = 88. Behaviour-preserving.
        expect(q.score).toBe(88);
        expect(Number.isFinite(q.score as number)).toBe(true);
        expect(q.avgDurationMins).toBe(480);
        expect(q.avgQuality).toBe(8);
    });
});

describe('sleep-service getAnalytics — empty-history summary + finite qualityScore', () => {
    it('empty history → qualityScore null and the empty-history summary copy', async () => {
        const svc = makeService([]);
        const a = await svc.getAnalytics(USER);

        expect(a.qualityScore).toBeNull();
        expect(a.avgDuration).toBeNull();
        expect(a.avgQuality).toBeNull();
        expect(a.sessionsLogged).toBe(0);
        expect(a.circadianAlignment).toBeNull();
        expect(a.chartData).toEqual([]);
        expect(a.summary).toBe('Log your sleep to unlock personalized analytics.');

        // The qualityScore that feeds the summary must be finite-or-null.
        expect(Number.isNaN(a.qualityScore as any)).toBe(false);
    });

    it('normal history → finite qualityScore embedded in a NaN-free summary', async () => {
        const svc = makeService([
            { durationMins: 480, quality: 8, startTime: new Date('2026-06-17T22:30:00.000Z'), circadianAlignmentScore: 100 },
        ]);
        const a = await svc.getAnalytics(USER);

        expect(a.qualityScore).toBe(88);
        expect(Number.isFinite(a.qualityScore as number)).toBe(true);
        // The summary embeds the finite score/duration — never the string 'NaN'.
        expect(a.summary).toContain('88/100');
        expect(a.summary).not.toContain('NaN');
    });
});

describe('sleep-service getAnalytics — redacted error wrapper', () => {
    // A leaky cause: every substring here is internal detail that MUST NOT ride
    // out on the re-thrown error message.
    const LEAKY_CAUSE_MESSAGE =
        'Prisma P2010 raw query failed at /app/src/sleep.service.ts localhost:5432';

    it('a rejecting findMany surfaces the FIXED generic message, not the raw cause', async () => {
        const svc = makeService([], new Error(LEAKY_CAUSE_MESSAGE));

        await expect(svc.getAnalytics(USER)).rejects.toThrow('Failed to compute sleep analytics');
    });

    it('the thrown error message contains NONE of the injected raw cause text', async () => {
        const svc = makeService([], new Error(LEAKY_CAUSE_MESSAGE));

        let caught: any;
        try {
            await svc.getAnalytics(USER);
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(Error);
        const msg: string = caught.message;
        // Positive: exactly the generic copy.
        expect(msg).toBe('Failed to compute sleep analytics');
        // Negative: not the raw cause nor any of its internal fragments.
        expect(msg).not.toContain(LEAKY_CAUSE_MESSAGE);
        expect(msg).not.toContain('Prisma');
        expect(msg).not.toContain('P2010');
        expect(msg).not.toContain('at /');
        expect(msg).not.toContain('/app/src');
        expect(msg).not.toContain('localhost');
        expect(msg).not.toContain('5432');
    });

    it('a non-Error rejection is still redacted to the generic message', async () => {
        // The catch must not assume the thrown value is an Error — a bare object
        // (e.g. a Prisma-shaped reject) must still re-throw the fixed string.
        const svc = makeService([], { code: 'P2010', detail: 'record not reachable' });

        let caught: any;
        try {
            await svc.getAnalytics(USER);
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(Error);
        expect(caught.message).toBe('Failed to compute sleep analytics');
        expect(caught.message).not.toContain('record not reachable');
        expect(caught.message).not.toContain('P2010');
    });
});
