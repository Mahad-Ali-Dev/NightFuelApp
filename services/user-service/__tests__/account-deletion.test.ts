/**
 * GDPR account-deletion ORCHESTRATOR — DELETE /v1/users/me (src/routes.ts +
 * src/account-deletion.ts).
 *
 * Locks the GDPR "delete my account" contract:
 *   - IDENTITY: the userId comes ONLY from the verified JWT (request.user.userId).
 *     A forged body userId is IGNORED — a user can only delete THEIR OWN account
 *     (no IDOR).
 *   - OWN DATA: user-service purges its own tables for the JWT userId.
 *   - FAN-OUT: every owning service's internal endpoint is called, with the
 *     X-Internal-Token, for the JWT userId.
 *   - RESILIENCE: a downstream failure → 207 multi-status with the per-service
 *     list (own data still authoritative).
 *   - IDEMPOTENCY: re-deleting an already-deleted account returns success.
 *
 * Strategy mirrors privacy.test.ts / internal-auth.test.ts: mount the REAL
 * `userRoutes` plugin against a fully-mocked UserService, a stand-in
 * `authenticate` decorator, and an INJECTED fanOut seam that records its args
 * (no real HTTP). The fan-out list/headers themselves are unit-tested against
 * the real fanOutPurge with a stub fetch.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { userRoutes } from '../src/routes';
import {
    fanOutPurge,
    OWNING_SERVICES,
    purgeOneService,
} from '../src/account-deletion';

const USER_ID = '44444444-4444-4444-4444-444444444444';
const ATTACKER_TARGET_ID = '99999999-9999-9999-9999-999999999999';
const INTERNAL_TOKEN = 'user-internal-token-value';

function buildMockService() {
    return {
        getProfileWithPreferences: jest.fn(),
        getStatus: jest.fn(),
        updateProfile: jest.fn(),
        updatePrivacy: jest.fn(),
        getPreferences: jest.fn(),
        updatePreferences: jest.fn(),
        updateOnboarding: jest.fn(),
        getStudents: jest.fn(),
        assignProtocol: jest.fn(),
        getAdminStats: jest.fn(),
        getAdminUsers: jest.fn(),
        toggleBanUser: jest.fn(),
        getAllUsersInternal: jest.fn(),
        // Account-deletion surface.
        purgeOwnUserData: jest.fn(async (userId: string) => ({
            userId,
            deletedCounts: {
                coach_client_relations: 0,
                period_logs: 0,
                user_statuses: 1,
                user_preferences: 1,
                coach_profiles: 0,
                user_profiles: 1,
            },
        })),
        emitUserDeleted: jest.fn(async () => undefined),
    };
}

/** Builds the app with a stand-in authenticate + an injected fanOut spy. */
async function buildApp(
    svc: ReturnType<typeof buildMockService>,
    fanOut: typeof fanOutPurge,
    payload: any = { userId: USER_ID, role: 'USER' }
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('authenticate', async (request: any) => {
        request.user = payload;
    });
    await app.register(
        async (instance) => {
            await userRoutes(instance, {
                userService: svc as any,
                internalServiceToken: INTERNAL_TOKEN,
                fanOut,
            });
        },
        { prefix: '/v1/users' }
    );
    await app.ready();
    return app;
}

// A fanOut spy that reports every owning service as purged OK.
function okFanOut() {
    return jest.fn(async (userId: string, token: string) =>
        OWNING_SERVICES.map((s) => ({ service: s.key, ok: true, status: 200 }))
    ) as unknown as typeof fanOutPurge;
}

