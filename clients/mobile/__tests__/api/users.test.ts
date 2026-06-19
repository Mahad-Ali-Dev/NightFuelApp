/**
 * Tests for the additive surface of src/api/users.ts (the social profile work-item):
 *   - updatePrivacy → PATCH /v1/users/me { isPrivate }
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
  },
}));

import { updatePrivacy } from '@/api/users';
import { apiClient } from '@/api/client';

const mockedPatch = apiClient.patch as jest.Mock;

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
