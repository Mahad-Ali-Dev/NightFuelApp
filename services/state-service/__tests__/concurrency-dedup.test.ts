/**
 * Regression suite — state-service materializer CONCURRENCY / IDEMPOTENCY
 * (src/materializer.ts: runLockedUpsert, exercised via handleMealLogged +
 * handleSleepLogged).
 *
 * Locks the data-integrity fixes for the read-modify-write handlers, which run
 * over Redis Pub/Sub (EventBus.subscribe, dispatched with Promise.all — NO
 * consumer group), so concurrent / redelivered same-user events could corrupt
 * the adherence window and the bounded fatigue score:
 *
 *   (1) DEDUP GUARD — when the incoming event.eventId equals the row's stored
 *       lastEventId (an immediate redelivery of the last event), the handler
 *       must SKIP the write entirely. This is what stops a redelivered sleep
 *       event from double-stepping fatigue, or a redelivered meal event from
 *       re-folding the same adherence sample.
 *
 *   (2) TRANSACTIONAL / LOCKED PATH — the read → compute → upsert runs inside a
 *       single $transaction that first takes a `SELECT … FOR UPDATE` row lock
 *       (via $queryRaw). We assert the ordering (lock acquired before the read,
 *       upsert issued on the SAME transaction client) so a concurrent same-user
 *       handler is serialized by the DB rather than racing the in-memory value.
 *
 *   (3) FIRST-INSERT RETRY — for a brand-new user there is no row to lock, so
 *       two simultaneous first events race the insert; the loser hits the
 *       unique(userId) constraint (P2002) and the handler retries ONCE. We
 *       assert exactly one retry and an eventual successful upsert.
 *
 * Driven with a fake Prisma that records the order of operations on the
 * transaction client — no real infra is touched. This is the same class-module
 * style as state-finite.test.ts / adherence-window.test.ts.
 */
import { StateMaterializer } from '../src/materializer';

const USER = 'user-1';

interface UpsertCall {
    where: { userId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
}

/**
 * Build a StateMaterializer over a fake Prisma whose $transaction supplies a tx
 * client recording the operation order. `existingRow` is the row returned from
 * findUnique (and dictates whether the lock query reports the row as present).
 */
function makeMaterializer(existingRow: Record<string, unknown> | null = null) {
    const calls: UpsertCall[] = [];
    const ops: string[] = []; // ordered log of tx operations
    const userState = {
        findUnique: async () => {
            ops.push('read');
            return existingRow;
        },
        upsert: async (args: UpsertCall) => {
            ops.push('upsert');
            calls.push(args);
            return {};
        },
    };
    const tx = {
        userState,
        $queryRaw: async () => {
            ops.push('lock');
            return existingRow ? [1] : [];
        },
    };
    const fakePrisma: any = {
        userState,
        $queryRaw: tx.$queryRaw,
        $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
    };
    return { materializer: new StateMaterializer(fakePrisma), calls, ops };
}

function sleepEvent(eventId: string, payload: Record<string, unknown>) {
    return { eventId, userId: USER, payload } as any;
}
function mealEvent(eventId: string, payload: Record<string, unknown>) {
    return { eventId, userId: USER, payload } as any;
}

describe('state-service materializer — idempotency dedup guard (lastEventId)', () => {
    it('handleSleepLogged SKIPS the write when eventId == stored lastEventId (redelivery)', async () => {
        // Row already shows this exact event as the last one processed.
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 5, lastEventId: 'evt-dup' });
        await materializer.handleSleepLogged(sleepEvent('evt-dup', { quality: 5, disturbances: 9 }));

        // Duplicate → no upsert at all → fatigue is NOT double-stepped.
        expect(calls).toHaveLength(0);
    });

