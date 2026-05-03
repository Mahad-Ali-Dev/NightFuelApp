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
