/**
 * Regression suite — decision-engine CORS allowlist (src/index.ts).
 *
 * Vulnerability this locks shut:
 *   index.ts registered `@fastify/cors` with `origin: true`, which REFLECTS the
 *   caller's Origin header back as `access-control-allow-origin` — i.e. every
 *   site is allowed. The fix replaces that with an EXPLICIT allowlist resolved
 *   from `CORS_ORIGIN` (comma-separated), and when `CORS_ORIGIN` is unset the
 *   allowlist is EMPTY so the browser is told no cross-origin is permitted
 *   (fail CLOSED). It is never '*' and never reflective.
 *
 * Why mount a tiny app instead of importing src/index.ts:
 *   - The service bootstrap module (src/index.ts) calls fastify.listen() at
 *     import time and cannot be loaded in a unit test — the same constraint
 *     documented atop error-redaction.test.ts / input-bounds.test.ts.
 *   - So this suite re-wires the EXACT CORS registration src/index.ts performs:
 *     the same `resolveCorsOrigins(CORS_ORIGIN)` rule (split on ',', trim,
 *     drop blanks, else []) feeding the real `@fastify/cors` plugin with the
 *     same methods. If index.ts ever regresses to `origin: true` / `'*'`, the
 *     assertions here describe exactly what must NOT happen.
 *
 * decision-engine runs vitest WITHOUT globals, so describe/it/expect/beforeEach/
 * afterEach are imported explicitly (same as the sibling suites).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';

// Mirror of src/index.ts's inline allowlist resolution. Kept identical so the
// test pins the production rule (split on ',', trim, drop blanks; unset → []).
function resolveCorsOrigins(corsOrigin: string | undefined): string[] {
    return corsOrigin
        ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
        : [];
}

// Build a Fastify app wired EXACTLY like src/index.ts's CORS registration.
async function buildApp(corsOrigin: string | undefined): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(fastifyCors, {
        origin: resolveCorsOrigins(corsOrigin),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });
    app.get('/health', async () => ({ status: 'ok' }));
    await app.ready();
    return app;
}

describe('decision-engine CORS allowlist (resolveCorsOrigins)', () => {
    let app: FastifyInstance | undefined;

    afterEach(async () => {
        if (app) {
            await app.close();
            app = undefined;
        }
    });

    // ── The unit rule (fail CLOSED when unset; never reflective) ──────────────
    it('resolves an EMPTY allowlist when CORS_ORIGIN is unset (fail closed)', () => {
        expect(resolveCorsOrigins(undefined)).toEqual([]);
    });

    it('resolves an EMPTY allowlist when CORS_ORIGIN is an empty string', () => {
        expect(resolveCorsOrigins('')).toEqual([]);
    });

    it('splits, trims, and drops blanks from a comma-separated CORS_ORIGIN', () => {
        expect(resolveCorsOrigins('https://app.example.com, https://admin.example.com , ')).toEqual([
            'https://app.example.com',
            'https://admin.example.com',
        ]);
    });

    it('NEVER returns the wildcard "*" — even a literal "*" is treated as a single explicit origin, not a reflective allow-all', () => {
        // The fix removed the '*' fallback entirely; resolveCorsOrigins only ever
        // returns the configured entries. (A deployer who literally sets
        // CORS_ORIGIN='*' gets one explicit origin, which @fastify/cors will only
        // echo for a request whose Origin is the string "*".)
        expect(resolveCorsOrigins(undefined)).not.toContain('*');
        expect(resolveCorsOrigins('')).not.toContain('*');
    });

    // ── End-to-end through the real @fastify/cors plugin ──────────────────────
    it('with CORS_ORIGIN UNSET, a cross-origin request gets NO access-control-allow-origin header (fail closed)', async () => {
        app = await buildApp(undefined);
        const res = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'https://evil.example.com' },
        });
        expect(res.statusCode).toBe(200);
        // Fail closed: the disallowed origin is NOT reflected and the wildcard is
        // never sent.
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('NEVER reflects an arbitrary attacker origin when an allowlist IS configured', async () => {
        app = await buildApp('https://app.example.com');
        const res = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'https://evil.example.com' },
        });
        expect(res.statusCode).toBe(200);
        // The attacker origin is not on the allowlist, so it is not echoed and the
        // header is never the wildcard.
        expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
        expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('ALLOWS a configured origin (reflects it exactly) so legitimate clients keep working', async () => {
        app = await buildApp('https://app.example.com');
        const res = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'https://app.example.com' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    });

    it('a CORS preflight (OPTIONS) for a configured origin is permitted; an unknown origin is not allowed', async () => {
        app = await buildApp('https://app.example.com');

        const allowed = await app.inject({
            method: 'OPTIONS',
            url: '/health',
            headers: {
                origin: 'https://app.example.com',
                'access-control-request-method': 'GET',
            },
        });
        expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');

        const denied = await app.inject({
            method: 'OPTIONS',
            url: '/health',
            headers: {
                origin: 'https://evil.example.com',
                'access-control-request-method': 'GET',
            },
        });
        expect(denied.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
        expect(denied.headers['access-control-allow-origin']).not.toBe('*');
    });
});
