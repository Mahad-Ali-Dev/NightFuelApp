/**
 * State-machine regression suite — exercise-service workout-SESSION lifecycle
 * (src/exercise.service.ts: startSession / getActiveSession / endSession /
 * logSessionExercise).
 *
 * Three lifecycle bugs are locked here (sprint F23). They are about the *state
 * machine*, NOT ownership (ownership is covered separately by
 * session-ownership.test.ts at the route layer):
 *
 *   1. (HIGH) startSession used to create UNLIMITED concurrent 'active' sessions
 *      for one user — every /start spawned another active row. The fix atomically
 *      CANCELS any existing active session for the user before creating the new
 *      one (updateMany { userId, status:'active' } → status:'cancelled',
 *      endedAt:now), so a user has at most one active session. getActiveSession
 *      also gained orderBy startedAt:desc so the MOST RECENT active row wins.
 *
 *   2. (MED) endSession used to re-complete a TERMINAL session — a second /end on
 *      an already completed/cancelled session overwrote endedAt. The fix scopes
 *      the updateMany to status:'active'; on count 0 it returns null (the route
 *      404s on null, the F22 IDOR behaviour, which is preserved).
 *
 *   3. (MED) logSessionExercise used to let a set be appended to a
 *      completed/cancelled session. The fix scopes its precondition findFirst to
 *      status:'active'; a non-active (or non-owned / missing) session → null →
 *      route 404.
 *
 * Why this suite instantiates the REAL ExerciseService against a mocked Prisma
 * (instead of mirroring routes like session-ownership.test.ts): the bug lives in
 * the SERVICE's Prisma query shapes (the where/data clauses), not the route glue.
 * ExerciseService can be imported directly — it only stores prisma/eventBus in
 * its constructor and runs no side effects at import (same reason heatmap-window
 * .test.ts imports from ../src). So we drive the real methods through a tiny
 * Prisma double whose updateMany/findFirst/create record the exact arguments and
 * model an in-memory workout_sessions table, then assert the lifecycle invariants
 * AND the precise query clauses (the load-bearing part of each fix).
 *
 * If the service query shapes change, these assertions must change in lockstep —
 * that lockstep is the point.
 */
import { ExerciseService } from '../src/exercise.service';

const USER_A = 'aaaaaaaa-aaaa-8aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-8bbb-8bbb-bbbbbbbbbbbb';

type SessionRow = {
    id: string;
    userId: string;
    routineId: string | null;
    status: string; // 'active' | 'completed' | 'cancelled'
    startedAt: Date;
    endedAt: Date | null;
};

/**
 * A minimal in-memory Prisma double for the workout_sessions table that models
 * the exact methods ExerciseService.startSession/getActiveSession/endSession/
 * logSessionExercise call: create, findFirst, updateMany. It honours the
 * { userId, status } / { id, userId, status } where-filters and the
 * orderBy startedAt:desc the real service uses, so the lifecycle assertions
 * reflect real Prisma semantics.
 */
function buildPrismaDouble(seed: SessionRow[] = []) {
    const sessions: SessionRow[] = seed.map((s) => ({ ...s }));
    let seq = 0;
    const clock = () => new Date(2026, 5, 21, 12, 0, seq); // distinct, increasing

    const matches = (row: SessionRow, where: any): boolean => {
        if (where.id !== undefined && row.id !== where.id) return false;
        if (where.userId !== undefined && row.userId !== where.userId) return false;
        if (where.status !== undefined && row.status !== where.status) return false;
        return true;
    };

    const workoutSession = {
        create: jest.fn(async ({ data }: any) => {
            seq += 1;
            const row: SessionRow = {
                id: `sess-${seq}`,
                userId: data.userId,
                routineId: data.routineId ?? null,
                status: data.status,
                startedAt: clock(),
                endedAt: null,
            };
            sessions.push(row);
            return { ...row };
        }),
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
            let hits = sessions.filter((r) => matches(r, where));
            if (orderBy?.startedAt === 'desc') {
                hits = hits.slice().sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
            }
            return hits.length ? { ...hits[0] } : null;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
            const hits = sessions.filter((r) => matches(r, where));
            for (const r of hits) Object.assign(r, data);
            return { count: hits.length };
        }),
    };

    const exerciseLog = {
        create: jest.fn(async ({ data }: any) => ({ id: 'log-1', ...data })),
    };

    return {
        prisma: { workoutSession, exerciseLog } as any,
        // Test-only view into the table.
        _rows: sessions,
    };
}

