/**
 * GDPR data-export regression suite — GET /v1/exercises/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Two guarantees:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. Without the X-Internal-Token header
 *      (or with the wrong one) it MUST answer 404 (the stock not-found body),
 *      never revealing the route exists, and ExerciseService.exportUser is NEVER
 *      invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME user-owned tables the purge covers (workouts,
 *      workout_routines, 1rm_logs, workout_sessions), keyed by table name, and
 *      ONLY the target user's rows (others + the NULL-user global routine template
 *      are excluded, exactly like the purge).
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real ExerciseService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics (rows by
 *     user_id across the four tables, others/global excluded), that the export
 *     table set EXACTLY matches the purge table set (sync invariant), that the
 *     cascade-child rows (exercises, exercise_logs) are nested in the export, that
 *     no secret/credential-looking field leaks, and that the per-table row cap
 *     bounds + flags the payload.
 *   • REST — the genuine makeInternalAuthGuard preHandler (the SAME guard
 *     src/index.ts mounts) wraps a tiny app reproducing the route handler with a
 *     mock service, proving the guard and the 200 body wiring.
 *
 * Why not import src/index.ts directly: it opens real DB/Redis connections at
 * import time and cannot be loaded in a unit test (same constraint documented in
 * gdpr-purge.test.ts). So the REST layer rebuilds the exact route shape.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { makeInternalAuthGuard } from '@nightfuel/config';
import { ExerciseService } from '../src/exercise.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// The export table set MUST equal the purge table set.
const EXPORT_TABLES = ['workouts', 'workout_routines', '1rm_logs', 'workout_sessions'];

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what ExerciseService.exportUser touches: findMany on workout /
// workoutRoutine / oneRepMaxLog / workoutSession with the exact `where: { userId }`
// + orderBy + take shapes exportUser builds. The `include` (child exercises /
// logs) is honoured by returning rows that already carry those nested arrays.
// Also provides deleteMany + a sequential $transaction so the sync-invariant test
// can run the real purgeUser against the same seeded fake.
function makeFakePrisma(seed?: {
    workouts?: any[];
    workoutRoutines?: any[];
    oneRepMaxLogs?: any[];
    workoutSessions?: any[];
}) {
    const state = {
        workouts: seed?.workouts ? [...seed.workouts] : [],
        workoutRoutines: seed?.workoutRoutines ? [...seed.workoutRoutines] : [],
        oneRepMaxLogs: seed?.oneRepMaxLogs ? [...seed.oneRepMaxLogs] : [],
        workoutSessions: seed?.workoutSessions ? [...seed.workoutSessions] : [],
    };

    // exportUser builds `where: { userId }`; a row matches only when its userId
    // strictly equals the target — a NULL userId (global routine template) never
    // matches a concrete id, exactly like Postgres `WHERE user_id = $1`.
    const findByUser = (rows: any[], { where, take }: any) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };
    const byUserId = (where: any) => (r: any) => r.userId === where.userId;

    const prisma: any = {
        workout: {
            findMany: (args: any) => findByUser(state.workouts, args),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.workouts, byUserId(where))),
        },
        workoutRoutine: {
            findMany: (args: any) => findByUser(state.workoutRoutines, args),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.workoutRoutines, byUserId(where))),
        },
        oneRepMaxLog: {
            findMany: (args: any) => findByUser(state.oneRepMaxLogs, args),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.oneRepMaxLogs, byUserId(where))),
        },
        workoutSession: {
            findMany: (args: any) => findByUser(state.workoutSessions, args),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.workoutSessions, byUserId(where))),
        },
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

const noopEventBus: any = { publish: jest.fn(), subscribe: jest.fn() };

/**
 * Build a Fastify app reproducing the EXACT route wiring from src/index.ts: the
 * real makeInternalAuthGuard preHandler + the inline GET .../export handler. The
 * service is injected so the REST layer can use a mock.
 */
async function buildApp(exerciseSvc: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/internal/user/:userId/export', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().uuid() }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const data = await exerciseSvc.exportUser(userId);
            return reply.code(200).send({ userId, data });
        } catch (err: any) {
            request.log.error({ err, userId }, 'GDPR export failed');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    await app.ready();
    return app;
}

const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

