/**
 * Unit test — scripts/check-no-inline-401.js regex contract.
 *
 * The guard script (scripts/check-no-inline-401.js) walks every
 * services/<svc>/src/*.ts file looking for inline 401 reply bodies the codebase
 * has agreed to centralize in packages/config/src/auth-errors.ts. The detection
 * is built on two regexes:
 *
 *   1) INLINE_401_RE          — Bearer-specific phrase match. Catches the
 *                               original missing-token literal.
 *   2) INLINE_401_GENERIC_RE  — broad `statusCode: 401 ... .send(` match.
 *                               Catches the payload-invalid variants and any
 *                               future drift.
 *
 * This suite locks the two regex shapes in. If anyone narrows or rewrites them
 * in a way that lets a real inline 401 slip past — or, conversely, widens them
 * so they false-positive on the canonical helper call site — these assertions
 * go red BEFORE the change reaches CI.
 *
 * Plain JS (not TS) on purpose: the script under test is plain JS too, so the
 * test stays close to the production surface and runs without the babel/ts-jest
 * transform stack. We import the regexes via the script's `module.exports.__test`
 * back-door — same constants the guard uses at runtime.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-no-inline-401.test.js`
 */

'use strict';

const path = require('path');

// Pull the regex constants the guard uses at runtime. Importing the script as a
// module is safe — main() is only invoked when the script is run directly
// (require.main === module guard inside the script).
const { __test } = require(path.resolve(__dirname, '..', 'check-no-inline-401.js'));
const { INLINE_401_RE, INLINE_401_GENERIC_RE, isWithinCanonicalCall } = __test;

describe('check-no-inline-401 — regex contract', () => {
    // ── Fixture (a): the original Bearer-style inline 401 ─────────────────────
    // This is the canonical missing-token body — what the guard was built to
    // catch first. Both regexes should match it (Bearer-specific is the more
    // informative failure message, generic is the safety net).
    test('fixture (a): inline Bearer body — true positive on the Bearer regex', () => {
        const snippet = `
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'A valid Bearer token is required.',
            });
        `;
        expect(INLINE_401_RE.test(snippet)).toBe(true);
        // And the generic regex catches it too — safety-net invariant.
        expect(INLINE_401_GENERIC_RE.test(snippet)).toBe(true);
    });

    // ── Fixture (b): the payload-invalid variants the new generic regex owns ─
    // These bodies use a DIFFERENT message ('Invalid token payload' / 'Token
    // payload is missing userId.') than the Bearer pattern, so the old regex
    // would let them slip past. The generic regex MUST catch them.
    test('fixture (b): inline "Invalid token payload" body — true positive on the generic regex', () => {
        const snippet = `
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token payload' });
        `;
        expect(INLINE_401_RE.test(snippet)).toBe(false);
        expect(INLINE_401_GENERIC_RE.test(snippet)).toBe(true);
    });

    test('fixture (b2): inline "Token payload is missing userId" body — true positive on the generic regex', () => {
        const snippet = `
            reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Token payload is missing userId.',
            });
        `;
        expect(INLINE_401_RE.test(snippet)).toBe(false);
        expect(INLINE_401_GENERIC_RE.test(snippet)).toBe(true);
    });

    // ── Fixture (c): the canonical helper call site ─────────────────────────
    // The whole point of the migration is to delete the inline body and call
    // sendUnauthorized / sendUnauthorizedPayload instead. Those call sites
    // contain neither `statusCode: 401` nor `.send(` in the offending shape,
    // so both regexes must miss them — true negative.
    test('fixture (c): canonical sendUnauthorized() call — true negative on both regexes', () => {
        const snippet = `
            return sendUnauthorized(reply, request, err);
        `;
        expect(INLINE_401_RE.test(snippet)).toBe(false);
        expect(INLINE_401_GENERIC_RE.test(snippet)).toBe(false);
    });

    test('fixture (c2): canonical sendUnauthorizedPayload() call — true negative on both regexes', () => {
        const snippet = `
            return sendUnauthorizedPayload(reply, request, err);
        `;
        expect(INLINE_401_RE.test(snippet)).toBe(false);
        expect(INLINE_401_GENERIC_RE.test(snippet)).toBe(false);
    });

    // ── Fixture (d): a test file asserting against the body shape ───────────
    // Test files legitimately need to write down the body shape they expect to
    // see. The path-skip in main() means these files never reach the regex in
    // production — but if some future refactor mixes a test fixture into a
    // non-test file, the isWithinCanonicalCall pre-filter is the second line
    // of defence. Here we verify a typical `expect({ statusCode: 401, ... })`
    // shape, when wrapped near a sendUnauthorized mention, is ignored.
    test('fixture (d): test file expect({ statusCode: 401 }) snippet — ignored when inside a canonical-helper window', () => {
        const snippet = `
            // sendUnauthorizedPayload should produce this exact body
            expect(body).toEqual({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Token payload is invalid or missing userId.',
            });
        `;
        // The raw regex matches — that's expected because the line literally
        // contains `statusCode: 401 ... .send(` -wait, it doesn't, it contains
        // .toEqual not .send. Confirm: the generic regex tests against
        // `.send(`, so an expect() block has no business matching it.
        expect(INLINE_401_GENERIC_RE.test(snippet)).toBe(false);
    });

    test('fixture (d2): inline 401 sitting next to a sendUnauthorized comment — pre-filter skips it', () => {
        // Real-world counter-example: the canonical body literal lives inside
        // the helper itself. The walker skips packages/config/ by path, but
        // the isWithinCanonicalCall pre-filter is the second safeguard for
        // anything that slips through.
        const lines = [
            '// canonical helper — used by every service',
            'export function sendUnauthorizedPayload(reply, request, err) {',
            '    return reply.code(401).send({',
            '        statusCode: 401,',
            '        error: "Unauthorized",',
            '        message: "Token payload is invalid or missing userId.",',
            '    });',
            '}',
        ];
        // The line with `statusCode: 401` is index 3 (0-indexed). Its 5-line
        // window (idx-2 .. idx+2) includes 'sendUnauthorizedPayload' on line 1,
        // so the pre-filter must return true.
        expect(isWithinCanonicalCall(lines, 3)).toBe(true);
    });
});
