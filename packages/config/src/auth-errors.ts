// ── Canonical 401 helper ──────────────────────────────────────────────────────
// Shared by every service's `authenticate` decorator. @fastify/jwt's
// request.jwtVerify() throws typed FST_JWT_* errors (no token, malformed,
// expired, bad signature). Serializing that raw error to the client leaks
// internal error codes/shapes, so instead we log the real cause server-side and
// return one stable, generic body. Keep this body byte-for-byte identical to the
// inline version in user-service/src/index.ts so all services answer the same.

export const UNAUTHORIZED_BODY = {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'A valid Bearer token is required.',
} as const;

/**
 * Reply with the canonical 401 body, logging the real verification error.
 *
 * Typed loosely (`any`) on purpose: services pass their Fastify reply/request
 * with varying type-provider generics, and this helper only touches the small
 * surface (`reply.code().send()`, `request.log.error`) common to all of them.
 *
 * @param reply   Fastify reply — the 401 is sent on it.
 * @param request Fastify request — used only for structured logging (optional).
 * @param err     The original error thrown by jwtVerify() (logged, never sent).
 */
export function sendUnauthorized(reply: any, request?: any, err?: unknown) {
    if (request?.log?.error) request.log.error({ err }, 'auth token verification failed');
    return reply.code(401).send(UNAUTHORIZED_BODY);
}
