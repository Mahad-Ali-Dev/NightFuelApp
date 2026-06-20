/**
 * Unit test — scripts/check-demo-urls-sample.js contract.
 *
 * check-demo-urls-sample.js is the INFORMATIONAL (always-non-blocking) sibling of
 * the standalone, deliberately-HARD scripts/check-demo-urls.js. It is wired into
 * scripts/gate.js as a reporting step (runReportingStep) and therefore must NEVER
 * fail the gate: it ALWAYS exits 0, in EVERY path:
 *
 *   (1) success           — every sampled URL returns HTTP 200 → exit 0;
 *   (2) non-200 found      — a reachable dead URL is printed as a NOTE → exit 0;
 *   (3) offline (neterr)   — probeUrl returns a network error → "skipping" → 0;
 *   (4) missing source     — curatedDemos.ts cannot be read → note → exit 0;
 *   (5) no URLs found      — the parser returns [] → note → exit 0.
 *
 * It reuses the dependency-free helpers (extractDemoUrls / sampleUrls / probeUrl /
 * isNetworkUnavailable + CURATED_DEMOS_TS) from check-demo-urls.js, so we also pin
 * the parser/sampler against the REAL curatedDemos.ts here.
 *
 * Plain JS (not TS) on purpose: the scripts under test are plain JS, so the test
 * runs under the gate's harness-self-test jest pass (`--transform '{}'`, no
 * babel/ts-jest). We drive main() WITHOUT spawning a child process: we
 * `jest.doMock` the sibling module so the freshly-required script's main() closure
 * uses our stubbed probeUrl, spy on fs.readFileSync to control the source, and spy
 * on process.exit (throwing a sentinel) to capture the exit code. Importing the
 * module is safe — its CLI/main() side-effect only runs under
 * `require.main === module`.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-demo-urls-sample.test.js`
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SAMPLE_PATH = path.resolve(__dirname, '..', 'check-demo-urls-sample.js');
const SIBLING_PATH = path.resolve(__dirname, '..', 'check-demo-urls.js');

// ─────────────────────────────────────────────────────────────────────────────
// (A) Parser / sampler / classifier — exercised against the SHARED helpers (no
// network, no child process). These are the same dependency-free helpers
// check-demo-urls-sample.js reuses from check-demo-urls.js.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-demo-urls-sample — reused helpers (parser / sampler / classifier)', () => {
    const { __test } = require(SAMPLE_PATH);

    test('exposes the reused internals on module.exports.__test', () => {
        expect(typeof __test.main).toBe('function');
        expect(typeof __test.extractDemoUrls).toBe('function');
        expect(typeof __test.sampleUrls).toBe('function');
        expect(typeof __test.probeUrl).toBe('function');
        expect(typeof __test.isNetworkUnavailable).toBe('function');
        expect(typeof __test.CURATED_DEMOS_TS).toBe('string');
        expect(typeof __test.SAMPLE_SIZE).toBe('number');
        expect(__test.SAMPLE_SIZE).toBeGreaterThan(0);
    });

    test('extractDemoUrls pulls FEDB frame URLs + YouTube URLs from a small source', () => {
        const source = [
            "const FEDB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';",
            'const FEDB_BACKED_SLUGS: Readonly<Record<string, string>> = {',
            "  'Barbell Squat': 'Barbell_Squat',",
            '};',
            "const X = { 'A': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=abc123', verified: true } };",
        ].join('\n');
        const urls = __test.extractDemoUrls(source);
        expect(urls).toContain(
            'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg',
        );
        expect(urls).toContain(
            'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/1.jpg',
        );
        expect(urls).toContain('https://www.youtube.com/watch?v=abc123');
        // The bare FEDB_BASE directory literal is NOT a checkable URL (no frame).
        expect(urls).not.toContain('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises');
        // De-duplicated.
        expect(new Set(urls).size).toBe(urls.length);
    });

    test('sampleUrls takes the first N in source order and never exceeds N', () => {
        const urls = ['a', 'b', 'c', 'd', 'e'];
        expect(__test.sampleUrls(urls, 3)).toEqual(['a', 'b', 'c']);
        expect(__test.sampleUrls(urls, 0)).toEqual([]);
        expect(__test.sampleUrls(urls, 99)).toEqual(urls);
        // A negative size clamps to 0 (mirrors check-demo-urls.js).
        expect(__test.sampleUrls(urls, -2)).toEqual([]);
    });

    test('isNetworkUnavailable classifies neterr codes vs a real HTTP status', () => {
        expect(__test.isNetworkUnavailable({ kind: 'neterr', code: 'ENOTFOUND' })).toBe(true);
        expect(__test.isNetworkUnavailable({ kind: 'neterr', code: 'ETIMEDOUT' })).toBe(true);
        expect(__test.isNetworkUnavailable({ kind: 'status', status: 200 })).toBe(false);
        expect(__test.isNetworkUnavailable({ kind: 'status', status: 404 })).toBe(false);
    });

    test('parses the REAL curatedDemos.ts into a non-trivial, all-HTTPS sample', () => {
        const source = fs.readFileSync(__test.CURATED_DEMOS_TS, 'utf8');
        const all = __test.extractDemoUrls(source);
        expect(all.length).toBeGreaterThan(50);
        const sample = __test.sampleUrls(all, __test.SAMPLE_SIZE);
        expect(sample.length).toBe(Math.min(__test.SAMPLE_SIZE, all.length));
        for (const u of sample) {
            expect(u.startsWith('https://')).toBe(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) main() ALWAYS exits 0 — driven via stubbed helpers + fs/process.exit spies.
//
// We jest.doMock the sibling (check-demo-urls.js) so the freshly-required sample
// script's main() closure uses our stubbed extractDemoUrls/sampleUrls/probeUrl,
// then drive each path: success / non-200-found / offline / missing-source /
// no-urls. process.exit is spied to THROW `EXIT:<code>` so we can both halt main()
// at the exit point and assert the code.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-demo-urls-sample — main() exits 0 in every path', () => {
    /**
     * Load a FRESH copy of the sample script with the sibling mocked, and run its
     * main() with fs.readFileSync + process.exit + console.log spied.
     *
     * @param {object} opts
     * @param {string[]} opts.urls        URLs extractDemoUrls should return.
     * @param {(u:string)=>object} opts.probe  probeUrl stub (returns a probe result).
     * @param {Error} [opts.readError]    if set, fs.readFileSync THROWS this (missing source).
     * @returns {{ exitCode:number|undefined, probed:string[], logs:string[] }}
     */
    async function runMain({ urls = [], probe, readError } = {}) {
        jest.resetModules();

        const probed = [];
        jest.doMock(SIBLING_PATH, () => ({
            __test: {
                extractDemoUrls: () => urls.slice(),
                // Real sampler semantics: first N in order.
                sampleUrls: (u, n) => (Array.isArray(u) ? u.slice(0, Math.max(0, n)) : []),
                probeUrl: (u) => {
                    probed.push(u);
                    return Promise.resolve(probe ? probe(u) : { kind: 'status', status: 200 });
                },
                isNetworkUnavailable: (r) => !!(r && r.kind === 'neterr'),
                CURATED_DEMOS_TS: '/virtual/curatedDemos.ts',
            },
        }));

        const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
            if (readError) throw readError;
            return 'virtual curatedDemos source';
        });
        const logs = [];
        const logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
            logs.push(args.join(' '));
        });
        // The script frames everything as a note on stdout, but guard stderr too.
        const errSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
            logs.push(args.join(' '));
        });
        let exitCode;
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
            exitCode = code;
            throw new Error(`__EXIT__:${code}`);
        });

        // eslint-disable-next-line global-require
        const { __test } = require(SAMPLE_PATH);
        try {
            await __test.main();
        } catch (err) {
            // Only the process.exit sentinel is expected; rethrow anything else.
            if (!/^__EXIT__:/.test(String(err && err.message))) throw err;
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
            logSpy.mockRestore();
            readSpy.mockRestore();
            jest.dontMock(SIBLING_PATH);
            jest.resetModules();
        }

        return { exitCode, probed, logs };
    }

    test('success — all sampled URLs return 200 → exit 0, prints OK', async () => {
        const { exitCode, probed, logs } = await runMain({
            urls: ['https://x.test/a', 'https://x.test/b', 'https://x.test/c'],
            probe: () => ({ kind: 'status', status: 200 }),
        });
        expect(exitCode).toBe(0);
        // Every URL was probed (none short-circuited).
        expect(probed.length).toBe(3);
        expect(logs.join('\n')).toMatch(/OK — all 3 sampled demo URL\(s\) returned HTTP 200/);
    });

    test('non-200 found — a reachable dead URL is a NOTE only → still exit 0', async () => {
        const dead = 'https://x.test/dead';
        const { exitCode, logs } = await runMain({
            urls: ['https://x.test/ok', dead],
            probe: (u) => (u === dead ? { kind: 'status', status: 404 } : { kind: 'status', status: 200 }),
        });
        // The single hard-failure mode of check-demo-urls.js is DOWNGRADED to a
        // note here: a dead URL must NOT change the exit code.
        expect(exitCode).toBe(0);
        const text = logs.join('\n');
        expect(text).toMatch(/NOTE — 1 of 2 sampled demo URL\(s\) did not return HTTP 200/);
        expect(text).toMatch(/note \[404\] https:\/\/x\.test\/dead/);
    });

    test('offline — a network error makes the run a no-op skip → exit 0', async () => {
        const { exitCode, probed, logs } = await runMain({
            urls: ['https://x.test/a', 'https://x.test/b', 'https://x.test/c'],
            probe: () => ({ kind: 'neterr', code: 'ENOTFOUND' }),
        });
        expect(exitCode).toBe(0);
        // The first neterr short-circuits the loop — we stop probing.
        expect(probed.length).toBe(1);
        expect(logs.join('\n')).toMatch(/network unavailable, skipping/);
    });

    test('offline — a non-classified neterr (unknown code) is also treated as skip → exit 0', async () => {
        const { exitCode, logs } = await runMain({
            urls: ['https://x.test/a'],
            probe: () => ({ kind: 'neterr', code: 'EUNKNOWN' }),
        });
        expect(exitCode).toBe(0);
        expect(logs.join('\n')).toMatch(/network unavailable, skipping/);
    });

    test('missing source — fs.readFileSync throws → note → exit 0 (no probing)', async () => {
        const enoent = new Error('ENOENT: no such file');
        const { exitCode, probed, logs } = await runMain({
            urls: ['https://x.test/a'],
            readError: enoent,
        });
        expect(exitCode).toBe(0);
        expect(probed.length).toBe(0);
        expect(logs.join('\n')).toMatch(/cannot read .*curatedDemos\.ts/);
        expect(logs.join('\n')).toMatch(/informational, non-blocking/);
    });

    test('no URLs found — empty parse → note → exit 0 (no probing)', async () => {
        const { exitCode, probed, logs } = await runMain({ urls: [] });
        expect(exitCode).toBe(0);
        expect(probed.length).toBe(0);
        expect(logs.join('\n')).toMatch(/no demo URLs found to sample/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (C) Exit-0-by-construction — structural guard, mirroring check-aurora-coverage:
// the source must contain a process.exit(0) and NEVER a non-zero process.exit.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-demo-urls-sample — exit-0 by construction (source-level)', () => {
    const source = fs.readFileSync(SAMPLE_PATH, 'utf8');

    test('the script never calls process.exit with a non-zero code', () => {
        expect(/process\.exit\(\s*0\s*\)/.test(source)).toBe(true);
        expect(/process\.exit\(\s*[1-9]/.test(source)).toBe(false);
        const calls = source.match(/process\.exit\([^)]*\)/g) || [];
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call.replace(/\s+/g, '')).toBe('process.exit(0)');
        }
    });

    test('running the script as a child process exits 0', () => {
        // End-to-end belt-and-suspenders: a real spawn must also be 0. Whether the
        // CI box is online or offline, the contract is the same — exit 0.
        const { spawnSync } = require('child_process');
        const res = spawnSync(process.execPath, [SAMPLE_PATH], { encoding: 'utf8' });
        expect(res.status).toBe(0);
        const out = `${res.stdout || ''}${res.stderr || ''}`;
        expect(out).toMatch(/check-demo-urls-sample:/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (D) Gate wiring — the sampled rot check is a SEPARATE informational reporting
// step (buildReportingSteps), NOT part of the hard buildSteps() array, so the
// gate-steps meta self-test stays green.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-demo-urls-sample — gate.js wiring (informational, separate from hard steps)', () => {
    const { __test: gateTest } = require(path.resolve(__dirname, '..', 'gate.js'));
    const { buildSteps, buildReportingSteps } = gateTest;

    test('buildReportingSteps() includes the demo-urls-sample report running the script', () => {
        const reports = buildReportingSteps();
        expect(Array.isArray(reports)).toBe(true);
        const step = reports.find((s) => /demo-urls-sample/.test(s.name));
        expect(step).toBeDefined();
        // Mirrors the aurora-coverage entry: name carries "(informational)".
        expect(step.name).toMatch(/informational/);
        const last = step.args[step.args.length - 1];
        expect(last.split(/[\\/]/).join('/')).toMatch(/scripts\/check-demo-urls-sample\.js$/);
        // It carries NO `file:` field (it lives outside buildSteps, but assert
        // anyway so it can never grow one and confuse the meta self-test logic).
        expect(step.file).toBeUndefined();
    });

    test('the sampled rot check is NOT in the hard buildSteps() array', () => {
        const hardNames = buildSteps().map((s) => s.name);
        expect(hardNames.some((n) => /demo-urls-sample/.test(n))).toBe(false);
        // And no hard step references the sample script (which would make the
        // gate-steps meta self-test require it to be a HARD on-disk step).
        const refsSample = buildSteps().some(
            (s) =>
                Array.isArray(s.args) &&
                s.args.some((a) => typeof a === 'string' && a.endsWith('check-demo-urls-sample.js')),
        );
        expect(refsSample).toBe(false);
    });

    test('the HARD scripts/check-demo-urls.js is NOT wired into the gate (neither hard nor reporting)', () => {
        // This item must NEVER wire in the hard probe — only the sampled sibling.
        const inHard = buildSteps().some(
            (s) => Array.isArray(s.args) && s.args.some((a) => typeof a === 'string' && /[\\/]check-demo-urls\.js$/.test(a)),
        );
        const inReports = buildReportingSteps().some(
            (s) => Array.isArray(s.args) && s.args.some((a) => typeof a === 'string' && /[\\/]check-demo-urls\.js$/.test(a)),
        );
        expect(inHard).toBe(false);
        expect(inReports).toBe(false);
    });
});
