/**
 * Input-bounds suite — user-service write surface (src/schemas.ts mounted via
 * the zod type-provider in src/routes.ts). Locks the profile / preferences /
 * onboarding validation bounds at the HTTP edge so a loosened (or removed)
 * `min`/`max`/`positive`/`enum`/`regex` constraint fails here before it can
 * reach the database.
 *
 * Background: user-service previously had only error-redaction + privacy
 * coverage; the write bounds in src/schemas.ts (displayName 2..64, heightCm
 * positive..300, weightKg positive..600, region enum, targetCalories
 * positive..10000, allergies/healthConditions array max(20) with item
 * min(1)..max(64), workoutDurationPreference int 10..180, the goal/diet/split
 * enums, and onboarding step int 0..20) were entirely unguarded by tests. P1
 * security item: any future PR that widens one of those caps would ship GREEN.
 *
 * Strategy mirrors error-redaction.test.ts / privacy.test.ts exactly:
 *   - Mount the REAL `userRoutes` plugin (so the genuine schemas wire through
 *     the real fastify-type-provider-zod validator) against a fully-mocked
 *     UserService — NO DB / Redis is touched.
 *   - Install the shared zod validator/serializer compilers and a stand-in
 *     `authenticate` decorator that attaches a usable `request.user.userId`
 *     so each handler proceeds past `extractUserId` to (at most) the service.
 *
 * What the assertions prove:
 *   1. Out-of-bounds bodies → 400 AND the mocked service method is NEVER called
 *      (the zod type-provider rejects before the handler body runs — same
 *      pattern proven by privacy.test.ts' non-boolean isPrivate case).
 *   2. Inclusive boundary values (heightCm=300, weightKg=600, displayName len
 *      2 & 64, step 0 & 20, allergies length exactly 20) → NOT 400 and the
 *      service method is called exactly once.
 *   3. An unexpected service throw on PUT /me (e.g. a Prisma connect failure)
 *      resolves to the route's FIXED in-route fallback `{ error: 'Internal
 *      server error' }` (src/routes.ts) and never echoes any raw err.message
 *      fragment. (PUT /me carries its own try/catch fallback — it does not
 *      depend on the shared registerFastifyErrorHandler, so none is wired here,
 *      matching how the in-route 404 block of error-redaction.test.ts mounts
 *      the routes.)
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { userRoutes } from '../src/routes';

const USER_ID = '55555555-5555-5555-5555-555555555555';

// Full mocked UserService surface — every method the real userRoutes touches is
// a jest.fn() so nothing reaches a DB/Redis layer. Mirrors the factory used by
// error-redaction.test.ts / privacy.test.ts.
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

async function buildApp(
    svc: ReturnType<typeof buildMockService>
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // The zod type-provider compilers are what make `schema.body = <zodSchema>`
    // actually validate — without them the bounds would be silently ignored.
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    // Stand-in for the real `authenticate` decorator: attach a usable user so
    // extractUserId() succeeds and the handler proceeds to (at most) the
    // service. Identical to the other suites in this folder.
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: USER_ID, role: 'USER' };
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

// ── PUT /v1/users/me — profile bounds ──────────────────────────────────────────
describe('PUT /v1/users/me — profile input bounds', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    async function put(payload: any) {
        return app.inject({ method: 'PUT', url: '/v1/users/me', payload });
    }

    // Out-of-bounds → 400, service NEVER called.
    it('rejects heightCm=301 (> max 300) with 400 and never calls the service', async () => {
        const res = await put({ heightCm: 301 });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it('rejects weightKg=601 (> max 600) with 400 and never calls the service', async () => {
        const res = await put({ weightKg: 601 });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it('rejects heightCm=0 (non-positive) with 400 and never calls the service', async () => {
        const res = await put({ heightCm: 0 });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it('rejects displayName length 1 (< min 2) with 400 and never calls the service', async () => {
        const res = await put({ displayName: 'a' });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it('rejects displayName length 65 (> max 64) with 400 and never calls the service', async () => {
        const res = await put({ displayName: 'a'.repeat(65) });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it("rejects avatarUrl 'not-a-url' (invalid url) with 400 and never calls the service", async () => {
        const res = await put({ avatarUrl: 'not-a-url' });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it("rejects dateOfBirth '06-2026' (fails YYYY-MM-DD regex) with 400 and never calls the service", async () => {
        const res = await put({ dateOfBirth: '06-2026' });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    it("rejects region 'gb' (outside us/eu/ap enum) with 400 and never calls the service", async () => {
        const res = await put({ region: 'gb' });
        expect(res.statusCode).toBe(400);
        expect(svc.updateProfile).not.toHaveBeenCalled();
    });

    // Inclusive happy paths → NOT 400, service called exactly once with the body.
    it('accepts heightCm=300 (inclusive max): not 400, service called once', async () => {
        svc.updateProfile.mockResolvedValueOnce({ userId: USER_ID, heightCm: 300 } as any);
        const res = await put({ heightCm: 300 });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updateProfile).toHaveBeenCalledTimes(1);
        expect(svc.updateProfile).toHaveBeenCalledWith(USER_ID, { heightCm: 300 });
    });

    it('accepts weightKg=600 (inclusive max): not 400, service called once', async () => {
        svc.updateProfile.mockResolvedValueOnce({ userId: USER_ID, weightKg: 600 } as any);
        const res = await put({ weightKg: 600 });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updateProfile).toHaveBeenCalledTimes(1);
        expect(svc.updateProfile).toHaveBeenCalledWith(USER_ID, { weightKg: 600 });
    });

    it('accepts displayName length 2 (inclusive min): not 400, service called once', async () => {
        svc.updateProfile.mockResolvedValueOnce({ userId: USER_ID } as any);
        const res = await put({ displayName: 'ab' });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updateProfile).toHaveBeenCalledTimes(1);
        expect(svc.updateProfile).toHaveBeenCalledWith(USER_ID, { displayName: 'ab' });
    });

    it('accepts displayName length 64 (inclusive max): not 400, service called once', async () => {
        const name = 'a'.repeat(64);
        svc.updateProfile.mockResolvedValueOnce({ userId: USER_ID } as any);
        const res = await put({ displayName: name });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updateProfile).toHaveBeenCalledTimes(1);
        expect(svc.updateProfile).toHaveBeenCalledWith(USER_ID, { displayName: name });
    });

    // Redaction: an unexpected (non-"Profile not found") throw must resolve to
    // the route's FIXED in-route fallback and never echo raw err.message.
    it('maps an unexpected service throw to the fixed "Internal server error" fallback (no raw fragments)', async () => {
        const LEAKY = 'Prisma connect ECONNREFUSED 5432 at /srv/app localhost:5432';
        svc.updateProfile.mockRejectedValueOnce(new Error(LEAKY));

        const res = await put({ displayName: 'Valid Name' });

        // The route catch falls through the 'Profile not found' branch and
        // returns its fixed 500 literal.
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({ error: 'Internal server error' });
        // None of the raw thrown fragments may reach the wire.
        expect(res.body).not.toContain(LEAKY);
        expect(res.body).not.toContain('Prisma');
        expect(res.body).not.toContain('ECONNREFUSED');
        expect(res.body).not.toContain('5432');
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('at /');
    });
});

// ── PUT /v1/users/me/preferences — preferences bounds ───────────────────────────
describe('PUT /v1/users/me/preferences — preferences input bounds', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    async function put(payload: any) {
        return app.inject({ method: 'PUT', url: '/v1/users/me/preferences', payload });
    }

    // Out-of-bounds → 400, service NEVER called.
    it('rejects targetCalories=10001 (> max 10000) with 400 and never calls the service', async () => {
        const res = await put({ targetCalories: 10001 });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it('rejects targetCalories=0 (non-positive) with 400 and never calls the service', async () => {
        const res = await put({ targetCalories: 0 });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it('rejects an allergies array of length 21 (> max 20) with 400 and never calls the service', async () => {
        const res = await put({ allergies: Array.from({ length: 21 }, (_, i) => `a${i}`) });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it('rejects an allergies item of 65 chars (> item max 64) with 400 and never calls the service', async () => {
        const res = await put({ allergies: ['peanut', 'x'.repeat(65)] });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it('rejects workoutDurationPreference=9 (< min 10) with 400 and never calls the service', async () => {
        const res = await put({ workoutDurationPreference: 9 });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it('rejects workoutDurationPreference=181 (> max 180) with 400 and never calls the service', async () => {
        const res = await put({ workoutDurationPreference: 181 });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it("rejects primaryGoal 'FAME' (outside enum) with 400 and never calls the service", async () => {
        const res = await put({ primaryGoal: 'FAME' });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    it("rejects dietMode 'XX' (outside enum) with 400 and never calls the service", async () => {
        const res = await put({ dietMode: 'XX' });
        expect(res.statusCode).toBe(400);
        expect(svc.updatePreferences).not.toHaveBeenCalled();
    });

    // Inclusive happy path → NOT 400, service called exactly once.
    it('accepts an allergies array of length exactly 20 (items <= 64 chars): not 400, service called once', async () => {
        const allergies = Array.from({ length: 20 }, (_, i) => `allergen-${i}`);
        svc.updatePreferences.mockResolvedValueOnce({ userId: USER_ID, allergies } as any);
        const res = await put({ allergies });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updatePreferences).toHaveBeenCalledTimes(1);
        expect(svc.updatePreferences).toHaveBeenCalledWith(USER_ID, { allergies });
    });

    it('accepts workoutDurationPreference=10 and =180 (inclusive bounds): not 400, service called', async () => {
        svc.updatePreferences.mockResolvedValue({ userId: USER_ID } as any);

        const low = await put({ workoutDurationPreference: 10 });
        expect(low.statusCode).not.toBe(400);

        const high = await put({ workoutDurationPreference: 180 });
        expect(high.statusCode).not.toBe(400);

        expect(svc.updatePreferences).toHaveBeenNthCalledWith(1, USER_ID, { workoutDurationPreference: 10 });
        expect(svc.updatePreferences).toHaveBeenNthCalledWith(2, USER_ID, { workoutDurationPreference: 180 });
    });

    it('accepts targetCalories=10000 (inclusive max): not 400, service called once', async () => {
        svc.updatePreferences.mockResolvedValueOnce({ userId: USER_ID, targetCalories: 10000 } as any);
        const res = await put({ targetCalories: 10000 });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updatePreferences).toHaveBeenCalledTimes(1);
        expect(svc.updatePreferences).toHaveBeenCalledWith(USER_ID, { targetCalories: 10000 });
    });
});

// ── PUT /v1/users/me/onboarding — onboarding step bounds ────────────────────────
describe('PUT /v1/users/me/onboarding — onboarding step bounds', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    async function put(payload: any) {
        return app.inject({ method: 'PUT', url: '/v1/users/me/onboarding', payload });
    }

    // Out-of-bounds → 400, service NEVER called. (Schema requires both step +
    // completed; we always send completed so only the step bound is exercised.)
    it('rejects step=21 (> max 20) with 400 and never calls the service', async () => {
        const res = await put({ step: 21, completed: false });
        expect(res.statusCode).toBe(400);
        expect(svc.updateOnboarding).not.toHaveBeenCalled();
    });

    it('rejects step=-1 (< min 0) with 400 and never calls the service', async () => {
        const res = await put({ step: -1, completed: false });
        expect(res.statusCode).toBe(400);
        expect(svc.updateOnboarding).not.toHaveBeenCalled();
    });

    // Inclusive happy paths → NOT 400, service called exactly once.
    it('accepts step=0 (inclusive min): not 400, service called once', async () => {
        svc.updateOnboarding.mockResolvedValueOnce({ userId: USER_ID, onboardingStep: 0 } as any);
        const res = await put({ step: 0, completed: false });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updateOnboarding).toHaveBeenCalledTimes(1);
        expect(svc.updateOnboarding).toHaveBeenCalledWith(USER_ID, { step: 0, completed: false });
    });

    it('accepts step=20 (inclusive max): not 400, service called once', async () => {
        svc.updateOnboarding.mockResolvedValueOnce({ userId: USER_ID, onboardingStep: 20 } as any);
        const res = await put({ step: 20, completed: true });
        expect(res.statusCode).not.toBe(400);
        expect(svc.updateOnboarding).toHaveBeenCalledTimes(1);
        expect(svc.updateOnboarding).toHaveBeenCalledWith(USER_ID, { step: 20, completed: true });
    });
});
