/**
 * Tests for src/api/subscriptions.ts.
 *
 * Focus: getStatus() maps the backend /me shape onto SubscriptionStatus —
 * tier default, active = (status === 'ACTIVE'), expiresAt rename, and the
 * features array derived from limits.analyticsEnabled.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import {
  getStatus,
  upgrade,
  enrollAsCoach,
  bookCoachSession,
} from '@/api/subscriptions';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getStatus', () => {
  test('maps an active PRO subscription with analytics enabled', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        tier: 'PRO',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-12-31T00:00:00.000Z',
        limits: { analyticsEnabled: true },
      },
    });

    const status = await getStatus();

    expect(mockedGet).toHaveBeenCalledWith('/v1/subscriptions/me');
    expect(status).toEqual({
      tier: 'PRO',
      active: true,
      expiresAt: '2026-12-31T00:00:00.000Z',
      features: ['analytics'],
    });
  });

  test('marks active=false for any non-ACTIVE status', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { tier: 'PRO', status: 'CANCELED', limits: {} },
    });

    const status = await getStatus();

    expect(status.active).toBe(false);
    expect(status.features).toEqual([]);
  });

  test('defaults tier to FREE and expiresAt to undefined when absent', async () => {
    mockedGet.mockResolvedValueOnce({ data: { status: 'INACTIVE' } });

    const status = await getStatus();

    expect(status.tier).toBe('FREE');
    expect(status.active).toBe(false);
    expect(status.expiresAt).toBeUndefined();
    expect(status.features).toEqual([]);
  });

  test('omits the analytics feature when analyticsEnabled is false', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { tier: 'PREMIUM', status: 'ACTIVE', limits: { analyticsEnabled: false } },
    });

    const status = await getStatus();

    expect(status.features).toEqual([]);
  });
});

describe('upgrade', () => {
  test('POSTs the tier payload to /upgrade and returns the response data', async () => {
    mockedPost.mockResolvedValueOnce({ data: { ok: true } });

    const result = await upgrade({ tier: 'PRO', paymentMethodId: 'pm_1' });

    expect(mockedPost).toHaveBeenCalledWith('/v1/subscriptions/upgrade', {
      tier: 'PRO',
      paymentMethodId: 'pm_1',
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('enrollAsCoach', () => {
  test('POSTs to the coach onboard endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: { enrolled: true } });

    const result = await enrollAsCoach();

    expect(mockedPost).toHaveBeenCalledWith('/v1/subscriptions/coach/onboard');
    expect(result).toEqual({ enrolled: true });
  });
});

describe('bookCoachSession', () => {
  test('POSTs coachId + amount to the checkout endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: { sessionId: 's_1' } });

    const result = await bookCoachSession('coach_9', 4999);

    expect(mockedPost).toHaveBeenCalledWith('/v1/subscriptions/coach/checkout', {
      coachId: 'coach_9',
      amount: 4999,
    });
    expect(result).toEqual({ sessionId: 's_1' });
  });
});
