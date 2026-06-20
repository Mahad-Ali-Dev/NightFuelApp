/**
 * Tests for src/api/shifts.ts.
 *
 * Focus: list() must request a start/end window the backend GET /v1/shifts
 * actually accepts. The server caps the whole-day span at MAX_QUERY_RANGE_DAYS
 * (366, @nightfuel/config range-bounds) and 400s anything wider — so the
 * dashboard ['shifts-upcoming'] query was failing on every load when list()
 * sent a 732-day (±366d) window. These tests lock the window inside the cap,
 * assert it still reaches into the near future (NextShiftCard countdown), and
 * keep getCurrent/list's shiftType→type normalisation honest.
 *
 * The span check mirrors the server's UTC-midnight whole-day math byte-for-byte
 * (Math.round(delta / 86_400_000) <= cap) so it tracks the live contract; it is
 * inlined rather than importing @nightfuel/config, which the mobile client does
 * not declare as a dependency.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

import { getCurrent, list } from '@/api/shifts';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;

// The documented date-range cap (~1 leap year). Mirrors MAX_QUERY_RANGE_DAYS in
// @nightfuel/config / shift-service so the assertion fails the moment list()
// drifts back outside what GET /v1/shifts accepts.
const MAX_QUERY_RANGE_DAYS = 366;
const MS_PER_DAY = 86_400_000;

// Whole-day span between two YYYY-MM-DD bounds, parsed at explicit UTC midnight
// exactly as the server does — timezone-independent regardless of the host.
function wholeDaySpan(start: string, end: string): number {
  return Math.round(
    (Date.parse(end + 'T00:00:00.000Z') - Date.parse(start + 'T00:00:00.000Z')) /
      MS_PER_DAY,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Pull the { start, end } the implementation sent to apiClient.get('/v1/shifts').
function lastListParams(): { start: string; end: string } {
  const call = mockedGet.mock.calls.find((c) => c[0] === '/v1/shifts');
  expect(call).toBeDefined();
  return call![1].params as { start: string; end: string };
}

describe('list', () => {
  test('requests a start/end window within the server MAX_QUERY_RANGE_DAYS cap', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await list();

    const { start, end } = lastListParams();
    // Both bounds are YYYY-MM-DD (the regex the server enforces).
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The exact range the client sends would PASS the backend validation that
    // was previously returning 400 — i.e. end>=start and span <= 366 days.
    const span = wholeDaySpan(start, end);
    expect(span).toBeGreaterThanOrEqual(0); // not reversed
    expect(span).toBeLessThanOrEqual(MAX_QUERY_RANGE_DAYS); // inside the cap
  });

  test('the forward (end) bound reaches into the future for NextShiftCard', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await list();

    const { end } = lastListParams();
    // Parsed at UTC midnight; today (any tz) is well before the forward bound,
    // so the dashboard countdown still has near-future range to find a shift.
    const today = new Date().toISOString().slice(0, 10);
    expect(Date.parse(end + 'T00:00:00.000Z')).toBeGreaterThan(
      Date.parse(today + 'T00:00:00.000Z'),
    );
  });

  test('normalises shiftType→type and never sends userId', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 's_1', shiftType: 'NIGHT', startTime: 'a', endTime: 'b' }],
    });

    const shifts = await list();

    expect(shifts[0].type).toBe('NIGHT');
    // userId is server-derived from the JWT, so it must not be forwarded.
    expect(lastListParams()).not.toHaveProperty('userId');
  });

  test('degrades a non-array body to [] rather than throwing', async () => {
    mockedGet.mockResolvedValueOnce({ data: null });

    await expect(list()).resolves.toEqual([]);
  });
});

describe('getCurrent', () => {
  test('returns null when the body is empty (204 / no active shift)', async () => {
    mockedGet.mockResolvedValueOnce({ data: '' });

    await expect(getCurrent()).resolves.toBeNull();
  });

  test('normalises the persisted shiftType onto type', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { id: 's_2', shiftType: 'DAY' },
    });

    const current = await getCurrent();

    expect(mockedGet).toHaveBeenCalledWith('/v1/shifts/current');
    expect(current?.type).toBe('DAY');
  });
});
