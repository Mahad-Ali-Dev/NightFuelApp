import { PrismaClient, Shift } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { CreateShiftBody, UpdateShiftBody, GetShiftsQuery } from './schemas';
import { Channels } from '@nightfuel/types';
import { randomUUID } from 'crypto';

export class ShiftService {
    constructor(
        private prisma: PrismaClient,
        private eventBus: RedisEventBus
    ) { }

    // userId is passed explicitly from the route (extracted from JWT), never from the request body
    async createShift(body: CreateShiftBody, userId: string): Promise<Shift> {
        const shift = await this.prisma.shift.upsert({
            where: {
                userId_shiftDate: {
                    userId,
                    shiftDate: new Date(body.shiftDate),
                },
            },
            update: {
                startTime: body.startTime,
                endTime: body.endTime,
                shiftType: body.shiftType,
                isDayOff: body.isDayOff,
                commuteMinutes: body.commuteMinutes,
            },
            create: {
                userId,
                shiftDate: new Date(body.shiftDate),
                startTime: body.startTime,
                endTime: body.endTime,
                shiftType: body.shiftType,
                isDayOff: body.isDayOff,
                commuteMinutes: body.commuteMinutes,
            },
        });

        try {
            await this.eventBus.publish(Channels.Shift.ShiftCreated, {
                eventId: randomUUID(),
                eventType: 'shift.created',
                producedAt: new Date().toISOString(),
                producerService: 'shift-service',
                correlationId: randomUUID(),
                userId,
                payload: shift,
            });
        } catch (e: any) {
            console.error('Failed to publish shift.created event:', e.message);
        }

        return shift;
    }

    // userId from JWT is authoritative — query.userId optional field is ignored
    async getShifts(query: GetShiftsQuery, userId: string): Promise<Shift[]> {
        return this.prisma.shift.findMany({
            where: {
                userId,
                shiftDate: {
                    gte: new Date(query.start),
                    lte: new Date(query.end),
                },
            },
            orderBy: {
                shiftDate: 'asc',
            },
        });
    }

    async getCurrentShift(userId: string): Promise<Shift | null> {
        const now = new Date();
        return this.prisma.shift.findFirst({
            where: {
                userId,
                endTime: { gt: now }, // Shift has not ended yet
            },
            orderBy: {
                startTime: 'asc', // Get the one closest to now (either active or next upcoming)
            },
        });
    }

    async getShiftById(id: string, userId: string): Promise<Shift | null> {
        return this.prisma.shift.findUnique({
            where: { id, userId },
        });
    }

    async updateShift(id: string, userId: string, body: UpdateShiftBody): Promise<Shift> {
        const existingShift = await this.prisma.shift.findUnique({
            where: { id, userId },
        });

        if (!existingShift) {
            throw new Error('Shift not found');
        }

        const shift = await this.prisma.shift.update({
            where: { id },
            data: {
                ...body,
                shiftDate: body.shiftDate ? new Date(body.shiftDate) : undefined,
            },
        });

        try {
            await this.eventBus.publish(Channels.Shift.ShiftUpdated, {
                eventId: randomUUID(),
                eventType: 'shift.updated',
                producedAt: new Date().toISOString(),
                producerService: 'shift-service',
                correlationId: randomUUID(),
                userId,
                payload: shift,
            });
        } catch (e: any) {
            console.error('Failed to publish shift.updated event:', e.message);
        }

        return shift;
    }

    // ── GDPR purge (F35a) ────────────────────────────────────────────────────────
    // PERMANENTLY erase EVERY shift-service row owned by `userId` across all three
    // user-owned tables (shifts, rotation_patterns, scheduled_sessions). All three
    // are keyed by a single `user_id` column (verified against the schema), so a
    // delete-by-userId removes exactly this user's rows and nothing belonging to
    // another user. There are no cross-user relations here — scheduled_sessions'
    // optional `shift_id` points only at one of the SAME user's shifts.
    //
    // IDEMPOTENT: deleteMany never throws on zero matches, so purging a user with
    // no rows returns all-zero counts and re-purging is safe.
    //
    // shifts + rotation_patterns are always-present base tables, so their deletes
    // run together in a $transaction (all-or-nothing). scheduled_sessions is
    // created by a USER-GATED migration that may be un-run (see training.routes.ts);
    // its delete is issued separately and tolerates the missing-table error (P2021)
    // by reporting 0 — mirroring this service's existing graceful-degradation
    // contract rather than failing the whole purge before the table exists.
    async purgeUser(userId: string): Promise<{
        shifts: number;
        rotation_patterns: number;
        scheduled_sessions: number;
    }> {
        const [shifts, rotationPatterns] = await this.prisma.$transaction([
            this.prisma.shift.deleteMany({ where: { userId } }),
            this.prisma.rotationPattern.deleteMany({ where: { userId } }),
        ]);

        let scheduledSessions = 0;
        try {
            const res = await this.prisma.scheduledSession.deleteMany({ where: { userId } });
            scheduledSessions = res.count;
        } catch (err: any) {
            // P2021 = table does not exist (un-run scheduled_sessions migration).
            // Treat the absent table as "zero rows to purge"; anything else is a
            // genuine fault and must propagate to the 500 handler.
            const message = typeof err?.message === 'string' ? err.message : '';
            const missingTable =
                err?.code === 'P2021' ||
                /relation "scheduled_sessions" does not exist/i.test(message) ||
                /table.*scheduled_sessions.*does not exist/i.test(message);
            if (!missingTable) throw err;
        }

        return {
            shifts: shifts.count,
            rotation_patterns: rotationPatterns.count,
            scheduled_sessions: scheduledSessions,
        };
    }

