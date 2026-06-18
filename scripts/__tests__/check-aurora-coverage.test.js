/**
 * Unit test — scripts/check-aurora-coverage.js contract.
 *
 * check-aurora-coverage.js is an INFORMATIONAL (non-blocking) reporting tool: it
 * walks the mobile app-screen tree (clients/mobile/app) and reports how many
 * screens have adopted each Aurora primitive — GlassCard, CtaButton, and the
 * expo-status-bar StatusBar — as counts AND percentages, then ALWAYS exits 0. It
 * is NOT a guard: its numbers must never fail the gate.
 *
 * This suite locks:
 *   (1) the per-file detectors — a `<GlassCard` tag OR a GlassCard import from
 *       '@/components/ui' counts as GlassCard; a `<CtaButton` tag counts as
 *       CtaButton; BOTH an expo-status-bar import AND a `<StatusBar` tag count as
 *       StatusBar — and their comment/string false-match immunity;
 *   (2) computeCoverage() returns correct counts AND percentages on small
 *       in-memory fixtures (including the empty-tree / divide-by-zero case);
 *   (3) the script's main path is exit-0 BY CONSTRUCTION (main() calls
 *       process.exit(0) unconditionally — there is no non-zero exit anywhere);
 *   (4) the gate wiring: the coverage report is a SEPARATE informational step
 *       (buildReportingSteps), NOT part of the hard buildSteps() array, so the
 *       gate-steps meta self-test stays green.
 *
 * Plain JS (not TS) on purpose: the scripts under test are plain JS too, so the
 * test runs without the babel/ts-jest transform stack — under the gate's
 * harness-self-test jest pass (`--transform '{}'`). We import the pure helpers
 * via the script's `module.exports.__test` back-door. Importing the module is
 * safe: its main()/CLI only runs under the require.main === module guard.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-aurora-coverage.test.js`
 */

'use strict';

const fs = require('fs');
const path = require('path');

const COVERAGE_PATH = path.resolve(__dirname, '..', 'check-aurora-coverage.js');
const { __test } = require(COVERAGE_PATH);
const {
    detectScreen,
    detectGlassCard,
    detectCtaButton,
    detectStatusBar,
    importsGlassCardFromUi,
    isScreenFile,
    computeCoverage,
    pct,
    formatReport,
    stripCommentsAndStrings,
    stripComments,
    NON_SCREEN_BASENAMES,
} = __test;

const { __test: gateTest } = require(path.resolve(__dirname, '..', 'gate.js'));
const { buildSteps, buildReportingSteps } = gateTest;

