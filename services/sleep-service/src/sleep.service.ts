import { PrismaClient, SleepSession, SleepPreference } from './generated/prisma';
import { EventBus } from '@nightfuel/events';
import { Channels, SleepLoggedPayload } from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('sleep-service');

export interface CreateSleepSessionInput {
    userId: string;
    startTime: string;
    endTime?: string | null;
    quality?: number | null;
    disturbances?: number;
    source?: string;
    // Optional circadian window for alignment scoring (from shift/circadian-engine data)
    circadianSleepStart?: string | null;
    circadianSleepEnd?: string | null;
    notes?: string | null;
}

/**
 * Compute a 0-100 circadian alignment score.
 * Score = 100 if sleep start falls within ±30 min of the circadian recommendation.
 * Degrades linearly to 0 as the offset reaches ±3 hours.
 */
function computeAlignmentScore(
    actualStart: Date,
    circadianStart: Date | null,
): number | null {
    if (!circadianStart) return null;
    const diffMins = Math.abs(
        (actualStart.getTime() - circadianStart.getTime()) / 60_000,
    );
    const MAX_OFFSET_MINS = 180; // 3 hours → score 0
    const PERFECT_WINDOW   = 30;  // ±30 min → score 100
    if (diffMins <= PERFECT_WINDOW) return 100;
    if (diffMins >= MAX_OFFSET_MINS) return 0;
    return Math.round(
        100 * (1 - (diffMins - PERFECT_WINDOW) / (MAX_OFFSET_MINS - PERFECT_WINDOW)),
    );
}

