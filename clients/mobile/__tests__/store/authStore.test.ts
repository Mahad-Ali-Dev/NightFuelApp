/**
 * Tests for src/store/authStore.ts.
 *
 * Focus: the *mapping* logic in login / register / loadSession that turns the
 * auth-service responses (AuthResponse + the /v1/users/me profile) into the
 * client-side `User` object. Specifically:
 *   - onboardingComplete is read from `onboardingCompleted` (camel-D backend
 *     field), with the documented fallback chain.
 *   - role is lower-cased from the auth response ('USER' -> 'user').
 *   - no password / passwordHash field leaks into the stored User.
 *   - email + name are resolved across the response/profile field aliases.
 *
 * The auth API (`@/api/auth`) and `expo-secure-store` are mocked so no real
 * network or device keychain is touched — matching the convention in
 * __tests__/api/auth.test.ts.
 */

// ─── Mocks (must be declared before importing the module under test) ─────────
jest.mock('@/api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getMe: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useAuthStore } from '@/store/authStore';
import * as authApi from '@/api/auth';
import * as SecureStore from 'expo-secure-store';

const mockedLogin = authApi.login as jest.Mock;
const mockedRegister = authApi.register as jest.Mock;
const mockedGetMe = authApi.getMe as jest.Mock;
const mockedLogout = authApi.logout as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;
const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedDeleteItem = SecureStore.deleteItemAsync as jest.Mock;

/** A realistic /v1/auth/login|register response from the auth-service. */
function makeAuthResponse(overrides: Record<string, any> = {}) {
  return {
    user: {
      id: 'u_1',
      email: 'nurse@example.com',
      displayName: 'Night Nurse',
      role: 'USER',
      onboardingCompleted: false,
      // A hostile/over-sharing backend might include these — they must NOT
      // end up on the client `User`.
      passwordHash: '$2b$10$super.secret.hash',
      password: 'plaintext-should-never-appear',
      ...overrides,
    },
    accessToken: 'access-abc',
    refreshToken: 'refresh-xyz',
  };
}

/** Reset the zustand singleton + all mocks before every test. */
beforeEach(() => {
  jest.clearAllMocks();
  // Re-establish the default resolved values cleared by clearAllMocks().
  mockedSetItem.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
  mockedGetItem.mockResolvedValue(null);
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    role: 'user',
  });
});

// ─── login() ────────────────────────────────────────────────────────────────