    it('handleSleepLogged PROCESSES a new event (eventId != stored lastEventId)', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 5, lastEventId: 'evt-old' });
        await materializer.handleSleepLogged(sleepEvent('evt-new', { quality: 5, disturbances: 9 }));

        expect(calls).toHaveLength(1);
        expect(calls[0].update.fatigueLevel).toBe(6); // stepped exactly once
        expect(calls[0].update.lastEventId).toBe('evt-new');
    });

    it('handleMealLogged SKIPS a redelivered meal event (no re-fold of the sample)', async () => {
        const { materializer, calls } = makeMaterializer({
            adherenceSamples: [],
            lastEventId: 'meal-dup',
        });
        await materializer.handleMealLogged(
            mealEvent('meal-dup', { mealLogId: 'm1', isAdherent: false }),
        );

        expect(calls).toHaveLength(0);
    });

    it('handleMealLogged PROCESSES a new meal event', async () => {
        const { materializer, calls } = makeMaterializer({
            adherenceSamples: [],
            lastEventId: 'meal-old',
        });
        await materializer.handleMealLogged(
            mealEvent('meal-new', { mealLogId: 'm2', isAdherent: false }),
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].update.lastEventId).toBe('meal-new');
    });
});

describe('state-service materializer — transactional / locked read-modify-write', () => {
    it('takes the row lock BEFORE reading, and upserts inside the same transaction', async () => {
        const { materializer, ops } = makeMaterializer({ fatigueLevel: 5, lastEventId: 'evt-old' });
        await materializer.handleSleepLogged(sleepEvent('evt-new', { quality: 5, disturbances: 9 }));

        // Order proves serialization: lock → read → upsert, all on the tx client.
        expect(ops).toEqual(['lock', 'read', 'upsert']);
    });

    it('a brand-new user (no row to lock) still upserts (insert path) without a pre-read', async () => {
        // existingRow null → lock query returns empty → no findUnique, straight to upsert.
        const { materializer, ops, calls } = makeMaterializer(null);
        await materializer.handleSleepLogged(sleepEvent('evt-1', { quality: 7, disturbances: 0 }));

        expect(ops).toEqual(['lock', 'upsert']); // no 'read' — nothing to lock/read
        expect(calls).toHaveLength(1);
        expect(calls[0].create.fatigueLevel).toBe(3.0); // disturbances 0 → not fatigued
    });
});

describe('state-service materializer — first-insert P2002 retry', () => {
    it('retries exactly once when the first insert loses the unique(userId) race', async () => {
        // First attempt: no row exists, the upsert throws P2002 (lost the insert
        // race). Second attempt: the row now exists, lock+read+upsert succeed.
        const calls: UpsertCall[] = [];
        let rowExists = false; // flips true after the winning insert (simulated)
        let upsertAttempts = 0;

        const userState = {
            findUnique: async () => (rowExists ? { fatigueLevel: 5, lastEventId: 'winner' } : null),
            upsert: async (args: UpsertCall) => {
                upsertAttempts += 1;
                if (upsertAttempts === 1) {
                    // The concurrent winner committed between our lock check and write.
                    rowExists = true;
                    const e: any = new Error('Unique constraint failed');
                    e.code = 'P2002';
                    throw e;
                }
                calls.push(args);
                return {};
            },
        };
        const tx = {
            userState,
            $queryRaw: async () => (rowExists ? [1] : []),
        };
        const fakePrisma: any = {
            userState,
            $queryRaw: tx.$queryRaw,
            $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
        };
        const materializer = new StateMaterializer(fakePrisma);

        await materializer.handleSleepLogged(sleepEvent('evt-1', { quality: 7, disturbances: 9 }));

        // Two upsert attempts total (1 failed insert + 1 successful retry).
        expect(upsertAttempts).toBe(2);
        expect(calls).toHaveLength(1);
        // Retry folded our step onto the winner's committed fatigue (5 + 1 = 6).
        expect(calls[0].update.fatigueLevel).toBe(6);
    });

    it('does NOT retry on a non-P2002 error (it propagates)', async () => {
        const userState = {
            findUnique: async () => null,
            upsert: async () => {
                const e: any = new Error('connection lost');
                e.code = 'P1001';
                throw e;
            },
        };
        const tx = { userState, $queryRaw: async () => [] };
        const fakePrisma: any = {
            userState,
            $queryRaw: tx.$queryRaw,
            $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
        };
        const materializer = new StateMaterializer(fakePrisma);

        await expect(
            materializer.handleSleepLogged(sleepEvent('evt-1', { quality: 7, disturbances: 0 })),
        ).rejects.toThrow('connection lost');
    });
});