    // ── GDPR data export (F35a, Right of Access) ─────────────────────────────────
    // READ-ONLY counterpart of purgeUser. Returns EVERY shift-service row owned by
    // `userId` across the SAME three user-owned tables the purge erases (shifts,
    // rotation_patterns, scheduled_sessions), keyed by table name, so export and
    // erasure stay in sync. No writes ever occur; calling it twice yields the same
    // result (idempotent).
    //
    // SECURITY: this service stores NO secrets/credentials/tokens — every column on
    // all three tables is non-sensitive scheduling data — so every column is safe to
    // emit verbatim. (There is nothing to scrub here, unlike notification-service's
    // push_subscriptions endpoint/auth/p256dh keys.)
    //
    // BOUNDS: shifts is per-user but capped at one row per (user, date), and
    // rotation_patterns / scheduled_sessions are small per user, so each findMany is
    // bounded by `take: EXPORT_ROW_LIMIT + 1` to detect (and flag) absurd row counts
    // rather than read unboundedly. shifts + rotation_patterns are always-present
    // base tables; scheduled_sessions is created by a USER-GATED migration that may
    // be un-run, so its read tolerates the missing-table error (P2021) by returning
    // an empty list — mirroring purgeUser's graceful-degradation contract.
    async exportUser(userId: string): Promise<{
        shifts: Shift[];
        rotation_patterns: any[];
        scheduled_sessions: any[];
        _meta: {
            shiftsTruncated: boolean;
            rotationPatternsTruncated: boolean;
            scheduledSessionsTruncated: boolean;
            rowLimit: number;
        };
    }> {
        const cap = EXPORT_ROW_LIMIT;

        const [shifts, rotationPatterns] = await Promise.all([
            this.prisma.shift.findMany({
                where: { userId },
                orderBy: { shiftDate: 'desc' },
                take: cap + 1,
            }),
            this.prisma.rotationPattern.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: cap + 1,
            }),
        ]);

        let scheduledSessions: any[] = [];
        try {
            scheduledSessions = await this.prisma.scheduledSession.findMany({
                where: { userId },
                orderBy: { scheduledAt: 'desc' },
                take: cap + 1,
            });
        } catch (err: any) {
            // P2021 = table does not exist (un-run scheduled_sessions migration).
            // Treat the absent table as "zero rows to export"; anything else is a
            // genuine fault and must propagate to the 500 handler.
            const message = typeof err?.message === 'string' ? err.message : '';
            const missingTable =
                err?.code === 'P2021' ||
                /relation "scheduled_sessions" does not exist/i.test(message) ||
                /table.*scheduled_sessions.*does not exist/i.test(message);
            if (!missingTable) throw err;
        }

        const shiftsTruncated = shifts.length > cap;
        const rotationPatternsTruncated = rotationPatterns.length > cap;
        const scheduledSessionsTruncated = scheduledSessions.length > cap;

        return {
            shifts: shiftsTruncated ? shifts.slice(0, cap) : shifts,
            rotation_patterns: rotationPatternsTruncated ? rotationPatterns.slice(0, cap) : rotationPatterns,
            scheduled_sessions: scheduledSessionsTruncated ? scheduledSessions.slice(0, cap) : scheduledSessions,
            _meta: {
                shiftsTruncated,
                rotationPatternsTruncated,
                scheduledSessionsTruncated,
                rowLimit: cap,
            },
        };
    }

    async deleteShift(id: string, userId: string): Promise<void> {
        await this.prisma.shift.delete({
            where: { id, userId },
        });

        try {
            await this.eventBus.publish(Channels.Shift.ShiftUpdated, {
                eventId: randomUUID(),
                eventType: 'shift.updated',
                producedAt: new Date().toISOString(),
                producerService: 'shift-service',
                correlationId: randomUUID(),
                userId,
                payload: { deletedShiftId: id },
            });
        } catch (e: any) {
            console.error('Failed to publish shift.deleted event:', e.message);
        }
    }
}

// Sanity bound on a per-user GDPR export so a pathological row count for one user
// cannot force an unbounded read. `take: cap + 1` lets exportUser detect (and
// flag) truncation at the cap. Per-user shift data is tiny in practice (≤1 row
// per day), so this cap is never reached for a real user.
const EXPORT_ROW_LIMIT = 50_000;
