/**
 * Security suite — auth-service register / login / reset-password INPUT BOUNDS
 * (src/schemas.ts) and the 400/401 redaction contract on the genuine routes
 * (src/routes.ts).
 *
 * Why this file exists: auth-service already has auth.routes / error-redaction /
 * route-body-redaction suites, but NONE of them lock the zod *input bounds* on
 * the security-critical credential endpoints. Those bounds (strong-password
 * rule, displayName/region length, email shape, reset-token presence) are the
 * first line of defence against weak-credential and malformed-input abuse, so a
 * silent loosening of any of them must turn this file red.
 *
 * What it asserts, on the GENUINE `authRoutes` plugin with a fully-mocked
 * AuthService (the proven in-test-Fastify recipe from route-body-redaction.test.ts:
 * setValidatorCompiler/serializerCompiler from fastify-type-provider-zod, decorate
 * `authenticate`, register authRoutes under '/v1/auth', and deliberately NOT
 * register @fastify/rate-limit so the 7/min limiter cannot interfere):
 *
 *   1. OUT-OF-BOUNDS bodies are rejected at validation -> HTTP 400 and the mocked
 *      service method is NEVER invoked (the bound short-circuits before the
 *      handler runs). This is the security-critical assertion: a weak password /
 *      malformed email / too-short field can never reach AuthService.
 *   2. INCLUSIVE happy paths (exactly-min strong password, displayName length 2,
 *      region length 2, valid email) are NOT rejected at validation (not 400)
 *      and the mocked service IS invoked exactly once — proving the bounds are
 *      inclusive at the boundary and not accidentally off-by-one strict.
 *   3. The 400/401 catch funnels through the real, non-exported safeMsg/ALLOWED
 *      allowlist (src/routes.ts): a NON-allowlisted leaky throw collapses to the
 *      per-route fixed fallback only (no Prisma/P2025/localhost/5432/'at /'
 *      fragments on the wire); an ALLOWLISTED throw ('Invalid credentials' on
 *      login) still passes verbatim.
 *
 * AuthService is fully mocked, so every branch is deterministic and no
 * DB/Redis/network is touched. This is a NEW file — it does not touch the
 * existing auth.routes / error-redaction / route-body-redaction suites (each
 * owned by a separate work-item).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from '../src/routes';

// Per-route generic fallbacks (must match src/routes.ts exactly).
const REGISTER_FALLBACK = 'Unable to complete request';
const LOGIN_FALLBACK = 'Invalid credentials';
// An allowlisted string the helper IS permitted to surface verbatim (src/routes.ts ALLOWED).
const ALLOWLISTED_LOGIN_MESSAGE = 'Invalid credentials';
// A raw, non-allowlisted message padded with attack-signal fragments that the
// redaction MUST strip from the wire body.
const LEAKY_MESSAGE = 'Prisma P2025 record not found at /srv/app localhost:5432';

// Every method the routes plugin may call on AuthService. Each is a jest.fn()
// configured per-test, so each branch is driven deterministically and no real
// service is constructed.
function buildMockAuthService() {
    return {
        register: jest.fn(),
        login: jest.fn(),
        refreshToken: jest.fn(),
        forgotPassword: jest.fn(),
        resetPassword: jest.fn(),
        logout: jest.fn(),
        getUserProfile: jest.fn(),
    };
}

type MockAuthService = ReturnType<typeof buildMockAuthService>;

async function buildApp(svc: MockAuthService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // Same compilers as src/index.ts so the route zod schemas validate identically
    // (and an out-of-bounds body fails validation -> 400 before the handler).
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // The plugin's logout/me routes reference `(fastify as any).authenticate`.
    // Provide a no-op so registration succeeds; the bounds tests here drive only
    // the public register/login/reset-password routes (no auth guard).
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: '00000000-0000-0000-0000-000000000000' };
    });

    // Register exactly as src/index.ts does: under the /v1/auth prefix, passing
    // the (mocked) AuthService. NOTE: @fastify/rate-limit is deliberately NOT
    // registered, so the per-route 7/min limiter is inert here.
    await app.register(
        async (instance) => {
            await authRoutes(instance, { authService: svc as any });
        },
        { prefix: '/v1/auth' }
    );

    await app.ready();
    return app;
}

// A register body that PASSES registerSchema at every field except the one the
// test deliberately corrupts — so the rejection is attributable to that single
// out-of-bounds field and nothing else.
function validRegisterBody(overrides: Record<string, unknown> = {}) {
    return {
        email: 'new.user@example.com',
        // exactly 8 chars, one uppercase, one digit — the inclusive lower bound.
        password: 'Passwor1',
        displayName: 'Jo', // exactly the min length of 2
        region: 'us', // exactly length 2 (ISO 3166-1 alpha-2)
        role: 'USER',
        ...overrides,
    };
}

function validLoginBody(overrides: Record<string, unknown> = {}) {
    return {
        email: 'user@example.com',
        // login.password is intentionally NOT strong-validated (legacy passwords
        // must still authenticate) — any non-empty string is accepted.
        password: 'whatever-they-typed',
        ...overrides,
    };
}

function validResetBody(overrides: Record<string, unknown> = {}) {
    return {
        token: 'a-reset-token',
        newPassword: 'Passwor1', // inclusive lower bound of strongPassword
        ...overrides,
    };
}

describe('auth-service credential routes — zod INPUT BOUNDS are enforced before the handler', () => {
    let app: FastifyInstance;
    let svc: MockAuthService;

    beforeEach(async () => {
        svc = buildMockAuthService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    // ── OUT-OF-BOUNDS register bodies are rejected at validation (service untouched)
    describe('POST /register — out-of-bounds bodies -> 400, service.register NEVER called', () => {
        const cases: Array<[string, Record<string, unknown>]> = [
            ['password missing an uppercase letter', { password: 'password1' }],
            ['password missing a digit', { password: 'Password' }],
            ['password shorter than 8 chars', { password: 'Pass1' }],
            ['displayName shorter than 2 chars', { displayName: 'J' }],
            ['region longer than 2 chars', { region: 'usa' }],
            ['region shorter than 2 chars', { region: 'u' }],
            ['malformed email', { email: 'not-an-email' }],
        ];

        it.each(cases)('%s -> 400 and register is not invoked', async (_label, override) => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: validRegisterBody(override),
            });

            // Validation short-circuits the handler: 400 from the zod validator
            // compiler, and the credential service is never reached.
            expect(res.statusCode).toBe(400);
            expect(svc.register).not.toHaveBeenCalled();
        });
    });

    // ── OUT-OF-BOUNDS reset-password bodies are rejected at validation
    describe('POST /reset-password — out-of-bounds bodies -> 400, service.resetPassword NEVER called', () => {
        const cases: Array<[string, Record<string, unknown>]> = [
            ['empty token (min 1)', { token: '' }],
            ['weak newPassword — missing uppercase', { newPassword: 'password1' }],
            ['weak newPassword — missing digit', { newPassword: 'Password' }],
            ['weak newPassword — shorter than 8', { newPassword: 'Pass1' }],
        ];

        it.each(cases)('%s -> 400 and resetPassword is not invoked', async (_label, override) => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/reset-password',
                payload: validResetBody(override),
            });

            expect(res.statusCode).toBe(400);
            expect(svc.resetPassword).not.toHaveBeenCalled();
        });
    });

    // ── OUT-OF-BOUNDS login bodies are rejected at validation
    describe('POST /login — malformed email -> 400, service.login NEVER called', () => {
        it('malformed email -> 400 and login is not invoked', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: validLoginBody({ email: 'not-an-email' }),
            });

            expect(res.statusCode).toBe(400);
            expect(svc.login).not.toHaveBeenCalled();
        });
    });

    // ── INCLUSIVE boundaries pass validation and reach the (mocked) service ──────
    describe('inclusive boundaries are accepted (NOT 400) and the service is invoked once', () => {
        it('register: exactly-8-char strong password, displayName len 2, region len 2, valid email', async () => {
            svc.register.mockResolvedValueOnce({ ok: true } as never);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: validRegisterBody(), // all fields exactly at the inclusive bound
            });

            // Boundary inputs are valid: the request reaches the handler (201 on
            // the happy path), so it is emphatically NOT a 400 validation reject.
            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(201);
            expect(svc.register).toHaveBeenCalledTimes(1);
        });

        it('login: valid email + arbitrary non-empty password is accepted', async () => {
            svc.login.mockResolvedValueOnce({ token: 'x' } as never);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: validLoginBody(),
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(200);
            expect(svc.login).toHaveBeenCalledTimes(1);
        });

        it('reset-password: non-empty token + exactly-8-char strong newPassword is accepted', async () => {
            svc.resetPassword.mockResolvedValueOnce(undefined as never);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/reset-password',
                payload: validResetBody(),
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(200);
            expect(svc.resetPassword).toHaveBeenCalledTimes(1);
        });
    });

    // ── 400/401 redaction: the catch funnels through the real safeMsg/ALLOWED ───
    describe('4xx body redaction — non-allowlisted throws collapse to the fixed fallback', () => {
        it('register: a NON-allowlisted leaky throw -> 400 with ONLY the fixed fallback', async () => {
            svc.register.mockRejectedValueOnce(new Error(LEAKY_MESSAGE) as never);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/register',
                payload: validRegisterBody(),
            });

            expect(res.statusCode).toBe(400);
            // Exactly the per-route generic fallback — nothing else.
            expect(res.json()).toEqual({ error: REGISTER_FALLBACK });
            // Hard guard: none of the raw fragments may reach the wire.
            expect(res.body).not.toContain(LEAKY_MESSAGE);
            expect(res.body).not.toContain('Prisma');
            expect(res.body).not.toContain('P2025');
            expect(res.body).not.toContain('localhost');
            expect(res.body).not.toContain('5432');
            expect(res.body).not.toContain('at /');
            // The service WAS reached (valid body) — this is the catch path, not
            // a validation reject.
            expect(svc.register).toHaveBeenCalledTimes(1);
        });

        it('login: a NON-allowlisted leaky throw -> 401 with ONLY the fixed fallback', async () => {
            svc.login.mockRejectedValueOnce(new Error(LEAKY_MESSAGE) as never);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: validLoginBody(),
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual({ error: LOGIN_FALLBACK });
            expect(res.body).not.toContain(LEAKY_MESSAGE);
            expect(res.body).not.toContain('Prisma');
            expect(res.body).not.toContain('P2025');
            expect(res.body).not.toContain('localhost');
            expect(res.body).not.toContain('5432');
            expect(res.body).not.toContain('at /');
            expect(svc.login).toHaveBeenCalledTimes(1);
        });

        it('login: an ALLOWLISTED throw ("Invalid credentials") passes through verbatim', async () => {
            svc.login.mockRejectedValueOnce(new Error(ALLOWLISTED_LOGIN_MESSAGE) as never);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/auth/login',
                payload: validLoginBody(),
            });

            expect(res.statusCode).toBe(401);
            expect(res.json()).toEqual({ error: ALLOWLISTED_LOGIN_MESSAGE });
            expect(svc.login).toHaveBeenCalledTimes(1);
        });
    });
});
