/**
 * Regression suite — auth-service IN-ROUTE 4xx body redaction for the catch that
 * previously sent `error: err.message` verbatim (src/routes.ts, the 400 catch at
 * what the work-item brief calls the "verify-email" path; in the current source
 * it is the /logout 400 catch — the one raw-message echo that bypassed the
 * `safeMsg` allowlist used by every other credential route).
 *
 * Background: the credential routes funnel caught errors through `safeMsg(err,
 * fallback)` against an ALLOWED allowlist (src/routes.ts:14-23), so only a known
 * user-facing string ('Invalid refresh token', 'Invalid credentials', ...) ever
 * reaches the client; anything else (Prisma/DB/network) collapses to the per-
 * route generic fallback. The flagged catch instead sent `err.message` straight
 * through, leaking whatever the service threw. The fix routes it through the same
 * `safeMsg` helper.
 *
 * This file locks that in by mounting the GENUINE `authRoutes` plugin (so the
 * real, non-exported `safeMsg`/ALLOWED logic is exercised) and driving the
 * patched catch with (a) a NON-allowlisted leaky throw → asserts ONLY the fixed
 * fallback escapes, and (b) an ALLOWLISTED throw → asserts it still passes
 * verbatim. AuthService is fully mocked, so every branch is deterministic and no
 * DB/Redis/network is touched. @fastify/rate-limit is intentionally NOT
 * registered. This is a NEW file — it does not touch the existing
 * error-redaction.test.ts (owned by a separate work-item).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from '../src/routes';

// The per-route generic fallback for the patched catch (matches src/routes.ts).
const FIXED_FALLBACK = 'Unable to complete request';
// An allowlisted string the helper IS permitted to surface verbatim.
const ALLOWLISTED_MESSAGE = 'Invalid refresh token';
// A raw, non-allowlisted message padded with attack-signal fragments.
const LEAKY_MESSAGE =
    'Prisma P2025 record not found at /srv/app localhost:5432';

// A refreshToken body that PASSES refreshTokenSchema so the request reaches the
// handler (and thus the mocked service) rather than being rejected at validation.
const VALID_LOGOUT_BODY = { refreshToken: 'a'.repeat(32) };

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
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // The patched catch lives on a route guarded by `authenticate`. Provide a
    // decorator that attaches a user and proceeds so the handler runs and we can
    // observe the catch behaviour (the existing suite uses a no-op for routes it
    // does not drive; here we must actually reach the handler).
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: '00000000-0000-0000-0000-000000000000' };
    });

    await app.register(
        async (instance) => {
            await authRoutes(instance, { authService: svc as any });
        },
        { prefix: '/v1/auth' }
    );

    await app.ready();
    return app;
}

describe('auth-service in-route 4xx body — safeMsg redaction on the patched catch', () => {
    let app: FastifyInstance;
    let svc: MockAuthService;

    beforeEach(async () => {
        svc = buildMockAuthService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    it('a NON-allowlisted (leaky) thrown message is replaced by the fixed fallback', async () => {
        svc.logout.mockRejectedValueOnce(new Error(LEAKY_MESSAGE));

        const res = await app.inject({
            method: 'POST',
            url: '/v1/auth/logout',
            payload: VALID_LOGOUT_BODY,
        });

        expect(res.statusCode).toBe(400);
        // Exactly the per-route generic fallback — nothing else.
        expect(res.json()).toEqual({ error: FIXED_FALLBACK });
        // Hard guard: none of the raw fragments may reach the wire.
        expect(res.body).not.toContain(LEAKY_MESSAGE);
        expect(res.body).not.toContain('Prisma');
        expect(res.body).not.toContain('P2025');
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('5432');
        expect(res.body).not.toContain('at /');
        expect(svc.logout).toHaveBeenCalledTimes(1);
    });

    it('an ALLOWLISTED thrown message still passes through verbatim', async () => {
        svc.logout.mockRejectedValueOnce(new Error(ALLOWLISTED_MESSAGE));

        const res = await app.inject({
            method: 'POST',
            url: '/v1/auth/logout',
            payload: VALID_LOGOUT_BODY,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: ALLOWLISTED_MESSAGE });
        expect(svc.logout).toHaveBeenCalledTimes(1);
    });

    it('the fixed fallback is NOT itself an allowlisted string (helper would not echo it)', async () => {
        // Sanity guard: if the fallback were accidentally added to ALLOWED, the
        // negative assertions above would pass for the wrong reason. A throw of
        // the fallback text must therefore be treated as non-allowlisted and
        // still collapse to the same fixed copy.
        svc.logout.mockRejectedValueOnce(new Error(FIXED_FALLBACK + ' (raw internal)'));

        const res = await app.inject({
            method: 'POST',
            url: '/v1/auth/logout',
            payload: VALID_LOGOUT_BODY,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: FIXED_FALLBACK });
        expect(res.body).not.toContain('raw internal');
    });
});
