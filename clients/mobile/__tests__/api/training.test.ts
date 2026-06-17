/**
 * Tests for src/api/training.ts.
 *
 * Focus: the WRITE path, createScheduledSession(). Against a MOCKED apiClient
 * we assert it:
 *   - POSTs to '/v1/training/scheduled-sessions' and resolves with the created
 *     session on a 201;
 *   - forwards a well-formed ISO `scheduledAt` and the title/notes verbatim;
 *   - includes `shiftId` ONLY when the caller supplies one (the "None" case
 *     omits the key entirely — the backend contract is strictly-optional);
 *   - does NOT swallow failures: a 503-shaped error and a bare network error
 *     both propagate as rejections so the calling form's onError can classify
 *     them (503 → "not available yet" vs. generic connection copy).
 *
 * getScheduledSessions() is covered too (simple passthrough) to lock the
 * already-shipped READ path next to the new WRITE path.
 *
 * The additive shift-scoped READ getScheduledSessionsForShift() is covered
 * here as well. Built on the SAME GET endpoint, we assert it:
 *   - returns ONLY the sessions whose `shiftId` matches the requested shift
 *     (given a mixed array of linked/unlinked/other-shift sessions);
 *   - tolerates the `200 []` body the backend returns while the user-gated
 *     scheduled_sessions migration is un-run — degrades to [] without throwing;
 *   - tolerates a (defensively-handled) non-array body — returns [] rather than
 *     throwing so the shift-detail screen can't crash on a malformed payload;
 *   - does NOT swallow a real HTTP failure (a rejected GET propagates so the
 *     screen's error branch can offer a retry).
 *
 * Live persistence is intentionally NOT exercised: the scheduled_sessions
 * migrations (20260617000000 + 20260618000000) are USER-GATED and un-run on
 * the VPS, so a real POST would 503. We assert the client behaviour against a
 * mock instead.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import {
  createScheduledSession,
  getScheduledSessions,
  getScheduledSessionsForShift,
  type ScheduledSession,
} from '@/api/training';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;

const SESSION: ScheduledSession = {
  id: 'ss_1',
  userId: 'u_1',
  title: 'Push Day',
  scheduledAt: '2026-06-20T09:00:00.000Z',
  notes: null,
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createScheduledSession', () => {
  test('POSTs to /v1/training/scheduled-sessions and resolves with the session on 201', async () => {
    mockedPost.mockResolvedValueOnce({ status: 201, data: SESSION });

    const result = await createScheduledSession({
      title: 'Push Day',
      scheduledAt: '2026-06-20T09:00:00.000Z',
    });

    expect(mockedPost).toHaveBeenCalledWith('/v1/training/scheduled-sessions', {
      title: 'Push Day',
      scheduledAt: '2026-06-20T09:00:00.000Z',
    });
    expect(result).toBe(SESSION);
  });

  test('forwards a well-formed ISO scheduledAt and notes verbatim', async () => {
    mockedPost.mockResolvedValueOnce({ status: 201, data: SESSION });

    const scheduledAt = new Date('2026-06-20T09:00:00').toISOString();
    await createScheduledSession({
      title: 'Leg Day',
      scheduledAt,
      notes: 'Squats then accessory work',
    });

    const [, body] = mockedPost.mock.calls[0];
    // A real ISO-8601 instant (parseable, round-trips through Date).
    expect(typeof body.scheduledAt).toBe('string');
    expect(new Date(body.scheduledAt).toISOString()).toBe(scheduledAt);
    expect(body.notes).toBe('Squats then accessory work');
    expect(body.title).toBe('Leg Day');
  });

  test('includes shiftId when a shift is selected', async () => {
    mockedPost.mockResolvedValueOnce({ status: 201, data: SESSION });

    await createScheduledSession({
      title: 'Linked',
      scheduledAt: '2026-06-20T09:00:00.000Z',
      shiftId: '11111111-1111-1111-1111-111111111111',
    });

    const [, body] = mockedPost.mock.calls[0];
    expect(body.shiftId).toBe('11111111-1111-1111-1111-111111111111');
  });

  test('omits shiftId entirely when none is selected (strictly-optional contract)', async () => {
    mockedPost.mockResolvedValueOnce({ status: 201, data: SESSION });

    await createScheduledSession({
      title: 'Unlinked',
      scheduledAt: '2026-06-20T09:00:00.000Z',
    });

    const [, body] = mockedPost.mock.calls[0];
    expect('shiftId' in body).toBe(false);
  });

  test('propagates a 503-shaped error (does not swallow) so the form can classify it', async () => {
    const err503 = {
      response: { status: 503, data: { error: 'Scheduled sessions are not yet available' } },
    };
    mockedPost.mockRejectedValueOnce(err503);

    await expect(
      createScheduledSession({ title: 'X', scheduledAt: '2026-06-20T09:00:00.000Z' }),
    ).rejects.toBe(err503);
  });

  test('propagates a bare network error (no response) as a rejection', async () => {
    const networkErr = Object.assign(new Error('Network Error'), { response: undefined });
    mockedPost.mockRejectedValueOnce(networkErr);

    await expect(
      createScheduledSession({ title: 'X', scheduledAt: '2026-06-20T09:00:00.000Z' }),
    ).rejects.toBe(networkErr);
  });
});

describe('getScheduledSessions', () => {
  test('GETs /v1/training/scheduled-sessions and returns the data verbatim', async () => {
    const sessions = [SESSION];
    mockedGet.mockResolvedValueOnce({ data: sessions });

    const result = await getScheduledSessions();

    expect(mockedGet).toHaveBeenCalledWith('/v1/training/scheduled-sessions');
    expect(result).toBe(sessions);
  });
});

describe('getScheduledSessionsForShift', () => {
  const SHIFT_ID = '11111111-1111-1111-1111-111111111111';
  const OTHER_SHIFT_ID = '22222222-2222-2222-2222-222222222222';

  // A session linked to the shift we're querying for.
  const LINKED: ScheduledSession = {
    ...SESSION,
    id: 'ss_linked',
    title: 'On this shift',
    shiftId: SHIFT_ID,
  };
  // A session linked to a DIFFERENT shift — must be filtered out.
  const OTHER_SHIFT: ScheduledSession = {
    ...SESSION,
    id: 'ss_other',
    title: 'On another shift',
    shiftId: OTHER_SHIFT_ID,
  };
  // An unlinked session (shiftId null) — must be filtered out.
  const UNLINKED_NULL: ScheduledSession = {
    ...SESSION,
    id: 'ss_unlinked_null',
    title: 'Unlinked (null)',
    shiftId: null,
  };
  // An unlinked session (shiftId absent) — must be filtered out.
  const UNLINKED_ABSENT: ScheduledSession = { ...SESSION, id: 'ss_unlinked_absent' };

  test('returns only the sessions whose shiftId matches the requested shift', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [LINKED, OTHER_SHIFT, UNLINKED_NULL, UNLINKED_ABSENT],
    });

    const result = await getScheduledSessionsForShift(SHIFT_ID);

    // Reuses the SAME read endpoint (no dedicated shift-scoped query).
    expect(mockedGet).toHaveBeenCalledWith('/v1/training/scheduled-sessions');
    expect(result).toEqual([LINKED]);
  });

  test('returns [] for a 200 [] body (un-run migration) without throwing', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await expect(getScheduledSessionsForShift(SHIFT_ID)).resolves.toEqual([]);
  });

  test('returns [] for a non-array body without throwing', async () => {
    // Defensive: a transiently malformed payload must not crash the screen.
    mockedGet.mockResolvedValueOnce({ data: null });

    await expect(getScheduledSessionsForShift(SHIFT_ID)).resolves.toEqual([]);
  });

  test('does NOT swallow a real HTTP failure — the rejected GET propagates', async () => {
    const err500 = { response: { status: 500, data: { error: 'An unexpected error occurred' } } };
    mockedGet.mockRejectedValueOnce(err500);

    await expect(getScheduledSessionsForShift(SHIFT_ID)).rejects.toBe(err500);
  });
});
