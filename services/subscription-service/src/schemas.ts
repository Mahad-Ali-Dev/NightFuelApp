import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Domain Enums (mirrored from Prisma schema so routes stay independent of the
// generated Prisma client types at the schema-validation boundary).
// ─────────────────────────────────────────────────────────────────────────────

export const SubscriptionTierEnum = z.enum(['FREE', 'PRO', 'PREMIUM', 'ENTERPRISE']);
export const SubStatusEnum = z.enum(['ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIALING']);

export type SubscriptionTier = z.infer<typeof SubscriptionTierEnum>;
export type SubStatus = z.infer<typeof SubStatusEnum>;

// ─────────────────────────────────────────────────────────────────────────────
// Tier Limits — canonical definition consumed by both the service layer and the
// route handler for /me/limits.
// ─────────────────────────────────────────────────────────────────────────────

export interface TierLimits {
  historyDays: number;       // -1 = unlimited
  plansPerMonth: number;     // -1 = unlimited
  aiModels: string[];
  analyticsEnabled: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    historyDays: 7,
    plansPerMonth: 5,
    aiModels: ['gpt-4o-mini'],
    analyticsEnabled: false,
  },
  PRO: {
    historyDays: 90,
    plansPerMonth: 30,
    aiModels: ['gpt-4o-mini', 'gpt-4o'],
    analyticsEnabled: true,
  },
  PREMIUM: {
    historyDays: 365,
    plansPerMonth: -1,
    aiModels: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet'],
    analyticsEnabled: true,
  },
  ENTERPRISE: {
    historyDays: -1,
    plansPerMonth: -1,
    aiModels: ['all'],
    analyticsEnabled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tier catalogue — human-readable metadata surfaced on GET /v1/subscriptions/tiers
// ─────────────────────────────────────────────────────────────────────────────

export interface TierInfo {
  tier: SubscriptionTier;
  displayName: string;
  priceUsdMonthly: number | null; // null = contact sales
  description: string;
  features: string[];
  limits: TierLimits;
}

export const TIER_CATALOGUE: TierInfo[] = [
  {
    tier: 'FREE',
    displayName: 'Free',
    priceUsdMonthly: 0,
    description: 'Get started with core chrono-nutrition planning.',
    features: [
      '7-day meal history',
      '5 AI plans per month',
      'Basic circadian shift detection',
      'Standard meal suggestions',
    ],
    limits: TIER_LIMITS.FREE,
  },
  {
    tier: 'PRO',
    displayName: 'Pro',
    priceUsdMonthly: 9.99,
    description: 'For dedicated shift workers who want deeper insights.',
    features: [
      '90-day meal history',
      '30 AI plans per month',
      'Advanced circadian modelling',
      'Analytics dashboard',
      'GPT-4o model access',
      'Priority support',
    ],
    limits: TIER_LIMITS.PRO,
  },
  {
    tier: 'PREMIUM',
    displayName: 'Premium',
    priceUsdMonthly: 24.99,
    description: 'Unlimited planning with cutting-edge AI models.',
    features: [
      '365-day meal history',
      'Unlimited AI plans',
      'Full analytics suite',
      'Claude 3.5 Sonnet model access',
      'Custom shift patterns',
      'Dedicated support channel',
    ],
    limits: TIER_LIMITS.PREMIUM,
  },
  {
    tier: 'ENTERPRISE',
    displayName: 'Enterprise',
    priceUsdMonthly: null,
    description: 'Tailored solutions for healthcare teams and large organisations.',
    features: [
      'Unlimited history',
      'Unlimited AI plans',
      'All AI models',
      'Full analytics & audit logs',
      'SSO & SCIM provisioning',
      'SLA-backed support',
      'Custom integrations',
    ],
    limits: TIER_LIMITS.ENTERPRISE,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Route I/O Schemas (Zod — used for fastify-type-provider-zod validation)
// ─────────────────────────────────────────────────────────────────────────────

/** POST /v1/subscriptions/upgrade body */
export const UpgradeBodySchema = z.object({
  tier: SubscriptionTierEnum.describe('Target subscription tier'),
});
export type UpgradeBody = z.infer<typeof UpgradeBodySchema>;

/** Generic API success wrapper */
export const SuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

/** Subscription shape returned to clients */
export const SubscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tier: SubscriptionTierEnum,
  status: SubStatusEnum,
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  stripeCustomerId: z.string().nullable(),
  stripeSubId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  limits: z.object({
    historyDays: z.number(),
    plansPerMonth: z.number(),
    aiModels: z.array(z.string()),
    analyticsEnabled: z.boolean(),
  }),
});
export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>;

/** GET /me/limits response */
export const LimitsResponseSchema = z.object({
  tier: SubscriptionTierEnum,
  status: SubStatusEnum,
  limits: z.object({
    historyDays: z.number(),
    plansPerMonth: z.number(),
    aiModels: z.array(z.string()),
    analyticsEnabled: z.boolean(),
  }),
  usageContext: z.object({
    historyDaysLabel: z.string(),
    plansPerMonthLabel: z.string(),
    isUnlimitedHistory: z.boolean(),
    isUnlimitedPlans: z.boolean(),
  }),
});
export type LimitsResponse = z.infer<typeof LimitsResponseSchema>;

/** GET /tiers response */
export const TiersResponseSchema = z.object({
  tiers: z.array(
    z.object({
      tier: SubscriptionTierEnum,
      displayName: z.string(),
      priceUsdMonthly: z.number().nullable(),
      description: z.string(),
      features: z.array(z.string()),
      limits: z.object({
        historyDays: z.number(),
        plansPerMonth: z.number(),
        aiModels: z.array(z.string()),
        analyticsEnabled: z.boolean(),
      }),
    }),
  ),
});
