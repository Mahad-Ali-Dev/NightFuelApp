// Tests for the shared internal-service-token guard in @nightfuel/config (F34 #5).
//
// makeInternalAuthGuard(expectedToken) returns a Fastify preHandler that:
//   - 404s (stock not-found body) when X-Internal-Token is missing/wrong, NEVER
//     revealing that the route exists (mirrors the nginx edge 404).
//   - falls through (does NOT touch reply) when the token matches.
//   - fails closed when the expected token is empty/undefined (everything 404s).
//
// The compare is constant-time (timingSafeEqualStr) — also asserted directly.
//
// Imported from ../src (NOT the built dist) so the suite runs without a build.
import { describe, it, expect, jest } from '@jest/globals';
import { makeInternalAuthGuard, timingSafeEqualStr, NOT_FOUND_BODY } from '../src/internal-auth';

const TOKEN = 'super-secret-internal-token';

// Minimal Fastify reply/request doubles — the guard only touches
// request.headers and reply.code().send().
function makeReply() {
    const reply: any = {
        statusCode: undefined,
        body: undefined,
        code(c: number) {
            this.statusCode = c;
            return this;
        },
        send(b: unknown) {
            this.body = b;
            return this;
        },
    };
    return reply;
}

function makeRequest(headers: Record<string, string> = {}) {
    return { headers, url: '/internal/all', method: 'GET', log: { warn: jest.fn() } } as any;
}

describe('timingSafeEqualStr', () => {
    it('returns true for identical strings', () => {
        expect(timingSafeEqualStr(TOKEN, TOKEN)).toBe(true);
    });
    it('returns false for different strings', () => {
        expect(timingSafeEqualStr(TOKEN, 'wrong')).toBe(false);
    });
    it('returns false for different-length strings without throwing', () => {
        expect(timingSafeEqualStr('a', 'abcdef')).toBe(false);
    });
    it('returns false when either side is empty', () => {
        expect(timingSafeEqualStr('', TOKEN)).toBe(false);
        expect(timingSafeEqualStr(TOKEN, '')).toBe(false);
    });
});

describe('makeInternalAuthGuard', () => {
    it('404s with the stock not-found body when the token header is missing', async () => {
        const guard = makeInternalAuthGuard(TOKEN);
        const reply = makeReply();
        await guard(makeRequest({}), reply);
        expect(reply.statusCode).toBe(404);
        expect(reply.body).toEqual(NOT_FOUND_BODY);
    });

    it('404s when the token is wrong', async () => {
        const guard = makeInternalAuthGuard(TOKEN);
        const reply = makeReply();
        await guard(makeRequest({ 'x-internal-token': 'nope' }), reply);
        expect(reply.statusCode).toBe(404);
        expect(reply.body).toEqual(NOT_FOUND_BODY);
    });

    it('falls through (does not touch reply) when the token matches', async () => {
        const guard = makeInternalAuthGuard(TOKEN);
        const reply = makeReply();
        await guard(makeRequest({ 'x-internal-token': TOKEN }), reply);
        expect(reply.statusCode).toBeUndefined();
        expect(reply.body).toBeUndefined();
    });

    it('fails closed when the expected token is empty (every request 404s)', async () => {
        const guard = makeInternalAuthGuard('');
        const reply = makeReply();
        await guard(makeRequest({ 'x-internal-token': '' }), reply);
        expect(reply.statusCode).toBe(404);
    });

    it('fails closed when the expected token is undefined', async () => {
        const guard = makeInternalAuthGuard(undefined);
        const reply = makeReply();
        await guard(makeRequest({ 'x-internal-token': 'anything' }), reply);
        expect(reply.statusCode).toBe(404);
    });
});
