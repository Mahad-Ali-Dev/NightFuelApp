/**
 * Suite — shift-service `/v1/training/scheduled-sessions` routes
 * (src/training.routes.ts), the read/write path behind the mobile Training
 * Calendar's "Scheduled Sessions" list.
 *
 * Two contracts are locked here:
 *
 *   1. AUTHENTICATED GET returns the SIGNED-IN user's sessions. The Prisma
 *      client is fully mocked (scheduledSession.findMany is a jest.fn()), so we
 *      can both observe the rows round-trip to the client AND assert the query
 *      is scoped to `request.user.userId` from the verified JWT — never a
 *      client-supplied id.
 *
 *   2. GRACEFUL DEGRADATION while the user-gated 20260617000000_scheduled_sessions
 *      migration is UN-RUN. A simulated Prisma `P2021` ("table does not exist")
 *      MUST yield `200 []`, NOT a 500 — otherwise dev/calendar breaks for every
 *      user until a human migrates the VPS. This assertion FAILS against a naive
 *      handler that lets the missing-table error fall through to the generic 500.
 *
 * The genuine `trainingRoutes` plugin is registered on a fresh Fastify instance
 * wired exactly like src/index.ts (fastify-type-provider-zod compilers +
 * @fastify/jwt + the `authenticate` decorator that delegates to
 * `sendUnauthorized`), so the route schemas validate and the auth gate is real.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import { sendUnauthorized } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { trainingRoutes } from '../src/training.routes';

// Satisfies the service's JWT_SECRET.min(32) contract.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

const USER_ID = '11111111-1111-1111-1111-111111111111';

// A representative row as Prisma would return it (Date instances serialise to
// ISO strings over the wire — the test asserts on the serialised JSON).
const SESSION_ROW = {
    id: '22222222-2222-2222-2222-222222222222',
    userId: USER_ID,
    title: 'Lower body — squats',
    scheduledAt: new Date('2026-06-20T18:00:00.000Z'),
    notes: 'Deload week',
    createdAt: new Date('2026-06-17T10:00:00.000Z'),
    updatedAt: new Date('2026-06-17T10:00:00.000Z'),
};

type MockPrisma = {
    scheduledSession: {
        findMany: ReturnType<typeof jest.fn>;
        create: ReturnType<typeof jest.fn>;
    };
};

function makeMockPrisma(): MockPrisma {
    return {
        scheduledSession: {
            findMany: jest.fn(() => Promise.resolve([SESSION_ROW] as unknown)),
            create: jest.fn(() => Promise.resolve(SESSION_ROW as unknown)),
        },
    };
}

/**
 * Build a fresh app wired exactly like src/index.ts (minus the real DB): Zod
 * compilers, @fastify/jwt, the `authenticate` decorator, and the trainingRoutes
 * plugin mounted at the production `/v1/training` prefix.
 */
async function buildApp(prisma: MockPrisma): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyJwt, { secret: JWT_SECRET });
    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            return sendUnauthorized(reply, request, err);
        }
    });
    await app.register(
        async (instance) => {
            await trainingRoutes(instance, { prisma: prisma as any });
        },
        { prefix: '/v1/training' }
    );
    await app.ready();
    return app;
}