describe('DELETE /v1/users/me — GDPR orchestrator (route)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('uses the JWT userId (NOT a forged body) — no IDOR', async () => {
        const svc = buildMockService();
        const fanOut = okFanOut();
        app = await buildApp(svc, fanOut);

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/users/me',
            // Attacker tries to redirect the deletion at someone else's account.
            payload: { userId: ATTACKER_TARGET_ID },
        });

        expect(res.statusCode).toBe(200);
        // Own-data purge ran against the JWT userId, never the body's target.
        expect(svc.purgeOwnUserData).toHaveBeenCalledWith(USER_ID);
        expect(svc.purgeOwnUserData).not.toHaveBeenCalledWith(ATTACKER_TARGET_ID);
        // Fan-out used the JWT userId + the internal token.
        expect(fanOut).toHaveBeenCalledWith(USER_ID, INTERNAL_TOKEN);
        const fanOutArgs = (fanOut as jest.Mock).mock.calls[0];
        expect(fanOutArgs[0]).toBe(USER_ID);
        expect(fanOutArgs[0]).not.toBe(ATTACKER_TARGET_ID);
    });

    it('purges own data AND fans out to every owning service with the token', async () => {
        const svc = buildMockService();
        const fanOut = okFanOut();
        app = await buildApp(svc, fanOut);

        const res = await app.inject({ method: 'DELETE', url: '/v1/users/me' });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.status).toBe('deleted');
        // Own-data purge is reported.
        expect(svc.purgeOwnUserData).toHaveBeenCalledTimes(1);
        expect(body.ownData.userId).toBe(USER_ID);
        // Every owning service appears in the per-service summary, all ok.
        const reported = body.services.map((s: any) => s.service).sort();
        const expected = OWNING_SERVICES.map((s) => s.key).sort();
        expect(reported).toEqual(expected);
        expect(body.services.every((s: any) => s.ok)).toBe(true);
        // Best-effort event emitted.
        expect(svc.emitUserDeleted).toHaveBeenCalledWith(USER_ID);
    });

    it('RESILIENT: a downstream failure → 207 with the per-service status list', async () => {
        const svc = buildMockService();
        const fanOut = jest.fn(async () =>
            OWNING_SERVICES.map((s, i) =>
                i === 0
                    ? { service: s.key, ok: false, status: 500, error: 'HTTP 500' }
                    : { service: s.key, ok: true, status: 200 }
            )
        ) as unknown as typeof fanOutPurge;
        app = await buildApp(svc, fanOut);

        const res = await app.inject({ method: 'DELETE', url: '/v1/users/me' });

        expect(res.statusCode).toBe(207);
        const body = res.json();
        expect(body.status).toBe('partial');
        // Own data still authoritatively purged.
        expect(svc.purgeOwnUserData).toHaveBeenCalledWith(USER_ID);
        // The failing service is listed for retry.
        const failed = body.services.filter((s: any) => !s.ok);
        expect(failed).toHaveLength(1);
        expect(failed[0].service).toBe(OWNING_SERVICES[0].key);
    });

    it('IDEMPOTENT: re-deleting an already-deleted account still returns success', async () => {
        const svc = buildMockService();
        // Already deleted → own purge finds nothing (all counts 0), downstream all ok.
        svc.purgeOwnUserData.mockResolvedValueOnce({
            userId: USER_ID,
            deletedCounts: {
                coach_client_relations: 0,
                period_logs: 0,
                user_statuses: 0,
                user_preferences: 0,
                coach_profiles: 0,
                user_profiles: 0,
            },
        });
        const fanOut = okFanOut();
        app = await buildApp(svc, fanOut);

        const res = await app.inject({ method: 'DELETE', url: '/v1/users/me' });

        expect(res.statusCode).toBe(200);
        expect(res.json().status).toBe('deleted');
        expect(res.json().ownData.deletedCounts.user_profiles).toBe(0);
    });

    it('unauthenticated (token payload has no userId) → 401, nothing purged', async () => {
        const svc = buildMockService();
        const fanOut = okFanOut();
        app = await buildApp(svc, fanOut, { role: 'USER' });

        const res = await app.inject({ method: 'DELETE', url: '/v1/users/me' });

        expect(res.statusCode).toBe(401);
        expect(svc.purgeOwnUserData).not.toHaveBeenCalled();
        expect(fanOut).not.toHaveBeenCalled();
    });
});

describe('fanOutPurge / purgeOneService — inter-service client', () => {
    it('calls every owning service with DELETE + X-Internal-Token, idempotent on 2xx', async () => {
        const seen: Array<{ url: string; method?: string; token?: any }> = [];
        const fakeFetch = jest.fn(async (url: any, init: any) => {
            seen.push({
                url: String(url),
                method: init?.method,
                token: init?.headers?.['x-internal-token'],
            });
            return { ok: true, status: 200 } as any;
        }) as unknown as typeof fetch;

        const results = await fanOutPurge(USER_ID, INTERNAL_TOKEN, OWNING_SERVICES, fakeFetch);

        // One call per owning service, all reported ok.
        expect(results).toHaveLength(OWNING_SERVICES.length);
        expect(results.every((r) => r.ok)).toBe(true);
        expect(seen).toHaveLength(OWNING_SERVICES.length);
        // Every call is a DELETE carrying the internal token at the right path.
        for (const svc of OWNING_SERVICES) {
            const match = seen.find((c) => c.url.includes(svc.path(USER_ID)));
            expect(match).toBeDefined();
            expect(match!.method).toBe('DELETE');
            expect(match!.token).toBe(INTERNAL_TOKEN);
        }
    });

    it('captures (never throws) a non-2xx as a failed result for retry', async () => {
        const fakeFetch = jest.fn(async () => ({ ok: false, status: 503 } as any)) as unknown as typeof fetch;
        const result = await purgeOneService(OWNING_SERVICES[0], USER_ID, INTERNAL_TOKEN, fakeFetch);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(503);
    });

    it('captures (never throws) a network error as a failed result', async () => {
        const fakeFetch = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        const result = await purgeOneService(OWNING_SERVICES[0], USER_ID, INTERNAL_TOKEN, fakeFetch);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('ECONNREFUSED');
    });
});
