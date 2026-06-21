// ── Shared plan resolver (single source of truth) ───────────────────────────────
// Three byte-near-identical `resolvePlan` copies used to live in the services and
// drift: chat-service (ChatService.resolvePlan), exercise-service, and
// plan-service. Each minted a short-lived internal JWT, called the
// subscription-service `/v1/subscriptions/me` endpoint, and mapped the returned
// tier to a coarse 'free' | 'pro' plan that the shared AI quota
// (./ai-quota — AI_LIMITS) keys on. Centralising the resolver HERE, in the
// dependency-light @nightfuel/config (whose `tsc -b --force` build runs in the
// gate BEFORE the backend tests), lets every service import ONE implementation
// instead of maintaining three.
//
// WHY node:crypto and not jsonwebtoken: the F3 constraint forbids adding a new
// runtime dependency, and `jsonwebtoken` — though hoisted at the repo root — is
// NOT a dependency of packages/config. The token the three live copies mint is a
// plain HS256 JWT with a 60s expiry, which is a few lines of the `node:crypto`
// built-in (base64url header + payload, HMAC-SHA256 signature). So we mint it
// inline rather than importing a library. The minted payload carries BOTH
// `userId` and `sub` (a superset of every old copy): subscription-service's
// extractUserId reads `user.id ?? user.userId`, so carrying `userId` resolves the
// TARGET user. chat-service's old `role: 'SYSTEM'` claim was immaterial to /me and
// is intentionally dropped.
//
// This module imports ONLY the `node:crypto` built-in — no zod, no Fastify, no
// service code, no new package. It is otherwise pure: `fetch` is read from
// `fetchImpl ?? globalThis.fetch` INSIDE the function (so a test can inject a
// stub), and the token's `iat`/`exp` are computed from `Date.now()` INSIDE the
// function (never at module scope), so there is no ambient module-level clock or
// network handle to leak across calls.

import { createHmac } from 'node:crypto';

/** Default per-request timeout (ms) for the subscription-service lookup. All
 *  three original copies used 3000ms (chat/exercise/plan: INTERNAL_REQUEST_TIMEOUT_MS
 *  = 3_000 / 3000). Kept at 3000 verbatim so centralising the resolver does NOT
 *  silently change live timeout behaviour. */
const DEFAULT_TIMEOUT_MS = 3000;

/** Lifetime (seconds) of the minted internal token — 60s, matching the
 *  `expiresIn: '60s'` every original copy passed. Long enough to cover one /me
 *  round-trip, short enough that a leaked token is near-useless. */
const TOKEN_TTL_SECONDS = 60;

/** Default short TTL (ms) for the opt-in per-user plan cache. 30s is short
 *  enough that a tier change (upgrade/downgrade in subscription-service) is
 *  reflected within ~half a minute, yet long enough that a burst of Ria chat
 *  sends / generates for one user collapses to a SINGLE /me lookup instead of
 *  one per message. Callers opt in by passing `cacheTtlMs` (omitted/0/negative
 *  -> caching OFF, so every existing caller and test is byte-for-byte
 *  unchanged: a fresh /me on every call). */
const DEFAULT_CACHE_TTL_MS = 30_000;

/** Upper bound on distinct userId entries held in the in-memory plan cache. The
 *  cache is a bounded LRU: on insert past this size the OLDEST (least-recently
 *  inserted) entry is evicted, so a flood of distinct users can never grow the
 *  Map without limit. 1000 covers a realistic concurrent-active-user burst while
 *  capping worst-case memory at a few hundred KB. */
const PLAN_CACHE_MAX_ENTRIES = 1000;

/** A cached plan decision plus the wall-clock ms at which it stops being served. */
interface PlanCacheEntry {
    plan: 'free' | 'pro';
    expiresAtMs: number;
}

/**
 * Module-scope, process-wide cache of resolved plans keyed by
 * `${userId}|${base}|${jwtSecret}` — userId is the primary axis the
 * task calls for, and base/secret are folded in so a process that (re)points at
 * a different subscription-service or rotates its internal secret can never serve
 * a stale cross-config decision. Insertion order doubles as LRU recency: Map
 * iteration yields keys oldest-first, so the first key is the eviction victim.
 *
 * Held at module scope deliberately so a BURST of calls (many Ria sends in a row
 * in the same process) shares one entry. This introduces NO ambient clock or
 * network at module load — it is an empty Map; all `Date.now()` reads happen
 * INSIDE the functions below (per the source-level acceptance test).
 */
