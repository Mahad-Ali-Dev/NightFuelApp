/**
 * user-service perf cluster — route contracts.
 *
 * Covers:
 *   HIGH  #4  POST /v1/users/public/batch — PUBLIC (authenticate, NOT internal-
 *             token guarded), bounded to 100 ids, returns { users: PublicProfile[] }
 *             with the SAME public shape as GET /public/:userId.
 *   HIGH  #3  GET  /v1/users/internal/all — cursor-paginated: accepts ?cursor=&limit=
 *             and returns { users, nextCursor }; still internal-token guarded.
 *
 * Mounts the REAL `userRoutes` plugin against a fully-mocked UserService, with a
 * stand-in `authenticate` decorator (mirrors privacy.test.ts / internal-auth.test.ts).
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { userRoutes } from '../src/routes';

const USER_ID = '66666666-6666-4666-8666-666666666666';
const INTERNAL_TOKEN = 'user-internal-token-value';

function buildMockService() {
    return {
        getProfileWithPreferences: jest.fn(),
        getPublicProfile: jest.fn(),
        getPublicProfilesBatch: jest.fn(),
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
    };
}

async function buildApp(svc: ReturnType<typeof buildMockService>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
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

describe('POST /v1/users/public/batch — HIGH #4 batch public profiles', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });
    afterEach(async () => {
        if (app) await app.close();
    });

    it('resolves a list of ids in ONE call and returns { users: PublicProfile[] }', async () => {
        const profiles = [
            { id: 'a', displayName: 'Ann', avatarUrl: 'https://x/a.png', timezone: 'UTC', isPrivate: false },
            { id: 'b', displayName: 'Bob', avatarUrl: null, timezone: 'America/New_York', isPrivate: true },
        ];
        svc.getPublicProfilesBatch.mockResolvedValueOnce(profiles);

        const res = await app.inject({
            method: 'POST',
            url: '/v1/users/public/batch',
            payload: { ids: ['a', 'b'] },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ users: profiles });
        // ONE service call resolves the whole batch.
        expect(svc.getPublicProfilesBatch).toHaveBeenCalledTimes(1);
        expect(svc.getPublicProfilesBatch).toHaveBeenCalledWith(['a', 'b']);
    });

    it('returns the SAME public shape as GET /public/:userId (no sensitive fields)', async () => {
        svc.getPublicProfilesBatch.mockResolvedValueOnce([
            { id: 'a', displayName: 'Ann', avatarUrl: null, timezone: 'UTC', isPrivate: false },
        ]);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/users/public/batch',
            payload: { ids: ['a'] },
        });
        expect(res.statusCode).toBe(200);
        const user = res.json().users[0];
        expect(Object.keys(user).sort()).toEqual(
            ['avatarUrl', 'displayName', 'id', 'isPrivate', 'timezone'].sort()
        );
        expect(res.body).not.toContain('heightCm');
        expect(res.body).not.toContain('weightKg');
    });

    it('is a PUBLIC route — reachable WITHOUT an X-Internal-Token', async () => {
        svc.getPublicProfilesBatch.mockResolvedValueOnce([]);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/users/public/batch',
            payload: { ids: ['z'] },
        });
        // Not 404 (would be the internal-token-guard hide) — the handler runs.
        expect(res.statusCode).toBe(200);
        expect(svc.getPublicProfilesBatch).toHaveBeenCalled();
    });

    it('rejects an empty ids array with 400 (min 1)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/users/public/batch',
            payload: { ids: [] },
        });
        expect(res.statusCode).toBe(400);
        expect(svc.getPublicProfilesBatch).not.toHaveBeenCalled();
    });

    it('rejects more than 100 ids with 400 (bounded batch)', async () => {
        const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/users/public/batch',
            payload: { ids },
        });
        expect(res.statusCode).toBe(400);
        expect(svc.getPublicProfilesBatch).not.toHaveBeenCalled();
    });

    it('accepts exactly 100 ids (the bound is inclusive)', async () => {
        const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
        svc.getPublicProfilesBatch.mockResolvedValueOnce([]);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/users/public/batch',
            payload: { ids },
        });
        expect(res.statusCode).toBe(200);
        expect(svc.getPublicProfilesBatch).toHaveBeenCalledWith(ids);
    });
});

describe('GET /v1/users/internal/all — HIGH #3 cursor pagination', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });
    afterEach(async () => {
        if (app) await app.close();
    });

    it('returns { users, nextCursor } and passes cursor/limit through to the service', async () => {
        svc.getAllUsersInternal.mockResolvedValueOnce({
            users: [{ userId: 'u1', timezone: 'UTC' }],
            nextCursor: 'u1',
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/users/internal/all?cursor=u0&limit=1',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ users: [{ userId: 'u1', timezone: 'UTC' }], nextCursor: 'u1' });
        expect(svc.getAllUsersInternal).toHaveBeenCalledWith({ cursor: 'u0', limit: 1 });
    });

    it('first page: no cursor required', async () => {
        svc.getAllUsersInternal.mockResolvedValueOnce({ users: [], nextCursor: null });
        const res = await app.inject({
            method: 'GET',
            url: '/v1/users/internal/all',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ users: [], nextCursor: null });
        expect(svc.getAllUsersInternal).toHaveBeenCalledWith({ cursor: undefined, limit: undefined });
    });

    it('still 404s without the internal token (guard intact)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/users/internal/all' });
        expect(res.statusCode).toBe(404);
        expect(svc.getAllUsersInternal).not.toHaveBeenCalled();
    });
});
