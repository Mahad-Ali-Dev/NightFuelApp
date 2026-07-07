/**
 * GDPR data-export ORCHESTRATOR — GET /v1/users/me/export (src/routes.ts +
 * src/data-export.ts).
 *
 * Locks the GDPR Art.20 portability contract:
 *   - IDENTITY: the userId comes ONLY from the verified JWT (request.user.userId).
 *     A forged param userId is IGNORED — a user can only export THEIR OWN data
 *     (no IDOR).
 *   - OWN DATA: user-service gathers its own user-owned data for the JWT userId.
 *   - FAN-OUT: every owning service's internal export endpoint is called, with
 *     the X-Internal-Token, for the JWT userId.
 *   - BUNDLE: a single { exportedAt, userId, self, services: { <svc>: <data> } }.
 *   - RESILIENCE: a per-service failure degrades that slot to { error }, not a
 *     hard failure — the rest of the bundle is still returned (always 200).
 *
 * Strategy mirrors account-deletion.test.ts: mount the REAL `userRoutes` plugin
 * against a fully-mocked UserService, a stand-in `authenticate` decorator, and an
 * INJECTED fanOutExp seam that records its args (no real HTTP). The fan-out
 * list/headers/paths are unit-tested against the real fanOutExport with a stub
 * fetch.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { userRoutes } from '../src/routes';
import {
    fanOutExport,
    exportOneService,
    EXPORT_SERVICES,
} from '../src/data-export';
import { OWNING_SERVICES } from '../src/account-deletion';

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
        purgeOwnUserData: jest.fn(),
        emitUserDeleted: jest.fn(),
        // Data-export surface: own-data gather echoes the userId it was called with.
        gatherOwnUserData: jest.fn(async (userId: string) => ({
            userId,
            profile: { userId, displayName: 'Test User' },
            preferences: { userId, primaryGoal: 'GENERAL_HEALTH' },
            status: { userId, cyclePhase: 'UNKNOWN' },
            coachProfile: null,
            coachClientRelations: [],
            periodLogs: [],
            cycleHistory: { cycles: [], averages: {} },
            cycleForecast: {},
        })),
    };
}

/** Builds the app with a stand-in authenticate + an injected fanOutExp spy. */
async function buildApp(
    svc: ReturnType<typeof buildMockService>,
    fanOutExp: typeof fanOutExport,
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
                fanOutExp,
            });
        },
        { prefix: '/v1/users' }
    );
    await app.ready();
    return app;
}

// A fanOutExp spy that reports every owning service as exported OK with stub data.
function okFanOut() {
    return jest.fn(async (userId: string, token: string) =>
        EXPORT_SERVICES.map((s) => ({ service: s.key, data: { svc: s.key, userId }, status: 200 }))
    ) as unknown as typeof fanOutExport;
}