const planCache = new Map<string, PlanCacheEntry>();

/** Build the composite cache key for a resolve target. */
function planCacheKey(userId: string, base: string, jwtSecret: string): string {
    return `${userId}|${base}|${jwtSecret}`;
}

/**
 * TEST-ONLY: drop all cached plan decisions. Exported so a test can assert a
 * clean slate; production code never needs it (entries self-expire via TTL).
 */
export function __clearPlanCache(): void {
    planCache.clear();
}

/**
 * base64url-encode a UTF-8 string WITHOUT padding — the JWS encoding for the JWT
 * header and payload segments. `Buffer.toString('base64url')` already emits the
 * URL-safe alphabet (`-`/`_`) with no `=` padding, exactly what a JWT segment
 * requires, so no manual character substitution is needed.
 */
function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64url');
}

/**
 * Mint a 60s HS256 JWT for the target user, signed with `jwtSecret`, using only
 * the `node:crypto` built-in (no jsonwebtoken dependency).
 *
 * The payload carries BOTH `userId` and `sub` set to `userId` (a superset of the
 * three original copies) plus standard `iat`/`exp` claims. The signing input is
 * `${headerB64}.${payloadB64}` and the signature is the base64url HMAC-SHA256 of
 * that input under `jwtSecret`, yielding the canonical `header.payload.signature`
 * compact JWS form a verifier (e.g. @fastify/jwt on the subscription-service)
 * accepts.
 *
 * @param userId    The subject the token resolves to (both `sub` and `userId`).
 * @param jwtSecret The HMAC secret shared with the subscription-service.
 * @returns         A signed compact-form HS256 JWT string.
 */
function mintInternalToken(userId: string, jwtSecret: string): string {
    // iat/exp are read from the wall clock INSIDE the function (never at module
    // scope) so this stays a per-call value a test can pin with a fixed clock.
    const iat = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
        JSON.stringify({ userId, sub: userId, iat, exp: iat + TOKEN_TTL_SECONDS }),
    );
    const signingInput = `${header}.${payload}`;
    const signature = createHmac('sha256', jwtSecret).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
}

/**
 * Resolve a caller's coarse billing plan ('free' | 'pro') from the
 * subscription-service — the single shared implementation the chat, exercise, and
 * plan services all import (replacing their three drifting copies).
 *
 * Behaviour (the UNION of the three original copies):
 *   • No `jwtSecret` → return 'free' WITHOUT calling fetch. An internal token
 *     cannot be minted, so we degrade to the safer, lower-limit plan and never
 *     touch the network (a test asserts the injected `fetchImpl` is untouched).
 *   • Otherwise mint a 60s HS256 token AS the target user and GET
 *     `${base}/v1/subscriptions/me` (base = `subscriptionServiceUrl` with any
 *     trailing slash stripped) with `authorization: Bearer <token>` and
 *     `accept: application/json`, bounded by an AbortController whose timer fires
 *     after `timeoutMs ?? 3000` ms and is always cleared in `finally`.
 *   • Map the response: `(sub.tier ?? 'FREE').toUpperCase() === 'FREE'` → 'free',
 *     anything else → 'pro'.
 *   • Return 'free' on ANY non-OK status, abort/timeout, thrown error, or
 *     JSON-parse failure — the safer default an unreachable subscription-service
 *     degrades to.
 *
 * Pure w.r.t. ambient state: `fetch` is taken from `fetchImpl ?? globalThis.fetch`
 * and the token clock from `Date.now()`, both read INSIDE this function — there is
 * no module-scope `fetch(` call or `Date.now()`.
 *
 * @param args.userId                  The user whose plan to resolve.
 * @param args.jwtSecret               HMAC secret for the internal token; empty/falsy → 'free'.
 * @param args.subscriptionServiceUrl  Base URL of the subscription-service (trailing slash tolerated).
 * @param args.fetchImpl               Optional fetch implementation (defaults to globalThis.fetch); injectable for tests.
 * @param args.timeoutMs               Optional per-request timeout in ms (defaults to 3000).
 * @param args.cacheTtlMs             Optional opt-in cache TTL. Omitted/0/negative -> caching OFF
 *                                     (a fresh /me on every call, byte-identical to the pre-cache
 *                                     behaviour). When > 0 (or `true` -> 30s default), a successful
 *                                     'free'/'pro' decision is memoised per userId for that many ms,
 *                                     so a burst of Ria sends / generates collapses to one /me lookup.
 *                                     Only positive (non-'free'-fallback) lookups that actually hit the
 *                                     service are cached; degraded 'free' fallbacks (no secret, non-OK,
 *                                     timeout, throw, parse error) are NEVER cached, so a transient
 *                                     subscription-service outage can't pin a user to 'free'.
 * @returns                            'pro' for any non-FREE tier, otherwise 'free'.
 */
