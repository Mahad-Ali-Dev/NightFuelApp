/**
 * Tests for src/api/progress.ts.
 *
 * Focus: getStreak() remaps the backend's currentStreak/longestStreak/
 * lastAdherentDate field names onto the Streak shape, with fallbacks to the
 * already-correct names and finally to 0 / ''. Also covers the simple
 * passthrough + params-forwarding endpoints.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import {
  getStreak,
  getToday,
  logHydration,
  getHistory,
  getBodyMetrics,
  getStats,
} from '@/api/progress';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getStreak', () => {
  test('remaps the backend currentStreak/longestStreak/lastAdherentDate names', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        currentStreak: 5,
        longestStreak: 12,
        lastAdherentDate: '2026-06-13',
      },
    });

    const streak = await getStreak();

    expect(mockedGet).toHaveBeenCalledWith('/v1/progress/streak');
    expect(streak).toEqual({
      current: 5,
      longest: 12,
      lastActiveDate: '2026-06-13',
    });
  });

  test('falls back to the already-correct field names when present', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { current: 3, longest: 9, lastActiveDate: '2026-06-10' },
    });

    const streak = await getStreak();

    expect(streak).toEqual({
      current: 3,
      longest: 9,
      lastActiveDate: '2026-06-10',
    });
  });

  test('defaults to 0 / 0 / "" when the response is empty', async () => {
    mockedGet.mockResolvedValueOnce({ data: {} });

    const streak = await getStreak();

    expect(streak).toEqual({ current: 0, longest: 0, lastActiveDate: '' });
  });

  test('treats a 0 currentStreak as 0 (not coerced to a fallback)', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { currentStreak: 0, longestStreak: 0, lastAdherentDate: '' },
    });

    const streak = await getStreak();

    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(0);
  });
});

describe('getToday', () => {
  test('GETs /v1/progress/today and returns the data verbatim', async () => {
    const today = { id: 'p_1', caloriesActual: 1800, mealsLogged: 3 };
    mockedGet.mockResolvedValueOnce({ data: today });

    const result = await getToday();

    expect(mockedGet).toHaveBeenCalledWith('/v1/progress/today');
    expect(result).toBe(today);
  });
});

describe('logHydration', () => {
  test('POSTs the amount and returns the hydrationMl payload', async () => {
    mockedPost.mockResolvedValueOnce({ data: { hydrationMl: 500 } });

    const result = await logHydration(500);

    expect(mockedPost).toHaveBeenCalledWith('/v1/progress/hydration', {
      amount: 500,
    });
    expect(result).toEqual({ hydrationMl: 500 });
  });
});

describe('getHistory', () => {
  test('forwards the default 7-day window as a query param', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await getHistory();

    expect(mockedGet).toHaveBeenCalledWith('/v1/progress/history', {
      params: { days: 7 },
    });
  });

  test('forwards a custom day count', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await getHistory(30);

    expect(mockedGet).toHaveBeenCalledWith('/v1/progress/history', {
      params: { days: 30 },
    });
  });
});

describe('getBodyMetrics', () => {
  test('defaults to a 90-day window', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await getBodyMetrics();

    expect(mockedGet).toHaveBeenCalledWith('/v1/progress/metrics', {
      params: { days: 90 },
    });
  });
});

describe('getStats', () => {
  test('defaults to a 30-day window', async () => {
    mockedGet.mockResolvedValueOnce({ data: {} });

    await getStats();

    expect(mockedGet).toHaveBeenCalledWith('/v1/progress/stats', {
      params: { days: 30 },
    });
  });
});
