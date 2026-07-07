/**
 * Regression suite — push-subscription hijack guard (LOW #18).
 *
 * Background: `PushSubscription.endpoint` is globally @unique. The previous
 * registerWebPush / registerExpoPush did a Prisma `upsert` keyed on `endpoint`
 * alone with `update: { userId }`, so submitting an endpoint / Expo token that
 * was ALREADY owned by another user silently RE-POINTED that subscription to the
 * caller — hijacking push delivery (or stealing another device's subscription).
 *
 * The fix (push.service.ts) never reassigns an endpoint across users: it
 * looks the row up first, updates in place ONLY when the SAME user owns it,
 * creates when the endpoint is new, and throws PushSubscriptionConflictError
 * (statusCode 409) when a DIFFERENT user owns it — leaving the existing row
 * untouched.
 *
 * Strategy: an in-memory fake of `prisma.pushSubscription` (findUnique / update
 * / create) backed by a Map keyed on endpoint. No DB is touched. We assert that
 * a token owned by user A is NOT reassigned to user B.
 */
import { PushService, PushSubscriptionConflictError } from '../src/push.service';

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ENDPOINT = 'https://push.example.com/sub/shared-endpoint';
const EXPO_TOKEN = 'ExponentPushToken[shared-token-xyz]';

interface Row {
  id: string;
  userId: string;
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
  platform: string;
}

/** In-memory stand-in for prisma.pushSubscription, keyed on the @unique endpoint. */
function makeFakePrisma() {
  const byEndpoint = new Map<string, Row>();
  let seq = 0;
  const pushSubscription = {
    findUnique: jest.fn(async ({ where }: any) => byEndpoint.get(where.endpoint) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const row: Row = { id: `row-${++seq}`, ...data };
      byEndpoint.set(row.endpoint, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const existing = byEndpoint.get(where.endpoint);
      if (!existing) throw new Error('not found');
      const row = { ...existing, ...data };
      byEndpoint.set(where.endpoint, row);
      return row;
    }),
  };
  return { prisma: { pushSubscription } as any, byEndpoint, pushSubscription };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;

describe('PushService.registerWebPush — cross-user hijack guard', () => {
  it('does NOT reassign an endpoint owned by user A to user B (throws conflict)', async () => {
    const { prisma, byEndpoint, pushSubscription } = makeFakePrisma();
    const svc = new PushService(prisma, silentLogger);

    // User A registers first — the row is created and owned by A.
    await svc.registerWebPush({ userId: USER_A, endpoint: ENDPOINT, p256dh: 'kA', auth: 'aA' });
    expect(byEndpoint.get(ENDPOINT)?.userId).toBe(USER_A);

    // User B submits the SAME endpoint — must be refused, NOT re-pointed.
    await expect(
      svc.registerWebPush({ userId: USER_B, endpoint: ENDPOINT, p256dh: 'kB', auth: 'aB' }),
    ).rejects.toBeInstanceOf(PushSubscriptionConflictError);

    // The row is still owned by A and its keys are unchanged — no hijack.
    const row = byEndpoint.get(ENDPOINT)!;
    expect(row.userId).toBe(USER_A);
    expect(row.p256dh).toBe('kA');
    expect(row.auth).toBe('aA');
    // The row was never updated for user B.
    expect(pushSubscription.update).not.toHaveBeenCalled();
  });

  it('allows the SAME user to update their own subscription in place', async () => {
    const { prisma, byEndpoint } = makeFakePrisma();
    const svc = new PushService(prisma, silentLogger);

    await svc.registerWebPush({ userId: USER_A, endpoint: ENDPOINT, p256dh: 'k1', auth: 'a1' });
    // Re-register with rotated keys — same owner, update is allowed.
    await svc.registerWebPush({ userId: USER_A, endpoint: ENDPOINT, p256dh: 'k2', auth: 'a2' });

    const row = byEndpoint.get(ENDPOINT)!;
    expect(row.userId).toBe(USER_A);
    expect(row.p256dh).toBe('k2');
    expect(row.auth).toBe('a2');
  });

  it('creates a fresh row for a brand-new endpoint', async () => {
    const { prisma, byEndpoint, pushSubscription } = makeFakePrisma();
    const svc = new PushService(prisma, silentLogger);

    const res = await svc.registerWebPush({ userId: USER_A, endpoint: ENDPOINT, p256dh: 'k', auth: 'a' });
    expect(res.id).toBeTruthy();
    expect(byEndpoint.get(ENDPOINT)?.userId).toBe(USER_A);
    expect(pushSubscription.create).toHaveBeenCalledTimes(1);
  });
});

describe('PushService.registerExpoPush — cross-user hijack guard', () => {
  it('does NOT reassign an Expo token owned by user A to user B (throws conflict)', async () => {
    const { prisma, byEndpoint, pushSubscription } = makeFakePrisma();
    const svc = new PushService(prisma, silentLogger);

    await svc.registerExpoPush({ userId: USER_A, expoPushToken: EXPO_TOKEN });
    expect(byEndpoint.get(EXPO_TOKEN)?.userId).toBe(USER_A);

    await expect(
      svc.registerExpoPush({ userId: USER_B, expoPushToken: EXPO_TOKEN }),
    ).rejects.toBeInstanceOf(PushSubscriptionConflictError);

    expect(byEndpoint.get(EXPO_TOKEN)!.userId).toBe(USER_A);
    expect(pushSubscription.update).not.toHaveBeenCalled();
  });

  it('allows the SAME user to re-register their own Expo token', async () => {
    const { prisma, byEndpoint } = makeFakePrisma();
    const svc = new PushService(prisma, silentLogger);

    await svc.registerExpoPush({ userId: USER_A, expoPushToken: EXPO_TOKEN });
    await svc.registerExpoPush({ userId: USER_A, expoPushToken: EXPO_TOKEN });

    expect(byEndpoint.get(EXPO_TOKEN)!.userId).toBe(USER_A);
  });
});