export async function resolvePlan({
    userId,
    jwtSecret,
    subscriptionServiceUrl,
    fetchImpl,
    timeoutMs,
    cacheTtlMs,
}: {
    userId: string;
    jwtSecret: string;
    subscriptionServiceUrl: string;
    fetchImpl?: typeof globalThis.fetch;
    timeoutMs?: number;
    cacheTtlMs?: number | boolean;
}): Promise<'free' | 'pro'> {
    // No secret -> cannot mint an internal token -> default to the safer free
    // plan WITHOUT any network call (callers in misconfigured/test envs rely on
    // this never reaching out). Never cached.
    if (!jwtSecret) return 'free';

    // Resolve the opt-in cache TTL: `true` -> 30s default, a number -> that many
    // ms, anything <= 0 / omitted / false -> caching OFF.
    const ttlMs = cacheTtlMs === true ? DEFAULT_CACHE_TTL_MS : typeof cacheTtlMs === 'number' ? cacheTtlMs : 0;
    const cacheEnabled = ttlMs > 0;

    // Strip any trailing slash(es) so we never produce a `//v1/...` path.
    const base = subscriptionServiceUrl.replace(/\/+$/, '');
    const cacheKey = planCacheKey(userId, base, jwtSecret);

    // Cache READ: serve a still-fresh entry without minting a token or touching
    // the network. Date.now() is read INSIDE the function (no module-scope clock).
    if (cacheEnabled) {
        const hit = planCache.get(cacheKey);
        if (hit && hit.expiresAtMs > Date.now()) return hit.plan;
        // Expired entry: drop it so the Map doesn't retain stale keys.
        if (hit) planCache.delete(cacheKey);
    }

    // Read fetch INSIDE the function so there is no module-scope fetch handle and
    // a test can inject a stub.
    const doFetch = fetchImpl ?? globalThis.fetch;

    const url = `${base}/v1/subscriptions/me`;
    // /me derives its subject FROM the token, so mint it AS the target user.
    const token = mintInternalToken(userId, jwtSecret);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const res = await doFetch(url, {
            method: 'GET',
            headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
            signal: controller.signal,
        });
        // Any non-OK status (incl. 5xx) -> the safer free default. NOT cached.
        if (!res.ok) return 'free';
        const sub = (await res.json()) as { tier?: string };
        const plan: 'free' | 'pro' = (sub.tier ?? 'FREE').toUpperCase() === 'FREE' ? 'free' : 'pro';
        // Cache WRITE: only a real, service-backed decision is memoised. Bound the
        // Map with simple LRU eviction (oldest insertion = first Map key).
        if (cacheEnabled) {
            if (planCache.size >= PLAN_CACHE_MAX_ENTRIES && !planCache.has(cacheKey)) {
                const oldest = planCache.keys().next().value;
                if (oldest !== undefined) planCache.delete(oldest);
            }
            planCache.set(cacheKey, { plan, expiresAtMs: Date.now() + ttlMs });
        }
        return plan;
    } catch {
        // Abort/timeout, network throw, or JSON-parse failure -> free. NOT cached.
        return 'free';
    } finally {
        clearTimeout(timer);
    }
}