describe('authStore.login', () => {
  test('maps the auth response + /me profile into the stored User', async () => {
    mockedLogin.mockResolvedValueOnce(makeAuthResponse());
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
      avatarUrl: 'https://cdn/x.png',
      onboardingCompleted: true,
      shiftType: 'night',
    });

    await useAuthStore.getState().login('nurse@example.com', 'hunter2');

    const { user, isAuthenticated, isLoading, role } = useAuthStore.getState();
    expect(isAuthenticated).toBe(true);
    expect(isLoading).toBe(false);
    expect(role).toBe('user');
    expect(user).toEqual({
      id: 'u_1',
      email: 'nurse@example.com',
      name: 'Night Nurse',
      avatarUrl: 'https://cdn/x.png',
      role: 'user',
      onboardingComplete: true,
      emailVerified: false,
      shiftType: 'night',
    });
  });

  test('reads onboardingComplete from the profile `onboardingCompleted` field', async () => {
    mockedLogin.mockResolvedValueOnce(makeAuthResponse());
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
      onboardingCompleted: true, // returning user finished onboarding
    });

    await useAuthStore.getState().login('nurse@example.com', 'hunter2');

    expect(useAuthStore.getState().user?.onboardingComplete).toBe(true);
  });

  test('falls back to preferences.onboardingCompleted when top-level is absent', async () => {
    mockedLogin.mockResolvedValueOnce(makeAuthResponse());
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
      preferences: { onboardingCompleted: true },
    });

    await useAuthStore.getState().login('nurse@example.com', 'hunter2');

    expect(useAuthStore.getState().user?.onboardingComplete).toBe(true);
  });

  test('onboardingComplete defaults to false when no flag is present anywhere', async () => {
    mockedLogin.mockResolvedValueOnce(makeAuthResponse());
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
    });

    await useAuthStore.getState().login('nurse@example.com', 'hunter2');

    expect(useAuthStore.getState().user?.onboardingComplete).toBe(false);
  });

  test('lower-cases the role from the auth response (USER -> user)', async () => {
    mockedLogin.mockResolvedValueOnce(
      makeAuthResponse({ role: 'COACH' }),
    );
    mockedGetMe.mockResolvedValueOnce({ userId: 'u_1', displayName: 'Coach' });

    await useAuthStore.getState().login('coach@example.com', 'pw');

    expect(useAuthStore.getState().user?.role).toBe('coach');
    // role is also mirrored onto the top-level store slice
    expect(useAuthStore.getState().role).toBe('coach');
  });

  test('role from the auth response wins over the profile role', async () => {
    // The store comment says role comes from the auth response; the /me profile
    // role (here 'ADMIN') must be ignored in favour of the auth response role.
    mockedLogin.mockResolvedValueOnce(makeAuthResponse({ role: 'USER' }));
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
      role: 'ADMIN',
    });

    await useAuthStore.getState().login('nurse@example.com', 'pw');

    expect(useAuthStore.getState().user?.role).toBe('user');
  });

  test('does not leak passwordHash / password onto the stored User', async () => {
    mockedLogin.mockResolvedValueOnce(makeAuthResponse());
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
      // a leaky /me as well
      passwordHash: '$2b$10$another.hash',
      password: 'nope',
    });

    await useAuthStore.getState().login('nurse@example.com', 'hunter2');

    const user = useAuthStore.getState().user as unknown as Record<string, unknown>;
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');
    expect(Object.keys(user).sort()).toEqual(
      [
        'avatarUrl',
        'email',
        'emailVerified',
        'id',
        'name',
        'onboardingComplete',
        'role',
        'shiftType',
      ].sort(),
    );
  });

  test('email comes from the auth response (the /me profile omits it)', async () => {
    mockedLogin.mockResolvedValueOnce(
      makeAuthResponse({ email: 'auth-email@example.com' }),
    );
    // /me has no email at all
    mockedGetMe.mockResolvedValueOnce({ userId: 'u_1', displayName: 'X' });

    await useAuthStore.getState().login('auth-email@example.com', 'pw');

    expect(useAuthStore.getState().user?.email).toBe('auth-email@example.com');
  });

  test('name resolves from profile.displayName first', async () => {
    mockedLogin.mockResolvedValueOnce(
      makeAuthResponse({ displayName: 'Auth Name' }),
    );
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Profile Name',
    });

    await useAuthStore.getState().login('nurse@example.com', 'pw');

    // profile displayName takes precedence over the auth response displayName
    expect(useAuthStore.getState().user?.name).toBe('Profile Name');
  });

  test('name falls back to "User" when neither profile nor response provide one', async () => {
    const resp = makeAuthResponse();
    delete (resp.user as any).displayName;
    mockedLogin.mockResolvedValueOnce(resp);
    mockedGetMe.mockResolvedValueOnce({ userId: 'u_1' }); // no displayName/name

    await useAuthStore.getState().login('nurse@example.com', 'pw');

    expect(useAuthStore.getState().user?.name).toBe('User');
  });

  test('id resolves from profile.userId (preferred) over profile.id', async () => {
    mockedLogin.mockResolvedValueOnce(makeAuthResponse());
    mockedGetMe.mockResolvedValueOnce({
      userId: 'profile-user-id',
      id: 'profile-id',
      displayName: 'X',
    });

    await useAuthStore.getState().login('nurse@example.com', 'pw');

    expect(useAuthStore.getState().user?.id).toBe('profile-user-id');
  });

  test('falls back to minimal user mapping when getMe() rejects', async () => {
    mockedLogin.mockResolvedValueOnce(
      makeAuthResponse({ onboardingCompleted: true, role: 'ADMIN' }),
    );
    mockedGetMe.mockRejectedValueOnce(new Error('network down'));

    await useAuthStore.getState().login('nurse@example.com', 'pw');

    const { user, isAuthenticated, isLoading } = useAuthStore.getState();
    expect(isAuthenticated).toBe(true);
    expect(isLoading).toBe(false);
    // From the auth response only, but still mapped + lower-cased + no leak.
    expect(user).toEqual({
      id: 'u_1',
      email: 'nurse@example.com',
      name: 'Night Nurse',
      avatarUrl: null,
      role: 'admin',
      onboardingComplete: true,
      emailVerified: false,
      shiftType: null,
    });
    expect(user as unknown as Record<string, unknown>).not.toHaveProperty('passwordHash');
  });

  test('rejects and resets isLoading when the login API call fails', async () => {
    const err = Object.assign(new Error('bad'), {
      response: { data: { error: 'Invalid credentials' } },
    });
    mockedLogin.mockRejectedValueOnce(err);

    await expect(
      useAuthStore.getState().login('nurse@example.com', 'wrong'),
    ).rejects.toThrow('Invalid credentials');

    const { user, isAuthenticated, isLoading } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(isLoading).toBe(false);
    // getMe must never be reached if login itself threw.
    expect(mockedGetMe).not.toHaveBeenCalled();
  });
});

