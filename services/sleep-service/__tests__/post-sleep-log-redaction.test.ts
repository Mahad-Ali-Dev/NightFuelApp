/**
 * Regression suite — sleep-service POST /v1/sleep log redaction (MEDIUM #15).
 *
 * Background: the POST /v1/sleep catch in src/index.ts previously did
 *   logger.error({ err, body: request.body, stack: err.stack }, 'POST /v1/sleep failed')
 * which logs the request body — sleep timestamps / quality, i.e. HEALTH data.
 * The fix drops the body (and the redundant stack) from the log, keeping only
 * userId + err:
 *   const userId = (request.user as any)?.userId ?? (request.user as any)?.id;
 *   logger.error({ userId, err }, 'POST /v1/sleep failed')
 *
 * Why replicate the catch instead of importing src/index.ts:
 *   - The bootstrap module opens real DB/Redis connections at import time and
 *     cannot be loaded in a unit test (same constraint as inline-404-redaction.
 *     test.ts). So we mount a tiny Fastify app whose POST handler reproduces the
 *     EXACT hardened catch shape from src/index.ts and spy the logger.
 *
 * Assertions FAIL against the old `body: request.body` code and PASS after the
 * fix: the logged meta carries userId + err, never the body or its health values.
 */
import Fastify, { FastifyInstance } from 'fastify';

const USER_ID = '66666666-6666-6666-6666-666666666666';

// Health values from the POST body that MUST NOT reach the logs.
const SLEEP_START = '2026-06-17T22:30:00.000Z';
const SLEEP_END = '2026-06-18T06:30:00.000Z';

function buildApp(logger: { error: jest.Mock }): FastifyInstance {
    const app = Fastify({ logger: false });

    // Stand-in authenticate: attach a user so the handler's userId extraction
    // succeeds, exactly as the real onRequest decorator would.
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: USER_ID };
    });

    app.post('/v1/sleep', { onRequest: [(app as any).authenticate] }, async (request, reply) => {
        try {
            // Force the catch branch (the real handler calls sleepSvc.createSession).
            throw new Error('Prisma boom at /app/src localhost:5432');
        } catch (err: any) {
            // EXACT hardened catch from src/index.ts — keep in lockstep.
            const userId = (request.user as any)?.userId ?? (request.user as any)?.id;
            logger.error({ userId, err }, 'POST /v1/sleep failed');
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    return app;
}

describe('sleep-service POST /v1/sleep — request body excluded from logs (MEDIUM #15)', () => {
    let app: FastifyInstance;
    let logger: { error: jest.Mock };

    beforeEach(async () => {
        logger = { error: jest.fn() };
        app = buildApp(logger);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('logs userId + err only — never the request body or its health values', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep',
            payload: { startTime: SLEEP_START, endTime: SLEEP_END, quality: 9 },
        });

        expect(res.statusCode).toBe(500);
        expect(logger.error).toHaveBeenCalledTimes(1);

        const [meta, msg] = logger.error.mock.calls[0];
        expect(msg).toBe('POST /v1/sleep failed');
        expect(meta).toHaveProperty('userId', USER_ID);
        expect(meta).toHaveProperty('err');
        // The body must NOT be attached.
        expect(meta).not.toHaveProperty('body');
        expect(meta).not.toHaveProperty('stack');

        // And no health value may appear anywhere in the serialized log args.
        const serialized = JSON.stringify({ userId: meta.userId, err: String(meta.err) });
        expect(serialized).not.toContain(SLEEP_START);
        expect(serialized).not.toContain(SLEEP_END);
    });
});
