// Tests for the shared `resolvePlan` plan resolver in @nightfuel/config.
//
// This locks the resolver three services lean on (chat / exercise / plan), which
// replaces their three drifting copies. The primary import is the PACKAGE
// entrypoint ('@nightfuel/config', NOT a deep src/ path) so this also asserts the
// acceptance contract that the symbol resolves through the built dist/index.js —
// exactly how a service does `import { resolvePlan } from '@nightfuel/config'`.
//
// Every case injects a `jest.fn` `fetchImpl` and pins the clock with fake timers,
// so the resolver is driven deterministically with ZERO real network or ambient
// Date.now(). The branches mirror the acceptance matrix:
//   (a) no jwtSecret           -> 'free' AND fetchImpl NOT called
//   (b) tier 'FREE'            -> 'free'
//   (c) tier 'PRO'             -> 'pro'
//   (d) tier 'TRIAL'/other     -> 'pro'
//   (e) non-OK 500             -> 'free'
//   (f) abort / timeout        -> 'free'
//   (g) thrown / JSON-parse err -> 'free'
// A final source-level test greps resolve-plan.ts to prove there is NO
// module-scope `fetch(` call or `Date.now()` (both must be read INSIDE the fn).
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePlan } from '@nightfuel/config';

const USER_ID = 'user-abc-123';
const JWT_SECRET = 'test-internal-secret';
const SUB_URL = 'http://subscription-service:3015';
const ME_PATH = '/v1/subscriptions/me';

/** Build a minimal Response-like object the resolver consumes (`ok`, `status`,
 *  `json()`). Typed as a real Response via `unknown` so the injected fetch's
 *  signature still matches `typeof globalThis.fetch`. */
function makeResponse({
    ok,
    status = ok ? 200 : 500,
    body,
    jsonThrows = false,
}: {
    ok: boolean;
    status?: number;
    body?: unknown;
    jsonThrows?: boolean;
}): Response {
    return {
        ok,
        status,
        json: async () => {
            if (jsonThrows) throw new SyntaxError('Unexpected token < in JSON');
            return body;
        },
    } as unknown as Response;
}

/** A jest.fn typed as `typeof globalThis.fetch` so it slots into `fetchImpl`. */
function mockFetch(impl: (...args: Parameters<typeof globalThis.fetch>) => Promise<Response>) {
    return jest.fn(impl) as unknown as jest.MockedFunction<typeof globalThis.fetch>;
}

describe('resolvePlan — shared plan resolver', () => {
    // Pin the wall clock so the minted token's iat/exp are deterministic and we
    // can both fast-forward timers (timeout case) and assert exact iat/exp.
    const FIXED_MS = Date.parse('2026-06-20T12:00:00.000Z');

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_MS);
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    // (a) No secret -> 'free' AND the injected fetch is NEVER called (we can't
    // mint a token, so we must not touch the network).
    it("(a) returns 'free' WITHOUT calling fetch when jwtSecret is empty", async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: { tier: 'PRO' } }));
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: '',
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('free');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    // (b) tier 'FREE' -> 'free'.
    it("(b) maps tier 'FREE' to 'free'", async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: { tier: 'FREE' } }));
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('free');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    // (c) tier 'PRO' -> 'pro'.
    it("(c) maps tier 'PRO' to 'pro'", async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: { tier: 'PRO' } }));
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('pro');
    });

    // (d) Any non-FREE tier (TRIAL, lowercase, or a missing tier defaulting to
    // 'FREE'… that last one is 'free'; here we prove the OTHER side) -> 'pro'.
    it.each([['TRIAL'], ['trialing'], ['pro'], ['ENTERPRISE'], ['anything-else']])(
        "(d) maps non-FREE tier %s to 'pro'",
        async (tier) => {
            const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: { tier } }));
            const plan = await resolvePlan({
                userId: USER_ID,
                jwtSecret: JWT_SECRET,
                subscriptionServiceUrl: SUB_URL,
                fetchImpl,
            });
            expect(plan).toBe('pro');
        },
    );

    // A missing tier field defaults to 'FREE' (the `?? 'FREE'` branch) -> 'free'.
    it("(d') maps a missing tier field to 'free' via the 'FREE' default", async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: {} }));
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('free');
    });

    // (e) Non-OK 500 -> 'free' (and json() is never read).
    it("(e) returns 'free' on a non-OK 500 response", async () => {
        const json = jest.fn(async () => ({ tier: 'PRO' }));
        const fetchImpl = mockFetch(async () => ({ ok: false, status: 500, json } as unknown as Response));
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('free');
        // We bail on !res.ok before parsing the body.
        expect(json).not.toHaveBeenCalled();
    });

    // (f) Abort / timeout -> 'free'. The fetch implementation rejects when its
    // AbortSignal fires; we advance fake timers past the default 3000ms to fire
    // the resolver's internal AbortController.
    it("(f) returns 'free' when the request times out (abort)", async () => {
        const fetchImpl = mockFetch(
            (_url, init) =>
                new Promise<Response>((_resolve, reject) => {
                    const signal = (init as RequestInit | undefined)?.signal;
                    signal?.addEventListener('abort', () =>
                        reject(new DOMException('The operation was aborted.', 'AbortError')),
                    );
                }),
        );
        const promise = resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
            timeoutMs: 3000,
        });
        // Fire the resolver's setTimeout(abort, 3000).
        await jest.advanceTimersByTimeAsync(3000);
        await expect(promise).resolves.toBe('free');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    // (g) A thrown network error -> 'free'.
    it("(g) returns 'free' when fetch throws", async () => {
        const fetchImpl = mockFetch(async () => {
            throw new TypeError('network error: ECONNREFUSED');
        });
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('free');
    });

    // (g) A JSON-parse failure on an OK response -> 'free'.
    it("(g') returns 'free' when res.json() throws (parse error)", async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, jsonThrows: true }));
        const plan = await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        expect(plan).toBe('free');
    });
});