// ─── register() ───────────────────────────────────────────────────────────────

describe('authStore.register', () => {
  const registerData = {
    email: 'new@example.com',
    password: 'Abcdef12',
    displayName: 'Newbie',
    region: 'US',
  };

  test('returns the generic message and does NOT sign the user in', async () => {
    // NEW CONTRACT: register() creates the account but does not authenticate —
    // the backend emails a 6-digit OTP and returns a generic anti-enumeration
    // message. It must NOT mutate the session or call getMe(); sign-in happens
    // later via verifyOtp -> socialLogin.
    mockedRegister.mockResolvedValueOnce({ message: 'verification code sent' });

    const result = await useAuthStore.getState().register(registerData);

    expect(result).toEqual({ message: 'verification code sent' });
    const { user, isAuthenticated, role } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(role).toBe('user');
    expect(mockedRegister).toHaveBeenCalledWith(registerData);
    // register() never hydrates the profile — that's socialLogin's job.
    expect(mockedGetMe).not.toHaveBeenCalled();
  });

  test('rejects with the server message when the register API call fails', async () => {
    const err = Object.assign(new Error('bad'), {
      response: { data: { message: 'Something went wrong' } },
    });
    mockedRegister.mockRejectedValueOnce(err);

    await expect(
      useAuthStore.getState().register(registerData),
    ).rejects.toThrow('Something went wrong');

    // Still logged out; the session gate was never touched.
    const { user, isAuthenticated } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(mockedGetMe).not.toHaveBeenCalled();
  });
});

// ─── socialLogin() — Google / Apple / verify-otp sign-in path ────────────────

describe('authStore.socialLogin', () => {
  /** A { user, accessToken, refreshToken } response as returned by
   *  googleSignIn / appleSignIn / verifyOtp (tokens already persisted by the
   *  api layer). socialLogin() hydrates the profile + flips isAuthenticated. */
  function makeSocial(overrides: Record<string, any> = {}) {
    return {
      user: {
        id: 'u_s',
        email: 'social@example.com',
        displayName: 'Social User',
        role: 'USER',
        onboardingCompleted: false,
        emailVerified: true,
        ...overrides,
      },
      accessToken: 'access-s',
      refreshToken: 'refresh-s',
    };
  }

  test('hydrates the User from /me and flips isAuthenticated', async () => {
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_s',
      displayName: 'Social User',
      avatarUrl: 'https://cdn/s.png',
      onboardingCompleted: true,
      emailVerified: true,
      shiftType: 'rotating',
    });

    await useAuthStore.getState().socialLogin(makeSocial() as any);

    const { user, isAuthenticated, isLoading, role } = useAuthStore.getState();
    expect(isAuthenticated).toBe(true);
    expect(isLoading).toBe(false);
    expect(role).toBe('user');
    expect(user).toEqual({
      id: 'u_s',
      email: 'social@example.com',
      name: 'Social User',
      avatarUrl: 'https://cdn/s.png',
      role: 'user',
      onboardingComplete: true,
      emailVerified: true,
      shiftType: 'rotating',
    });
  });

  test('lower-cases the role from the auth response (COACH -> coach)', async () => {
    mockedGetMe.mockResolvedValueOnce({ userId: 'u_s', displayName: 'Coach' });

    await useAuthStore.getState().socialLogin(makeSocial({ role: 'COACH' }) as any);

    expect(useAuthStore.getState().user?.role).toBe('coach');
    expect(useAuthStore.getState().role).toBe('coach');
  });

  test('does not leak passwordHash / password onto the stored User', async () => {
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_s',
      displayName: 'Social User',
      passwordHash: '$2b$10$leak',
      password: 'leak',
    });

    await useAuthStore.getState().socialLogin(makeSocial() as any);

    const user = useAuthStore.getState().user as unknown as Record<string, unknown>;
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');
  });

  test('rejects and resets isLoading when profile hydration ultimately fails', async () => {
    // hydrateUserFromMe swallows a getMe rejection and falls back to the auth
    // response, so socialLogin resolves; assert the happy fallback path instead.
    mockedGetMe.mockRejectedValueOnce(new Error('me down'));

    await useAuthStore.getState().socialLogin(makeSocial({ role: 'ADMIN' }) as any);

    const { user, isAuthenticated, isLoading } = useAuthStore.getState();
    expect(isAuthenticated).toBe(true);
    expect(isLoading).toBe(false);
    expect(user?.role).toBe('admin');
    expect(user?.emailVerified).toBe(true);
  });
});

