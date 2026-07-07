/**
 * Regression suite — HIGH #1 web XSS hardening: the long-lived REFRESH token is
 * carried in an httpOnly cookie (nf_refresh) set/cleared by auth-service, NOT in
 * a JS-readable response field the web client would have to put in localStorage.
 *
 * What this locks in (src/routes.ts login/refresh/logout + src/refresh-cookie.ts):
 *   - login   sets Set-Cookie: nf_refresh=<token>; HttpOnly; SameSite=Lax; Path=/
 *             AND still returns refreshToken in the JSON body (mobile compat).
 *   - refresh accepts the token from the COOKIE (web, empty body) OR the body
 *             (mobile), rotates it, and re-sets the cookie.
 *   - logout  revokes the token taken from cookie OR body and CLEARS the cookie
 *             (Max-Age=0), so a logged-out browser can no longer refresh.
 *
 * AuthService is fully mocked so every branch is deterministic and no
 * DB/Redis/network is touched. @fastify/rate-limit is intentionally NOT
 * registered. This is a NEW file and does not touch the sibling suites.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from '../src/routes';
import { REFRESH_COOKIE_NAME } from '../src/refresh-cookie';

const VALID_LOGIN_BODY = { email: 'user@example.com', password: 'whatever' };

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
    // logout is behind `authenticate`; provide a no-op so the request reaches the
    // handler (we are testing the cookie behaviour, not JWT verification).
    app.decorate('authenticate', async () => {
        /* no-op */
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

// Pull the single Set-Cookie header value (fastify inject normalizes to a string
// or string[]). Returns '' when absent.
function setCookie(res: { headers: Record<string, any> }): string {
    const raw = res.headers['set-cookie'];
    if (!raw) return '';
    return Array.isArray(raw) ? raw.join('\n') : String(raw);
}

describe('auth-service refresh-token httpOnly cookie (HIGH #1)', () => {
    let app: FastifyInstance;
    let svc: MockAuthService;

    beforeEach(async () => {
        svc = buildMockAuthService();
        app = await buildApp(svc);
    });
    afterEach(async () => {
        await app.close();
    });

    it('login sets an httpOnly SameSite=Lax nf_refresh cookie AND keeps the token in the JSON body', async () => {
        svc.login.mockResolvedValueOnce({
            user: { id: 'u1', email: 'user@example.com' },
            accessToken: 'access-1',
            refreshToken: 'refresh-secret-1',
        });

        const res = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: VALID_LOGIN_BODY });

        expect(res.statusCode).toBe(200);
        const cookie = setCookie(res);
        expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=refresh-secret-1`);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toContain('Path=/');
        // Mobile compat: token still present in the body.
        const body = res.json();
        expect(body.accessToken).toBe('access-1');
        expect(body.refreshToken).toBe('refresh-secret-1');
    });

    it('refresh reads the token from the nf_refresh COOKIE (empty body) and rotates the cookie', async () => {
        svc.refreshToken.mockResolvedValueOnce({ accessToken: 'access-2', refreshToken: 'refresh-secret-2' });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/auth/refresh',
            payload: {}, // web sends no body
            headers: { cookie: `${REFRESH_COOKIE_NAME}=refresh-secret-1` },
        });

        expect(res.statusCode).toBe(200);
        // The service was called with the token taken from the cookie.
        expect(svc.refreshToken).toHaveBeenCalledWith({ refreshToken: 'refresh-secret-1' });
        // The rotated token is written back into the cookie.
        expect(setCookie(res)).toContain(`${REFRESH_COOKIE_NAME}=refresh-secret-2`);
        expect(res.json().refreshToken).toBe('refresh-secret-2');
    });

    it('refresh still accepts the token from the BODY (mobile path)', async () => {
        svc.refreshToken.mockResolvedValueOnce({ accessToken: 'access-3', refreshToken: 'refresh-secret-3' });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/auth/refresh',
            payload: { refreshToken: 'mobile-refresh' },
        });

        expect(res.statusCode).toBe(200);
        expect(svc.refreshToken).toHaveBeenCalledWith({ refreshToken: 'mobile-refresh' });
    });

    it('refresh with neither cookie nor body returns 401 and never calls the service', async () => {
        const res = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: {} });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: 'Invalid refresh token' });
        expect(svc.refreshToken).not.toHaveBeenCalled();
    });

    it('logout revokes the cookie token AND clears the cookie (Max-Age=0)', async () => {
        svc.logout.mockResolvedValueOnce(undefined);

        const res = await app.inject({
            method: 'POST',
            url: '/v1/auth/logout',
            payload: {},
            headers: { cookie: `${REFRESH_COOKIE_NAME}=refresh-secret-1` },
        });

        expect(res.statusCode).toBe(204);
        expect(svc.logout).toHaveBeenCalledWith('refresh-secret-1');
        const cookie = setCookie(res);
        expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=`);
        expect(cookie).toMatch(/Max-Age=0/i);
    });

    it('logout clears the cookie even when there is no token to revoke', async () => {
        const res = await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: {} });
        expect(res.statusCode).toBe(204);
        expect(svc.logout).not.toHaveBeenCalled();
        expect(setCookie(res)).toMatch(/Max-Age=0/i);
    });
});
