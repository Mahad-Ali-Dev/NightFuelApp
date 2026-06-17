/**
 * Unit test — scripts/check-error-handler-registered.js contract.
 *
 * The guard (scripts/check-error-handler-registered.js) enforces two contracts
 * over each services/<svc>/src/ tree:
 *
 *   (1) REGISTRATION — every service references either the shared
 *       `registerFastifyErrorHandler` (from @nightfuel/config) OR an inline
 *       `.setErrorHandler(`. A service with neither is an offender.
 *   (2) NO RAW-ERROR LEAK — no 4xx/5xx `.send({...})` body echoes raw
 *       `err.message` / `error.message` / `.stack`, either directly or via a
 *       `${var}` interpolation of a variable bound to raw error text. The one
 *       safe exception is the `error.validation ? error.message : '...'`
 *       ternary inside a global error handler.
 *
 * This suite locks both detectors in. If anyone narrows the leak detector so a
 * real `reply.code(500).send({ error: err.message })` slips past — or widens it
 * so it false-positives on the dozens of SAFE generic bodies that merely sit
 * near a `catch (err)` / `if (err.message...)` — these assertions go red BEFORE
 * the change reaches CI. They also pin the registration check: dropping both a
 * shared-handler import and an inline setErrorHandler from a service must flag.
 *
 * Plain JS (not TS) on purpose: the script under test is plain JS too, so the
 * test stays close to the production surface and runs without the babel/ts-jest
 * transform stack — it runs under the gate's harness-self-test jest pass. We
 * import the pure helpers via the script's `module.exports.__test` back-door.
 * Importing the module is safe: main() only runs under the
 * require.main === module guard inside the script.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-error-handler-registered.test.js`
 */

'use strict';

const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'check-error-handler-registered.js'));
const {
    SHARED_HANDLER_RE,
    INLINE_HANDLER_RE,
    RAW_ERROR_TOKEN_RE,
    serviceMentionsHandler,
    collectErrorBoundIdentifiers,
    extractBalancedArg,
    bodyEchoesRawError,
    maxStatusInChain,
    findLeakLines,
    isInsideCatch,
} = __test;

// Small helper: run the full per-file leak pass (resolve bound ids, then scan)
// exactly as main() does for one service file.
function leakLines(src) {
    return findLeakLines(src, collectErrorBoundIdentifiers(src));
}

describe('check-error-handler-registered — contract (1): registration', () => {
    // ── Negative: a clean shared-handler service ────────────────────────────
    test('shared registerFastifyErrorHandler satisfies registration (true negative)', () => {
        const src = `
            import { registerFastifyErrorHandler } from '@nightfuel/config';
            const fastify = Fastify();
            registerFastifyErrorHandler(fastify, logger);
        `;
        expect(SHARED_HANDLER_RE.test(src)).toBe(true);
        expect(serviceMentionsHandler([src])).toBe(true);
    });

    // ── Negative: a clean inline-setErrorHandler service ────────────────────
    test('inline .setErrorHandler() satisfies registration (true negative)', () => {
        const src = `
            const app = Fastify();
            app.setErrorHandler((error, request, reply) => {
                logger.error({ err: error }, 'Unhandled');
                return reply.code(500).send({ error: 'Internal Server Error', message: 'Internal server error' });
            });
        `;
        expect(INLINE_HANDLER_RE.test(src)).toBe(true);
        expect(serviceMentionsHandler([src])).toBe(true);
    });

    // ── Positive: a service src with NEITHER handler is an offender ─────────
    test('a service src with neither handler is flagged (true positive)', () => {
        const src = `
            import Fastify from 'fastify';
            const fastify = Fastify();
            fastify.get('/v1/health', async () => ({ ok: true }));
            // NOTE: this service forgot to install any global error handler.
            fastify.listen({ port: 3000 });
        `;
        expect(SHARED_HANDLER_RE.test(src)).toBe(false);
        expect(INLINE_HANDLER_RE.test(src)).toBe(false);
        expect(serviceMentionsHandler([src])).toBe(false);
    });

    test('registration scans across multiple files — handler in ANY src file counts', () => {
        const routes = `fastify.get('/x', () => {});`; // no handler here
        const index = `registerFastifyErrorHandler(fastify, logger);`; // handler here
        expect(serviceMentionsHandler([routes, index])).toBe(true);
        // …but two handler-less files together are still an offender.
        expect(serviceMentionsHandler([routes, `fastify.get('/y', () => {});`])).toBe(false);
    });
});

