/**
 * UserService.logPeriod — IDEMPOTENCY suite (data-integrity LOW #9).
 *
 * A double-submit of the SAME period start must NOT duplicate a period_logs row
 * (duplicate starts skew the learned avg_cycle_length_days / avg_period_length_days
 * and the regularity classification). logPeriod now appends via
 * createMany({ skipDuplicates: true }) against the @@unique([userId, startDate])
 * constraint, so a re-submit silently keeps the single existing row and still
 * recomputes + returns the current stats.
 *
 * This drives the REAL UserService.logPeriod over a stateful FAKE prisma whose
 * periodLog.createMany enforces the unique (userId, startDate) constraint exactly
 * like Postgres + skipDuplicates would, plus a no-op event bus. ensureProfileExists
 * and recalculateCyclePhase both swallow their own errors, so the minimal fake is
 * sufficient to exercise the append + recompute path.
 */
import { UserService } from '../src/user.service';

const USER = 'user-1';

// Build a stateful fake prisma that enforces @@unique([userId, startDate]) on
// period_logs (date-granularity, matching the @db.Date column) and supports the
// handful of reads/writes logPeriod touches.
function makeFakePrisma() {
    const periodRows: any[] = [];
    const dayKey = (userId: string, startDate: Date) =>
        `${userId}|${new Date(startDate).toISOString().slice(0, 10)}`;

    const profile: any = {
        userId: USER,
        biologicalSex: 'FEMALE',
        cycleTrackingEnabled: true,
    };

    return {
        rows: periodRows,
        prisma: {
            userProfile: {
                count: async () => 1,
                findUnique: async () => profile,
                update: async ({ data }: any) => {
                    Object.assign(profile, data);
                    return profile;
                },
            },
            periodLog: {
                createMany: async ({ data, skipDuplicates }: any) => {
                    let inserted = 0;
                    for (const row of data) {
                        const key = dayKey(row.userId, row.startDate);
                        const dup = periodRows.some((r) => dayKey(r.userId, r.startDate) === key);
                        if (skipDuplicates && dup) continue;
                        periodRows.push({ id: `p-${periodRows.length}`, ...row });
                        inserted++;
                    }
                    return { count: inserted };
                },
                findMany: async () =>
                    [...periodRows].sort(
                        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
                    ),
            },
            userStatus: {
                // touched indirectly via updateUserStatus; keep it inert.
                upsert: async () => ({}),
                update: async () => ({}),
                findUnique: async () => null,
            },
        },
    };
}

const fakeBus = { publish: async () => {} } as any;

describe('UserService.logPeriod — idempotency (double-submit)', () => {
    it('double logPeriod with the same startDate => ONE row', async () => {
        const { prisma, rows } = makeFakePrisma();
        const svc = new UserService(prisma as any, fakeBus);

        await svc.logPeriod(USER, { startDate: '2026-06-01' } as any);
        expect(rows).toHaveLength(1);

        // Re-submit the identical start (double-tap / retry).
        await svc.logPeriod(USER, { startDate: '2026-06-01' } as any);
        expect(rows).toHaveLength(1); // no duplicate
    });

    it('a duplicate start with a different time-of-day is still deduped (DATE granularity)', async () => {
        const { prisma, rows } = makeFakePrisma();
        const svc = new UserService(prisma as any, fakeBus);

        await svc.logPeriod(USER, { startDate: '2026-06-01T00:00:00.000Z' } as any);
        await svc.logPeriod(USER, { startDate: '2026-06-01T09:30:00.000Z' } as any);
        expect(rows).toHaveLength(1);
    });

    it('distinct period starts still each create a row (dedup is per-day, not global)', async () => {
        const { prisma, rows } = makeFakePrisma();
        const svc = new UserService(prisma as any, fakeBus);

        await svc.logPeriod(USER, { startDate: '2026-06-01' } as any);
        await svc.logPeriod(USER, { startDate: '2026-06-29' } as any);
        expect(rows).toHaveLength(2);
    });
});
