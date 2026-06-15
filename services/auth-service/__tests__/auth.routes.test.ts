/**
 * Regression suite — auth-service register/login/forgot-password 4xx error
 * NORMALIZATION (src/routes.ts:14-23).
 *
 * Background: the credential endpoints catch whatever AuthService throws and run
 * it through an ALLOWED allowlist + `safeMsg` helper. Only the small set of
 * known, user-facing strings ('User already exists', 'Invalid credentials',
 * 'Account temporarily locked', ...) is ever reflected verbatim to the client;
 * ANY other error (Prisma/DB/network/unexpected) is replaced with a per-route
 * generic fallback so internal details can never leak. forgot-password returns
 * the same generic 200 body whether the account exists or not (no enumeration).
 *
 * These tests lock that behaviour in permanently: if anyone widens the surface
 * (e.g. reflects `err.message` directly) or narrows the allowlist (dropping a
 * legitimate user-facing string), this file goes red.
 *
 * The app under test is the genuine `authRoutes` plugin imported from `../src`,
 * registered on a fresh Fastify instance wired exactly like `src/index.ts`
 * (fastify-type-provider-zod compilers, mounted under the `/v1/auth` prefix) so
 * the route schemas validate. AuthService is fully mocked: every method is a
 * jest.fn(), so each error branch is driven deterministically and no
 * DB/Redis/network is touched. @fastify/rate-limit is intentionally NOT
 * registered here so the 7/min limiter cannot interfere with the allowlist
 * assertions (every test issues only a handful of requests anyway).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from '../src/routes';

// The exact generic forgot-password message — identical on the happy path and
// on internal failure, so the body is byte-for-byte the same either way.
const GENERIC_FORGOT_MESSAGE = 'If an account exists, a reset link has been sent';

// Every method the routes plugin may call on AuthService. Each is a jest.fn()
// whose behaviour we configure per-test (resolve/reject) to drive each branch.
function buildMockAuthService() {
    return {
        register: jest.fn(),
        login: jest.fn(),
        refreshToken: jest.fn(),
        forgotPassword: jest.fn(),
        resetPassword: jest.fn(),
        // logout / getUserProfile are only reachable behind the `authenticate`
        // decorator (not exercised here) but are included so the mock is a
        // faithful stand-in for the real service shape.
        logout: jest.fn(),
        getUserProfile: jest.fn(),
    };
}

type MockAuthService = ReturnType<typeof buildMockAuthService>;

// Valid request bodies that PASS each route's zod schema, so a request reaches
// the handler (and thus the mocked service) instead of being rejected at
// validation — which would never exercise the catch/normalization branch.
const VALID_REGISTER_BODY = {
    email: 'new.user@example.com',
    password: 'Str0ngPass',
    displayName: 'New User',
    region: 'us',
    role: 'USER',
};
const VALID_LOGIN_BODY = {
    email: 'user@example.com',
    password: 'whatever-they-typed',
};
const VALID_FORGOT_BODY = { email: 'user@example.com' };

// Captured route options keyed by `METHOD url` — populated via an onRoute hook so
// we can assert the credential endpoints carry the tight authRateLimit config.
type CapturedRoute = { method: string | string[]; url: string; config?: any };

async function buildApp(
    svc: MockAuthService
): Promise<{ app: FastifyInstance; routes: CapturedRoute[] }> {
    const app = Fastify({ logger: false });
    // Same compilers as src/index.ts so the route zod schemas validate identically.
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // The plugin's logout/me route options reference `(fastify as any).authenticate`.
    // Provide a no-op so registration succeeds; those routes are not tested here.
    app.decorate('authenticate', async () => {
        /* no-op: not exercised by these tests */
    });

    const routes: CapturedRoute[] = [];
    app.addHook('onRoute', (routeOptions) => {
        routes.push({
            method: routeOptions.method,
            url: routeOptions.url,
            config: routeOptions.config,
        });
    });

    // Register exactly as src/index.ts does: under the /v1/auth prefix, passing
    // the (mocked) AuthService as the plugin option. NOTE: @fastify/rate-limit is
    // deliberately NOT registered, so the per-route limiter is inert here.
    await app.register(
        async (instance) => {
            await authRoutes(instance, { authService: svc as any });
        },
        { prefix: '/v1/auth' }
    );

    await app.ready();
    return { app, routes };
}