const noopEventBus = { publish: jest.fn(async () => {}) } as any;

function activeRow(over: Partial<SessionRow> = {}): SessionRow {
    return {
        id: 'sess-existing',
        userId: USER_A,
        routineId: null,
        status: 'active',
        startedAt: new Date(2026, 5, 21, 11, 0, 0),
        endedAt: null,
        ...over,
    };
}

describe('startSession — single active session invariant (bug 1, HIGH)', () => {
    it('cancels the existing active session BEFORE creating a new one', async () => {
        const { prisma, _rows } = buildPrismaDouble([activeRow({ id: 'old' })]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const created = await svc.startSession(USER_A, 'routine-x');

        // The previously-active row is now cancelled with an endedAt stamp.
        const old = _rows.find((r) => r.id === 'old')!;
        expect(old.status).toBe('cancelled');
        expect(old.endedAt).toBeInstanceOf(Date);

        // Exactly ONE active row remains for the user — the freshly created one.
        const active = _rows.filter((r) => r.userId === USER_A && r.status === 'active');
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(created.id);
        expect(created.status).toBe('active');

        // Lock the cancel clause: scoped to the caller's own ACTIVE sessions,
        // setting cancelled + endedAt — and it runs before create.
        expect(prisma.workoutSession.updateMany).toHaveBeenCalledTimes(1);
        const cancelArgs = prisma.workoutSession.updateMany.mock.calls[0][0];
        expect(cancelArgs.where).toEqual({ userId: USER_A, status: 'active' });
        expect(cancelArgs.data.status).toBe('cancelled');
        expect(cancelArgs.data.endedAt).toBeInstanceOf(Date);
        // updateMany ordered before create (the close-then-open sequence).
        const cancelOrder = prisma.workoutSession.updateMany.mock.invocationCallOrder[0];
        const createOrder = prisma.workoutSession.create.mock.invocationCallOrder[0];
        expect(cancelOrder).toBeLessThan(createOrder);
    });

    it('a SECOND start cancels the first — never two concurrent active rows', async () => {
        const { prisma, _rows } = buildPrismaDouble();
        const svc = new ExerciseService(prisma, noopEventBus);

        const first = await svc.startSession(USER_A);
        const second = await svc.startSession(USER_A);

        expect(first.id).not.toBe(second.id);
        const active = _rows.filter((r) => r.userId === USER_A && r.status === 'active');
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(second.id);

        const firstRow = _rows.find((r) => r.id === first.id)!;
        expect(firstRow.status).toBe('cancelled');
        expect(firstRow.endedAt).toBeInstanceOf(Date);
    });

    it("does NOT cancel another user's active session", async () => {
        const { prisma, _rows } = buildPrismaDouble([
            activeRow({ id: 'b-active', userId: USER_B }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        await svc.startSession(USER_A);

        // User B's active session is untouched (the cancel is userId-scoped).
        const bRow = _rows.find((r) => r.id === 'b-active')!;
        expect(bRow.status).toBe('active');
        expect(bRow.endedAt).toBeNull();
    });
});

describe('getActiveSession — most-recent active row (bug 1, ordering)', () => {
    it('orders by startedAt desc and includes logs', async () => {
        const { prisma } = buildPrismaDouble([
            activeRow({ id: 'older', startedAt: new Date(2026, 5, 20, 9, 0, 0) }),
            activeRow({ id: 'newer', startedAt: new Date(2026, 5, 21, 9, 0, 0) }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const active = await svc.getActiveSession(USER_A);
        expect(active?.id).toBe('newer');

        const args = prisma.workoutSession.findFirst.mock.calls[0][0];
        expect(args.where).toEqual({ userId: USER_A, status: 'active' });
        expect(args.orderBy).toEqual({ startedAt: 'desc' });
        expect(args.include).toEqual({ logs: true });
    });
});

describe('endSession — terminal session is not re-completed (bug 2, MED)', () => {
    it('ends an ACTIVE session (count 1) and returns the completed row', async () => {
        const { prisma, _rows } = buildPrismaDouble([
            activeRow({ id: 'sess-active' }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const ended = await svc.endSession('sess-active', USER_A);
        expect(ended).not.toBeNull();
        expect(ended?.status).toBe('completed');

        const row = _rows.find((r) => r.id === 'sess-active')!;
        expect(row.status).toBe('completed');
        expect(row.endedAt).toBeInstanceOf(Date);

        // The update is scoped to the caller's OWN ACTIVE session.
        const args = prisma.workoutSession.updateMany.mock.calls[0][0];
        expect(args.where).toEqual({ id: 'sess-active', userId: USER_A, status: 'active' });
        expect(args.data.status).toBe('completed');
        expect(args.data.endedAt).toBeInstanceOf(Date);
    });

    it('a SECOND end on an already-completed session returns null and does NOT overwrite endedAt', async () => {
        const firstEndedAt = new Date(2026, 5, 21, 10, 30, 0);
        const { prisma, _rows } = buildPrismaDouble([
            activeRow({ id: 'sess-done', status: 'completed', endedAt: firstEndedAt }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const result = await svc.endSession('sess-done', USER_A);
        expect(result).toBeNull(); // count 0 ⇒ route 404 (F22 behaviour preserved)

        const row = _rows.find((r) => r.id === 'sess-done')!;
        expect(row.status).toBe('completed');
        // endedAt is untouched — NOT overwritten by the second /end.
        expect(row.endedAt).toBe(firstEndedAt);
    });

    it('end on a CANCELLED session returns null (terminal, not re-completed)', async () => {
        const cancelledAt = new Date(2026, 5, 21, 10, 0, 0);
        const { prisma, _rows } = buildPrismaDouble([
            activeRow({ id: 'sess-cancelled', status: 'cancelled', endedAt: cancelledAt }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const result = await svc.endSession('sess-cancelled', USER_A);
        expect(result).toBeNull();

        const row = _rows.find((r) => r.id === 'sess-cancelled')!;
        expect(row.status).toBe('cancelled');
        expect(row.endedAt).toBe(cancelledAt);
    });
});

describe('logSessionExercise — cannot log into a non-active session (bug 3, MED)', () => {
    it('logs a set into an ACTIVE owned session', async () => {
        const { prisma } = buildPrismaDouble([activeRow({ id: 'sess-active' })]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const log = await svc.logSessionExercise('sess-active', USER_A, 'Bench Press', 3, 10, 80, 0);
        expect(log).not.toBeNull();
        expect(prisma.exerciseLog.create).toHaveBeenCalledTimes(1);

        // The precondition findFirst is scoped to OWNED + ACTIVE.
        const args = prisma.workoutSession.findFirst.mock.calls[0][0];
        expect(args.where).toEqual({ id: 'sess-active', userId: USER_A, status: 'active' });
    });

    it('rejects logging into a COMPLETED session (returns null, no write)', async () => {
        const { prisma } = buildPrismaDouble([
            activeRow({ id: 'sess-done', status: 'completed', endedAt: new Date() }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const log = await svc.logSessionExercise('sess-done', USER_A, 'Bench Press', 3, 10, 80, 0);
        expect(log).toBeNull();
        expect(prisma.exerciseLog.create).not.toHaveBeenCalled();
    });

    it('rejects logging into a CANCELLED session (returns null, no write)', async () => {
        const { prisma } = buildPrismaDouble([
            activeRow({ id: 'sess-cancelled', status: 'cancelled', endedAt: new Date() }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const log = await svc.logSessionExercise('sess-cancelled', USER_A, 'Bench Press', 3, 10, 80, 0);
        expect(log).toBeNull();
        expect(prisma.exerciseLog.create).not.toHaveBeenCalled();
    });

    it("rejects logging into another user's active session (ownership preserved)", async () => {
        const { prisma } = buildPrismaDouble([
            activeRow({ id: 'b-active', userId: USER_B }),
        ]);
        const svc = new ExerciseService(prisma, noopEventBus);

        const log = await svc.logSessionExercise('b-active', USER_A, 'Bench Press', 3, 10, 80, 0);
        expect(log).toBeNull();
        expect(prisma.exerciseLog.create).not.toHaveBeenCalled();
    });
});