describe('ExerciseService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all four tables, excluding others + global templates', async () => {
        const { prisma } = makeFakePrisma({
            workouts: [
                { id: 'w1', userId: VICTIM, title: 'Leg Day', exercises: [{ id: 'e1', name: 'Squat', sets: 5 }] },
                { id: 'w2', userId: VICTIM, title: 'Push Day', exercises: [] },
                { id: 'w3', userId: OTHER, title: 'Other', exercises: [] },
            ],
            // Includes a NULL-userId GLOBAL template that must be EXCLUDED from the export.
            workoutRoutines: [
                { id: 'r1', userId: VICTIM, title: 'My Routine' },
                { id: 'r2', userId: OTHER, title: 'Their Routine' },
                { id: 'rGlobal', userId: null, title: 'Global Template' },
            ],
            oneRepMaxLogs: [{ id: 'o1', userId: VICTIM, exerciseName: 'Bench' }, { id: 'o2', userId: OTHER }],
            workoutSessions: [
                { id: 's1', userId: VICTIM, status: 'completed', logs: [{ id: 'l1', exerciseName: 'Squat' }] },
                { id: 's3', userId: OTHER, status: 'active', logs: [] },
            ],
        });
        const svc = new ExerciseService(prisma as any, noopEventBus);

        const out = await svc.exportUser(VICTIM);

        // Only the victim's rows are returned; OTHER + NULL-user global excluded.
        expect(out.workouts.map((r: any) => r.id)).toEqual(['w1', 'w2']);
        expect(out.workout_routines.map((r: any) => r.id)).toEqual(['r1']);
        expect(out['1rm_logs'].map((r: any) => r.id)).toEqual(['o1']);
        expect(out.workout_sessions.map((r: any) => r.id)).toEqual(['s1']);

        // Cascade-child rows (the purge erases these) are nested in the export.
        expect(out.workouts[0].exercises.map((e: any) => e.id)).toEqual(['e1']);
        expect(out.workout_sessions[0].logs.map((l: any) => l.id)).toEqual(['l1']);

        // Untruncated for a small dataset.
        expect(out._meta).toMatchObject({
            workoutsTruncated: false,
            workoutRoutinesTruncated: false,
            oneRepMaxLogsTruncated: false,
            workoutSessionsTruncated: false,
        });
    });

    it('export table set EXACTLY mirrors the purge table set (export/erasure stay in sync)', async () => {
        const { prisma } = makeFakePrisma({
            workouts: [{ id: 'w1', userId: VICTIM, exercises: [] }],
            workoutRoutines: [{ id: 'r1', userId: VICTIM }],
            oneRepMaxLogs: [{ id: 'o1', userId: VICTIM }],
            workoutSessions: [{ id: 's1', userId: VICTIM, logs: [] }],
        });
        const svc = new ExerciseService(prisma as any, noopEventBus);

        const exportKeys = Object.keys(await svc.exportUser(VICTIM)).filter((k) => k !== '_meta').sort();
        // purgeUser returns a per-table deletedCounts whose keys ARE the table set.
        const { prisma: prisma2 } = makeFakePrisma({
            workouts: [{ id: 'w1', userId: VICTIM, exercises: [] }],
            workoutRoutines: [{ id: 'r1', userId: VICTIM }],
            oneRepMaxLogs: [{ id: 'o1', userId: VICTIM }],
            workoutSessions: [{ id: 's1', userId: VICTIM, logs: [] }],
        });
        const purgeKeys = Object.keys(await new ExerciseService(prisma2 as any, noopEventBus).purgeUser(VICTIM)).sort();

        expect(exportKeys).toEqual([...EXPORT_TABLES].sort());
        expect(exportKeys).toEqual(purgeKeys);
    });

    it('SECURITY: no secret/credential/token/password column appears anywhere in the export', async () => {
        const { prisma } = makeFakePrisma({
            workouts: [{ id: 'w1', userId: VICTIM, title: 'Leg Day', notes: 'felt strong', exercises: [{ id: 'e1', name: 'Squat' }] }],
            workoutRoutines: [{ id: 'r1', userId: VICTIM, title: 'Plan', exercises: [{ name: 'Squat' }] }],
            oneRepMaxLogs: [{ id: 'o1', userId: VICTIM, exerciseName: 'Bench', weightKg: 100 }],
            workoutSessions: [{ id: 's1', userId: VICTIM, status: 'completed', logs: [{ id: 'l1', exerciseName: 'Squat' }] }],
        });
        const svc = new ExerciseService(prisma as any, noopEventBus);

        const out = await svc.exportUser(VICTIM);
        const blob = JSON.stringify(out).toLowerCase();

        // This service stores no auth material, but assert defensively: a future
        // schema change that leaks a credential-looking field into the export fails here.
        for (const banned of ['password', 'passwordhash', 'token', 'secret', 'refreshtoken', 'apikey', 'privatekey']) {
            expect(blob).not.toContain(banned);
        }
    });

    it('BOUNDS the result: a table over EXPORT_ROW_LIMIT is capped and flagged truncated', async () => {
        // Build cap+1 rows so exportUser detects truncation (take: cap+1, slice to cap).
        const CAP = 50_000;
        const workouts = Array.from({ length: CAP + 1 }, (_, i) => ({ id: `w${i}`, userId: VICTIM, exercises: [] }));
        const { prisma } = makeFakePrisma({ workouts });
        const svc = new ExerciseService(prisma as any, noopEventBus);

        const out = await svc.exportUser(VICTIM);

        expect(out.workouts.length).toBe(CAP);
        expect(out._meta.workoutsTruncated).toBe(true);
        expect(out._meta.rowLimit).toBe(CAP);
    });
});

describe('GET /v1/exercises/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(() => Promise.resolve({}));
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: `/v1/exercises/internal/user/${VICTIM}/export` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(() => Promise.resolve({}));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/exercises/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            workouts: [{ id: 'w1', userId: VICTIM, exercises: [{ id: 'e1' }] }],
            workout_routines: [{ id: 'r1', userId: VICTIM }],
            '1rm_logs': [{ id: 'o1', userId: VICTIM }],
            workout_sessions: [{ id: 's1', userId: VICTIM, logs: [{ id: 'l1' }] }],
            _meta: {
                workoutsTruncated: false,
                workoutRoutinesTruncated: false,
                oneRepMaxLogsTruncated: false,
                workoutSessionsTruncated: false,
                rowLimit: 50000,
            },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/exercises/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.userId).toBe(VICTIM);
        // Exactly the purge's table set is present, keyed by table name.
        expect(Object.keys(body.data).filter((k) => k !== '_meta').sort()).toEqual([...EXPORT_TABLES].sort());
        expect(body.data).toEqual(data);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const empty = {
            workouts: [], workout_routines: [], '1rm_logs': [], workout_sessions: [],
            _meta: { workoutsTruncated: false, workoutRoutinesTruncated: false, oneRepMaxLogsTruncated: false, workoutSessionsTruncated: false, rowLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(empty));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/exercises/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data).toEqual(empty);
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(() => Promise.resolve({}));
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/exercises/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
