/**
 * Extended coverage for resolveDeepLink: the remaining allowlist routes
 * (verify / subscription / share), the Expo-router "+not-found" path, query
 * param filtering, scheme handling, and additional deny cases.
 *
 * Uses the same expo-linking mock shape as deepLinks.test.ts so URLs parse
 * without a native module.
 */
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

import { resolveDeepLink } from '@/lib/deepLinks';

describe('resolveDeepLink — allow cases', () => {
  test('accepts email verify link with token', () => {
    const r = resolveDeepLink('https://nightfuel.app/verify?token=tok123');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(auth)/verify');
    expect(r.route).toContain('token=tok123');
  });

  test('accepts the alternate /verify-email path', () => {
    const r = resolveDeepLink('https://nightfuel.app/verify-email?token=tok123');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(auth)/verify');
  });

  test('accepts subscription return URL (no required params)', () => {
    const r = resolveDeepLink('https://nightfuel.app/subscription/return');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(settings)/subscription');
  });

  test('accepts shared workout and substitutes the id', () => {
    const r = resolveDeepLink('https://nightfuel.app/share/workout/wk-42');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(exercises)/wk-42');
  });

  test('matches paths case-insensitively', () => {
    const r = resolveDeepLink('https://nightfuel.app/RESET?token=abc');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(auth)/reset');
  });

  test('tolerates a trailing slash on the path', () => {
    const r = resolveDeepLink('https://nightfuel.app/subscription/return/');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(settings)/subscription');
  });
});

describe('resolveDeepLink — +not-found and unknown paths', () => {
  test('rejects the Expo-router "+not-found" sentinel path', () => {
    const r = resolveDeepLink('https://nightfuel.app/+not-found');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unknown_path');
    expect(r.route).toBe('');
  });

  test('rejects a nested "+not-found" path', () => {
    const r = resolveDeepLink('https://nightfuel.app/some/+not-found');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unknown_path');
  });

  test('rejects the bare root path', () => {
    const r = resolveDeepLink('https://nightfuel.app/');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unknown_path');
  });

  test('rejects a path that only partially matches an allowed prefix', () => {
    // /coach/invite REQUIRES a token segment; /coach alone is unknown.
    const r = resolveDeepLink('https://nightfuel.app/coach');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unknown_path');
  });

  test('rejects /share/workout with no id segment', () => {
    const r = resolveDeepLink('https://nightfuel.app/share/workout');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unknown_path');
  });
});

describe('resolveDeepLink — deny cases (schemes & required params)', () => {
  test('rejects data: scheme', () => {
    const r = resolveDeepLink('data:text/html,<script>alert(1)</script>');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsafe_scheme');
  });

  test('rejects http:// (only https is allowed, not plain http)', () => {
    const r = resolveDeepLink('http://nightfuel.app/reset?token=abc');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsafe_scheme');
  });

  test('rejects an unrelated custom scheme', () => {
    const r = resolveDeepLink('evil://nightfuel.app/reset?token=abc');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsafe_scheme');
  });

  test('rejects /verify when the token param is empty', () => {
    const r = resolveDeepLink('https://nightfuel.app/verify?token=');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('missing_required_param');
  });

  test('rejects /reset when only an unrelated param is present', () => {
    const r = resolveDeepLink('https://nightfuel.app/reset?foo=bar');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('missing_required_param');
  });
});

describe('resolveDeepLink — query param handling', () => {
  test('preserves additional safe query params on the resolved route', () => {
    const r = resolveDeepLink('https://nightfuel.app/reset?token=abc&ref=email');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('token=abc');
    expect(r.route).toContain('ref=email');
  });

  test('url-encodes query param values', () => {
    const r = resolveDeepLink('https://nightfuel.app/subscription/return?msg=a b&x=1');
    expect(r.safe).toBe(true);
    // A space in a value must be encoded, never passed raw.
    expect(r.route).not.toContain('msg=a b');
    expect(r.route).toContain('msg=a%20b');
  });

  test('always reports the original URL as source', () => {
    const url = 'https://nightfuel.app/admin/secret';
    const r = resolveDeepLink(url);
    expect(r.source).toBe(url);
  });
});

describe('resolveDeepLink — app scheme parity', () => {
  test('nightfuel:// reset resolves to the same route as https', () => {
    const r = resolveDeepLink('nightfuel://reset?token=abc');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(auth)/reset');
    expect(r.route).toContain('token=abc');
  });

  test('nightfuel:// coach invite folds hostname back into the path', () => {
    const r = resolveDeepLink('nightfuel://coach/invite/xyz');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(coach)/invite/xyz');
  });
});
