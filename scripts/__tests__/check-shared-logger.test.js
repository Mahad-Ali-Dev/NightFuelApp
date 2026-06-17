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
 * It also locks the two ROBUSTNESS hardenings:
 *   (1) a `pino(` inside a `// …` / `/* … *​/` comment or a string/template
 *       literal is NOT flagged (comment/string-stripping), while a real-code
 *       `pino(` still IS; and
 *   (2) a `createLogger(...) as <hand-rolled pino logger>` cast IS flagged,
 *       while the legitimate dep-nesting reconciliation casts —
 *       `as unknown as Logger` (the live subscription-service/src/index.ts:62
 *       shape), `as Logger`, `as any`, `as unknown` — are NOT. This keeps the
 *       HARD gate green on the current tree while closing the cast-evasion hole.
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
    stripCommentsAndStrings,
    castEvadesSharedLogger,
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

// ─────────────────────────────────────────────────────────────────────────────
// ROBUSTNESS (1): a `pino(` inside a comment or a string/template literal must
// NOT be flagged, while a real-code `pino(` still IS. Locks the
// stripCommentsAndStrings tolerant-tokenizer pass.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-shared-logger — fileConstructsRawPino: comment/string false-match immunity', () => {
    test('a `pino(` inside a // line comment is NOT flagged', () => {
        const src = [
            "import { createLogger } from '@nightfuel/config';",
            '// legacy: const rootLogger = pino({ level: LOG_LEVEL });',
            "const logger = createLogger('svc');",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('a `pino(` inside a /* block comment */ is NOT flagged', () => {
        const src = [
            "import { createLogger } from '@nightfuel/config';",
            '/*',
            ' * Historically this service did `const log = pino({ ... })`.',
            ' * It now uses the shared factory below.',
            ' */',
            "const logger = createLogger('svc');",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('a `pino(` inside a string literal is NOT flagged', () => {
        const src = [
            "import { createLogger } from '@nightfuel/config';",
            "const help = 'do not call pino({ level }) directly — use createLogger';",
            "const logger = createLogger('svc');",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('a `pino(` inside a template literal (no interpolation) is NOT flagged', () => {
        const src = [
            "import { createLogger } from '@nightfuel/config';",
            'const doc = `example: pino({ level: "info" })`;',
            "const logger = createLogger('svc');",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('a real-code `pino(` sitting alongside a comment-mentioned pino( IS still flagged', () => {
        // The comment `pino(` is stripped; the real one on the next line is not.
        const src = [
            "import pino from 'pino';",
            '// note: pino({ ... }) is forbidden',
            'const rootLogger = pino({ level: LOG_LEVEL });',
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(true);
    });

    test('a real-code `pino(` inside a template `${…}` expression IS flagged (real code, not string body)', () => {
        // The `${...}` body is real code, so a constructor call there is caught.
        const src = [
            "import pino from 'pino';",
            'const x = `${pino({ level: "info" })}`;',
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(true);
    });
});

describe('check-shared-logger — stripCommentsAndStrings: structure-preserving blanking', () => {
    test('preserves length and newline positions exactly', () => {
        const src = [
            "const a = 1; // pino( comment",
            "const b = 'pino(string)';",
            'const c = 2;',
        ].join('\n');
        const out = stripCommentsAndStrings(src);
        expect(out.length).toBe(src.length);
        // Same number of lines (newlines preserved 1:1).
        expect(out.split('\n').length).toBe(src.split('\n').length);
        // Real code outside comments/strings is untouched.
        expect(out).toContain('const a = 1;');
        expect(out).toContain('const c = 2;');
        // The `pino(` text inside the comment and the string is gone.
        expect(out.includes('pino(')).toBe(false);
    });

    test('keeps real-code tokens but blanks comment/string contents', () => {
        const src = "const logger = pino(); // build it";
        const out = stripCommentsAndStrings(src);
        // The real `pino()` call survives…
        expect(out).toContain('pino()');
        // …but the comment text does not.
        expect(out.includes('build it')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROBUSTNESS (2): the `createLogger(...) as <X>` cast-evasion detector. The
// documented dep-nesting reconciliation casts stay clean; a cast that
// re-introduces/hides a hand-rolled pino logger is flagged.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-shared-logger — castEvadesSharedLogger: legitimate casts (true negatives)', () => {
    test('the live subscription-service/src/index.ts:62 `as unknown as Logger` shape is NOT flagged', () => {
        const src = [
            "import type { Logger } from 'pino';",
            "import { createLogger } from '@nightfuel/config';",
            "const rootLogger = createLogger('subscription-service') as unknown as Logger;",
        ].join('\n');
        expect(castEvadesSharedLogger(stripCommentsAndStrings(src))).toBe(false);
        // …and the whole-file detector agrees (gate-safety on the real shape).
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('`createLogger(...) as Logger` (pino Logger type, single cast) is NOT flagged', () => {
        const src = [
            "import type { Logger } from 'pino';",
            "import { createLogger } from '@nightfuel/config';",
            "const logger = createLogger('svc') as Logger;",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('`createLogger(...) as pino.Logger` (namespace-qualified Logger type) is NOT flagged', () => {
        const src = [
            "import * as pino from 'pino';",
            "import { createLogger } from '@nightfuel/config';",
            "const logger = createLogger('svc') as pino.Logger;",
        ].join('\n');
        expect(fileConstructsRawPino(src)).toBe(false);
    });

    test('the live `as any` reconciliation casts (plan-service / notification-service) are NOT flagged', () => {
        // plan-service/src/worker.ts:4 and notification-service/src/index.ts:34.
        const planWorker = [
            "import { createLogger } from '@nightfuel/config';",
            "const logger = createLogger('plan-service:worker') as any;",
        ].join('\n');
        const notif = [
            "import { createLogger } from '@nightfuel/config';",
            "const logger = createLogger('notification-service') as any;",
        ].join('\n');
        expect(fileConstructsRawPino(planWorker)).toBe(false);
        expect(fileConstructsRawPino(notif)).toBe(false);
    });

    test('`createLogger(...) as unknown` (single unknown cast) is NOT flagged', () => {
        const src = "const logger = createLogger('svc') as unknown;";
        expect(castEvadesSharedLogger(stripCommentsAndStrings(src))).toBe(false);
    });

    test('a bare `createLogger(...)` with no cast at all is NOT flagged', () => {
        const src = "const logger = createLogger('svc');";
        expect(fileConstructsRawPino(src)).toBe(false);
    });
});

describe('check-shared-logger — castEvadesSharedLogger: cast evasions (true positives)', () => {
    test('`createLogger(...) as <hand-rolled pino logger>` IS flagged', () => {
        const src = [
            "import { createLogger } from '@nightfuel/config';",
            '// SomethingHidingRawPino is a locally-declared pino-shaped logger type',
            "const logger = createLogger('svc') as SomethingHidingRawPino;",
        ].join('\n');
        expect(castEvadesSharedLogger(stripCommentsAndStrings(src))).toBe(true);
        expect(fileConstructsRawPino(src)).toBe(true);
    });

    test('`createLogger(...) as unknown as <hand-rolled pino logger>` IS flagged (final segment wins)', () => {
        const src = "const logger = createLogger('svc') as unknown as RawPinoLogger;";
        expect(fileConstructsRawPino(src)).toBe(true);
    });

    test('a `createLogger(...) as <evasion>` written INSIDE a string is NOT flagged (stripped first)', () => {
        // Defensive: the cast detector also runs over the stripped text, so a
        // cast mentioned in a string/comment cannot itself trip the guard.
        const src = "const doc = \"const l = createLogger('x') as RawPinoLogger;\";";
        expect(fileConstructsRawPino(src)).toBe(false);
    });
});
