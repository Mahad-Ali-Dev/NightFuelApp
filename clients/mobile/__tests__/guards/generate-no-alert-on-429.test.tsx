/**
 * generate-no-alert-on-429.test.tsx
 *
 * REGRESSION LOCK (the "regression net" item 2 explicitly asked for): after
 * items 1 and 2 landed, ALL FOUR AI-generate callers
 *
 *   - app/(tabs)/circadian.tsx        (generatePlan,        Regenerate protocol)
 *   - app/(shifts)/index.tsx          (generatePlan,        generate plan hero)
 *   - app/(meals)/planner.tsx         (generatePlan,        GENERATE AI PLAN)
 *   - app/(exercises)/ai-planner.tsx  (generateRoutineWithAI, generate routine)
 *
 * route the caught generate error through the shared `parseAiQuotaError`
 * (`@/api/ai`) and flip into one of two mutually-exclusive GROUND-TRUTH render
 * states — a distinct "daily AI limit reached" upgrade block (CtaButton →
 * '/(modals)/premium'), or a retryable inline notice — instead of firing the
 * old DESTRUCTIVE `Alert.alert('…', …)` that the quota 429 used to dead-end in.
 *
 * Rule cited: state-ground-truth.md — the visible failure surface is DERIVED
 * from the single `quota` / `genError` state the generate `onError` sets, never
 * from an imperative, untestable `Alert.alert(...)` side effect on the 429
 * branch. The behavioral per-screen suites (circadian.quota / planner.quota /
 * ai-coach.quota and the screen suites) already pin the rendered upgrade
 * affordance + the spied-Alert "not called" assertion. THIS file is the coarse,
 * cross-screen net so a future edit to ANY of the four can't quietly reintroduce
 * a bare destructive Alert on the generate-error / 429 path.
 *
 * Approach B (lightweight static — disjoint from every screen file): read each
 * of the four screen sources straight from disk and assert
 *   (1) it imports `parseAiQuotaError` from '@/api/ai' (proves it still routes
 *       the generate error through the quota split), AND
 *   (2) its GENERATE mutation's `onError` handler body contains NO `Alert.alert(`
 *       call (the precise regression — a quota 429 must NOT dead-end in an
 *       Alert), AND
 *   (3) the file contains no bare destructive `Alert.alert('Error' …)` /
 *       `Alert.alert("Error" …)` anywhere (the literal "bare Alert" marker the
 *       item names).
 *
 * It is deliberately precise: it scopes the no-Alert assertion to the GENERATE
 * mutation's `onError` block (located via its `generatePlan` /
 * `generateRoutineWithAI` mutationFn and a brace/paren-balanced slice of the
 * arrow body), so it does NOT trip on the legitimate NON-generate Alerts that
 * remain — e.g. planner.tsx's generate `onSuccess` "Plan Generated" toast and
 * its separate `ratePlan` `onError` "Rating Failed" alert, or ai-planner.tsx's
 * generate `onSuccess` "Plan Created!" alert. Those are success / unrelated
 * mutations, not the quota-bearing generate-error path.
 *
 * Additive + verify-only: a NEW test file. It imports none of the screens and
 * modifies nothing — it reads their source via fs (same `path.resolve(__dirname,
 * …)` pattern as __tests__/constants/pendingHumanReview.test.ts). Pure
 * data/logic: no React, no network, no native module loads. Runs under
 * `test:mobile` (jest in @nightfuel/mobile), which `node scripts/gate.js`
 * already includes — no gate.js edit, no buildSteps placement risk.
 */
import * as fs from 'fs';
import * as path from 'path';

// ── The four generate-caller screens + the generate fn each one meters. ──────
// `fn` is the mutationFn callee whose sibling `onError` we scope the no-Alert
// assertion to (so onSuccess / unrelated-mutation Alerts are out of scope).
const GENERATE_CALLERS: ReadonlyArray<{ label: string; rel: string; fn: string }> = [
  { label: 'circadian',  rel: '../../app/(tabs)/circadian.tsx',       fn: 'generatePlan' },
  { label: 'shifts',     rel: '../../app/(shifts)/index.tsx',         fn: 'generatePlan' },
  { label: 'planner',    rel: '../../app/(meals)/planner.tsx',        fn: 'generatePlan' },
  { label: 'ai-planner', rel: '../../app/(exercises)/ai-planner.tsx', fn: 'generateRoutineWithAI' },
];

