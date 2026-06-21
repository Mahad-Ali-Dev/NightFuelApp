/**
 * Locking test for the push-notification deep-link guard in
 * src/hooks/useNotifications.ts.
 *
 * A push payload is attacker-influenced: `data.deepLink` must NEVER reach
 * `router.push()` unchecked, or a crafted push could deep-link into any route
 * (e.g. /(admin)/...), bypassing the deep-link allowlist. This suite pins the
 * pure resolver `resolveNotificationTarget`:
 *   - allowlisted external-style links resolve via resolveDeepLink,
 *   - the one in-app route the notification service emits
 *     (/messages/<conversationId>) is accepted only with a safe id,
 *   - everything else (unknown paths, traversal, scheme pivots, injection)
 *     is rejected → caller falls back to home.
 *
 * We mock expo-constants as Expo Go so the hook module's `require('expo-notifications')`
 * side effect is skipped, and mock the same expo-linking parse shape used by
 * the deepLinks suites. Sentry / api-client / authStore are stubbed so the
 * module loads without native deps.
 */

// appOwnership 'expo' === Expo Go → module-level expo-notifications require is skipped.
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'expo' } }));

// Same parse shape as __tests__/lib/deepLinks.test.ts so URLs resolve without a native module.
jest.mock('expo-linking', () => ({
  parse: (url: string) => {
    try {
      const noScheme = url
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .replace(/^[a-z][a-z0-9+.-]*:/i, '//fake/');
      const u = new URL('http://' + noScheme.replace(/^\/\//, ''));
      const queryParams: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        queryParams[k] = v;
      });
      return { hostname: u.hostname, path: u.pathname.replace(/^\/+/, ''), queryParams };
    } catch {
      return { path: '', queryParams: {} };
    }
  },
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockCapture = jest.fn();
jest.mock('@/lib/sentry', () => ({ captureException: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('@/api/client', () => ({ apiClient: { post: jest.fn() } }));
jest.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: null }) }));

import { resolveNotificationTarget } from '@/hooks/useNotifications';

beforeEach(() => {
  mockCapture.mockClear();
});

describe('resolveNotificationTarget — legitimate notification routes', () => {
  test('accepts the /messages/<conversationId> deepLink the notification service emits', () => {
    const id = '33333333-3333-3333-3333-333333333333';
    expect(resolveNotificationTarget(`/messages/${id}`, id)).toBe(`/messages/${id}`);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('builds the messages route from conversationId when deepLink is absent', () => {
    const id = 'abc-123_DEF';
    expect(resolveNotificationTarget(undefined, id)).toBe(`/messages/${id}`);
  });

  test('tolerates a trailing slash on the messages deepLink', () => {
    const id = 'conv-1';
    expect(resolveNotificationTarget(`/messages/${id}/`, id)).toBe(`/messages/${id}`);
  });

  test('resolves an allowlisted external link via resolveDeepLink', () => {
    const out = resolveNotificationTarget('https://zeitra.app/coach/invite/xyz', undefined);
    expect(out).toContain('/(coach)/invite/xyz');
  });
});

describe('resolveNotificationTarget — rejects attacker-controlled targets', () => {
  test('rejects an arbitrary in-app route not on the allowlist (admin pivot)', () => {
    expect(resolveNotificationTarget('/(admin)/users', undefined)).toBeNull();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  test('rejects a path-traversal attempt in the messages id', () => {
    expect(resolveNotificationTarget('/messages/..%2F..%2F(admin)', undefined)).toBeNull();
  });

  test('rejects a messages id containing a slash (extra path segment)', () => {
    expect(resolveNotificationTarget('/messages/abc/secret', undefined)).toBeNull();
  });

  test('rejects a messages id with query/fragment injection', () => {
    expect(resolveNotificationTarget('/messages/abc?to=/(admin)', undefined)).toBeNull();
  });

  test('rejects a javascript: scheme pivot', () => {
    expect(resolveNotificationTarget('javascript:alert(1)', undefined)).toBeNull();
  });

  test('rejects an unknown https path', () => {
    expect(resolveNotificationTarget('https://zeitra.app/admin/secret-panel', undefined)).toBeNull();
  });

  test('rejects a conversationId that is not a safe token', () => {
    expect(resolveNotificationTarget(undefined, '../(admin)')).toBeNull();
  });

  test('returns null when neither a deepLink nor a conversationId is present', () => {
    expect(resolveNotificationTarget(undefined, undefined)).toBeNull();
  });
});
