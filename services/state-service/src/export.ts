// ── GDPR data export — state-service (F35a, GDPR right-to-access) ─────────────
// Read-only counterpart of purgeUser (src/purge.ts). Returns EVERY state-service
// row owned by a single user across the EXACT SAME user-owned table set the purge
// erases, so right-to-access and right-to-erasure stay in sync. The state service
// has exactly ONE user-owned table:
//
//   user_states  (model UserState)  keyed by user_id (UserState.userId @unique)
//
// Because user_id is @unique there is AT MOST ONE row per user, so the export is
// inherently bounded (no row cap needed); we still return it under an array-shaped
// `user_states` key for a uniform per-table export shape and so that future
// user-owned tables added here mirror the purge cleanly.
//
// SECURITY: this table holds NO credential. Every column is the user's own
// adherence / sleep-quality / fatigue / weight / calorie & protein target /
// training-phase / cycle-week state plus bookkeeping (id, last_event_id,
// last_processed_at, updated_at). There is NO password/token/secret/raw-key
// column to leak (push-endpoint keys live in notification-service, not here), so
// the row is returned verbatim. If a secret/token/key column is EVER added to
// user_states, it MUST be stripped (or summarized as "present") here before
// returning — mirror the purge AND keep secrets out.
//
// READ-ONLY & IDEMPOTENT: only findMany runs; calling it twice yields identical
// output and never mutates state.
//
// Kept in its own module (not inline in index.ts) so the real read logic is
// unit-testable against a mock Prisma without importing the service bootstrap
// (index.ts opens DB/Redis connections at import time).

import { PrismaClient } from './generated/prisma';

// A structurally-minimal Prisma surface: just what exportUser touches. Lets the
// test pass an in-memory fake without reproducing the full generated client.
export interface ExportPrisma {
    userState: { findMany: (args: { where: { userId: string } }) => Promise<any[]> };
}

// Per-table rows keyed by the PHYSICAL table name (@@map), matching PurgeCounts
// keys so export and erasure describe the same table set.
export interface ExportData {
    user_states: any[];
}

/**
 * Read all of this user's state-service rows for GDPR data export.
 *
 * @returns data keyed by physical table name. Always resolves; an empty array
 *          when the user owns no rows (idempotent, never throws).
 */
export async function exportUser(prisma: PrismaClient | ExportPrisma, userId: string): Promise<ExportData> {
    // findMany (not findUnique) keeps a uniform array-shaped per-table result and
    // returns [] — not null — when the user has no row. user_id is @unique so this
    // yields at most one row; no take/limit is required to bound it.
    const userStates = await (prisma as ExportPrisma).userState.findMany({ where: { userId } });

    return {
        user_states: userStates,
    };
}
