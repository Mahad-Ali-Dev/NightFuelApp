/**
 * scanQuota — per-user DAILY quota for the food-scan gateways
 * (`/api/food-vision` AI photo recognition + `/api/food-search` barcode lookup).
 *
 * This is the web-service arm of the SHARED AI quota system in
 * `@nightfuel/config` (the same policy chat-service uses for Ria messages and
 * exercise-service uses for AI generations). We reuse that package's single
 * source of truth EXACTLY — `AI_LIMITS[plan].scans`, `resolvePlan(...)`,
 * `assertWithinDailyLimit(...)`, and the `AI_QUOTA_EXCEEDED` 429 wire contract —
 * so the per-plan caps and the over-cap body never drift from the other AI
 * endpoints.
 *
 * WHY a Redis counter (and not a DB table like exercise-service):
 *   The web service is a stateless Next.js app with NO database of its own — it
 *   cannot count "scans used today" from a domain table the way exercise-service
 *   counts AI-generated routines. Redis is already the shared infra every backend
 *   service talks to (`REDIS_URL=redis://redis:6379`), so we key a per-user,
 *   per-UTC-day counter there. This is the "Redis store" the shared quota policy
 *   documents as the usage backend alternative to a domain-table count.
 *
 * The counter key is `scans:<userId>:<utcDayKey>` and is INCR'd ONLY after a
 * scan actually succeeds (mirroring exercise-service, where only a persisted AI
 * routine consumes the `generations` budget). A failed/empty scan does not burn
 * a scan. The key auto-expires ~2 days out so no cleanup job is needed and the
 * count resets naturally at UTC midnight (the boundary assertWithinDailyLimit
 * uses).
 *
 * Server-only: this module imports `node:crypto` and `ioredis`. It must never be
 * pulled into a client bundle (it lives under lib/ and is imported only from the
 * app/api/* route handlers, which are server-side).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import Redis from 'ioredis';
import { NextRequest, NextResponse } from 'next/server';
import {
    AI_LIMITS,
    AI_QUOTA_EXCEEDED,
    assertWithinDailyLimit,
    resolvePlan,
    type AiPlan,
} from '@nightfuel/config';

// ── Env / config ────────────────────────────────────────────────────────────
// JWT_SECRET is the HS256 secret every service shares (mobile mints its access
// token with it). We verify the caller's Bearer token against it to learn the
// userId to key the quota on. SUBSCRIPTION_SERVICE_URL is where resolvePlan
// looks up the tier. Dev fallbacks mirror the localhost ports next.config.js
// rewrites use; in Docker these are set to the service names.
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const SUBSCRIPTION_SERVICE_URL =
    process.env.SUBSCRIPTION_SERVICE_URL ?? 'http://127.0.0.1:3010';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

// Two-day TTL on each daily counter key: comfortably past the UTC-midnight reset
// so a key set at 23:59 still expires cleanly, with zero cleanup job. The quota
// window itself is enforced by the UTC-day key + assertWithinDailyLimit, not the
// TTL — the TTL only reaps stale keys.
const COUNTER_TTL_SECONDS = 60 * 60 * 48;

// ── Lazy Redis singleton ──────────────────────────────────────────────────────
// One connection per server process, created on first use. lazyConnect so a
// module import never opens a socket at build time. maxRetriesPerRequest:1 +
// a short connect timeout so a Redis blip fails FAST (we degrade gracefully
// rather than hanging the scan request — see readCount/commit below).
let redis: Redis | null = null;
function getRedis(): Redis {
    if (!redis) {
        redis = new Redis(REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 1500,
            // Swallow connection errors here so an unreachable Redis surfaces as a
            // rejected command (handled per-call) rather than an unhandled
            // 'error' event crashing the route.
            retryStrategy: (times) => (times > 2 ? null : 200),
        });
        redis.on('error', () => {
            /* handled at call sites; avoid noisy unhandled 'error' events */
        });
    }
    return redis;
}

// ── JWT (HS256) verify + decode ───────────────────────────────────────────────
// The web service has no @fastify/jwt; we verify the shared HS256 access token
// with node:crypto (the same primitive @nightfuel/config uses to MINT its
// internal token). Returns the userId claim on a valid, unexpired signature,
// else null. We intentionally accept either `userId` or `sub` (auth-service and
// the internal minter both appear across the codebase).

/** base64url → Buffer (tolerates missing padding). */
function b64urlToBuffer(input: string): Buffer {
    return Buffer.from(input, 'base64url');
}

/** Constant-time Buffer equality that never throws on length mismatch. */
function safeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
        // Compare against self so the early return doesn't leak length via timing.
        timingSafeEqual(a, a);
        return false;
    }
    return timingSafeEqual(a, b);
}

/**
 * Verify an HS256 JWT against JWT_SECRET and return its `userId` (or `sub`)
 * claim. Returns null for any problem: missing secret, malformed token, wrong
 * `alg`, bad signature, expired `exp`, or no usable id claim. Never throws.
 */
