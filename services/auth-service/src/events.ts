import { RedisEventBus } from '@nightfuel/events';
import { Channels, NightFuelEvent, UserOnboardingCompletedPayload } from '@nightfuel/types';
import { PrismaClient } from './generated/prisma';
import { createLogger } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const logger = createLogger('auth-service:events');

// ── Internal service-to-service config (BUG #6) ─────────────────────────────────
// After onboarding completes we auto-generate the user's meal plan AND workout
// routine. Both target endpoints authenticate with a normal USER JWT (not the
// X-Internal-Token), and auth-service is the platform's token ISSUER — it already
// holds JWT_SECRET — so it can mint a short-lived token for the user on whose
// behalf we trigger generation. URLs follow the same env convention the rest of
// the platform uses (defaults match the docker-network service names/ports).
const PLAN_SERVICE_URL = (process.env.PLAN_SERVICE_URL || 'http://plan-service:3005').replace(/\/+$/, '');
const EXERCISE_SERVICE_URL = (process.env.EXERCISE_SERVICE_URL || 'http://exercise-service:3011').replace(/\/+$/, '');
// Generation can call the AI pipeline downstream, so give these triggers a
// generous-but-bounded timeout. They are fire-and-forget from the event handler's
// perspective; a slow/unreachable service is logged and never blocks the other.
const GENERATION_TIMEOUT_MS = 60_000;

/**
 * Mint a short-lived user JWT mirroring the { userId } shape the downstream
 * services verify (they read request.user.userId). Returns null when JWT_SECRET
 * is unset (dev/test) so the caller can skip the trigger rather than throw.
 */
function mintUserToken(userId: string): string | null {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.sign({ userId }, secret, { expiresIn: '120s' });
}

/**
 * POST to a downstream generation endpoint with the minted user token. Each call
 * is fully self-contained and never throws to the caller — failures are logged.
 * A bounded AbortController timeout prevents a hung downstream from pinning the
 * handler. Returns true on a 2xx, false otherwise (so the caller can log outcome).
 */
async function triggerGeneration(
    label: string,
    url: string,
    token: string,
    body: Record<string, unknown>,
): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            logger.warn({ label, status: res.status }, 'Post-onboarding generation returned non-OK (non-fatal)');
            return false;
        }
        logger.info({ label }, 'Post-onboarding generation triggered');
        return true;
    } catch (err: any) {
        logger.warn({ err: err?.message, label }, 'Post-onboarding generation request failed (non-fatal)');
        return false;
    } finally {
        clearTimeout(timer);
    }
}

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

        // ── BUG #6: auto-generate the user's plan + workout, then notify ────────
        // After the onboarding flag is persisted, kick off BOTH the meal-plan and
        // the workout-routine generation. Each runs in its OWN try/catch so one
        // failing (or being slow/unreachable) can NEVER block the other, and a
        // generation failure can NEVER fail/crash this event handler. The PLAN_READY
        // notifications are fired downstream by notification-service when each
        // service emits its "generated" event (plan.plan-generated /
        // exercise.routine-generated), so we don't notify here.
        //
        // The onboarding-completed payload carries no goal/level/profile, so we send
        // minimal bodies and rely on each generate route's sane defaults (exercise:
        // goal=general/level=intermediate/daysPerWeek=3; plan: empty profile → the
        // route's resolvedProfile fallback).
        const token = mintUserToken(userId);
        if (!token) {
            // OWNER: with no JWT_SECRET we can't mint a user token, so generation is
            // skipped (dev/test only — production always sets JWT_SECRET via loadConfig).
            logger.warn({ userId }, 'JWT_SECRET unset — skipping post-onboarding plan/workout generation');
            return;
        }

        // Fire BOTH generations CONCURRENTLY and independently. triggerGeneration
        // never throws (it logs + returns false on any failure/timeout), and
        // allSettled means one being slow/unreachable can't block or fail the
        // other — exactly the "two non-blocking calls, one failure can't block the
        // other" requirement. The downstream "generated" events drive the
        // PLAN_READY notifications, so there is nothing to await beyond kicking
        // these off.
        //   (1a) Meal-plan generation  → plan-service POST /v1/plans/generate
        //   (1b) Workout generation     → exercise-service POST /v1/exercises/routines/generate
        await Promise.allSettled([
            triggerGeneration(
                'plan-generation',
                `${PLAN_SERVICE_URL}/v1/plans/generate`,
                token,
                { date: new Date().toISOString().split('T')[0] },
            ),
            triggerGeneration(
                'workout-generation',
                `${EXERCISE_SERVICE_URL}/v1/exercises/routines/generate`,
                token,
                {},
            ),
        ]);
    });
}
