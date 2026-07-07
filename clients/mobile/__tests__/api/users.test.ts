/**
 * Tests for the additive surface of src/api/users.ts:
 *   - updatePrivacy   → PATCH  /v1/users/me { isPrivate }   (social profile work-item)
 *   - exportMyData    → GET    /v1/users/me/export          (GDPR export, F37)
 *   - deleteAccount   → DELETE /v1/users/me                 (GDPR deletion, F36)
 *
 * The pre-existing exports (getProfile/updateProfile/getPublicProfile/…) are
 * intentionally unchanged, so this suite only locks the new behaviour.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { updatePrivacy, exportMyData, deleteAccount } from '@/api/users';
import { apiClient } from '@/api/client';

const mockedPatch = apiClient.patch as jest.Mock;
const mockedGet = apiClient.get as jest.Mock;
const mockedDelete = apiClient.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updatePrivacy', () => {
  test('PATCHes /v1/users/me with { isPrivate: true }', async () => {
    mockedPatch.mockResolvedValueOnce({ data: {} });

    await updatePrivacy({ isPrivate: true });

    expect(mockedPatch).toHaveBeenCalledWith('/v1/users/me', { isPrivate: true });
  });

  test('PATCHes /v1/users/me with { isPrivate: false }', async () => {
    mockedPatch.mockResolvedValueOnce({ data: {} });

    await updatePrivacy({ isPrivate: false });

    expect(mockedPatch).toHaveBeenCalledWith('/v1/users/me', { isPrivate: false });
  });
});

describe('exportMyData', () => {
  test('GETs /v1/users/me/export', async () => {
    mockedGet.mockResolvedValueOnce({ data: { user: {} } });

    await exportMyData();

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/v1/users/me/export');
  });

  test('returns the axios response so callers can read .data', async () => {
    const payload = { data: { user: { id: 'u1' } } };
    mockedGet.mockResolvedValueOnce(payload);

    const res = await exportMyData();

    expect(res).toBe(payload);
  });
});

describe('deleteAccount', () => {
  test('DELETEs /v1/users/me', async () => {
    mockedDelete.mockResolvedValueOnce({ data: {} });

    await deleteAccount();

    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith('/v1/users/me');
  });

  test('does not touch the other verbs', async () => {
    mockedDelete.mockResolvedValueOnce({ data: {} });

    await deleteAccount();

    expect(mockedPatch).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