describe('check-error-handler-registered — contract (2): no raw-error leak', () => {
    // ── Positive: a direct err.message leak on a 5xx ────────────────────────
    test('reply.code(500).send({ error: err.message }) is flagged (true positive)', () => {
        const src = [
            'try {',
            '  doThing();',
            '} catch (err) {',
            '  return reply.code(500).send({ error: err.message });',
            '}',
        ].join('\n');
        expect(leakLines(src)).toEqual([4]);
    });

    test('reply.status(400).send({ stack: error.stack }) is flagged (true positive)', () => {
        const src = `return reply.status(400).send({ stack: error.stack });`;
        expect(leakLines(src)).toEqual([1]);
    });

    // ── Positive: the indirect/interpolation leak (the real stripe.ts shape) ─
    test('interpolated ${message} bound to err.message on a 4xx is flagged (true positive)', () => {
        const src = [
            'try {',
            '  event = stripe.webhooks.constructEvent(body, sig, secret);',
            '} catch (err) {',
            "  const message = err instanceof Error ? err.message : 'Unknown';",
            '  return reply.status(400).send({ error: `Webhook Error: ${message}` });',
            '}',
        ].join('\n');
        // The offending line is the .send( line (5), not the binding line (4).
        expect(leakLines(src)).toEqual([5]);
    });

    // ── Negative: the SAFE validation-gated ternary (global handler form) ───
    test('error.validation ? error.message : "Bad request" is NOT flagged (true negative)', () => {
        const src = [
            'fastify.setErrorHandler((error, request, reply) => {',
            "  logger.error({ err: error }, 'Unhandled');",
            '  if (error.statusCode && error.statusCode < 500) {',
            '    return reply.code(error.statusCode).send({',
            '      statusCode: error.statusCode,',
            "      error: error.name ?? 'Bad Request',",
            "      message: error.validation ? error.message : 'Bad request',",
            '    });',
            '  }',
            '  return reply.code(500).send({',
            '    statusCode: 500,',
            "    error: 'Internal Server Error',",
            "    message: 'Internal server error',",
            '  });',
            '});',
        ].join('\n');
        expect(leakLines(src)).toEqual([]);
    });

    // ── Negative: a SAFE generic 5xx body whose window mentions err.message ──
    // This is the dominant real-world shape across the tree: the catch binds or
    // branches on err.message, but the body is a fixed generic string. A naive
    // "window contains .send + err.message + status>=400" detector would flood
    // these as false positives — this test pins that they DON'T.
    test('generic 5xx body with err.message only in the catch header is NOT flagged (true negative)', () => {
        const src = [
            'try {',
            '  return reply.send(await svc.doThing(userId));',
            '} catch (err) {',
            '  request.log.error(err);',
            "  return reply.code(500).send({ error: 'An unexpected error occurred' });",
            '}',
        ].join('\n');
        expect(leakLines(src)).toEqual([]);
    });

    test('generic 4xx body with err.message only in an if-branch is NOT flagged (true negative)', () => {
        const src = [
            'catch (err) {',
            "  if (typeof err?.message === 'string' && err.message.includes('No active fast')) {",
            "    return reply.code(400).send({ error: 'No active fast found' });",
            '  }',
            "  return reply.code(500).send({ error: 'An unexpected error occurred' });",
            '}',
        ].join('\n');
        expect(leakLines(src)).toEqual([]);
    });

    // ── Negative: object-KEY `message:` collides with a bound `message` ─────
    // `const message = ... err.message` binds `message`; a later body with a
    // `message: '<literal>'` KEY must NOT be read as echoing the bound value.
    // Only `${message}` interpolation is the leak vector.
    test('object key message: with a literal value is NOT flagged despite a bound `message` (true negative)', () => {
        const src = [
            "const message = err instanceof Error ? err.message : 'Unknown error';",
            "logger.error({ err: message }, '[stripe] checkout failed');",
            "return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'An unexpected error occurred' });",
        ].join('\n');
        expect(leakLines(src)).toEqual([]);
    });

    // ── Negative: a 2xx response that echoes err.message is NOT an error body ─
    test('2xx send echoing err.message is NOT flagged — only 4xx/5xx bodies matter (true negative)', () => {
        const src = `return reply.status(200).send({ note: err.message });`;
        expect(leakLines(src)).toEqual([]);
    });

    // ── Positive: a BARE reply.send (no status) inside a catch, direct echo ──
    test('bare reply.send({ error: err.message }) inside a catch is flagged via the catch heuristic', () => {
        const src = [
            'try {',
            '  z();',
            '} catch (err) {',
            '  return reply.send({ error: err.message });',
            '}',
        ].join('\n');
        expect(leakLines(src)).toEqual([4]);
    });
});

