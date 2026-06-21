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
