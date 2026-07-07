// ── Shared data-retention / TTL helper ────────────────────────────────────────
// Closes audit finding F34 #17 (GDPR Art. 5(1)(e) storage-limitation): give the
// owner a CONFIGURABLE, time-based purge of ARCHIVAL special-category data, while
// guaranteeing the mechanism is DEFAULT-OFF — nothing is deleted until the owner
// sets a positive retention window, and user-valuable history is never auto-purged
// (that stays gated behind on-request erasure, F36).
//
// This module is PURE and dependency-free (imports nothing at runtime), so the
// cutoff math + the enabled guard are unit-testable in isolation and reusable by
// every service's retention sweep without pulling Prisma/Fastify/zod into scope.
//
// The single source of truth for the policy is: `retentionDays > 0` means
// "delete rows older than `retentionDays` days"; ANY non-positive / non-finite /
// unset value (0, negative, NaN) means DISABLED — no purge, ever. Services read
// their window from an env var that DEFAULTS TO 0, so the default deployment is a
// byte-identical no-op.

/**
 * Number of milliseconds in one whole day. Named so the cutoff math reads
 * intent-first instead of repeating the magic 86_400_000 literal (mirrors
 * range-bounds.ts's MS_PER_DAY).
 */
const MS_PER_DAY = 86_400_000;

/**
 * The retention guard: is a time-based purge ENABLED for this window?
 *
 * Returns `true` ONLY for a finite, strictly-positive `retentionDays`. Every
 * other value — `0`, a negative number, `NaN`, `Infinity`, or `undefined`
 * (an unset env that defaulted to 0/undefined) — returns `false`, i.e. DISABLED.
 * Callers MUST gate their sweep on this so the default-off path can never delete.
 *
 * @param retentionDays The configured retention window in whole days (or unset).
 * @returns `true` iff `retentionDays` is a finite number > 0.
 */
export function retentionEnabled(retentionDays: number | undefined | null): boolean {
    return typeof retentionDays === 'number' && Number.isFinite(retentionDays) && retentionDays > 0;
}

/**
 * Compute the retention CUTOFF instant: rows whose timestamp is strictly OLDER
 * than the returned Date are eligible for purge. `cutoff = now - retentionDays`.
 *
 * Pure and deterministic — `now` is injected so the result is testable without
 * touching the wall clock. Use it ONLY when {@link retentionEnabled} is true; a
 * non-positive `retentionDays` is a programming error here (the guard should have
 * short-circuited the sweep first), so this throws rather than silently computing
 * a cutoff in the future that could delete recent data.
 *
 * @param retentionDays The retention window in whole days (must be finite > 0).
 * @param now           The reference "now" instant (inject a fixed Date in tests).
 * @returns             A Date `retentionDays` days before `now`.
 * @throws              If `retentionDays` is not a finite number > 0.
 */
export function retentionCutoff(retentionDays: number, now: Date): Date {
    if (!retentionEnabled(retentionDays)) {
        throw new Error('retentionCutoff requires retentionDays > 0 (guard with retentionEnabled first)');
    }
    return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}
