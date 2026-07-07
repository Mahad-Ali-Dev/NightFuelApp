// ── GDPR purge — state-service (F35a) ────────────────────────────────────────
// Permanently erase EVERY state-service row owned by a single user. The state
// service has exactly ONE user-owned table:
//
//   user_states  (model UserState)  keyed by user_id (UserState.userId @unique)
//
// (Verified by grepping prisma/schema.prisma for user-id columns — there are no
// relation-keyed child tables in this service, so there is nothing else to
// cascade.)
//
// IDEMPOTENT by construction: deleteMany never throws on zero matched rows, so
// purging a user who owns nothing returns { user_states: 0 } with no error, and
// re-purging the same user is a safe no-op. The delete is wrapped in a
// $transaction so that — even though there is currently a single table — adding
// future user-owned tables here keeps the whole purge atomic (all-or-nothing).
//
// Kept in its own module (not inline in index.ts) so the real delete logic is
// unit-testable against a mock Prisma without importing the service bootstrap
// (index.ts opens DB/Redis connections at import time).

import { PrismaClient } from './generated/prisma';

// A structurally-minimal Prisma surface: just what purgeUser touches. Lets the
// test pass an in-memory fake without reproducing the full generated client.
export interface PurgePrisma {
    userState: { deleteMany: (args: { where: { userId: string } }) => Promise<{ count: number }> };
    $transaction: <T>(ops: Promise<T>[]) => Promise<T[]>;
}

// Per-table delete counts keyed by the PHYSICAL table name (@@map), so the
// summary is stable regardless of the Prisma model accessor name.
export interface PurgeCounts {
    user_states: number;
}

/**
 * Permanently delete all of this user's state-service rows.
 *
 * @returns deletedCounts keyed by physical table name. Always resolves (never
 *          throws) when the user owns no rows — idempotent.
 */
export async function purgeUser(prisma: PrismaClient | PurgePrisma, userId: string): Promise<PurgeCounts> {
    // Wrap in a transaction so multi-table purges (current + future) are atomic.
    // deleteMany matches WHERE user_id = $userId and never throws on zero rows.
    const [userStates] = await (prisma as PurgePrisma).$transaction([
        (prisma as PurgePrisma).userState.deleteMany({ where: { userId } }),
    ]);

    return {
        user_states: userStates.count,
    };
}