describe('resolvePlan — request shape & minted token', () => {
    const FIXED_MS = Date.parse('2026-06-20T12:00:00.000Z');
    const FIXED_IAT = Math.floor(FIXED_MS / 1000);

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_MS);
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    // The resolver GETs `${base}/v1/subscriptions/me` with the documented headers,
    // and STRIPS any trailing slash off the base URL (so no `//v1/...`).
    it('GETs /v1/subscriptions/me with Bearer + accept headers and a slash-stripped base', async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: { tier: 'FREE' } }));
        await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: 'http://subscription-service:3015///',
            fetchImpl,
        });
        const [calledUrl, init] = fetchImpl.mock.calls[0];
        expect(calledUrl).toBe(`http://subscription-service:3015${ME_PATH}`);
        const requestInit = init as RequestInit;
        expect(requestInit.method).toBe('GET');
        const headers = requestInit.headers as Record<string, string>;
        expect(headers.accept).toBe('application/json');
        expect(headers.authorization).toMatch(/^Bearer .+\..+\..+$/); // header.payload.signature
        expect(requestInit.signal).toBeDefined();
    });

    // The minted token is a verifiable HS256 JWT: header {alg:'HS256',typ:'JWT'},
    // payload carries BOTH userId and sub == userId with iat/exp = iat+60, and the
    // base64url HMAC-SHA256 signature over `${header}.${payload}` matches.
    it('mints a 60s HS256 token carrying both userId and sub, with a valid signature', async () => {
        const fetchImpl = mockFetch(async () => makeResponse({ ok: true, body: { tier: 'FREE' } }));
        await resolvePlan({
            userId: USER_ID,
            jwtSecret: JWT_SECRET,
            subscriptionServiceUrl: SUB_URL,
            fetchImpl,
        });
        const [, init] = fetchImpl.mock.calls[0];
        const auth = (init as RequestInit).headers as Record<string, string>;
        const token = auth.authorization.replace(/^Bearer /, '');
        const [h, p, sig] = token.split('.');

        const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
        expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });

        const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
        expect(payload.userId).toBe(USER_ID);
        expect(payload.sub).toBe(USER_ID);
        // subscription-service.extractUserId reads user.id ?? user.userId; userId
        // is present so the token resolves the TARGET user.
        expect(payload.iat).toBe(FIXED_IAT);
        expect(payload.exp).toBe(FIXED_IAT + 60);
        // The old chat-service `role: 'SYSTEM'` claim is intentionally dropped.
        expect(payload.role).toBeUndefined();

        // Signature verifies under the same secret (proves real HS256, no library).
        const expected = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
        expect(sig).toBe(expected);
    });
});

describe('resolve-plan.ts — no module-scope fetch / Date.now', () => {
    // The acceptance contract: the resolver must read `fetch` from
    // `fetchImpl ?? globalThis.fetch` and the clock from `Date.now()` INSIDE the
    // function — never at module load. We grep the SOURCE (stripping line + block
    // comments first so the documentation that mentions them doesn't false-trip)
    // and assert neither a bare `fetch(` call nor `Date.now()` appears at the
    // top level. Both tokens are allowed only within the function bodies, which
    // are indented; a module-scope occurrence would sit at column 0.
    const SRC = readFileSync(join(__dirname, '..', 'src', 'resolve-plan.ts'), 'utf8');

    /** Strip /* … *​/ block comments and // line comments so prose that names
     *  `fetch` / `Date.now` (e.g. JSDoc) doesn't count as code. */
    function stripComments(code: string): string {
        return code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
    }

    it('has no top-level (column-0) fetch( call', () => {
        const code = stripComments(SRC);
        // A module-scope fetch call would start at column 0. Function-body uses
        // (e.g. `const res = await doFetch(...)`) are indented and use doFetch,
        // not bare fetch, anyway.
        const moduleScopeFetch = /^fetch\s*\(/m.test(code);
        expect(moduleScopeFetch).toBe(false);
        // Stronger: there is no bare `fetch(` token ANYWHERE in code — the
        // resolver only ever calls `doFetch(`.
        expect(/\bfetch\s*\(/.test(code)).toBe(false);
    });

    it('has no top-level (column-0) Date.now() call', () => {
        const code = stripComments(SRC);
        const moduleScopeDateNow = /^[^\n]*Date\.now\s*\(\)/m
            .test(code.split('\n').filter((line) => /^\S/.test(line)).join('\n'));
        expect(moduleScopeDateNow).toBe(false);
        // Date.now() may appear ONLY inside the indented mintInternalToken body.
        for (const line of code.split('\n')) {
            if (/Date\.now\s*\(\)/.test(line)) {
                // Any occurrence must be indented (inside a function), not column 0.
                expect(/^\s+/.test(line)).toBe(true);
            }
        }
    });
});
