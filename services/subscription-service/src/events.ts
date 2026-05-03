import type { Logger } from 'pino';
import type { SubscriptionService } from './subscription.service';

// ─────────────────────────────────────────────────────────────────────────────
// EventBus interface — matches the @nightfuel/events EventBus abstraction.
// Defined locally so that this service can compile without requiring the
// workspace package during isolated development.  When the monorepo is fully
// wired, import from '@nightfuel/events' instead.
// ─────────────────────────────────────────────────────────────────────────────

export interface EventBus {
  /**
   * Subscribe to a Redis Pub/Sub channel.
   * The handler receives a raw JSON string; parse it before use.
   */
  subscribe(channel: string, handler: (message: string) => void | Promise<void>): Promise<void>;

  /**
   * Publish a serialised payload to a Redis Pub/Sub channel.
   */
  publish(channel: string, payload: Record<string, unknown>): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbound event schemas (validated at runtime — no Zod dependency here to
// keep the event layer lightweight; structural checks are sufficient).
// ─────────────────────────────────────────────────────────────────────────────

interface UserRegisteredPayload {
  userId: string;
  email: string;
  [key: string]: unknown;
}

function isUserRegisteredPayload(v: unknown): v is UserRegisteredPayload {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>)['userId'] === 'string'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbound event channels
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTS = {
  // Inbound
  USER_REGISTERED: 'nightfuel:auth:user-registered',

  // Outbound
  TIER_UPDATED: 'nightfuel:subscription:tier-updated',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// publishTierUpdated
// ─────────────────────────────────────────────────────────────────────────────

export async function publishTierUpdated(
  eventBus: EventBus,
  logger: Logger,
  payload: {
    userId: string;
    fromTier: string | null;
    toTier: string;
    subscriptionId: string;
  },
): Promise<void> {
  try {
    await eventBus.publish(EVENTS.TIER_UPDATED, {
      ...payload,
      occurredAt: new Date().toISOString(),
    });
    logger.info(
      { userId: payload.userId, fromTier: payload.fromTier, toTier: payload.toTier },
      'events: published nightfuel:subscription:tier-updated',
    );
  } catch (err) {
    // Non-fatal: log and continue — the DB is already updated.
    logger.error(
      { err, payload },
      'events: failed to publish nightfuel:subscription:tier-updated',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// setupEventSubscribers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wire all Redis Pub/Sub subscriptions for the subscription-service.
 *
 * Currently handles:
 *   - `nightfuel:auth:user-registered`  → auto-provisions a FREE subscription
 */
export async function setupEventSubscribers(
  eventBus: EventBus,
  subscriptionService: SubscriptionService,
  logger: Logger,
): Promise<void> {
  // ── nightfuel:auth:user-registered ─────────────────────────────────────────
  await eventBus.subscribe(EVENTS.USER_REGISTERED, async (raw: string) => {
    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      logger.error(
        { raw, err: parseErr },
        'events: failed to parse nightfuel:auth:user-registered payload',
      );
      return;
    }

    if (!isUserRegisteredPayload(payload)) {
      logger.warn(
        { payload },
        'events: nightfuel:auth:user-registered payload missing userId – skipping',
      );
      return;
    }

    const { userId } = payload;

    logger.info({ userId }, 'events: nightfuel:auth:user-registered received – provisioning FREE subscription');

    try {
      const sub = await subscriptionService.upsertForNewUser(userId);
      logger.info(
        { userId, subId: sub.id, tier: sub.tier },
        'events: FREE subscription provisioned for new user',
      );
    } catch (err) {
      logger.error(
        { userId, err },
        'events: failed to provision FREE subscription for new user',
      );
      // Do NOT rethrow — a transient Redis handler failure must not crash the
      // subscriber loop.  The endpoint /me will auto-provision on next request.
    }
  });

  logger.info('events: all subscribers registered');
}
