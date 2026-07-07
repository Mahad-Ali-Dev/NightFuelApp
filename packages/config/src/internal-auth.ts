// ── Shared internal-service-token guard (F34 #5) ──────────────────────────────
// Defense-in-depth for server-to-server-only "/internal/*" routes. Until F34 the
// ONLY thing protecting these PII routes was the nginx edge `return 404` on
// /v1/<svc>/internal/* — and that edge is bypassable (every app container also
// published its port on the host). This guard adds an in-service check so a
// request that reaches the route directly (over the Docker network or a
// bypassed edge) must still present the shared INTERNAL_SERVICE_TOKEN.
//
// Behaviour, deliberately mirroring the nginx edge:
//   - missing / wrong token  -> 404 (NOT 401/403): never reveal that the route
//     exists. The body matches Fastify's stock not-found shape so a probe can't
//     distinguish a guarded internal route from a genuinely absent path.
//   - correct token          -> falls through to the real handler.
//
// The compare is constant-time (crypto.timingSafeEqual) to avoid leaking the
// token via response-time analysis. An unset/empty expected token fails closed:
// every request 404s (the route is effectively disabled until the token is set).

import { timingSafeEqual } from 'crypto';

// The literal Fastify emits for an unmatched route. Returning this exact body on
// a token mismatch makes a guarded-but-present route indistinguishable from a
// route that does not exist.
export const NOT_FOUND_BODY = {
    statusCode: 404,
    error: 'Not Found',
    message: 'Route not found',
} as const;

/**
 * Constant-time string equality. Returns false for empty/mismatched inputs and
 * never throws (length-mismatched buffers are compared against themselves so
 * timingSafeEqual's equal-length precondition holds, then rejected on length).
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
    if (!a || !b) return false;
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
        // Still do a constant-time compare against ourselves so the early-return
        // path doesn't leak length via timing, then fail on the length check.
        timingSafeEqual(ab, ab);
        return false;
    }
    return timingSafeEqual(ab, bb);
}

/**
 * Build a Fastify preHandler that authorizes a server-to-server caller by the
 * `X-Internal-Token` request header (constant-time compared to `expectedToken`).
 *
 * On mismatch it replies 404 with the stock not-found body and returns — the
 * real route handler never runs. Attach it via `preHandler` (or `onRequest`) on
 * every `/internal/*` route:
 *
 *     const internalAuth = makeInternalAuthGuard(config.INTERNAL_SERVICE_TOKEN);
 *     fastify.get('/internal/all', { preHandler: internalAuth }, handler);
 *
 * Loosely typed (`any`) for the same reason as the shared 401 helper: services
 * carry different type-provider generics and this only touches the small common
 * surface (`request.headers`, `reply.code().send()`).
 */
export function makeInternalAuthGuard(expectedToken: string | undefined) {
    const expected = expectedToken ?? '';
    return async function internalAuthGuard(request: any, reply: any): Promise<void> {
        // Header names are lower-cased by Node's HTTP layer.
        const provided = request?.headers?.['x-internal-token'];
        const token = Array.isArray(provided) ? provided[0] : provided;
        if (typeof token !== 'string' || !timingSafeEqualStr(token, expected)) {
            if (request?.log?.warn) {
                request.log.warn(
                    { url: request?.url, method: request?.method },
                    'internal route rejected: missing/invalid X-Internal-Token',
                );
            }
            reply.code(404).send(NOT_FOUND_BODY);
            return;
        }
        // Valid token — fall through to the route handler.
    };
}
