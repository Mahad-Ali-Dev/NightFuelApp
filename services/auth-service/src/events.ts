import { RedisEventBus } from '@nightfuel/events';
import { Channels, NightFuelEvent, UserOnboardingCompletedPayload } from '@nightfuel/types';
import { PrismaClient } from './generated/prisma';
import { createLogger } from '@nightfuel/config';
import fs from 'fs';
import path from 'path';

const logger = createLogger('auth-service:events');

export function setupEventSubscribers(eventBus: RedisEventBus, prisma: PrismaClient) {
    eventBus.subscribe(Channels.User.OnboardingCompleted, async (event: NightFuelEvent<UserOnboardingCompletedPayload>) => {
        const { userId } = event;
        const { onboardingStep } = event.payload;

        const logMsg = `[${new Date().toISOString()}] Received user.onboarding-completed for user ${userId}\n`;
        fs.appendFileSync(path.join(process.cwd(), 'event-in.log'), logMsg);

        logger.info({ userId, onboardingStep }, 'Received user.onboarding-completed event');

        try {
            const result = await prisma.user.update({
                where: { id: userId },
                data: { onboardingCompleted: true },
            });
            fs.appendFileSync(path.join(process.cwd(), 'event-in.log'), `[${new Date().toISOString()}] Successfully updated user ${userId} in auth-service DB\n`);
            logger.info({ userId }, 'Updated user onboarding status in auth-service');
        } catch (err: any) {
            fs.appendFileSync(path.join(process.cwd(), 'event-in.log'), `[${new Date().toISOString()}] FAILED to update user ${userId}: ${err.message}\n`);
            logger.error({ err, userId }, 'Failed to update user onboarding status');
        }
    });
}
