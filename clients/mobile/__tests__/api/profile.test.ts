/**
 * Tests for src/api/profile.ts — locks the request CONTRACT against the
 * user-service so the client can't silently drift from what the server accepts
 * / returns.
 *
 * The two findings this pins (both confirmed against live production):
 *   - updateProfile must PUT the server key `displayName` (NOT `name`, which
 *     updateProfileSchema drops → the rename used to no-op behind a false
 *     success toast). It also forwards avatarUrl when present.
 *   - getPreferences / updatePreferences ride the real preference contract
 *     (dietaryPreference + sleepWindowStart/End + allergies/healthConditions);
 *     no dietaryType / wakeTime / sleepTargetHours keys (no backing column).
 *
 * Mock convention mirrors the sibling api suites (users.test.ts /
 * progress.test.ts): @/api/client stubbed so axios never loads.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

import {
  getMyProfile,
  updateProfile,
  getPreferences,
  updatePreferences,
} from '@/api/profile';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPut = apiClient.put as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getMyProfile', () => {
  test('GETs /v1/users/me and returns the data verbatim', async () => {
    const profile = { id: 'u1', displayName: 'Jane', avatarUrl: null };
    mockedGet.mockResolvedValueOnce({ data: profile });

    const result = await getMyProfile();

    expect(mockedGet).toHaveBeenCalledWith('/v1/users/me');
    expect(result).toBe(profile);
  });
});

describe('updateProfile', () => {
  test('PUTs /v1/users/me with the server-accepted displayName key', async () => {
    mockedPut.mockResolvedValueOnce({ data: {} });

    await updateProfile({ displayName: 'New Name' });

    expect(mockedPut).toHaveBeenCalledWith('/v1/users/me', { displayName: 'New Name' });
  });

  test('forwards avatarUrl alongside displayName when provided', async () => {
    mockedPut.mockResolvedValueOnce({ data: {} });

    await updateProfile({ displayName: 'New Name', avatarUrl: 'file:///avatar.jpg' });

    expect(mockedPut).toHaveBeenCalledWith('/v1/users/me', {
      displayName: 'New Name',
      avatarUrl: 'file:///avatar.jpg',
    });
  });

  test('does NOT inject a legacy `name` / aboutMe / occupation key', async () => {
    mockedPut.mockResolvedValueOnce({ data: {} });

    await updateProfile({ displayName: 'New Name' });

    const body = mockedPut.mock.calls[0][1];
    expect(body).not.toHaveProperty('name');
    expect(body).not.toHaveProperty('aboutMe');
    expect(body).not.toHaveProperty('occupation');
  });
});

describe('getPreferences', () => {
  test('GETs /v1/users/me/preferences and returns the data verbatim', async () => {
    const prefs = {
      dietaryPreference: 'KETO',
      sleepWindowStart: '23:00',
      sleepWindowEnd: '07:00',
      allergies: ['peanuts'],
      healthConditions: [],
    };
    mockedGet.mockResolvedValueOnce({ data: prefs });

    const result = await getPreferences();

    expect(mockedGet).toHaveBeenCalledWith('/v1/users/me/preferences');
    expect(result).toBe(prefs);
  });
});

describe('updatePreferences', () => {
  test('PUTs /v1/users/me/preferences with the real preference fields', async () => {
    mockedPut.mockResolvedValueOnce({ data: {} });

    await updatePreferences({
      dietaryPreference: 'VEGAN',
      sleepWindowStart: '22:30',
      sleepWindowEnd: '06:30',
      allergies: ['shellfish'],
    });

    expect(mockedPut).toHaveBeenCalledWith('/v1/users/me/preferences', {
      dietaryPreference: 'VEGAN',
      sleepWindowStart: '22:30',
      sleepWindowEnd: '06:30',
      allergies: ['shellfish'],
    });
  });
});