describe('GET /v1/users/me/export — GDPR portability orchestrator (route)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('uses the JWT userId (NOT a forged param) — no IDOR', async () => {
        const svc = buildMockService();
        const fanOutExp = okFanOut();
        app = await buildApp(svc, fanOutExp);

        const res = await app.inject({
            method: 'GET',
            // Attacker appends a target userId — there is no such param; identity
            // is JWT-only, so this query string can never redirect the export.
            url: `/v1/users/me/export?userId=${ATTACKER_TARGET_ID}`,
        });

        expect(res.statusCode).toBe(200);
        // Own-data gather ran against the JWT userId, never the attacker's target.
        expect(svc.gatherOwnUserData).toHaveBeenCalledWith(USER_ID);
        expect(svc.gatherOwnUserData).not.toHaveBeenCalledWith(ATTACKER_TARGET_ID);
        // Fan-out used the JWT userId + the internal token.
        expect(fanOutExp).toHaveBeenCalledWith(USER_ID, INTERNAL_TOKEN);
        const fanOutArgs = (fanOutExp as jest.Mock).mock.calls[0];
        expect(fanOutArgs[0]).toBe(USER_ID);
        expect(fanOutArgs[0]).not.toBe(ATTACKER_TARGET_ID);
        // The bundle's userId is the JWT userId.
        expect(res.json().userId).toBe(USER_ID);
    });

    it('gathers own data AND fans out to every owning service, assembling the bundle', async () => {
        const svc = buildMockService();
        const fanOutExp = okFanOut();
        app = await buildApp(svc, fanOutExp);

        const res = await app.inject({ method: 'GET', url: '/v1/users/me/export' });

        expect(res.statusCode).toBe(200);
        const body = res.json();

        // Bundle shape: exportedAt, userId, self, services map.
        expect(typeof body.exportedAt).toBe('string');
        expect(body.userId).toBe(USER_ID);
        expect(svc.gatherOwnUserData).toHaveBeenCalledTimes(1);
        expect(body.self.userId).toBe(USER_ID);
        expect(body.self.profile.displayName).toBe('Test User');

        // Every owning service appears as a slot in services, all with data.
        const reported = Object.keys(body.services).sort();
        const expected = OWNING_SERVICES.map((s) => s.key).sort();
        expect(reported).toEqual(expected);
        for (const key of expected) {
            expect(body.services[key]).toEqual({ svc: key, userId: USER_ID });
            // No degraded { error } slot.
            expect(body.services[key].error).toBeUndefined();
        }
    });

    it('RESILIENT: a per-service failure degrades that slot to { error }, still 200', async () => {
        const svc = buildMockService();
        const fanOutExp = jest.fn(async () =>
            EXPORT_SERVICES.map((s, i) =>
                i === 0
                    ? { service: s.key, error: 'HTTP 500', status: 500 }
                    : { service: s.key, data: { svc: s.key }, status: 200 }
            )
        ) as unknown as typeof fanOutExport;
        app = await buildApp(svc, fanOutExp);

        const res = await app.inject({ method: 'GET', url: '/v1/users/me/export' });

        // Not a hard failure — best-effort completeness.
        expect(res.statusCode).toBe(200);
        const body = res.json();
        // Own data still gathered.
        expect(svc.gatherOwnUserData).toHaveBeenCalledWith(USER_ID);
        // The failing service's slot is { error }; the rest carry data.
        const failedKey = OWNING_SERVICES[0].key;
        expect(body.services[failedKey]).toEqual({ error: 'HTTP 500' });
        for (const s of OWNING_SERVICES.slice(1)) {
            expect(body.services[s.key]).toEqual({ svc: s.key });
        }
        // Every owning service still has a slot (no service silently dropped).
        expect(Object.keys(body.services).sort()).toEqual(OWNING_SERVICES.map((s) => s.key).sort());
    });

    it('unauthenticated (token payload has no userId) → 401, nothing gathered', async () => {
        const svc = buildMockService();
        const fanOutExp = okFanOut();
        app = await buildApp(svc, fanOutExp, { role: 'USER' });

        const res = await app.inject({ method: 'GET', url: '/v1/users/me/export' });

        expect(res.statusCode).toBe(401);
        expect(svc.gatherOwnUserData).not.toHaveBeenCalled();
        expect(fanOutExp).not.toHaveBeenCalled();
    });
});

describe('fanOutExport / exportOneService — inter-service client', () => {
    it('covers the SAME owning-service set as deletion, GET to the /export path', () => {
        // Export fan-out must never drift from the deletion fan-out's service set.
        expect(EXPORT_SERVICES.map((s) => s.key).sort()).toEqual(
            OWNING_SERVICES.map((s) => s.key).sort()
        );
        // Each export path is the purge path + '/export'.
        for (const purge of OWNING_SERVICES) {
            const exp = EXPORT_SERVICES.find((e) => e.key === purge.key)!;
            expect(exp.path(USER_ID)).toBe(`${purge.path(USER_ID)}/export`);
        }
    });

    it('calls every owning service with GET + X-Internal-Token, returns parsed data', async () => {
        const seen: Array<{ url: string; method?: string; token?: any }> = [];
        const fakeFetch = jest.fn(async (url: any, init: any) => {
            seen.push({
                url: String(url),
                method: init?.method,
                token: init?.headers?.['x-internal-token'],
            });
            return { ok: true, status: 200, json: async () => ({ url: String(url) }) } as any;
        }) as unknown as typeof fetch;

        const results = await fanOutExport(USER_ID, INTERNAL_TOKEN, EXPORT_SERVICES, fakeFetch);

        // One call per owning service, every one returned data (no error).
        expect(results).toHaveLength(EXPORT_SERVICES.length);
        expect(results.every((r) => r.error === undefined && r.data !== undefined)).toBe(true);
        expect(seen).toHaveLength(EXPORT_SERVICES.length);
        // Every call is a GET carrying the internal token at the right /export path.
        for (const svc of EXPORT_SERVICES) {
            const match = seen.find((c) => c.url.includes(svc.path(USER_ID)));
            expect(match).toBeDefined();
            expect(match!.method).toBe('GET');
            expect(match!.token).toBe(INTERNAL_TOKEN);
            expect(match!.url).toContain('/export');
        }
    });

    it('captures (never throws) a non-2xx as an { error } slot for that service', async () => {
        const fakeFetch = jest.fn(async () => ({ ok: false, status: 503 } as any)) as unknown as typeof fetch;
        const result = await exportOneService(EXPORT_SERVICES[0], USER_ID, INTERNAL_TOKEN, fakeFetch);
        expect(result.data).toBeUndefined();
        expect(result.error).toBe('HTTP 503');
        expect(result.status).toBe(503);
    });

    it('captures (never throws) a network error as an { error } slot', async () => {
        const fakeFetch = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        const result = await exportOneService(EXPORT_SERVICES[0], USER_ID, INTERNAL_TOKEN, fakeFetch);
        expect(result.data).toBeUndefined();
        expect(result.error).toContain('ECONNREFUSED');
    });
});