function validToken(userId: string = USER_ID): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('shift-service /v1/training/scheduled-sessions', () => {
    let app: FastifyInstance;
    let prisma: MockPrisma;

    beforeEach(async () => {
        prisma = makeMockPrisma();
        app = await buildApp(prisma);
    });

    afterEach(async () => {
        await app.close();
    });

    describe('GET — authenticated read', () => {
        it("returns the signed-in user's sessions (200) and scopes the query to the JWT userId", async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body).toHaveLength(1);
            expect(body[0].id).toBe(SESSION_ROW.id);
            expect(body[0].title).toBe(SESSION_ROW.title);

            // The query MUST be scoped to the verified JWT identity, never a
            // client-supplied id.
            expect(prisma.scheduledSession.findMany).toHaveBeenCalledTimes(1);
            const callArg = prisma.scheduledSession.findMany.mock.calls[0][0] as any;
            expect(callArg.where.userId).toBe(USER_ID);
        });

        it('requires a valid Bearer token — 401 and the DB is never queried', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/training/scheduled-sessions',
            });

            expect(res.statusCode).toBe(401);
            expect(prisma.scheduledSession.findMany).not.toHaveBeenCalled();
        });

        // The core graceful-degradation contract. A naive handler that lets the
        // P2021 fall through to the shared 500 branch FAILS this test.
        it('returns 200 [] (NOT 500) when the scheduled_sessions table is absent (simulated Prisma P2021)', async () => {
            const p2021: any = new Error(
                'The table `public.scheduled_sessions` does not exist in the current database.'
            );
            p2021.code = 'P2021';
            prisma.scheduledSession.findMany.mockImplementationOnce(() => Promise.reject(p2021));

            const res = await app.inject({
                method: 'GET',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
            // The raw Prisma message must not reach the client even on this path.
            expect(res.body).not.toContain('scheduled_sessions');
        });

        // Also degrade when the missing-table error arrives un-coded (raw
        // Postgres "relation ... does not exist" message), e.g. via $queryRaw.
        it('returns 200 [] when the error is the raw "relation does not exist" message (no P2021 code)', async () => {
            const raw: any = new Error('relation "scheduled_sessions" does not exist');
            prisma.scheduledSession.findMany.mockImplementationOnce(() => Promise.reject(raw));

            const res = await app.inject({
                method: 'GET',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
        });

        // A genuine fault must NOT be masked as an empty list — it stays a
        // redacted 500 so real DB outages remain visible.
        it('returns a redacted 500 (not []) on a genuine DB fault', async () => {
            const boom: any = new Error('connect ECONNREFUSED 127.0.0.1:5432');
            prisma.scheduledSession.findMany.mockImplementationOnce(() => Promise.reject(boom));

            const res = await app.inject({
                method: 'GET',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
            });

            expect(res.statusCode).toBe(500);
            expect(res.json()).toEqual({ error: 'An unexpected error occurred' });
            // Redaction: the raw connection error must not leak to the client.
            expect(res.body).not.toContain('ECONNREFUSED');
            expect(res.body).not.toContain('5432');
        });
    });

    describe('POST — authenticated create', () => {
        it('creates a session for the signed-in user (201) using the JWT userId', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
                payload: { title: 'Lower body — squats', scheduledAt: '2026-06-20T18:00:00.000Z' },
            });

            expect(res.statusCode).toBe(201);
            expect(prisma.scheduledSession.create).toHaveBeenCalledTimes(1);
            const createArg = prisma.scheduledSession.create.mock.calls[0][0] as any;
            expect(createArg.data.userId).toBe(USER_ID);
            expect(createArg.data.title).toBe('Lower body — squats');
        });

        it('rejects a missing title with a 4xx (Zod body validation) and never writes', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
                payload: { scheduledAt: '2026-06-20T18:00:00.000Z' },
            });

            expect(res.statusCode).toBeGreaterThanOrEqual(400);
            expect(res.statusCode).toBeLessThan(500);
            expect(prisma.scheduledSession.create).not.toHaveBeenCalled();
        });

        it('requires a valid Bearer token — 401 and the DB is never written', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/training/scheduled-sessions',
                payload: { title: 'x', scheduledAt: '2026-06-20T18:00:00.000Z' },
            });

            expect(res.statusCode).toBe(401);
            expect(prisma.scheduledSession.create).not.toHaveBeenCalled();
        });

        // The write counterpart of the GET degradation: a missing table yields a
        // clear 503 (scheduling unavailable), NOT a generic 500.
        it('returns 503 (not 500) when the table is absent (simulated P2021)', async () => {
            const p2021: any = new Error('table does not exist');
            p2021.code = 'P2021';
            prisma.scheduledSession.create.mockImplementationOnce(() => Promise.reject(p2021));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/training/scheduled-sessions',
                headers: { authorization: `Bearer ${validToken()}` },
                payload: { title: 'Lower body — squats', scheduledAt: '2026-06-20T18:00:00.000Z' },
            });

            expect(res.statusCode).toBe(503);
        });
    });
});