describe('auth-service credential routes — 4xx error normalization', () => {
    let app: FastifyInstance;
    let routes: CapturedRoute[];
    let svc: MockAuthService;

    beforeEach(async () => {
        svc = buildMockAuthService();
        ({ app, routes } = await buildApp(svc));
    });

    afterEach(async () => {
        await app.close();
    });

    // ── Allowlisted errors surface their exact user-facing copy ───────────────
    describe('allowlisted errors are reflected verbatim', () => {
        it('register: "User already exists" -> 400 with that exact message', async () => {
            svc.register.mockRejectedValueOnce(new Error('User already exists'));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'User already exists' });
            expect(svc.register).toHaveBeenCalledTimes(1);
        });

        it('login: "Invalid credentials" -> 401 with that exact message', async () => {
            svc.login.mockRejectedValueOnce(new Error('Invalid credentials'));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: VALID_LOGIN_BODY,
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual({ error: 'Invalid credentials' });
            expect(svc.login).toHaveBeenCalledTimes(1);
        });

        it('login: "Account temporarily locked" -> 401 with that exact message', async () => {
            svc.login.mockRejectedValueOnce(new Error('Account temporarily locked'));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: VALID_LOGIN_BODY,
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual({ error: 'Account temporarily locked' });
            expect(svc.login).toHaveBeenCalledTimes(1);
        });
    });

    // ── Non-allowlisted / internal errors are replaced with the generic copy ──
    describe('non-allowlisted (internal) errors return ONLY the generic fallback', () => {
        const PRISMA_ERROR = 'Prisma P2002 unique constraint failed on the fields: (`email`)';

        it('register: a raw Prisma error never leaks — generic 400 fallback', async () => {
            svc.register.mockRejectedValueOnce(new Error(PRISMA_ERROR));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            expect(res.statusCode).toBe(400);
            // Exactly the per-route generic fallback — nothing else.
            expect(res.json()).toEqual({ error: 'Unable to complete request' });
            // Hard guard: the raw text / 'Prisma' must NEVER appear in the body.
            expect(res.body).not.toContain('Prisma');
            expect(res.body).not.toContain('P2002');
            expect(res.body).not.toContain('constraint');
        });

        it('login: a raw Prisma error never leaks — generic 401 fallback', async () => {
            svc.login.mockRejectedValueOnce(new Error(PRISMA_ERROR));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: VALID_LOGIN_BODY,
            });

            expect(res.statusCode).toBe(401);
            // The login fallback is the same generic copy as a real bad password,
            // so a DB failure is indistinguishable from invalid credentials.
            expect(res.json()).toEqual({ error: 'Invalid credentials' });
            expect(res.body).not.toContain('Prisma');
            expect(res.body).not.toContain('P2002');
            expect(res.body).not.toContain('constraint');
        });

        it('register: an arbitrary internal error string is not reflected', async () => {
            svc.register.mockRejectedValueOnce(
                new Error('connect ECONNREFUSED 127.0.0.1:5432')
            );

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'Unable to complete request' });
            expect(res.body).not.toContain('ECONNREFUSED');
            expect(res.body).not.toContain('5432');
        });
    });

    // ── forgot-password: same generic 200 regardless of account existence ─────
    describe('forgot-password does not enable user enumeration', () => {
        it('returns the same generic 200 body whether the service RESOLVES or THROWS', async () => {
            // Account exists / happy path: the service resolves with the generic
            // message and the route echoes it back.
            svc.forgotPassword.mockResolvedValueOnce({ message: GENERIC_FORGOT_MESSAGE });
            const resolved = await app.inject({
                method: 'POST',
                url: '/v1/auth/forgot-password',
                payload: VALID_FORGOT_BODY,
            });

            // Internal failure path: the service throws; the route swallows it and
            // still replies with the identical generic 200 body.
            svc.forgotPassword.mockRejectedValueOnce(
                new Error('Prisma findUnique failed: connection terminated')
            );
            const threw = await app.inject({
                method: 'POST',
                url: '/v1/auth/forgot-password',
                payload: VALID_FORGOT_BODY,
            });

            // Same status...
            expect(resolved.statusCode).toBe(200);
            expect(threw.statusCode).toBe(200);
            // ...and a byte-for-byte identical body (no enumeration signal).
            expect(resolved.body).toBe(threw.body);
            expect(resolved.json()).toEqual({ message: GENERIC_FORGOT_MESSAGE });
            expect(threw.json()).toEqual({ message: GENERIC_FORGOT_MESSAGE });

            // And the internal failure detail must never leak in either response.
            expect(threw.body).not.toContain('Prisma');
            expect(threw.body).not.toContain('connection terminated');
        });
    });

    // ── The credential routes carry the tight 7/min rate-limit config ─────────
    describe('credential routes declare the authRateLimit config (max:7, 1 minute)', () => {
        it.each([
            ['POST', '/v1/auth/register'],
            ['POST', '/v1/auth/login'],
            ['POST', '/v1/auth/refresh'],
            ['POST', '/v1/auth/forgot-password'],
            ['POST', '/v1/auth/reset-password'],
        ])('%s %s', (method, url) => {
            const route = routes.find(
                (r) =>
                    r.url === url &&
                    (Array.isArray(r.method) ? r.method.includes(method) : r.method === method)
            );
            expect(route).toBeDefined();
            expect(route!.config?.rateLimit?.max).toBe(7);
            expect(route!.config?.rateLimit?.timeWindow).toBe('1 minute');
        });
    });
});
