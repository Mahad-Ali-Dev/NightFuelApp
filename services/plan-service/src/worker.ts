import { PlanService } from './plan.service';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('plan-service:worker') as any;

export class PlanWorker {
    private isRunning = false;

    constructor(
        private planService: PlanService,
        private config: { USER_SERVICE_URL: string; INTERNAL_SERVICE_TOKEN?: string }
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
            // 1. Fetch all users from user-service.
            // PERF (HIGH #3): /internal/all is now CURSOR-PAGINATED
            // ({ users, nextCursor }). Page through every batch until nextCursor
            // is null so we still process all users, but each query is bounded
            // (no unbounded findMany over every profile on each 60s poll). Keep
            // sending the shared X-Internal-Token on every page request.
            const users = await this.fetchAllUsersPaged();

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

    /**
     * Page through the cursor-paginated GET /v1/users/internal/all endpoint until
     * exhausted, accumulating every user. Each request is bounded by the
     * endpoint's page size and carries the shared X-Internal-Token. A hard page
     * cap guards against an unexpected non-advancing cursor.
     */
    private async fetchAllUsersPaged(): Promise<Array<{ userId: string; timezone: string }>> {
        const PAGE_LIMIT = 500;
        const MAX_PAGES = 10_000; // safety stop (≈5M users at PAGE_LIMIT)
        const all: Array<{ userId: string; timezone: string }> = [];

        let cursor: string | null = null;
        for (let page = 0; page < MAX_PAGES; page++) {
            const url = new URL(`${this.config.USER_SERVICE_URL}/v1/users/internal/all`);
            url.searchParams.set('limit', String(PAGE_LIMIT));
            if (cursor) url.searchParams.set('cursor', cursor);

            const usersRes = await fetch(url.toString(), {
                // F34 #5: user-service /internal/* requires the shared token.
                headers: { 'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '' },
            });
            if (!usersRes.ok) throw new Error('Failed to fetch users from user-service');

            const body = await usersRes.json() as {
                users: Array<{ userId: string; timezone: string }>;
                nextCursor: string | null;
            };

            all.push(...body.users);

            if (!body.nextCursor) break;
            cursor = body.nextCursor;
        }

        return all;
    }
}
