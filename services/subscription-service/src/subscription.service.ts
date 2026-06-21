import { PrismaClient, SubscriptionTier, SubStatus } from './generated/prisma';
import type { Logger } from 'pino';
import {
  TIER_LIMITS,
  type LimitsResponse,
  type SubscriptionResponse,
  type TierLimits,
} from './schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSubscriptionInput {
  userId: string;
  tier?: SubscriptionTier;
  status?: SubStatus;
}

export interface UpgradeTierInput {
  userId: string;
  targetTier: SubscriptionTier;
}

export interface CancelSubscriptionInput {
  userId: string;
}

export interface BindIapTransactionInput {
  /** Apple originalTransactionId / Google orderId-or-purchaseToken — stable across renewals. */
  originalTransactionId: string;
  userId: string;
  platform: 'ios' | 'android';
  productId: string;
  tier: SubscriptionTier;
}

/**
 * Outcome of binding a validated IAP receipt to an account.
 *   - 'bound'       — first redemption: the binding was created for this user.
 *   - 'reaffirmed'  — the receipt is already bound to THIS user (idempotent re-validate).
 *   - 'conflict'    — the receipt is already bound to a DIFFERENT user (replay/sharing — REJECT).
 */
export type BindIapTransactionResult =
  | { status: 'bound' }
  | { status: 'reaffirmed' }
  | { status: 'conflict'; boundUserId: string };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function serializeSubscription(
  sub: {
    id: string;
    userId: string;
    tier: SubscriptionTier;
    status: SubStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
    stripeSubId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
): SubscriptionResponse {
  const limits: TierLimits = TIER_LIMITS[sub.tier];
  return {
    id: sub.id,
    userId: sub.userId,
    tier: sub.tier,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubId: sub.stripeSubId,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    limits,
  };
}

function buildLimitsResponse(
  tier: SubscriptionTier,
  status: SubStatus,
): LimitsResponse {
  const limits = TIER_LIMITS[tier];
  return {
    tier,
    status,
    limits,
    usageContext: {
      historyDaysLabel:
        limits.historyDays === -1 ? 'Unlimited' : `${limits.historyDays} days`,
      plansPerMonthLabel:
        limits.plansPerMonth === -1 ? 'Unlimited' : `${limits.plansPerMonth} per month`,
      isUnlimitedHistory: limits.historyDays === -1,
      isUnlimitedPlans: limits.plansPerMonth === -1,
    },
  };
}

/** Compute the end of the current calendar month to use as a default period end. */
function endOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionService
// ─────────────────────────────────────────────────────────────────────────────

export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) { }

  // ── upsertForNewUser ────────────────────────────────────────────────────────
  /**
   * Idempotently create a FREE subscription for a newly registered user.
   * Called from the `nightfuel:auth:user-registered` event subscriber.
   */
  async upsertForNewUser(userId: string): Promise<SubscriptionResponse> {
    this.logger.info({ userId }, 'subscription.service: upsertForNewUser');

    const now = new Date();
    const periodEnd = endOfCurrentMonth();

    const sub = await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier: 'FREE',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {}, // If it already exists, leave it untouched (idempotent)
    });

    // Record event only on actual creation (updatedAt ≈ createdAt within 1 s)
    const isNew = Math.abs(sub.updatedAt.getTime() - sub.createdAt.getTime()) < 1000;
    if (isNew) {
      await this.prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'SUBSCRIPTION_CREATED',
          toTier: 'FREE',
          metadata: { source: 'user-registered-event' },
        },
      });
    }

    this.logger.info({ userId, subId: sub.id, isNew }, 'subscription.service: upsertForNewUser done');
    return serializeSubscription(sub);
  }

  // ── getByUserId ─────────────────────────────────────────────────────────────
  async getByUserId(userId: string): Promise<SubscriptionResponse> {
    this.logger.debug({ userId }, 'subscription.service: getByUserId');

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) {
      // Auto-provision FREE subscription if not found (defensive path).
      this.logger.warn({ userId }, 'subscription.service: no subscription found, provisioning FREE');
      return this.upsertForNewUser(userId);
    }

    return serializeSubscription(sub);
  }

  // ── getLimits ───────────────────────────────────────────────────────────────
  async getLimits(userId: string): Promise<LimitsResponse> {
    this.logger.debug({ userId }, 'subscription.service: getLimits');

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true },
    });

    if (!sub) {
      // Return FREE defaults — caller can decide to provision.
      this.logger.warn({ userId }, 'subscription.service: getLimits – no subscription, returning FREE defaults');
      return buildLimitsResponse('FREE', 'ACTIVE');
    }

    return buildLimitsResponse(sub.tier, sub.status);
  }

  // ── bindIapTransaction ──────────────────────────────────────────────────────
  /**
   * Bind a validated IAP receipt to exactly one account (CRITICAL #1 — receipt
   * replay / sharing). Keyed by the platform's STABLE cross-renewal identifier
   * (Apple originalTransactionId / Google orderId-or-purchaseToken).
   *
   * Contract — the caller (routes.ts) MUST resolve this BEFORE calling
   * upgradeTier and act on the status:
   *   - 'bound'      → first redemption; proceed to upgradeTier.
   *   - 'reaffirmed' → same user re-validated the same receipt; idempotent,
   *                    proceed to upgradeTier (a no-op re-affirm of their tier).
   *   - 'conflict'   → receipt already belongs to ANOTHER user; the caller MUST
   *                    reject and MUST NOT upgrade — this is the shared/replayed
   *                    receipt case.
   *
   * Race safety: two users submitting the same receipt concurrently both miss the
   * initial findUnique, then both try to create. The DB UNIQUE on
   * original_transaction_id lets exactly one win; the loser's create throws Prisma
   * P2002, which we catch and re-resolve to the now-existing owner — yielding
   * 'reaffirmed' (same user, e.g. a client retry) or 'conflict' (different user).
   */
  async bindIapTransaction(
    input: BindIapTransactionInput,
  ): Promise<BindIapTransactionResult> {
    const { originalTransactionId, userId, platform, productId, tier } = input;

    const existing = await this.prisma.iAPTransaction.findUnique({
      where: { originalTransactionId },
    });

    if (existing) {
      if (existing.userId === userId) {
        this.logger.info({ userId, originalTransactionId }, 'subscription.service: IAP receipt re-affirmed by owner');
        return { status: 'reaffirmed' };
      }
      this.logger.warn(
        { userId, boundUserId: existing.userId, originalTransactionId },
        'subscription.service: IAP receipt already redeemed by another account — rejecting',
      );
      return { status: 'conflict', boundUserId: existing.userId };
    }

    try {
      await this.prisma.iAPTransaction.create({
        data: { originalTransactionId, userId, platform, productId, tier },
      });
      this.logger.info({ userId, originalTransactionId, tier }, 'subscription.service: IAP receipt bound to account');
      return { status: 'bound' };
    } catch (err: unknown) {
      // P2002 = unique constraint violation: a concurrent request bound this
      // receipt first. Re-resolve the winning owner to decide reaffirm vs conflict.
      if (
        err &&
        typeof err === 'object' &&
        (err as { code?: string }).code === 'P2002'
      ) {
        const winner = await this.prisma.iAPTransaction.findUnique({
          where: { originalTransactionId },
        });
        if (winner && winner.userId === userId) {
          return { status: 'reaffirmed' };
        }
        this.logger.warn(
          { userId, boundUserId: winner?.userId, originalTransactionId },
          'subscription.service: IAP receipt bound by another account in a race — rejecting',
        );
        return { status: 'conflict', boundUserId: winner?.userId ?? 'unknown' };
      }
      throw err;
    }
  }

  // ── upgradeTier ─────────────────────────────────────────────────────────────
  /**
   * Upgrade (or downgrade) a user's subscription tier.
   *
   * Stripe integration is deferred to future work; this implementation updates
   * the DB directly and publishes a `nightfuel:subscription:tier-updated` event.
   *
   * Returns the updated subscription AND the fromTier so the caller (events.ts)
   * can publish the event.
   */
  async upgradeTier(
    input: UpgradeTierInput,
  ): Promise<{ subscription: SubscriptionResponse; fromTier: SubscriptionTier | null }> {
    const { userId, targetTier } = input;
    this.logger.info({ userId, targetTier }, 'subscription.service: upgradeTier');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!existing) {
      // Provision first, then upgrade in a single round-trip via upsert.
      const now = new Date();
      const periodEnd = endOfCurrentMonth();

      const sub = await this.prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          tier: targetTier,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        update: {
          tier: targetTier,
          status: 'ACTIVE',
          cancelAtPeriodEnd: false,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await this.prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'TIER_UPGRADED',
          fromTier: null,
          toTier: targetTier,
          metadata: { source: 'upgrade-api' },
        },
      });

      return { subscription: serializeSubscription(sub), fromTier: null };
    }

    if (existing.tier === targetTier) {
      this.logger.info({ userId, targetTier }, 'subscription.service: already on target tier, no-op');
      return { subscription: serializeSubscription(existing), fromTier: existing.tier };
    }

    const fromTier = existing.tier;
    const now = new Date();

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        tier: targetTier,
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: endOfCurrentMonth(),
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        userId,
        eventType: 'TIER_UPGRADED',
        fromTier,
        toTier: targetTier,
        metadata: { source: 'upgrade-api' },
      },
    });

    this.logger.info({ userId, fromTier, toTier: targetTier }, 'subscription.service: tier updated');
    return { subscription: serializeSubscription(updated), fromTier };
  }

  // ── cancel ──────────────────────────────────────────────────────────────────
  /**
   * Mark the subscription for cancellation at period end.
   * Does NOT immediately cancel; Stripe (or a scheduler) would handle the
   * actual status transition when `currentPeriodEnd` is reached.
   */
  async cancel(input: CancelSubscriptionInput): Promise<SubscriptionResponse> {
    const { userId } = input;
    this.logger.info({ userId }, 'subscription.service: cancel');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new Error(`No subscription found for user ${userId}`);
    }

    if (existing.status === 'CANCELLED') {
      this.logger.info({ userId }, 'subscription.service: already cancelled');
      return serializeSubscription(existing);
    }

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        userId,
        eventType: 'SUBSCRIPTION_CANCEL_REQUESTED',
        fromTier: existing.tier,
        toTier: existing.tier,
        metadata: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: existing.currentPeriodEnd?.toISOString() ?? null,
        },
      },
    });

    this.logger.info({ userId }, 'subscription.service: cancelAtPeriodEnd set to true');
    return serializeSubscription(updated);
  }

  // ── updateStripeIds ─────────────────────────────────────────────────────────
  async updateStripeIds(
    userId: string,
    ids: { stripeCustomerId: string | null; stripeSubId: string | null },
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { userId },
      data: { stripeCustomerId: ids.stripeCustomerId, stripeSubId: ids.stripeSubId },
    });
    this.logger.info({ userId }, 'subscription.service: updateStripeIds done');
  }

  // ── updateStripeConnectId ───────────────────────────────────────────────────
  async updateStripeConnectId(
    userId: string,
    stripeConnectId: string,
  ): Promise<void> {
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!existing) {
      this.logger.warn({ userId }, 'Cannot update connect ID, no subscription found. Provisioning FREE.');
      await this.upsertForNewUser(userId);
    }
    await this.prisma.subscription.update({
      where: { userId },
      data: { stripeConnectId },
    });
    this.logger.info({ userId }, 'subscription.service: updateStripeConnectId done');
  }

  // ── getStripeConnectId ──────────────────────────────────────────────────────
  async getStripeConnectId(userId: string): Promise<string | null> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeConnectId: true },
    });
    return sub?.stripeConnectId ?? null;
  }

  // ── syncStripeSubscription ──────────────────────────────────────────────────
  async syncStripeSubscription(
    userId: string,
    sub: { id: string; status: string },
  ): Promise<void> {
    const status =
      sub.status === 'active' || sub.status === 'trialing' ? 'ACTIVE' : 'CANCELLED';
    await this.prisma.subscription.update({
      where: { userId },
      data: {
        stripeSubId: sub.id,
        status: status as any,
        cancelAtPeriodEnd: sub.status === 'canceled',
      },
    });
    this.logger.info({ userId, stripeStatus: sub.status }, 'subscription.service: syncStripeSubscription done');
  }

  // ── checkFeatureAccess ──────────────────────────────────────────────────────
  /**
   * Utility consumed internally and potentially by other services via HTTP.
   * Returns whether a given userId has access to a named feature.
   */
  async checkFeatureAccess(
    userId: string,
    feature: keyof TierLimits,
  ): Promise<{ allowed: boolean; tier: SubscriptionTier; value: TierLimits[keyof TierLimits] }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true },
    });

    const tier: SubscriptionTier = sub?.tier ?? 'FREE';
    const limits = TIER_LIMITS[tier];
    const value = limits[feature];

    // analyticsEnabled: boolean check
    if (typeof value === 'boolean') {
      return { allowed: value, tier, value };
    }

    // numeric -1 means unlimited (allowed), 0 or positive means check caller
    if (typeof value === 'number') {
      return { allowed: value !== 0, tier, value };
    }

    // array (aiModels): always "allowed" in the sense that the tier has models
    return { allowed: true, tier, value };
  }

  // ── purgeUser (GDPR) ────────────────────────────────────────────────────────
  /**
   * GDPR purge — PERMANENTLY delete EVERY subscription-service row owned by
   * `userId`.
   *
   * This service has exactly three user-owned tables (verified against
   * prisma/schema.prisma — every model carries a `user_id` and no other
   * user-id-bearing columns exist):
   *   • subscriptions       — owned via user_id (Subscription.userId)
   *   • subscription_events — owned via user_id (SubscriptionEvent.userId)
   *   • iap_transactions    — owned via user_id (IAPTransaction.userId)
   *
   * All three deletes run inside a single $transaction so the purge is
   * all-or-nothing.
   *
   * IDEMPOTENT: deleteMany never throws on zero rows, so purging a user with no
   * data returns all-zero counts and re-purging is a safe no-op.
   */
  async purgeUser(
    userId: string,
  ): Promise<{ subscriptions: number; subscription_events: number; iap_transactions: number }> {
    const [subscriptions, subscriptionEvents, iapTransactions] = await this.prisma.$transaction([
      this.prisma.subscription.deleteMany({ where: { userId } }),
      this.prisma.subscriptionEvent.deleteMany({ where: { userId } }),
      this.prisma.iAPTransaction.deleteMany({ where: { userId } }),
    ]);

    this.logger.info(
      {
        userId,
        subscriptions: subscriptions.count,
        subscription_events: subscriptionEvents.count,
        iap_transactions: iapTransactions.count,
      },
      'subscription.service: purgeUser done',
    );

    return {
      subscriptions: subscriptions.count,
      subscription_events: subscriptionEvents.count,
      iap_transactions: iapTransactions.count,
    };
  }
}
