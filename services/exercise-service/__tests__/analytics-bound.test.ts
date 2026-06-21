/**
 * Unit suite — exercise-service getExerciseAnalytics scan bound
 * (src/exercise.service.ts, MEDIUM #8).
 *
 * getExerciseAnalytics() previously ran
 *   prisma.exercise.findMany({ where: { workout: { userId }, name }, orderBy: asc })
 * with NO take and NO date window — an unbounded scan returning EVERY set of that
 * exercise the user had ever logged (the same class fixed for getHeatmap). The fix
 * bounds the query to the MOST-recent MAX_ANALYTICS_SETS sets by ordering
 * completedAt DESC + take, then reversing back to ASC so the emitted order is
 * identical to the old `orderBy: completedAt asc`.
 *
 * The MOST-recent rows (not the oldest) must be the ones kept because the mobile
 * `getLastSet` helper reads the LAST (most-recent) row and the web chart renders
 * only the tail — so the bound must never drop the newest set.
 *
 * Mirrors the in-memory-Prisma-fake style of gdpr-export.test.ts: the REAL
 * ExerciseService runs against a tiny fake exposing exercise.findMany, so nothing
 * opens a DB. Two properties are locked:
 *   (a) BOUND — the query is issued with orderBy completedAt DESC + take === the
 *       exported MAX_ANALYTICS_SETS cap (so a pathological history is capped to the
 *       most-recent N, never an unbounded scan).
 *   (b) PRESERVATION — for a normal (sub-cap) history the returned rows are the
 *       full set, in ascending date order, with the mapped shape unchanged.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ExerciseService, MAX_ANALYTICS_SETS } from '../src/exercise.service';

const noopEventBus = { publish: jest.fn(), subscribe: jest.fn() } as any;
const USER_ID = '55555555-5555-4555-8555-555555555555';

// A single exercise row in the shape getExerciseAnalytics consumes:
// findMany({ include: { workout: { select: { completedAt } } } }).
function row(id: string, completedAt: string, weightKg = 100, reps = 5, sets = 3) {
    return { id, sets, reps, weightKg, workout: { completedAt: new Date(completedAt) } };
}

// Fake Prisma that records the findMany args and returns `rows` already ordered
// DESC (newest first) — exactly what `orderBy: { workout: { completedAt: 'desc' } }`
// would yield — applying the requested `take` cap, mirroring the real DB.
function makeFakePrisma(rowsDesc: any[]) {
    const calls: any[] = [];
    return {
        calls,
        exercise: {
            findMany: jest.fn(async (args: any) => {
                calls.push(args);
                const take = args?.take;
                return typeof take === 'number' ? rowsDesc.slice(0, take) : rowsDesc;
            }),
        },
    } as any;
}

describe('getExerciseAnalytics scan bound (MAX_ANALYTICS_SETS)', () => {
    it('the cap is a finite positive number matching the shared 500 route cap', () => {
        expect(MAX_ANALYTICS_SETS).toBe(500);
    });

    it('(a) BOUND — issues findMany with completedAt DESC + take === MAX_ANALYTICS_SETS', async () => {
        const fake = makeFakePrisma([row('a', '2026-06-01T00:00:00.000Z')]);
        const svc = new ExerciseService(fake, noopEventBus);

        await svc.getExerciseAnalytics(USER_ID, 'Bench Press');

        expect(fake.exercise.findMany).toHaveBeenCalledTimes(1);
        const arg = fake.calls[0];
        expect(arg.take).toBe(MAX_ANALYTICS_SETS);
        expect(arg.orderBy).toEqual({ workout: { completedAt: 'desc' } });
        // name match stays case-insensitive and user-scoped (unchanged behaviour).
        expect(arg.where).toEqual({
            workout: { userId: USER_ID },
            name: { equals: 'Bench Press', mode: 'insensitive' },
        });
    });

    it('(b) PRESERVATION — sub-cap history returned in full, ASCending, mapped 1:1', async () => {
        // DB hands back newest-first (DESC); the service must reverse to ASC.
        const rowsDesc = [
            row('newest', '2026-06-03T00:00:00.000Z', 120, 4, 3),
            row('mid', '2026-06-02T00:00:00.000Z', 110, 5, 3),
            row('oldest', '2026-06-01T00:00:00.000Z', 100, 6, 3),
        ];
        const fake = makeFakePrisma(rowsDesc);
        const svc = new ExerciseService(fake, noopEventBus);

        const out = await svc.getExerciseAnalytics(USER_ID, 'Bench Press');

        // ASCending by date, full set preserved (3 in, 3 out).
        expect(out.map(r => r.id)).toEqual(['oldest', 'mid', 'newest']);
        // The LAST row is the most-recent set — what mobile getLastSet relies on.
        expect(out[out.length - 1].id).toBe('newest');
        // Mapped shape unchanged: volume = sets * reps * weightKg.
        expect(out[out.length - 1]).toEqual({
            id: 'newest',
            date: new Date('2026-06-03T00:00:00.000Z'),
            maxWeight: 120,
            volume: 3 * 4 * 120,
            reps: 4,
            sets: 3,
        });
    });

    it('(b) PRESERVATION — pathological history is capped to the most-recent N (newest kept)', async () => {
        // Build cap+50 rows, DESC (index 0 = newest). The DB fake applies `take`,
        // so only the newest MAX_ANALYTICS_SETS survive; after the reverse the
        // LAST returned row must still be the single newest set.
        const total = MAX_ANALYTICS_SETS + 50;
        const rowsDesc = Array.from({ length: total }, (_, i) =>
            // i=0 newest; each step one day older.
            row(`r${i}`, new Date(Date.UTC(2026, 5, 20) - i * 86_400_000).toISOString()),
        );
        const fake = makeFakePrisma(rowsDesc);
        const svc = new ExerciseService(fake, noopEventBus);

        const out = await svc.getExerciseAnalytics(USER_ID, 'Bench Press');

        expect(out).toHaveLength(MAX_ANALYTICS_SETS); // capped, not the full total
        expect(out[out.length - 1].id).toBe('r0'); // newest set never dropped
        // The dropped rows are the OLDEST 50 (r500..r549), not any recent one.
        expect(out.some(r => r.id === 'r549')).toBe(false);
        expect(out[0].id).toBe(`r${MAX_ANALYTICS_SETS - 1}`);
    });
});
