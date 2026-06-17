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

// ── Canonical 401 helper (payload variant) ────────────────────────────────────
// Distinct from sendUnauthorized() above. That one fires when the Bearer token
// is missing/malformed/expired (jwtVerify() threw). THIS one fires AFTER the
// signature checks pass but the decoded payload is structurally unusable —
// e.g. `request.user` has no `userId`/`id` field, or the field isn't a string.
// Keeping the bodies different (Bearer-token-required vs payload-invalid) lets
// clients distinguish "log back in" from "re-issue token" without us leaking
// the underlying validation detail. Use `request.log.warn` (not error) because
// a malformed payload is far more likely a stale/legacy token than a server
// bug — error log levels page on-call.
export const UNAUTHORIZED_PAYLOAD_BODY = {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Token payload is invalid or missing userId.',
} as const;

/**
 * Reply with the canonical payload-invalid 401 body, logging the cause.
 *
 * Same loose typing as sendUnauthorized — see the note above. `err` is
 * optional because most callers reach this branch via a `!userId` check
 * rather than a thrown error.
 *
 * @param reply   Fastify reply — the 401 is sent on it.
 * @param request Fastify request — used only for structured logging (optional).
 * @param err     Optional underlying error (logged, never sent).
 */
export function sendUnauthorizedPayload(reply: any, request?: any, err?: unknown) {
    if (request?.log?.warn) request.log.warn({ err }, 'auth token payload invalid');
    return reply.code(401).send(UNAUTHORIZED_PAYLOAD_BODY);
}