// ─── loadSession() ────────────────────────────────────────────────────────────

describe('authStore.loadSession', () => {
  test('no stored tokens -> stays logged out and does not call getMe', async () => {
    mockedGetItem.mockResolvedValue(null);

    await useAuthStore.getState().loadSession();

    const { user, isAuthenticated, isLoading } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(isLoading).toBe(false);
    expect(mockedGetMe).not.toHaveBeenCalled();
  });

  test('hydrates the User from /me when valid tokens are present', async () => {
    // both token reads return a value -> getStoredTokens() resolves a pair
    mockedGetItem.mockResolvedValue('some-token');
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      email: 'nurse@example.com',
      displayName: 'Night Nurse',
      avatarUrl: null,
      role: 'USER',
      onboardingCompleted: true,
      shiftType: 'rotating',
    });

    await useAuthStore.getState().loadSession();

    const { user, isAuthenticated, isLoading, role } = useAuthStore.getState();
    expect(isAuthenticated).toBe(true);
    expect(isLoading).toBe(false);
    expect(role).toBe('user');
    expect(user).toEqual({
      id: 'u_1',
      email: 'nurse@example.com',
      name: 'Night Nurse',
      avatarUrl: null,
      role: 'user',
      onboardingComplete: true,
      emailVerified: false,
      shiftType: 'rotating',
    });
  });

  test('lower-cases role and reads onboardingCompleted during hydration', async () => {
    mockedGetItem.mockResolvedValue('some-token');
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Admin Person',
      role: 'ADMIN',
      onboardingCompleted: true,
    });

    await useAuthStore.getState().loadSession();

    expect(useAuthStore.getState().user?.role).toBe('admin');
    expect(useAuthStore.getState().user?.onboardingComplete).toBe(true);
  });

  test('hydrated User does not leak passwordHash / password', async () => {
    mockedGetItem.mockResolvedValue('some-token');
    mockedGetMe.mockResolvedValueOnce({
      userId: 'u_1',
      displayName: 'Night Nurse',
      role: 'USER',
      passwordHash: '$2b$10$leak',
      password: 'leak',
    });

    await useAuthStore.getState().loadSession();

    const user = useAuthStore.getState().user as unknown as Record<string, unknown>;
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');
  });

  test('401 from /me clears tokens and logs the user out', async () => {
    mockedGetItem.mockResolvedValue('some-token');
    mockedGetMe.mockRejectedValueOnce(
      Object.assign(new Error('unauth'), { response: { status: 401 } }),
    );

    await useAuthStore.getState().loadSession();

    const { user, isAuthenticated, isLoading } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(isLoading).toBe(false);
    // both refresh + access keys deleted
    expect(mockedDeleteItem).toHaveBeenCalledTimes(2);
  });

  test('soft failure (network/5xx) keeps the session authenticated', async () => {
    mockedGetItem.mockResolvedValue('some-token');
    mockedGetMe.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { response: { status: 502 } }),
    );

    await useAuthStore.getState().loadSession();

    const { isAuthenticated, isLoading } = useAuthStore.getState();
    expect(isAuthenticated).toBe(true);
    expect(isLoading).toBe(false);
    // tokens are NOT cleared on a soft failure
    expect(mockedDeleteItem).not.toHaveBeenCalled();
  });
});

// ─── logout() ─────────────────────────────────────────────────────────────────

describe('authStore.logout', () => {
  test('clears tokens and resets state even when the server logout fails', async () => {
    // seed an authenticated state
    useAuthStore.setState({
      user: {
        id: 'u_1',
        email: 'nurse@example.com',
        name: 'Night Nurse',
        avatarUrl: null,
        role: 'user',
        onboardingComplete: true,
        emailVerified: true,
        shiftType: 'night',
      },
      isAuthenticated: true,
      isLoading: false,
      role: 'user',
    });
    // a stored refresh token so the server-side revoke path is exercised
    mockedGetItem.mockResolvedValue('refresh-token');
    mockedLogout.mockRejectedValueOnce(new Error('server unreachable'));

    await useAuthStore.getState().logout();

    const { user, isAuthenticated, role } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(role).toBe('user');
    // local tokens cleared regardless of the server error
    expect(mockedDeleteItem).toHaveBeenCalledTimes(2);
  });
});
