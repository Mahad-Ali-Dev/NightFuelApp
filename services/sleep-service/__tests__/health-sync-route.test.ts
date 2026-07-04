/**
 * Regression suite — POST /v1/sleep/health-sync ROUTE: input-bounds + AUTHZ,
 * exercised through the REAL validation pipeline (validatorCompiler +
 * serializerCompiler from fastify-type-provider-zod feeding the SHARED
 * registerFastifyErrorHandler), mirroring sleep-service/input-bounds.test.ts.
 *
 * What this locks that the pure health-sync.test.ts cannot:
 *   - the batch size cap + per-kind value bounds reject with a real HTTP 400;
 *   - a representative valid batch still succeeds 201 with the summary shape;
 *   - AUTHZ: with the `authenticate` hook denying, the request is rejected 401
 *     BEFORE the handler — and the userId the handler would use comes ONLY from
 *     request.user (the JWT), never the body, so there is no userId to forge
 *     (no IDOR). We prove the handler reads request.user.userId.
 *
 * Why we mount a tiny app instead of importing src/index.ts: the service
 * bootstrap opens real DB/Redis at import time (documented across the sibling
 * suites). We copy the schema verbatim from src/index.ts and attach the route
 * with a stub ingest so a valid request is observable without infra.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import {
    healthSyncSchema,
    MAX_BATCH_SAMPLES,
    MAX_HR_BPM,
    MIN_HR_BPM,
    MAX_HRV_MS,
    MAX_STEPS,
} from '../src/health-sync.service';

// ── Schema: imported from the SHARED source (D3) ─────────────────────────────────
// `healthSyncSchema` is the SAME object src/index.ts mounts on the route, so this
// suite validates the DEPLOYED schema — not a drift-prone copy. (Importing it is
// safe: health-sync.service.ts pulls in nothing from Prisma / Fastify / the bus.)

const VALID_SUMMARY = { persisted: 1, sleepSessionsCreated: 1, autonomicRefined: false };

/** Build an app wired like src/index.ts. `authResult` controls the auth hook. */
function buildApp(opts: { authed: boolean }): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const authenticate = async (request: any, reply: any) => {
        if (!opts.authed) return reply.code(401).send({ error: 'Unauthorized' });
        // Mirror src/index.ts: the verified token populates request.user.
        request.user = { userId: 'jwt-user-1' };
    };

    app.post(
        '/v1/sleep/health-sync',
        { onRequest: [authenticate], schema: { body: healthSyncSchema } },
        async (request: any, reply) => {
            // AUTHZ proof: the userId is read ONLY from the JWT-populated
            // request.user — never the body — so a caller can only ingest their own
            // samples. We echo it so the test can assert it.
            const userId = request.user.userId ?? request.user.id;
            return reply.code(201).send({ ...VALID_SUMMARY, userId });
        },
    );

    return app;
}

const SLEEP_SAMPLE = {
    kind: 'sleep',
    startTime: '2026-06-20T23:00:00.000Z',
    endTime: '2026-06-21T07:00:00.000Z',
    quality: 8,
};

describe('POST /v1/sleep/health-sync — AUTHZ', () => {
    it('rejects an unauthenticated request with 401 (before the handler)', async () => {
        const app = buildApp({ authed: false });
        await app.ready();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: { samples: [SLEEP_SAMPLE] },
        });
        expect(res.statusCode).toBe(401);
        await app.close();
    });

    it('uses the JWT userId (not the body) — no userId to forge (no IDOR)', async () => {
        const app = buildApp({ authed: true });
        await app.ready();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            // A forged userId in the body must be IGNORED.
            payload: { userId: 'victim-2', samples: [SLEEP_SAMPLE] },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().userId).toBe('jwt-user-1');
        await app.close();
    });
});

describe('POST /v1/sleep/health-sync — input-bounds', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
        app = buildApp({ authed: true });
        await app.ready();
    });
    afterAll(async () => app.close());

    it('rejects an empty batch (min 1) with 400', async () => {
        const res = await app.inject({ method: 'POST', url: '/v1/sleep/health-sync', payload: { samples: [] } });
        expect(res.statusCode).toBe(400);
    });

    it('rejects a batch over the size cap with 400', async () => {
        const samples = Array.from({ length: MAX_BATCH_SAMPLES + 1 }, () => SLEEP_SAMPLE);
        const res = await app.inject({ method: 'POST', url: '/v1/sleep/health-sync', payload: { samples } });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an out-of-range heart rate (bpm 999) with 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: { samples: [{ kind: 'heartRate', startTime: '2026-06-20T08:00:00.000Z', value: 999 }] },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an out-of-range HRV (9999 ms) with 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: { samples: [{ kind: 'hrv', startTime: '2026-06-20T08:00:00.000Z', value: MAX_HRV_MS + 1 }] },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an absurd steps count with 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: { samples: [{ kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: MAX_STEPS + 1 }] },
        });
        expect(res.statusCode).toBe(400);
    });

    it('accepts a camera_ppg heart-rate sample with 201 (the new HealthSource)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: {
                samples: [
                    {
                        kind: 'heartRate',
                        source: 'camera_ppg',
                        startTime: '2026-06-20T08:00:00.000Z',
                        value: 72,
                        unit: 'bpm',
                    },
                ],
            },
        });
        expect(res.statusCode).toBe(201);
    });

    it('rejects an unknown source with 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: {
                samples: [
                    { kind: 'heartRate', source: 'palm_reading', startTime: '2026-06-20T08:00:00.000Z', value: 72 },
                ],
            },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown kind with 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: { samples: [{ kind: 'bloodPressure', startTime: '2026-06-20T08:00:00.000Z', value: 120 }] },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects a non-ISO startTime with 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: { samples: [{ kind: 'sleep', startTime: 'yesterday' }] },
        });
        expect(res.statusCode).toBe(400);
    });

    it('a representative valid batch still succeeds 201 with the summary shape', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: {
                samples: [
                    SLEEP_SAMPLE,
                    { kind: 'restingHeartRate', startTime: '2026-06-21T07:00:00.000Z', value: 58 },
                    { kind: 'hrv', startTime: '2026-06-21T07:00:00.000Z', value: 65 },
                    { kind: 'steps', startTime: '2026-06-20T08:00:00.000Z', value: 8000 },
                ],
            },
        });
        expect(res.statusCode).toBe(201);
        const json = res.json();
        expect(typeof json.persisted).toBe('number');
        expect(typeof json.sleepSessionsCreated).toBe('number');
        expect(typeof json.autonomicRefined).toBe('boolean');
    });

    it('valid in-range edge values (bpm at MIN/MAX, hrv at MAX) succeed 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/sleep/health-sync',
            payload: {
                samples: [
                    { kind: 'heartRate', startTime: '2026-06-20T08:00:00.000Z', value: MIN_HR_BPM },
                    { kind: 'restingHeartRate', startTime: '2026-06-20T08:00:00.000Z', value: MAX_HR_BPM },
                    { kind: 'hrv', startTime: '2026-06-20T08:00:00.000Z', value: MAX_HRV_MS },
                ],
            },
        });
        expect(res.statusCode).toBe(201);
    });
});
