// Mock expo-linking so we don't need a native module in tests.
jest.mock('expo-linking', () => ({
  parse: (url: string) => {
    try {
      // Strip the scheme and parse the rest as a URL on a fake host.
      const noScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[a-z][a-z0-9+.-]*:/i, '//fake/');
      const u = new URL('http://' + noScheme.replace(/^\/\//, ''));
      const queryParams: Record<string, string> = {};
      u.searchParams.forEach((v, k) => { queryParams[k] = v; });
      return { hostname: u.hostname, path: u.pathname.replace(/^\/+/, ''), queryParams };
    } catch {
      return { path: '', queryParams: {} };
    }
  },
}));

import { resolveDeepLink } from '@/lib/deepLinks';

describe('resolveDeepLink', () => {
  test('accepts a valid password reset link with token', () => {
    const r = resolveDeepLink('https://nightfuel.app/reset?token=abc123');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(auth)/reset');
    expect(r.route).toContain('token=abc123');
  });

  test('accepts the alternate /reset-password path', () => {
    const r = resolveDeepLink('https://nightfuel.app/reset-password?token=xyz');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(auth)/reset');
  });

  test('rejects /reset without token', () => {
    const r = resolveDeepLink('https://nightfuel.app/reset');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('missing_required_param');
  });

  test('rejects an unknown path', () => {
    const r = resolveDeepLink('https://nightfuel.app/admin/secret-panel');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unknown_path');
  });

  test('rejects javascript: scheme (XSS pivot)', () => {
    const r = resolveDeepLink('javascript:alert(1)');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsafe_scheme');
  });

  test('rejects file: scheme', () => {
    const r = resolveDeepLink('file:///etc/passwd');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsafe_scheme');
  });

  test('substitutes capture groups for coach invite', () => {
    const r = resolveDeepLink('https://nightfuel.app/coach/invite/abc123');
    expect(r.safe).toBe(true);
    expect(r.route).toContain('/(coach)/invite/abc123');
  });

  test('url-encodes capture groups (defends against path traversal)', () => {
    const r = resolveDeepLink('https://nightfuel.app/coach/invite/..%2Fadmin');
    // Path-traversal segment should be reflected encoded, not raw.
    expect(r.route.includes('../')).toBe(false);
  });

  test('preserves the nightfuel:// scheme for app-launched URLs', () => {
    const r = resolveDeepLink('nightfuel://reset?token=abc');
    expect(r.safe).toBe(true);
  });
});
