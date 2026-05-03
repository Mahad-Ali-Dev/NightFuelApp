import { PlanService } from './plan.service';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('plan-service:worker') as any;

export class PlanWorker {
    private isRunning = false;

    constructor(
        private planService: PlanService,
        private config: { USER_SERVICE_URL: string }
    ) { }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('Plan Regeneration Worker started');

        // Check every minute
        setInterval(() => this.checkAndRegenerate(), 60 * 1000);
    }

    private async checkAndRegenerate() {
        try {
            // 1. Fetch all users from user-service
            const usersRes = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/all`);
            if (!usersRes.ok) throw new Error('Failed to fetch users from user-service');

            const users = await usersRes.json() as Array<{ userId: string, timezone: string }>;

            for (const user of users) {
                // 2. Check if it's 04:00 in user's timezone
                const userLocalTime = new Intl.DateTimeFormat('en-US', {
                    timeZone: user.timezone,
                    hour: 'numeric',
                    minute: 'numeric',
                    hour12: false
                }).format(new Date());

                if (userLocalTime === '04:00') {
                    logger.info({ userId: user.userId }, 'Triggering daily regeneration for user');

                    // Trigger regeneration for "tomorrow" or "today" depending on policy
                    // Here we trigger for the current date (which just started at 04:00)
                    const dateStr = new Date().toISOString().split('T')[0];

                    // We need a dummy profileData or fetch it from circadian-engine
                    // For now, we'll assume the service can handle missing profileData or uses defaults
                    try {
                        await this.planService.generateAndStorePlan({}, user.userId, dateStr);
                    } catch (err) {
                        logger.error({ userId: user.userId, err }, 'Failed to regenerate plan for user');
                    }
                }
            }
        } catch (err) {
            logger.error({ err }, 'PlanWorker error');
        }
    }
}
