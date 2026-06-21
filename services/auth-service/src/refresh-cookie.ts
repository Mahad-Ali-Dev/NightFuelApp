/**
 * Refresh-token cookie helpers (HIGH #1 — web XSS hardening).
 *
 * The web client must NOT hold the long-lived refresh token in JS-readable
 * storage (localStorage), or any XSS can steal it and mint sessions forever.
 * Instead, auth-service sets the refresh token in an httpOnly + Secure +
 * SameSite=Lax cookie that JavaScript cannot read, and the browser replays it
 * automatically on the same-origin /api/auth/* calls (axios withCredentials).
 *
 * These helpers build/parse the cookie with the raw Set-Cookie / Cookie headers
 * so we add NO new runtime dependency (@fastify/cookie is not installed and we
 * must not run npm install). The mobile client is unaffected: it reads the
 * refresh token from the JSON body and ignores cookies entirely, so login /
 * refresh keep returning the token in the body too (backward compatible).
 */

// Name of the httpOnly refresh-token cookie. Kept short and unguessable-prefix
// free; the value itself is the 256-bit random refresh token.
export const REFRESH_COOKIE_NAME = 'nf_refresh';

// 30 days, matching the refresh token's DB expiry in AuthService.generateTokens.
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Secure only outside local dev — a Secure cookie is dropped by the browser over
// plain http://, which would silently break the dev login flow. Production runs
// behind TLS so the flag is set there.
const isProd = process.env.NODE_ENV === 'production';

/**
 * Build the Set-Cookie header value that stores the refresh token.
 *
 * - httpOnly:  JS cannot read it (defeats XSS token theft) — the whole point.
 * - Secure:    only sent over HTTPS (prod); omitted in dev so http:// works.
 * - SameSite=Lax: sent on top-level same-site navigations + same-origin XHR
 *                 (the web app is same-origin with /api/auth via the nginx/Next
 *                 proxy), while blocking cross-site POSTs (CSRF hardening).
 * - Path=/:    the browser only ever requests the web origin; the refresh call
 *              is /api/auth/refresh, so Path=/ guarantees the cookie is replayed
 *              (the upstream sees /v1/auth/refresh but the BROWSER applies Path
 *              against the URL it requested, /api/auth/..., hence Path=/).
 */
export function buildRefreshCookie(refreshToken: string): string {
    const parts = [
        `${REFRESH_COOKIE_NAME}=${refreshToken}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${REFRESH_COOKIE_MAX_AGE_SECONDS}`,
    ];
    if (isProd) parts.push('Secure');
    return parts.join('; ');
}

/**
 * Build the Set-Cookie header value that CLEARS the refresh cookie (logout).
 * Same attributes as the setter (browsers match on name/path) with Max-Age=0
 * and an epoch Expires so it is removed immediately.
 */
export function buildClearedRefreshCookie(): string {
    const parts = [
        `${REFRESH_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ];
    if (isProd) parts.push('Secure');
    return parts.join('; ');
}

/**
 * Read the refresh token from the raw Cookie request header. Returns undefined
 * when the header is absent or the cookie is not present. Tolerant of multiple
 * cookies, surrounding whitespace, and '=' inside values.
 */
export function readRefreshCookie(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const pair of cookieHeader.split(';')) {
        const eq = pair.indexOf('=');
        if (eq === -1) continue;
        const name = pair.slice(0, eq).trim();
        if (name === REFRESH_COOKIE_NAME) {
            return pair.slice(eq + 1).trim();
        }
    }
    return undefined;
}
