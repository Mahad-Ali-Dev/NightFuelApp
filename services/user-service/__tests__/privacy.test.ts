/**
 * Public/private accounts — user-service privacy surface (src/routes.ts +
 * src/user.service.ts). Locks the social public/private contract that
 * community-service & chat-service consume:
 *
 *   PATCH /v1/users/me           { isPrivate? }  -> persists + returns the row
 *   GET   /v1/users/public/:id                   -> adds isPrivate alongside
 *                                                   id/displayName/avatarUrl/timezone
 *
 * Strategy mirrors error-redaction.test.ts: mount the REAL `userRoutes` plugin
 * against a fully-mocked UserService (no DB/Redis), with a stand-in
 * `authenticate` decorator. The unauthenticated assertions exercise the route's
 * own `extractUserId` → canonical `sendUnauthorizedPayload` 401 path by attaching
 * a token whose payload carries no `userId`/`id` (the exact branch the brief
 * references), and the byte-for-byte body is imported from @nightfuel/config so
 * a drift in the shared contract fails here.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { UNAUTHORIZED_PAYLOAD_BODY } from '@nightfuel/config';
import { userRoutes } from '../src/routes';

const USER_ID = '44444444-4444-4444-4444-444444444444';

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
    };
}

/**
 * Builds the app with a stand-in `authenticate` decorator.
 *
 * @param payload  what the decorator attaches as request.user. Pass a value
 *                 WITHOUT userId/id to drive extractUserId into the canonical
 *                 sendUnauthorizedPayload 401 branch.
 */
async function buildApp(
    svc: ReturnType<typeof buildMockService>,
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
            await userRoutes(instance, { userService: svc as any });
        },
        { prefix: '/v1/users' }
    );
    await app.ready();
    return app;
}

describe('PATCH /v1/users/me — privacy toggle', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('persists isPrivate:true and returns the updated profile value', async () => {
        svc = buildMockService();
        const updated = {
            id: 'profile-1',
            userId: USER_ID,
            displayName: 'Nyx',
            avatarUrl: null,
            timezone: 'UTC',
            isPrivate: true,
        };
        svc.updatePrivacy.mockResolvedValueOnce(updated as any);
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/users/me',
            payload: { isPrivate: true },
        });

        expect(res.statusCode).toBe(200);
        // Persisted via the service with the authenticated userId + the body.
        expect(svc.updatePrivacy).toHaveBeenCalledWith(USER_ID, { isPrivate: true });
        // The updated value is echoed back to the caller.
        expect(res.json()).toMatchObject({ userId: USER_ID, isPrivate: true });
    });

    it('persists isPrivate:false (un-privating) and returns it', async () => {
        svc = buildMockService();
        svc.updatePrivacy.mockResolvedValueOnce({ userId: USER_ID, isPrivate: false } as any);
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/users/me',
            payload: { isPrivate: false },
        });

        expect(res.statusCode).toBe(200);
        expect(svc.updatePrivacy).toHaveBeenCalledWith(USER_ID, { isPrivate: false });
        expect(res.json().isPrivate).toBe(false);
    });

    it('rejects a non-boolean isPrivate with a 400 validation error', async () => {
        svc = buildMockService();
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/users/me',
            payload: { isPrivate: 'yes' },
        });

        expect(res.statusCode).toBe(400);
        // Schema rejected it before the service was ever consulted.
        expect(svc.updatePrivacy).not.toHaveBeenCalled();
    });

    it('maps a service "Profile not found" throw to the fixed 404 literal (no leak)', async () => {
        svc = buildMockService();
        // The service translates Prisma P2025 → the canonical 'Profile not found'
        // string; the route must answer with the FIXED literal and never echo
        // err.message.
        svc.updatePrivacy.mockRejectedValueOnce(new Error('Profile not found'));
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/users/me',
            payload: { isPrivate: true },
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Profile not found' });
    });

    it('unauthenticated (token payload has no userId) → canonical sendUnauthorizedPayload 401', async () => {
        svc = buildMockService();
        // Decoded token verified but structurally unusable — extractUserId must
        // short-circuit with the canonical payload-invalid 401 and never touch
        // the service.
        app = await buildApp(svc, { role: 'USER' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/users/me',
            payload: { isPrivate: true },
        });

        expect(res.statusCode).toBe(401);
        // Byte-for-byte the shared canonical body.
        expect(res.json()).toEqual(UNAUTHORIZED_PAYLOAD_BODY);
        expect(svc.updatePrivacy).not.toHaveBeenCalled();
    });
});

describe('GET /v1/users/public/:userId — additive isPrivate field', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('returns isPrivate PLUS the pre-existing id/displayName/avatarUrl/timezone', async () => {
        svc = buildMockService();
        svc.getProfileWithPreferences.mockResolvedValueOnce({
            id: 'profile-row-id',
            userId: USER_ID,
            displayName: 'Aurora',
            avatarUrl: 'https://cdn.example/a.png',
            timezone: 'America/New_York',
            isPrivate: true,
            // extra sensitive fields that must NOT be exposed
            heightCm: 180,
            weightKg: 75,
        } as any);
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/users/public/${USER_ID}`,
        });

        expect(res.statusCode).toBe(200);
        // Exact public shape: the four pre-existing fields are unchanged AND
        // isPrivate is now present — nothing else leaks.
        expect(res.json()).toEqual({
            id: USER_ID,
            displayName: 'Aurora',
            avatarUrl: 'https://cdn.example/a.png',
            timezone: 'America/New_York',
            isPrivate: true,
        });
        // Sensitive profile fields stay stripped.
        expect(res.body).not.toContain('heightCm');
        expect(res.body).not.toContain('weightKg');
    });

    it('defaults isPrivate:false through for a public account', async () => {
        svc = buildMockService();
        svc.getProfileWithPreferences.mockResolvedValueOnce({
            id: 'profile-row-id',
            userId: USER_ID,
            displayName: 'Public Pete',
            avatarUrl: null,
            timezone: 'UTC',
            isPrivate: false,
        } as any);
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/users/public/${USER_ID}`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().isPrivate).toBe(false);
        expect(res.json().id).toBe(USER_ID);
    });

    it('404s when the profile does not exist', async () => {
        svc = buildMockService();
        svc.getProfileWithPreferences.mockResolvedValueOnce(null);
        app = await buildApp(svc);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/users/public/${USER_ID}`,
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Profile not found' });
    });
});
