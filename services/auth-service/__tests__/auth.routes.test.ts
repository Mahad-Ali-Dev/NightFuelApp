/**
 * Regression suite — auth-service register/login/forgot-password 4xx error
 * NORMALIZATION (src/routes.ts:14-23).
 *
 * Background: the credential endpoints catch whatever AuthService throws and run
 * it through an ALLOWED allowlist + `safeMsg` helper. Only the small set of
 * known, user-facing strings ('Invalid credentials', 'Account temporarily
 * locked', 'Invalid refresh token', ...) is ever reflected verbatim to the
 * client; ANY other error (Prisma/DB/network/unexpected) is replaced with a
 * per-route generic fallback so internal details can never leak.
 *
 * register and forgot-password go further: both return the SAME generic body
 * whether or not the email/account exists (and even on internal error), so
 * neither can be used to enumerate registered emails. 'User already exists' is
 * therefore deliberately NOT allowlisted — register never reflects it.
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

// The exact generic register message — identical for a brand-new signup, a
// duplicate email, AND an internal failure, so none of the three can be told
// apart (account enumeration). Must match src/routes.ts / auth.service.ts.
const GENERIC_REGISTER_MESSAGE =
    "If this email isn't already registered, the account was created";

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
        it('register: "User already exists" is NOT reflected — collapses to the generic 200 message (anti-enumeration)', async () => {
            // 'User already exists' was removed from the allowlist: register must
            // never reveal that an email is taken. Even if the service threw it,
            // the route swallows it and returns the SAME generic 200 body a new /
            // duplicate signup returns, so the duplicate case is indistinguishable.
            svc.register.mockRejectedValueOnce(new Error('User already exists'));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
            expect(res.body).not.toContain('User already exists');
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

        it('register: a raw Prisma error never leaks — generic 200 message (indistinguishable from success)', async () => {
            svc.register.mockRejectedValueOnce(new Error(PRISMA_ERROR));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            // Anti-enumeration: an internal failure returns the SAME generic 200
            // body a new/duplicate signup returns — never a distinguishable 4xx.
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
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

            // Anti-enumeration: collapses to the generic 200 message, no leak.
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
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

    // ── register: same generic 200 regardless of account existence ────────────
    describe('register does not enable user enumeration', () => {
        it('new email and duplicate email return a byte-for-byte identical generic 200 body', async () => {
            // The service returns the SAME generic message for a brand-new signup
            // and for a duplicate email (it never throws "User already exists").
            // The route echoes it back unchanged, so a caller cannot tell whether
            // the email was already registered.
            svc.register.mockResolvedValueOnce({ message: GENERIC_REGISTER_MESSAGE }); // "new" email
            const fresh = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            svc.register.mockResolvedValueOnce({ message: GENERIC_REGISTER_MESSAGE }); // duplicate email
            const duplicate = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: VALID_REGISTER_BODY,
            });

            expect(fresh.statusCode).toBe(200);
            expect(duplicate.statusCode).toBe(200);
            // Byte-for-byte identical — no enumeration signal in status or body.
            expect(fresh.body).toBe(duplicate.body);
            expect(fresh.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
            // The duplicate-account fact must never appear on the wire.
            expect(duplicate.body).not.toContain('already exists');
            expect(duplicate.body).not.toContain('User already exists');
        });
    });

    // ── login/register responses MUST NOT leak the bcrypt passwordHash ────────
    describe('login response never leaks passwordHash', () => {
        it('strips passwordHash from the user object even if the service returns it', async () => {
            // Drive the route with a user object that still carries a bcrypt hash
            // (simulating a regression in the service layer). The route's
            // defence-in-depth strip must remove it before it reaches the wire.
            svc.login.mockResolvedValueOnce({
                user: {
                    id: 'u_1',
                    email: 'user@example.com',
                    displayName: 'User',
                    role: 'USER',
                    passwordHash: '$2a$12$THIS_SHOULD_NEVER_LEAK_TO_THE_CLIENT',
                },
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            });

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: VALID_LOGIN_BODY,
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            // The secret hash must be entirely absent from the response.
            expect(body.user).not.toHaveProperty('passwordHash');
            expect(res.body).not.toContain('passwordHash');
            expect(res.body).not.toContain('$2a$12$');
            expect(res.body).not.toContain('THIS_SHOULD_NEVER_LEAK_TO_THE_CLIENT');
            // The rest of the response is still intact.
            expect(body.user.id).toBe('u_1');
            expect(body.user.email).toBe('user@example.com');
            expect(body.accessToken).toBe('access-token');
            expect(body.refreshToken).toBe('refresh-token');
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
