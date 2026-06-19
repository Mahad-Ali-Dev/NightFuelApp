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
 * @returns                            'pro' for any non-FREE tier, otherwise 'free'.
 */
export async function resolvePlan({
    userId,
    jwtSecret,
    subscriptionServiceUrl,
    fetchImpl,
    timeoutMs,
}: {
    userId: string;
    jwtSecret: string;
    subscriptionServiceUrl: string;
    fetchImpl?: typeof globalThis.fetch;
    timeoutMs?: number;
}): Promise<'free' | 'pro'> {
    // No secret -> cannot mint an internal token -> default to the safer free
    // plan WITHOUT any network call (callers in misconfigured/test envs rely on
    // this never reaching out).
    if (!jwtSecret) return 'free';

    // Read fetch INSIDE the function so there is no module-scope fetch handle and
    // a test can inject a stub.
    const doFetch = fetchImpl ?? globalThis.fetch;

    // Strip any trailing slash(es) so we never produce a `//v1/...` path.
    const base = subscriptionServiceUrl.replace(/\/+$/, '');
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
        // Any non-OK status (incl. 5xx) -> the safer free default.
        if (!res.ok) return 'free';
        const sub = (await res.json()) as { tier?: string };
        return (sub.tier ?? 'FREE').toUpperCase() === 'FREE' ? 'free' : 'pro';
    } catch {
        // Abort/timeout, network throw, or JSON-parse failure -> free.
        return 'free';
    } finally {
        clearTimeout(timer);
    }
}