function readScreen(rel: string): string {
  const abs = path.resolve(__dirname, rel);
  // Read straight from disk so a moved/renamed screen fails LOUDLY here (the
  // whole point of a regression lock) rather than silently passing on '' .
  const src = fs.readFileSync(abs, 'utf8');
  expect(typeof src).toBe('string');
  expect(src.length).toBeGreaterThan(0);
  return src;
}

/**
 * Slice the body of the `onError` arrow handler that belongs to the GENERATE
 * mutation in `src`. Strategy:
 *   1. find the generate `mutationFn` by its callee (`fn`);
 *   2. from there, find the NEXT `onError` (the one wired to that mutation —
 *      `mutationFn` always precedes its sibling callbacks in all four files);
 *   3. walk from the `=>` after `onError` and return the balanced arrow body
 *      (either a `{ … }` block or, defensively, a single expression up to the
 *      next top-level `,`/`}` at the handler's depth).
 *
 * Returns the handler body as a string. Throws (failing the test) if either the
 * generate mutationFn or its onError can't be located — a structural change that
 * a human must re-verify, not silently skip.
 */
function generateOnErrorBody(src: string, fn: string): string {
  const fnIdx = src.indexOf(`${fn}(`);
  if (fnIdx === -1) {
    throw new Error(`generate mutationFn callee \`${fn}(\` not found — screen restructured?`);
  }
  const oeIdx = src.indexOf('onError', fnIdx);
  if (oeIdx === -1) {
    throw new Error(`no \`onError\` after \`${fn}(\` — generate mutation restructured?`);
  }
  const arrowIdx = src.indexOf('=>', oeIdx);
  if (arrowIdx === -1) {
    throw new Error(`generate \`onError\` is not an arrow handler — restructured?`);
  }

  // Skip whitespace after `=>` to the first non-space char of the body.
  let i = arrowIdx + 2;
  while (i < src.length && /\s/.test(src[i] as string)) i += 1;

  if (src[i] === '{') {
    // Block body: return the balanced { … } (string/comment-naive, which is
    // fine here — none of the four onError bodies contain a `{`/`}` inside a
    // string or a regex literal).
    let depth = 0;
    for (let j = i; j < src.length; j += 1) {
      const ch = src[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return src.slice(i, j + 1);
      }
    }
    throw new Error('unbalanced braces in generate onError block body');
  }

  // Expression body (e.g. `onError: (e) => doThing(e)`): return up to the next
  // top-level `,` or `}` (the end of the callbacks object entry), tracking ()
  // [] {} nesting so a comma INSIDE the expression doesn't end the slice early.
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let j = i; j < src.length; j += 1) {
    const ch = src[j];
    if (ch === '(') round += 1;
    else if (ch === ')') round -= 1;
    else if (ch === '[') square += 1;
    else if (ch === ']') square -= 1;
    else if (ch === '{') curly += 1;
    else if (ch === '}') {
      if (round === 0 && square === 0 && curly === 0) return src.slice(i, j);
      curly -= 1;
    } else if (ch === ',' && round === 0 && square === 0 && curly === 0) {
      return src.slice(i, j);
    }
  }
  // Fell off the end without a delimiter — return the remainder (still safe to
  // scan for Alert.alert).
  return src.slice(i);
}