export class SleepService {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly eventBus: EventBus,
    ) {}

    async listSessions(userId: string, limit = 30): Promise<SleepSession[]> {
        return this.prisma.sleepSession.findMany({
            where:   { userId },
            orderBy: { startTime: 'desc' },
            take:    limit,
        });
    }

    async getSession(id: string, userId: string): Promise<SleepSession | null> {
        return this.prisma.sleepSession.findFirst({ where: { id, userId } });
    }

    async createSession(input: CreateSleepSessionInput): Promise<SleepSession> {
        const startTime = new Date(input.startTime);
        const endTime   = input.endTime ? new Date(input.endTime) : null;
        const durationMins = endTime
            ? Math.round((endTime.getTime() - startTime.getTime()) / 60_000)
            : null;

        const circadianStart = input.circadianSleepStart
            ? new Date(input.circadianSleepStart)
            : null;
        const alignmentScore = computeAlignmentScore(startTime, circadianStart);

        const session = await this.prisma.sleepSession.create({
            data: {
                userId:                 input.userId,
                startTime,
                endTime,
                durationMins,
                quality:                input.quality ?? null,
                disturbances:           input.disturbances ?? 0,
                source:                 input.source ?? 'MANUAL',
                circadianAlignmentScore: alignmentScore,
                notes:                  input.notes ?? null,
            },
        });

        logger.info(
            { sessionId: session.id, userId: input.userId, durationMins, alignmentScore },
            'Sleep session logged',
        );

        // Publish sleep.session-logged for downstream consumers (non-critical)
        try {
            const payload: SleepLoggedPayload = {
                sleepSessionId:         session.id,
                startTime:              session.startTime.toISOString(),
                endTime:                session.endTime?.toISOString() ?? null,
                durationMins,
                quality:                session.quality ?? null,
                disturbances:           session.disturbances,
                source:                 session.source,
                circadianAlignmentScore: session.circadianAlignmentScore ?? null,
            };

            await this.eventBus.publish<SleepLoggedPayload>(Channels.Sleep.SessionLogged, {
                eventId:         crypto.randomUUID(),
                eventType:       'sleep.session-logged',
                producedAt:      new Date().toISOString(),
                producerService: 'sleep-service',
                correlationId:   crypto.randomUUID(),
                userId:          input.userId,
                payload,
            });
        } catch (pubErr) {
            logger.error({ err: pubErr, sessionId: session.id }, 'Failed to publish sleep.session-logged event (session was saved)');
        }

        return session;
    }

    async updateSession(
        id: string,
        userId: string,
        data: Partial<Pick<CreateSleepSessionInput, 'endTime' | 'quality' | 'disturbances' | 'notes'>>,
    ): Promise<SleepSession> {
        const session = await this.prisma.sleepSession.findFirst({ where: { id, userId } });
        if (!session) throw new Error('Sleep session not found');

        const endTime = data.endTime ? new Date(data.endTime) : session.endTime;
        const durationMins = endTime
            ? Math.round((endTime.getTime() - session.startTime.getTime()) / 60_000)
            : session.durationMins;

        const updated = await this.prisma.sleepSession.update({
            where: { id },
            data: {
                endTime:      endTime ?? undefined,
                durationMins: durationMins ?? undefined,
                quality:      data.quality ?? undefined,
                disturbances: data.disturbances ?? undefined,
                notes:        data.notes ?? undefined,
            },
        });

        // Publish session-updated for downstream (non-critical)
        try {
            await this.eventBus.publish<SleepLoggedPayload>(Channels.Sleep.SessionUpdated, {
                eventId:         crypto.randomUUID(),
                eventType:       'sleep.session-updated',
                producedAt:      new Date().toISOString(),
                producerService: 'sleep-service',
                correlationId:   crypto.randomUUID(),
                userId,
                payload: {
                    sleepSessionId:         updated.id,
                    startTime:              updated.startTime.toISOString(),
                    endTime:                updated.endTime?.toISOString() ?? null,
                    durationMins:           updated.durationMins ?? null,
                    quality:                updated.quality ?? null,
                    disturbances:           updated.disturbances,
                    source:                 updated.source,
                    circadianAlignmentScore: updated.circadianAlignmentScore ?? null,
                },
            });
        } catch (pubErr) {
            logger.error({ err: pubErr, sessionId: id }, 'Failed to publish sleep.session-updated event (session was saved)');
        }

        logger.info({ sessionId: id, userId }, 'Sleep session updated');
        return updated;
    }

    async getPreferences(userId: string): Promise<SleepPreference> {
        return this.prisma.sleepPreference.upsert({
            where:  { userId },
            update: {},
            create: { userId, targetDuration: 480, windDownDuration: 30 },
        });
    }

    async updatePreferences(
        userId: string,
        data: { targetDuration?: number; windDownDuration?: number; temperatureTarget?: number | null },
    ): Promise<SleepPreference> {
        const updated = await this.prisma.sleepPreference.upsert({
            where:  { userId },
            update: {
                targetDuration:   data.targetDuration,
                windDownDuration: data.windDownDuration,
                temperatureTarget: data.temperatureTarget,
            },
            create: {
                userId,
                targetDuration:   data.targetDuration   ?? 480,
                windDownDuration: data.windDownDuration ?? 30,
                temperatureTarget: data.temperatureTarget,
            },
        });
        logger.info({ userId }, 'Sleep preferences updated');
        return updated;
    }

    // ── Derived analytics (empty-safe; never throws on no data) ──────────────────
    async getQuality(userId: string) {
        const sessions = await this.prisma.sleepSession.findMany({
            where: { userId }, orderBy: { startTime: 'desc' }, take: 30,
        });
        if (sessions.length === 0) {
            return { score: null, avgQuality: null, avgDurationMins: null, sessionsLogged: 0, lastNight: null };
        }
        const q = sessions.filter(s => s.quality != null).map(s => s.quality as number);
        const d = sessions.filter(s => s.durationMins != null).map(s => s.durationMins as number);
        const avgQuality = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
        const avgDurationMins = d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
        const qScore = avgQuality != null ? (avgQuality / 10) * 100 : null;
        const dScore = avgDurationMins != null ? Math.min(100, (avgDurationMins / 480) * 100) : null;
        const score = (qScore != null && dScore != null) ? Math.round(0.6 * qScore + 0.4 * dScore)
            : (qScore != null ? Math.round(qScore) : (dScore != null ? Math.round(dScore) : null));
        const last = sessions[0];
        return {
            score,
            avgQuality: avgQuality != null ? Math.round(avgQuality * 10) / 10 : null,
            avgDurationMins,
            sessionsLogged: sessions.length,
            lastNight: {
                durationMins: last.durationMins,
                quality: last.quality,
                startTime: last.startTime,
                circadianAlignmentScore: last.circadianAlignmentScore,
            },
        };
    }

    async getAnalytics(userId: string) {
        const sessions = await this.prisma.sleepSession.findMany({
            where: { userId }, orderBy: { startTime: 'desc' }, take: 30,
        });
        const quality = await this.getQuality(userId);
        const recent = sessions.slice(0, 7).reverse();
        const chartData = recent.map(s => ({
            date: s.startTime.toISOString().slice(0, 10),
            durationMins: s.durationMins ?? 0,
            quality: s.quality ?? 0,
            alignmentScore: s.circadianAlignmentScore ?? 0,
        }));
        const aligns = sessions.filter(s => s.circadianAlignmentScore != null).map(s => s.circadianAlignmentScore as number);
        const circadianAlignment = aligns.length ? Math.round(aligns.reduce((a, b) => a + b, 0) / aligns.length) : null;
        return {
            qualityScore: quality.score,
            avgDuration: quality.avgDurationMins,
            avgQuality: quality.avgQuality,
            sessionsLogged: sessions.length,
            circadianAlignment,
            chartData,
            summary: sessions.length === 0
                ? 'Log your sleep to unlock personalized analytics.'
                : `Across ${sessions.length} night(s), average sleep was ${quality.avgDurationMins ?? 0} min at a ${quality.score ?? 0}/100 quality score.`,
        };
    }
}
