/**
 * Tests for src/api/auth.ts.
 *
 * Focus: the response -> caller mapping and the token-persistence side effect.
 * We mock `@/api/client` so no real network / SecureStore is touched. The
 * `apiClient` is replaced with a jest mock whose `.post`/`.get` we control
 * per-test, and `setTokens` is a spy we assert against.
 */

// Mock the client module: apiClient methods + setTokens side-effect helper.
jest.mock('@/api/client', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
  setTokens: jest.fn().mockResolvedValue(undefined),
}));

import {
  login,
  register,
  refreshToken,
  forgotPassword,
  getMe,
  logout,
  type AuthResponse,
  type RegisterPayload,
} from '@/api/auth';
import { apiClient, setTokens } from '@/api/client';

const mockedPost = apiClient.post as jest.Mock;
const mockedGet = apiClient.get as jest.Mock;
const mockedSetTokens = setTokens as jest.Mock;

const authResponse: AuthResponse = {
  user: {
    id: 'u_1',
    email: 'nurse@example.com',
    displayName: 'Night Nurse',
    role: 'USER',
    onboardingCompleted: false,
  },
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('login', () => {
  test('POSTs credentials to /v1/auth/login and returns the response body', async () => {
    mockedPost.mockResolvedValueOnce({ data: authResponse });

    const result = await login('nurse@example.com', 'hunter2');

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith('/v1/auth/login', {
      email: 'nurse@example.com',
      password: 'hunter2',
    });
    expect(result).toEqual(authResponse);
    expect(result.user.displayName).toBe('Night Nurse');
  });

  test('persists the returned token pair via setTokens', async () => {
    mockedPost.mockResolvedValueOnce({ data: authResponse });

    await login('nurse@example.com', 'hunter2');

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(mockedSetTokens).toHaveBeenCalledWith('access-abc', 'refresh-xyz');
  });

  test('does not swallow a rejected request (wrong password)', async () => {
    const err = Object.assign(new Error('Unauthorized'), {
      response: { status: 401 },
    });
    mockedPost.mockRejectedValueOnce(err);

    await expect(login('nurse@example.com', 'wrong')).rejects.toThrow(
      'Unauthorized',
    );
    expect(mockedSetTokens).not.toHaveBeenCalled();
  });
});

describe('register', () => {
  const payload: RegisterPayload = {
    email: 'new@example.com',
    password: 'Abcdef12',
    displayName: 'Newbie',
    region: 'US',
    role: 'USER',
    shiftType: 'NIGHT',
  };

  test('POSTs the payload to /register, then logs in with the same creds and returns the login body', async () => {
    // /register is enumeration-resistant and returns only a generic message (no
    // tokens); register() completes the flow with an explicit /login.
    mockedPost
      .mockResolvedValueOnce({ data: { message: 'If this email is available, your account was created.' } })
      .mockResolvedValueOnce({ data: authResponse });

    const result = await register(payload);

    expect(mockedPost).toHaveBeenNthCalledWith(1, '/v1/auth/register', payload);
    expect(mockedPost).toHaveBeenNthCalledWith(2, '/v1/auth/login', {
      email: payload.email,
      password: payload.password,
    });
    expect(result).toEqual(authResponse);
  });

  test('persists tokens from the follow-up login (register itself returns no tokens)', async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { message: 'ok' } })
      .mockResolvedValueOnce({ data: authResponse });

    await register(payload);

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(mockedSetTokens).toHaveBeenCalledWith('access-abc', 'refresh-xyz');
  });
});

describe('refreshToken', () => {
  test('POSTs the refresh token and returns the new token pair', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });

    const result = await refreshToken('old-refresh');

    expect(mockedPost).toHaveBeenCalledWith('/v1/auth/refresh', {
      refreshToken: 'old-refresh',
    });
    expect(result).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  test('does NOT call setTokens (refresh is non-persisting by design)', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { accessToken: 'a', refreshToken: 'b' },
    });

    await refreshToken('old-refresh');

    expect(mockedSetTokens).not.toHaveBeenCalled();
  });
});

describe('forgotPassword', () => {
  test('POSTs the email to /v1/auth/forgot-password and returns the message', async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: 'Email sent' } });

    const result = await forgotPassword('nurse@example.com');

    expect(mockedPost).toHaveBeenCalledWith('/v1/auth/forgot-password', {
      email: 'nurse@example.com',
    });
    expect(result).toEqual({ message: 'Email sent' });
  });
});

describe('getMe', () => {
  test('GETs /v1/users/me and returns the raw data', async () => {
    const me = { id: 'u_1', displayName: 'Night Nurse', role: 'USER' };
    mockedGet.mockResolvedValueOnce({ data: me });

    const result = await getMe();

    expect(mockedGet).toHaveBeenCalledWith('/v1/users/me');
    expect(result).toEqual(me);
  });
});

describe('logout', () => {
  test('POSTs the refresh token with a short 3s timeout', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await logout('refresh-xyz');

    expect(mockedPost).toHaveBeenCalledWith(
      '/v1/auth/logout',
      { refreshToken: 'refresh-xyz' },
      { timeout: 3_000 },
    );
  });
});