// A bare destructive Alert: `Alert.alert('Error' …)` / `Alert.alert("Error" …)`,
// tolerant of whitespace. This is the literal "bare Alert on a 429" marker the
// work-item names; none of the four files may contain it.
const BARE_ERROR_ALERT = /Alert\s*\.\s*alert\s*\(\s*['"]Error['"]/;

// Any Alert.alert(...) call — used only inside the scoped generate onError body.
const ANY_ALERT_CALL = /Alert\s*\.\s*alert\s*\(/;

// `parseAiQuotaError` imported from '@/api/ai' (the quota split). Matches the
// real `import { …, parseAiQuotaError, … } from '@/api/ai'` in all four files.
const IMPORTS_PARSE_QUOTA =
  /import\s*\{[^}]*\bparseAiQuotaError\b[^}]*\}\s*from\s*['"]@\/api\/ai['"]/;

describe('regression lock — no generate caller fires a destructive Alert on a 429', () => {
  it.each(GENERATE_CALLERS)(
    '$label imports parseAiQuotaError (routes the generate error through the quota split)',
    ({ rel }) => {
      const src = readScreen(rel);
      expect(IMPORTS_PARSE_QUOTA.test(src)).toBe(true);
    },
  );

  it.each(GENERATE_CALLERS)(
    "$label's GENERATE onError handler contains no Alert.alert( (quota 429 must not dead-end in an Alert)",
    ({ rel, fn }) => {
      const src = readScreen(rel);
      const body = generateOnErrorBody(src, fn);
      // Sanity: we actually sliced the quota-split handler (it runs the error
      // through parseAiQuotaError), so the no-Alert assertion is meaningful and
      // not scoped to some empty/wrong block.
      expect(body).toMatch(/parseAiQuotaError\s*\(/);
      expect(ANY_ALERT_CALL.test(body)).toBe(false);
    },
  );

  it.each(GENERATE_CALLERS)(
    "$label contains no bare destructive Alert.alert('Error', …) anywhere",
    ({ rel }) => {
      const src = readScreen(rel);
      expect(BARE_ERROR_ALERT.test(src)).toBe(false);
    },
  );

  it('covers exactly the four generate-caller screens (all four files resolve on disk)', () => {
    // Guards against a silent drop of a caller from the list above (e.g. a
    // careless edit) — the net must keep watching ALL FOUR.
    expect(GENERATE_CALLERS).toHaveLength(4);
    for (const { rel } of GENERATE_CALLERS) {
      expect(fs.existsSync(path.resolve(__dirname, rel))).toBe(true);
    }
  });
});

// ── Self-check: the no-Alert scoping is real, not vacuously true. ────────────
// Prove the scoped extractor + assertion WOULD fail if a generate onError
// reintroduced a destructive Alert — so a green run means "no Alert", not "the
// regex never matches anything". Mirrors a synthetic generate mutation shaped
// exactly like the real ones (mutationFn → onError arrow body).
describe('regression lock — self-check (the assertion can actually fail)', () => {
  const REGRESSED = `
    const genM = useMutation({
      mutationFn: () => generatePlan({ date: dateStr }),
      onError: (err: unknown) => {
        const q = parseAiQuotaError(err);
        if (q) { setQuota(q); }
        else { Alert.alert('Error', getErrorMessage(err)); }
      },
    });
  `;

  it('extracts the generate onError body and DETECTS a reintroduced Alert there', () => {
    const body = generateOnErrorBody(REGRESSED, 'generatePlan');
    expect(body).toMatch(/parseAiQuotaError\s*\(/);
    // The synthetic regression DOES put an Alert on the 429/error branch …
    expect(ANY_ALERT_CALL.test(body)).toBe(true);
    // … and it's the bare-Error marker too — both nets would catch it.
    expect(BARE_ERROR_ALERT.test(REGRESSED)).toBe(true);
  });

  it('does NOT mis-scope a NON-generate (success / unrelated) Alert into the generate onError', () => {
    // Shaped like planner.tsx: generate onSuccess fires a benign toast, a
    // SEPARATE ratePlan mutation's onError fires "Rating Failed". Neither is the
    // generate-error path — the scoped slice must stay clean.
    const WITH_BENIGN_ALERTS = `
      const genM = useMutation({
        mutationFn: () => generatePlan({ date: dateStr }),
        onSuccess: () => { Alert.alert('Plan Generated', 'Ready.'); },
        onError: (err: unknown) => {
          const q = parseAiQuotaError(err);
          if (q) { setQuota(q); } else { setGenError(getErrorMessage(err)); }
        },
      });
      const rateM = useMutation({
        mutationFn: (r: number) => ratePlan(id, r),
        onError: (err: unknown) => Alert.alert('Rating Failed', getErrorMessage(err)),
      });
    `;
    const body = generateOnErrorBody(WITH_BENIGN_ALERTS, 'generatePlan');
    expect(body).toMatch(/parseAiQuotaError\s*\(/);
    // The generate onError is clean even though the file has two other Alerts.
    expect(ANY_ALERT_CALL.test(body)).toBe(false);
  });
});
