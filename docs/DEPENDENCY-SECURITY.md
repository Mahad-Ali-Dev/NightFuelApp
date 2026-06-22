# Dependency security — open advisories & migration plan

Status as of 2026-06-22. The CI `npm audit` and `pip-audit` jobs are
**informational (`continue-on-error: true`)**, not hard gates — they still run and
print every advisory, but they don't red-bar all of CI on vulnerabilities whose
only fix is a major framework migration. This file is the tracked record of why,
and the plan to resolve them.

## Why these aren't auto-fixed

Every open high/critical advisory resolves only via a **major-version bump**, and
`npm audit fix --force` would bump them all at once (verified via dry-run):
`@fastify/jwt` v8→v10, `fastify` v4→v5, plus `react-native`, `expo`, `next`, and
`nodemailer` majors. That would break auth across all services and the mobile app
simultaneously — a far bigger security risk than the advisories themselves. So the
upgrade is a deliberate, separately-tested migration, not a reckless one-shot.

## Open advisories

| Package | Severity | Issue | Fix path |
|---|---|---|---|
| `fast-jwt` (via `@fastify/jwt` v8) | critical | empty-HMAC-secret bypass, algorithm confusion | `@fastify/jwt` v10 (needs fastify v5) |
| `fast-uri` (via `fastify` v4/5) | high | path traversal / host confusion in URI parsing | `fastify` ≥ 5.8.5 |
| `form-data` | high | CRLF injection via unescaped field names | transitive bump |
| `react-native` / `expo` / `next` | high | various | framework majors (RN 0.86 / Expo 56 / Next 16) |

## Mitigation already in place (the important one)

The **most severe** advisory — `fast-jwt` accepting an **empty HMAC secret** →
JWT auth bypass — is **not reachable in this app**. Every service validates
`JWT_SECRET` at boot and **requires ≥ 32 characters**
(`auth-service/src/index.ts`, `@nightfuel/config`), so an empty/short secret fails
startup and the bypass path can never be exercised. The algorithm-confusion
variants require an RSA-key verifier config the services don't use (they use HS*
with the shared secret).

## Migration plan (the tracked follow-up)

A dedicated, gate-tested sprint, in this order to bound risk:

1. **Backend auth core** — bump the 10 services to `fastify` v5 + `@fastify/jwt`
   v10; run every auth + route suite; verify `request.jwtVerify()` / `fastify.jwt`
   API parity (it's stable across v8→v10) and the `@fastify/*` plugin set.
2. **`fast-uri` / `form-data`** — fall out of the fastify v5 bump; confirm.
3. **Mobile** — `expo` 56 + `react-native` 0.86 on their own branch with a full
   EAS build + device smoke test (these are the riskiest; do last, isolated).
4. **Python** — bump the `fastapi` / `langchain` / `pydantic` tree together; run
   the ai-pipeline + circadian suites.

Re-enable the audit jobs as **hard gates** (remove `continue-on-error`) once the
tree is clean.