// ─────────────────────────────────────────────────────────────────────────────
// Per-file detectors — GlassCard (tag OR @/components/ui import).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — GlassCard detection', () => {
    test('a `<GlassCard` tag counts', () => {
        const src = 'export default function S() { return <GlassCard><Text>x</Text></GlassCard>; }';
        expect(detectScreen(src).glassCard).toBe(true);
    });

    test('a GlassCard import from \'@/components/ui\' counts even with no visible tag', () => {
        const src = [
            "import { Skeleton, GlassCard, CtaButton } from '@/components/ui';",
            'export default function S() { return <Wrapper />; }',
        ].join('\n');
        expect(importsGlassCardFromUi(stripComments(src))).toBe(true);
        expect(detectScreen(src).glassCard).toBe(true);
    });

    test('an import of OTHER ui primitives (no GlassCard) does NOT count', () => {
        const src = [
            "import { Skeleton, EmptyState } from '@/components/ui';",
            'export default function S() { return <Skeleton />; }',
        ].join('\n');
        expect(detectScreen(src).glassCard).toBe(false);
    });

    test('a GlassCard import from a DIFFERENT module does NOT count (must be @/components/ui)', () => {
        const src = "import { GlassCard } from '../local/GlassCard';";
        expect(importsGlassCardFromUi(stripComments(src))).toBe(false);
        expect(detectScreen(src).glassCard).toBe(false);
    });

    test('`GlassCardSkeleton` is not mistaken for a GlassCard tag or specifier (boundary)', () => {
        const tagSrc = '<GlassCardSkeleton />';
        expect(detectScreen(tagSrc).glassCard).toBe(false);
        const impSrc = "import { GlassCardSkeleton } from '@/components/ui';";
        expect(importsGlassCardFromUi(stripComments(impSrc))).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-file detectors — CtaButton (tag).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — CtaButton detection', () => {
    test('a `<CtaButton` tag counts', () => {
        const src = '<CtaButton label="Save" onPress={onSave} />';
        expect(detectScreen(src).ctaButton).toBe(true);
        expect(detectCtaButton(stripCommentsAndStrings(src))).toBe(true);
    });

    test('no CtaButton tag → not counted', () => {
        const src = '<Button title="x" />';
        expect(detectScreen(src).ctaButton).toBe(false);
    });

    test('`<CtaButtonGroup` is not mistaken for `<CtaButton` (boundary)', () => {
        const src = '<CtaButtonGroup />';
        expect(detectScreen(src).ctaButton).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-file detectors — StatusBar (expo-status-bar import AND a <StatusBar tag).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — StatusBar detection (import AND tag)', () => {
    test('BOTH an expo-status-bar import AND a <StatusBar tag counts', () => {
        const src = [
            "import { StatusBar } from 'expo-status-bar';",
            'export default function S() { return <StatusBar style="light" />; }',
        ].join('\n');
        expect(detectScreen(src).statusBar).toBe(true);
    });

    test('the import alone (no tag) does NOT count', () => {
        const src = "import { StatusBar } from 'expo-status-bar';";
        expect(detectScreen(src).statusBar).toBe(false);
    });

    test('a <StatusBar tag alone (no expo-status-bar import) does NOT count', () => {
        const src = [
            "import { StatusBar } from 'react-native';",
            'export default function S() { return <StatusBar barStyle="light-content" />; }',
        ].join('\n');
        expect(detectScreen(src).statusBar).toBe(false);
    });

    test('a renamed import `{ StatusBar as Bar }` still counts when its tag is present', () => {
        // The module specifier (a string literal) is what we read for the import,
        // so a renamed binding still registers; the paired <StatusBar tag check
        // confirms the bar is rendered.
        const src = [
            "import { StatusBar as Bar } from 'expo-status-bar';",
            'export default function S() { return <StatusBar style="light" />; }',
        ].join('\n');
        expect(detectScreen(src).statusBar).toBe(true);
    });

    test('a double-quoted module specifier is matched too', () => {
        const src = [
            'import { StatusBar } from "expo-status-bar";',
            'export default function S() { return <StatusBar style="light" />; }',
        ].join('\n');
        expect(detectScreen(src).statusBar).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comment / string false-match immunity.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — comment/string false-match immunity', () => {
    test('a `<GlassCard` mentioned only in a // comment does NOT count', () => {
        const src = [
            '// legacy: <GlassCard>…</GlassCard>',
            'export default function S() { return <View />; }',
        ].join('\n');
        expect(detectScreen(src).glassCard).toBe(false);
    });

    test('a `<GlassCard` mentioned only in a block comment does NOT count', () => {
        const src = [
            '/*',
            ' * historically: <GlassCard>…</GlassCard>',
            ' */',
            'export default function S() { return <View />; }',
        ].join('\n');
        expect(detectScreen(src).glassCard).toBe(false);
    });

    test('a `<CtaButton` mentioned only in a string literal does NOT count', () => {
        const src = 'const doc = "<CtaButton label=\\"x\\" />";';
        expect(detectScreen(src).ctaButton).toBe(false);
    });

    test('a COMMENTED-OUT expo-status-bar import does NOT count, even with a real <StatusBar tag', () => {
        // The import line is commented; without an active import the StatusBar
        // detector (import AND tag) must stay false.
        const src = [
            "// import { StatusBar } from 'expo-status-bar';",
            'export default function S() { return <StatusBar style="light" />; }',
        ].join('\n');
        expect(detectScreen(src).statusBar).toBe(false);
    });

    test('a real GlassCard import alongside a comment-mentioned tag still counts', () => {
        const src = [
            '// note: <GlassCard> is the only sanctioned card',
            "import { GlassCard } from '@/components/ui';",
            'export default function S() { return <Wrapper />; }',
        ].join('\n');
        expect(detectScreen(src).glassCard).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// stripComments keeps strings (so import specifiers survive) but blanks comments.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — stripComments view (imports keep their string specifier)', () => {
    test('stripComments preserves a string module specifier but blanks comments; lengths preserved', () => {
        const src = [
            "import { StatusBar } from 'expo-status-bar'; // status bar",
            "const x = '@/components/ui';",
            'const y = 2;',
        ].join('\n');
        const out = stripComments(src);
        expect(out.length).toBe(src.length);
        expect(out.split('\n').length).toBe(src.split('\n').length);
        // String contents (the module specifier) survive…
        expect(out).toContain("'expo-status-bar'");
        expect(out).toContain("'@/components/ui'");
        // …but the trailing line-comment text is gone.
        expect(out.includes('status bar')).toBe(false);
    });

    test('stripCommentsAndStrings (the TAG view) blanks BOTH comments and strings', () => {
        const src = [
            "import { StatusBar } from 'expo-status-bar';",
            'const doc = "<GlassCard>";',
        ].join('\n');
        const out = stripCommentsAndStrings(src);
        expect(out.length).toBe(src.length);
        // The module specifier string is blanked here (which is exactly why
        // imports are detected on the stripComments view instead).
        expect(out.includes('expo-status-bar')).toBe(false);
        expect(out.includes('GlassCard')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// isScreenFile — denominator membership.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — isScreenFile (denominator)', () => {
    test('a regular screen *.tsx counts', () => {
        expect(isScreenFile('index.tsx')).toBe(true);
        expect(isScreenFile('login.tsx')).toBe(true);
        expect(isScreenFile('[postId].tsx')).toBe(true);
    });

    test('_layout.tsx and +not-found.tsx are excluded non-screen files', () => {
        expect(isScreenFile('_layout.tsx')).toBe(false);
        expect(isScreenFile('+not-found.tsx')).toBe(false);
        expect(NON_SCREEN_BASENAMES.has('_layout.tsx')).toBe(true);
        expect(NON_SCREEN_BASENAMES.has('+not-found.tsx')).toBe(true);
    });

    test('a non-tsx file is not a screen', () => {
        expect(isScreenFile('helpers.ts')).toBe(false);
        expect(isScreenFile('README.md')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// pct — percentage rounding + divide-by-zero safety.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — pct', () => {
    test('rounds to nearest whole percent', () => {
        expect(pct(1, 2)).toBe(50);
        expect(pct(2, 3)).toBe(67); // 66.66… → 67
        expect(pct(1, 3)).toBe(33); // 33.33… → 33
        expect(pct(78, 120)).toBe(65);
        expect(pct(0, 10)).toBe(0);
        expect(pct(10, 10)).toBe(100);
    });

    test('total of 0 yields 0 (no NaN / divide-by-zero)', () => {
        expect(pct(0, 0)).toBe(0);
        expect(pct(5, 0)).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCoverage — counts + percentages on in-memory fixtures.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — computeCoverage (in-memory fixtures)', () => {
    test('correct counts and percentages across mixed fixtures', () => {
        const files = [
            // 1: GlassCard tag + StatusBar (import+tag), no CtaButton
            {
                path: 'app/(tabs)/index.tsx',
                source: [
                    "import { StatusBar } from 'expo-status-bar';",
                    "import { GlassCard } from '@/components/ui';",
                    'export default () => (<><StatusBar style="light" /><GlassCard /></>);',
                ].join('\n'),
            },
            // 2: CtaButton tag only
            {
                path: 'app/(auth)/login.tsx',
                source: '<CtaButton label="Sign in" onPress={f} />',
            },
            // 3: GlassCard import (no tag) + CtaButton tag, no StatusBar
            {
                path: 'app/(onboarding)/shift-type.tsx',
                source: [
                    "import { CtaButton, GlassCard } from '@/components/ui';",
                    'export default () => (<Wrap><CtaButton label="Next" onPress={f} /></Wrap>);',
                ].join('\n'),
            },
            // 4: nothing (legacy screen)
            {
                path: 'app/(legacy)/old.tsx',
                source: 'export default () => (<View><Text>old</Text></View>);',
            },
        ];
        const summary = computeCoverage(files);
        expect(summary.total).toBe(4);
        // GlassCard: fixtures 1 and 3 → 2/4 = 50%
        expect(summary.glassCard.count).toBe(2);
        expect(summary.glassCard.percent).toBe(50);
        // CtaButton: fixtures 2 and 3 → 2/4 = 50%
        expect(summary.ctaButton.count).toBe(2);
        expect(summary.ctaButton.percent).toBe(50);
        // StatusBar: fixture 1 only → 1/4 = 25%
        expect(summary.statusBar.count).toBe(1);
        expect(summary.statusBar.percent).toBe(25);
    });

    test('an all-adopted set reports 100% on every primitive', () => {
        const oneFull = {
            path: 'app/full.tsx',
            source: [
                "import { StatusBar } from 'expo-status-bar';",
                "import { GlassCard, CtaButton } from '@/components/ui';",
                'export default () => (<><StatusBar style="light" /><GlassCard><CtaButton label="x" onPress={f} /></GlassCard></>);',
            ].join('\n'),
        };
        const summary = computeCoverage([oneFull, oneFull, oneFull]);
        expect(summary.total).toBe(3);
        expect(summary.glassCard).toEqual({ count: 3, percent: 100 });
        expect(summary.ctaButton).toEqual({ count: 3, percent: 100 });
        expect(summary.statusBar).toEqual({ count: 3, percent: 100 });
    });

    test('an empty file list yields a zeroed summary (no divide-by-zero)', () => {
        const summary = computeCoverage([]);
        expect(summary.total).toBe(0);
        expect(summary.glassCard).toEqual({ count: 0, percent: 0 });
        expect(summary.ctaButton).toEqual({ count: 0, percent: 0 });
        expect(summary.statusBar).toEqual({ count: 0, percent: 0 });
    });

    test('a non-array / undefined argument is treated as no screens (never throws)', () => {
        expect(computeCoverage(undefined).total).toBe(0);
        expect(computeCoverage(null).total).toBe(0);
    });

    test('a fixture with a non-string source is treated as empty (no throw)', () => {
        const summary = computeCoverage([{ path: 'x.tsx', source: undefined }, { path: 'y.tsx' }]);
        expect(summary.total).toBe(2);
        expect(summary.glassCard.count).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatReport — the printable table shows counts, percentages, total, and the
// INFORMATIONAL (non-blocking) banner.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — formatReport', () => {
    test('renders count/total/percent rows plus the informational banner', () => {
        const summary = computeCoverage([
            {
                path: 'a.tsx',
                source: [
                    "import { StatusBar } from 'expo-status-bar';",
                    'export default () => <StatusBar style="light" />;',
                ].join('\n'),
            },
            { path: 'b.tsx', source: '<View />' },
        ]);
        const text = formatReport(summary).join('\n');
        expect(text).toContain('Total screens: 2');
        expect(text).toContain('StatusBar: 1/2 screens (50%)');
        expect(text).toContain('GlassCard: 0/2 screens (0%)');
        expect(text).toContain('CtaButton: 0/2 screens (0%)');
        // The non-blocking banner must be present (both the header tag and the
        // closing note).
        expect(text).toMatch(/INFORMATIONAL \(non-blocking\)/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exit-0-by-construction — main() unconditionally exits 0 (it is a metric, never
// a gate). We assert this structurally: the source's only process.exit call in
// main() is process.exit(0), and there is no `process.exit(1)` anywhere.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — exit-0 by construction', () => {
    const source = fs.readFileSync(COVERAGE_PATH, 'utf8');

    test('the script never calls process.exit with a non-zero code', () => {
        // No process.exit(1) (or any non-zero literal) exists in the file.
        expect(/process\.exit\(\s*0\s*\)/.test(source)).toBe(true);
        expect(/process\.exit\(\s*[1-9]/.test(source)).toBe(false);
        // And process.exit is only ever called with 0.
        const calls = source.match(/process\.exit\([^)]*\)/g) || [];
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call.replace(/\s+/g, '')).toBe('process.exit(0)');
        }
    });

    test('running the script as a child process exits 0 and prints the banner', () => {
        const { spawnSync } = require('child_process');
        const res = spawnSync(process.execPath, [COVERAGE_PATH], { encoding: 'utf8' });
        expect(res.status).toBe(0);
        const out = `${res.stdout || ''}${res.stderr || ''}`;
        expect(out).toMatch(/INFORMATIONAL \(non-blocking\)/);
        expect(out).toMatch(/Total screens:/);
        expect(out).toMatch(/GlassCard:/);
        expect(out).toMatch(/CtaButton:/);
        expect(out).toMatch(/StatusBar:/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate wiring — the coverage report is a SEPARATE informational step, NOT part
// of the hard buildSteps() array (so the gate-steps meta self-test stays green).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage — gate.js wiring (informational, separate from hard steps)', () => {
    test('buildReportingSteps() includes the aurora-coverage report running the script', () => {
        const reports = buildReportingSteps();
        expect(Array.isArray(reports)).toBe(true);
        const cov = reports.find((s) => /aurora-coverage/.test(s.name));
        expect(cov).toBeDefined();
        const last = cov.args[cov.args.length - 1];
        expect(last.split(/[\\/]/).join('/')).toMatch(/scripts\/check-aurora-coverage\.js$/);
    });

    test('the coverage report is NOT in the hard buildSteps() array', () => {
        const hardNames = buildSteps().map((s) => s.name);
        // It must not appear among the hard steps under any aurora-coverage name.
        expect(hardNames.some((n) => /aurora-coverage/.test(n))).toBe(false);
        // And no hard step references the coverage script (which would make the
        // gate-steps meta self-test require it to be a HARD on-disk step).
        const refsCoverage = buildSteps().some((s) =>
            Array.isArray(s.args) && s.args.some((a) => typeof a === 'string' && a.endsWith('check-aurora-coverage.js')),
        );
        expect(refsCoverage).toBe(false);
    });
});