describe('check-error-handler-registered — pure helpers', () => {
    test('collectErrorBoundIdentifiers picks up only error-tainted const/let/var', () => {
        const src = [
            "const message = err instanceof Error ? err.message : 'x';",
            'let trace = error.stack;',
            'const safe = request.body;',
            'const userId = user.id;',
        ].join('\n');
        const ids = collectErrorBoundIdentifiers(src);
        expect(ids.has('message')).toBe(true);
        expect(ids.has('trace')).toBe(true);
        expect(ids.has('safe')).toBe(false);
        expect(ids.has('userId')).toBe(false);
    });

    test('extractBalancedArg returns the full balanced argument across nested parens and templates', () => {
        const src = 'reply.send({ error: `a ${fn(x)} b`, nested: g(h(i)) })';
        const open = src.indexOf('(');
        expect(extractBalancedArg(src, open)).toBe('{ error: `a ${fn(x)} b`, nested: g(h(i)) }');
    });

    test('extractBalancedArg returns null on unbalanced parens', () => {
        const src = 'reply.send({ error: oops ';
        const open = src.indexOf('(');
        expect(extractBalancedArg(src, open)).toBe(null);
    });

    test('maxStatusInChain reads the numeric status from a .code()/.status() chain', () => {
        expect(maxStatusInChain('return reply.code(500)')).toBe(500);
        expect(maxStatusInChain('reply.status(404).header(...)')).toBe(404);
        expect(maxStatusInChain('reply.code(200)')).toBe(200);
        expect(maxStatusInChain('reply')).toBe(null);
    });

    test('bodyEchoesRawError: direct token yes, safe ternary no, interpolation yes', () => {
        expect(bodyEchoesRawError('{ error: err.message }', new Set())).toBe(true);
        expect(
            bodyEchoesRawError("{ message: error.validation ? error.message : 'Bad request' }", new Set()),
        ).toBe(false);
        expect(bodyEchoesRawError('{ error: `oops: ${message}` }', new Set(['message']))).toBe(true);
        // A bound id used only as an object KEY (not interpolated) is safe.
        expect(bodyEchoesRawError("{ message: 'fixed' }", new Set(['message']))).toBe(false);
    });

    test('RAW_ERROR_TOKEN_RE matches the four raw forms and not innocent lookalikes', () => {
        expect(RAW_ERROR_TOKEN_RE.test('err.message')).toBe(true);
        expect(RAW_ERROR_TOKEN_RE.test('error.message')).toBe(true);
        expect(RAW_ERROR_TOKEN_RE.test('err.stack')).toBe(true);
        expect(RAW_ERROR_TOKEN_RE.test('error.stack')).toBe(true);
        // Innocent lookalikes must not match.
        expect(RAW_ERROR_TOKEN_RE.test('error.messageKey')).toBe(false);
        expect(RAW_ERROR_TOKEN_RE.test('errors.message')).toBe(false);
        expect(RAW_ERROR_TOKEN_RE.test('error.statusCode')).toBe(false);
    });

    test('isInsideCatch is true inside a catch body, false in a plain block', () => {
        const inCatch = 'try { a(); } catch (err) { HERE }';
        expect(isInsideCatch(inCatch, inCatch.indexOf('HERE'))).toBe(true);
        const plain = 'if (cond) { HERE }';
        expect(isInsideCatch(plain, plain.indexOf('HERE'))).toBe(false);
    });
});
