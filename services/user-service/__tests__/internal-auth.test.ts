/**
 * user-service /v1/users/internal/* in-service token guard (F34 #5).
 *
 * These PII routes (profile / preferences / status / all) are reached
 * server-to-server by chat / plan / progress. Before F34 the ONLY thing
 * protecting them was the nginx edge 404 — bypassable once an app port was
 * reachable on the host. makeInternalAuthGuard adds an in-service check:
 *
 *   - NO / WRONG X-Internal-Token  -> 404 (route hidden; service NOT reached).
 *   - CORRECT X-Internal-Token     -> reaches the handler.
 *
 * The REAL `userRoutes` plugin is mounted against a fully-mocked UserService
 * (no DB/Redis), wired with the production `internalServiceToken`. Mirrors the
 * harness in privacy.test.ts / error-redaction.test.ts.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { userRoutes } from '../src/routes';

const USER_ID = '44444444-4444-4444-4444-444444444444';
const INTERNAL_TOKEN = 'user-internal-token-value';

function buildMockService() {
    return {
        getProfileWithPreferences: jest.fn(async () => ({ id: USER_ID, displayName: 'A' })),
        getStatus: jest.fn(async () => ({ status: 'active' })),
        getPreferences: jest.fn(async () => ({ targetCalories: 2000 })),
        getAllUsersInternal: jest.fn(async () => [{ userId: USER_ID, timezone: 'UTC' }]),
        // Methods present so userRoutes registers without error.
        updateProfile: jest.fn(),
        updatePrivacy: jest.fn(),
        updatePreferences: jest.fn(),
        updateOnboarding: jest.fn(),
        getStudents: jest.fn(),
        assignProtocol: jest.fn(),
        getAdminStats: jest.fn(),
        getAdminUsers: jest.fn(),
        toggleBanUser: jest.fn(),
    };
}

async function buildApp(svc: ReturnType<typeof buildMockService>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    // Internal routes carry no `authenticate` onRequest, but the decorator must
    // exist for the other (user-facing) routes the plugin registers.
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: USER_ID, role: 'USER' };
    });
    await app.register(
        async (instance) => {
            await userRoutes(instance, { userService: svc as any, internalServiceToken: INTERNAL_TOKEN });
        },
        { prefix: '/v1/users' }
    );
    await app.ready();
    return app;
}

const INTERNAL_ROUTES: Array<{ name: string; url: string; serviceMethod: keyof ReturnType<typeof buildMockService> }> = [
    { name: 'profile', url: `/v1/users/internal/profile/${USER_ID}`, serviceMethod: 'getProfileWithPreferences' },
    { name: 'preferences', url: `/v1/users/internal/preferences/${USER_ID}`, serviceMethod: 'getPreferences' },
    { name: 'status', url: `/v1/users/internal/status/${USER_ID}`, serviceMethod: 'getStatus' },
    { name: 'all', url: '/v1/users/internal/all', serviceMethod: 'getAllUsersInternal' },
];

describe('user-service /v1/users/internal/* — internal-token guard', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    for (const route of INTERNAL_ROUTES) {
        it(`${route.name}: 404s without an X-Internal-Token (service never reached)`, async () => {
            const res = await app.inject({ method: 'GET', url: route.url });
            expect(res.statusCode).toBe(404);
            expect(svc[route.serviceMethod]).not.toHaveBeenCalled();
        });

        it(`${route.name}: 404s with a wrong X-Internal-Token (service never reached)`, async () => {
            const res = await app.inject({
                method: 'GET',
                url: route.url,
                headers: { 'x-internal-token': 'wrong-token' },
            });
            expect(res.statusCode).toBe(404);
            expect(svc[route.serviceMethod]).not.toHaveBeenCalled();
        });

        it(`${route.name}: reaches the handler (200) with the correct X-Internal-Token`, async () => {
            const res = await app.inject({
                method: 'GET',
                url: route.url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });
            expect(res.statusCode).toBe(200);
            expect(svc[route.serviceMethod]).toHaveBeenCalledTimes(1);
        });
    }
});