export function userIdFromBearer(authHeader: string | null): string | null {
    if (!JWT_SECRET || !authHeader) return null;
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!m || !m[1]) return null;
    const token = m[1];
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const sigB64 = parts[2];
    // Under strict noUncheckedIndexedAccess these are `string | undefined`; a
    // length-3 split guarantees all three, but guard explicitly to satisfy TS
    // (and defend against an empty segment like "a..c").
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    let header: { alg?: string; typ?: string };
    let payload: { userId?: unknown; sub?: unknown; exp?: unknown };
    try {
        header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8'));
        payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8'));
    } catch {
        return null;
    }

    // Only HS256 is accepted — never honour alg:'none' or an asymmetric alg.
    if (header?.alg !== 'HS256') return null;

    // Verify the signature over `${header}.${payload}`.
    const expected = createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest();
    let provided: Buffer;
    try {
        provided = b64urlToBuffer(sigB64);
    } catch {
        return null;
    }
    if (!safeEqual(expected, provided)) return null;

    // Reject an expired token (exp is seconds since epoch, per JWT).
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
        return null;
    }

    const id = payload.userId ?? payload.sub;
    return typeof id === 'string' && id.length > 0 ? id : null;
}

// ── UTC-day key ────────────────────────────────────────────────────────────────
/** YYYY-MM-DD in UTC — the same day boundary assertWithinDailyLimit resets on. */
function utcDayKey(now: Date): string {
    return now.toISOString().slice(0, 10);
}

function counterKey(userId: string, now: Date): string {
    return `scans:${userId}:${utcDayKey(now)}`;
}

// ── Usage store (Redis) ─────────────────────────────────────────────────────────

/**
 * Read the user's scans-used-today from Redis. On ANY Redis failure returns
 * `null` — the caller treats a null read as "unknown" and FAILS OPEN (allows the
 * scan) rather than blocking a paying user because of a transient infra blip.
 * A missed count is far cheaper than a food-logging outage.
 */
async function readCount(userId: string, now: Date): Promise<number | null> {
    try {
        const raw = await getRedis().get(counterKey(userId, now));
        const n = raw == null ? 0 : parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
        return null;
    }
}

/**
 * Record one consumed scan: INCR the per-day counter and (re)set its TTL. Called
 * ONLY after a scan actually succeeds. Best-effort — a Redis failure here is
 * swallowed (the scan already succeeded; we simply fail to bill it rather than
 * error the response).
 */
async function commitScan(userId: string, now: Date): Promise<void> {
    const key = counterKey(userId, now);
    try {
        const client = getRedis();
        const next = await client.incr(key);
        // Set the expiry once, on the first increment of the day.
        if (next === 1) await client.expire(key, COUNTER_TTL_SECONDS);
    } catch {
        /* best-effort: never fail a successful scan because the count didn't persist */
    }
}

// ── Public: enforce the scans quota ─────────────────────────────────────────────

export interface ScanQuotaAllowed {
    ok: true;
    userId: string;
    plan: AiPlan;
    limit: number;
    /** Uses left in the current UTC day BEFORE this scan (>= 1 when allowed). */
    remaining: number;
    /** ISO next-UTC-midnight reset. */
    resetsAt: string;
    /** Call AFTER the scan succeeds to consume one unit of quota. */
    commit: () => Promise<void>;
    /** Standard headers to echo remaining/limit on the response (both paths). */
    headers: Record<string, string>;
}

export interface ScanQuotaBlocked {
    ok: false;
    /** A ready-to-return 429 (quota) or 401 (no/invalid token) response. */
    response: NextResponse;
}

export type ScanQuotaResult = ScanQuotaAllowed | ScanQuotaBlocked;

/**
 * Gate a scan request against the caller's daily `scans` quota, reusing the
 * shared @nightfuel/config policy verbatim:
 *
 *   1. Verify the Bearer JWT → userId (401 if absent/invalid).
 *   2. resolvePlan(userId) → 'free' | 'pro' (degrades to 'free' if the
 *      subscription-service is unreachable — the shared resolver's own behaviour).
 *   3. usedToday := Redis counter; assertWithinDailyLimit(usedToday,
 *      AI_LIMITS[plan].scans, now).
 *   4. Over cap → 429 { error: AI_QUOTA_EXCEEDED, limit, plan, resetsAt }
 *      (byte-identical to chat/exercise). Otherwise return an `allowed` result
 *      whose `commit()` the caller invokes once the scan succeeds.
 *
 * Fail-open safety valve: if the Redis read fails (count unknown) we ALLOW the
 * scan rather than block on infra. `commit()` will also no-op if Redis is down.
 */
export async function enforceScanQuota(req: NextRequest): Promise<ScanQuotaResult> {
    const userId = userIdFromBearer(req.headers.get('authorization'));
    if (!userId) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
        };
    }

    const plan = await resolvePlan({
        userId,
        jwtSecret: JWT_SECRET,
        subscriptionServiceUrl: SUBSCRIPTION_SERVICE_URL,
        timeoutMs: 3000,
        // Short cache so a burst (photo then barcode) collapses tier lookups.
        cacheTtlMs: 30_000,
    });

    const limit = AI_LIMITS[plan].scans;
    const now = new Date();
    const usedToday = await readCount(userId, now);

    // Redis unavailable (null) → fail open: derive a permissive result off 0 used.
    const effectiveUsed = usedToday ?? 0;
    const q = assertWithinDailyLimit({ usedToday: effectiveUsed, limit, now });

    const headers: Record<string, string> = {
        'X-Scan-Limit': String(limit),
        'X-Scan-Remaining': String(q.remaining),
        'X-Scan-Plan': plan,
        'X-Scan-Resets-At': q.resetsAt,
    };

    if (!q.allowed) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: AI_QUOTA_EXCEEDED, limit, plan, resetsAt: q.resetsAt },
                { status: 429, headers },
            ),
        };
    }

    return {
        ok: true,
        userId,
        plan,
        limit,
        remaining: q.remaining,
        resetsAt: q.resetsAt,
        commit: () => commitScan(userId, now),
        headers,
    };
}
