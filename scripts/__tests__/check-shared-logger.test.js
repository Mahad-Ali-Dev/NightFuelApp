/**
 * Unit test — scripts/check-shared-logger.js contract.
 *
 * The guard (scripts/check-shared-logger.js) enforces one contract over each
 * services/<svc>/src/ tree:
 *
 *   NO RAW PINO CONSTRUCTION — no service src file constructs a pino logger
 *   itself; every service obtains its logger from the shared `createLogger`
 *   in @nightfuel/config. A file that calls `pino(...)` — either via the
 *   common `import pino from 'pino'` default binding or a renamed default
 *   import used as a constructor — is an offender. The SAFE shape that must
 *   NEVER be flagged is a TYPE-ONLY / named import of pino's `Logger` type
 *   (`import { Logger } from 'pino'` / `import type { Logger } from 'pino'`),
 *   which the shared @nightfuel/config server.ts and several service files use
 *   purely to TYPE a logger parameter.
 *
 * This suite locks the detector in on BOTH branches. If anyone narrows it so a
 * real `const logger = pino({ ... })` slips past — or widens it so it
 * false-positives on a type-only `import { Logger } from 'pino'` — these
 * assertions go red BEFORE the change reaches CI.
 *
 * Plain JS (not TS) on purpose: the script under test is plain JS too, so the
 * test stays close to the production surface and runs without the babel/ts-jest
 * transform stack — it runs under the gate's harness-self-test jest pass
 * (`--transform '{}'`). We import the pure helpers via the script's
 * `module.exports.__test` back-door. Importing the module is safe: main() only
 * runs under the require.main === module guard inside the script.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-shared-logger.test.js`
 */

'use strict';

const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'check-shared-logger.js'));
const {
    PINO_DEFAULT_IMPORT_RE,
    BARE_PINO_CALL_RE,
    fileConstructsRawPino,
} = __test;

describe('check-shared-logger — fileConstructsRawPino: raw-pino offenders (true positives)', () => {
    // ── Branch (a) + (b): the literal subscription-service/src/index.ts shape ─
    // `import pino from 'pino'` (default import) followed by a `pino({...})`
    // constructor call.
    test('default `import pino from "pino"` + `pino({...})` constructor is flagged', () => {
        const src = [
            "import pino from 'pino';",
            'const rootLogger = pino({',
            "  level: LOG_LEVEL,",
            "  transport: process.env['NODE_ENV'] !== 'production'",
            "    ? { target: 'pino-pretty', options: { colorize: true } }",
            '    : undefined,',
            '});',
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(true);
    });

    // ── Branch (a): a BARE `pino(` call with no default-import line at all ───
    test('a bare `pino(` constructor call is flagged on its own', () => {
        const src = "const logger = pino({ level: 'info' });";
        expect(fileConstructsRawPino(src)).toBe(true);
        expect(BARE_PINO_CALL_RE.test(src)).toBe(true);
    });

    // ── Branch (b): a RENAMED default import used as a constructor ───────────
    // The default binding is `makePino`, not `pino`, so branch (a)'s bare
    // `pino(` never matches — only the renamed-default-import path catches it.
    test('renamed default import `import makePino from "pino"` + `makePino(...)` is flagged', () => {
        const src = [
            "import makePino from 'pino';",
            "const logger = makePino({ level: 'info' });",
        ].join('\n');
        // Sanity: the bare `pino(` path does NOT fire here (binding is renamed).
        expect(BARE_PINO_CALL_RE.test(src)).toBe(false);
        // …but the renamed-default-import-+-call path does.
        expect(fileConstructsRawPino(src)).toBe(true);
    });
});

describe('check-shared-logger — fileConstructsRawPino: safe shapes (true negatives)', () => {
    // ── The createLogger fixture — the post-migration shape every service uses ─
    test('importing createLogger from @nightfuel/config and calling it is NOT flagged', () => {
        const src = [
            "import { createLogger } from '@nightfuel/config';",
            "const logger = createLogger('subscription-service');",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    // ── Type-only named import of pino's Logger TYPE — the @nightfuel/config ──
    // server.ts / subscription.service.ts / stripe.ts / events.ts shape. No
    // constructor, so it must never be flagged.
    test('`import type { Logger } from "pino"` (type-only) is NOT flagged', () => {
        const src = [
            "import type { Logger } from 'pino';",
            'export function bootstrap(logger: Logger) {',
            '  logger.info("up");',
            '}',
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('`import { Logger } from "pino"` (named type import, no `type` keyword) is NOT flagged', () => {
        const src = [
            "import { Logger } from 'pino';",
            'export interface BootstrapOptions { logger: Logger; }',
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    // ── A file that doesn't touch pino at all is obviously clean. ────────────
    test('a file that never references pino is NOT flagged', () => {
        const src = [
            "import Fastify from 'fastify';",
            'const app = Fastify();',
            "app.get('/v1/health', async () => ({ ok: true }));",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    // ── `pino-pretty` (a transport target string) and `pino.stdTimeFunctions` ─
    // (a member access) are not constructor calls and must not match the bare
    // `pino(` detector.
    test('`pino-pretty` string and `pino.stdTimeFunctions` member access are NOT bare-pino calls', () => {
        expect(BARE_PINO_CALL_RE.test("target: 'pino-pretty'")).toBe(false);
        expect(BARE_PINO_CALL_RE.test('timestamp: pino.stdTimeFunctions.isoTime')).toBe(false);
    });
});

describe('check-shared-logger — regex shapes', () => {
    test('PINO_DEFAULT_IMPORT_RE captures the default binding name, not named clauses', () => {
        expect(PINO_DEFAULT_IMPORT_RE.exec("import pino from 'pino';")[1]).toBe('pino');
        expect(PINO_DEFAULT_IMPORT_RE.exec('import makePino from "pino";')[1]).toBe('makePino');
        // A named import has no default binding — no match.
        expect(PINO_DEFAULT_IMPORT_RE.test("import { Logger } from 'pino';")).toBe(false);
        // A type-only default import binds a type, not a callable — no match.
        expect(PINO_DEFAULT_IMPORT_RE.test("import type Logger from 'pino';")).toBe(false);
        // A different module named *-pino must not be mistaken for `pino`.
        expect(PINO_DEFAULT_IMPORT_RE.test("import x from 'pino-http';")).toBe(false);
    });
});
