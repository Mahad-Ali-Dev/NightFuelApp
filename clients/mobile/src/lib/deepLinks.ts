/**
 * Deep-link path allowlist + parser.
 *
 * Defense-in-depth: even after Universal Links / App Links autoVerify
 * (configured in app.json) prevent another app from claiming our domain,
 * we still validate the *path* before navigating. This stops a malicious
 * link inside an email / SMS / pasted URL from sending the user to an
 * unintended in-app screen.
 *
 * Only paths in {@link DEEP_LINK_ROUTES} are followed; anything else falls
 * through to the home screen with a no-op.
 *
 * Read PRODUCTION_READINESS.md → S1 for context.
 */

import * as Linking from 'expo-linking';

/**
 * Allowed deep-link paths and their target in-app routes.
 *
 * Match is case-insensitive on the path. Query params and fragments are
 * preserved through to the target route.
 */
export const DEEP_LINK_ROUTES: Array<{
  /** Match against pathname (e.g. "/reset-password"). */
  pattern: RegExp;
  /** Target route inside the app. May reference a capture group via $1, $2, … */
  target: string;
  /** Required query params (rejected if missing). */
  required?: string[];
}> = [
  // Password reset — needs a token query param
  { pattern: /^\/reset(?:-password)?\/?$/i, target: '/(auth)/reset', required: ['token'] },
  // Email verification
  { pattern: /^\/verify(?:-email)?\/?$/i, target: '/(auth)/verify', required: ['token'] },
  // Coach invitation
  { pattern: /^\/coach\/invite\/([^/]+)\/?$/i, target: '/(coach)/invite/$1' },
  // Subscription return URL (after Stripe checkout)
  { pattern: /^\/subscription\/return\/?$/i, target: '/(settings)/subscription' },
  // Shared workout
  { pattern: /^\/share\/workout\/([^/]+)\/?$/i, target: '/(exercises)/$1' },
];

export interface DeepLinkResolution {
  /** True if the URL matched an allowlist entry and is safe to navigate to. */
  safe: boolean;
  /** Resolved in-app route — pass to `router.push()`. Empty if not safe. */
  route: string;
  /** Reason it was rejected (for analytics / Sentry). */
  reason?: 'invalid_url' | 'unknown_path' | 'missing_required_param' | 'unsafe_scheme';
  /** Original URL for logging. */
  source: string;
}

/**
 * Validate a deep-link URL against the allowlist and produce a safe in-app
 * route. NEVER pass `Linking.parse(url).path` directly to `router.push()` —
 * always run through this first.
 */
export function resolveDeepLink(rawUrl: string): DeepLinkResolution {
  const source = rawUrl;

  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(rawUrl);
  } catch {
    return { safe: false, route: '', reason: 'invalid_url', source };
  }

  // Reject anything that's not http(s) or our app scheme.
  // (Linking.parse strips the scheme for us — check the original URL.)
  const scheme = (rawUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1] ?? '').toLowerCase();
  const ALLOWED_SCHEMES = ['https', 'nightfuel'];
  if (scheme && !ALLOWED_SCHEMES.includes(scheme)) {
    return { safe: false, route: '', reason: 'unsafe_scheme', source };
  }

  // For the custom app scheme (e.g. nightfuel://reset), expo-linking puts the
  // first segment in `hostname`, not `path`. Fold it back in so app-launched
  // URLs resolve the same as their https:// equivalents.
  let rawPath = parsed.path ?? '';
  if (scheme === 'nightfuel' && parsed.hostname) {
    rawPath = parsed.hostname + (rawPath ? '/' + rawPath : '');
  }
  const path = '/' + rawPath.replace(/^\/+/, '');
  const queryParams = parsed.queryParams ?? {};

  for (const entry of DEEP_LINK_ROUTES) {
    const match = path.match(entry.pattern);
    if (!match) continue;

    // Required-param check
    if (entry.required) {
      for (const key of entry.required) {
        const v = queryParams[key];
        if (typeof v !== 'string' || v.length === 0) {
          return { safe: false, route: '', reason: 'missing_required_param', source };
        }
      }
    }

    // Substitute capture groups ($N -> match[N]) into target.
    // Using $ instead of a literal dollar sign to avoid string-template
    // interpolation surprises elsewhere in the toolchain.
    const DOLLAR = '$';
    let route = entry.target;
    for (let i = 1; i < match.length; i++) {
      route = route.split(DOLLAR + i).join(encodeURIComponent(match[i] ?? ''));
    }

    // Re-attach safe query params
    const qs = Object.entries(queryParams)
      .filter(([k]) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(k))
      .map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : '')}`)
      .join('&');
    if (qs) route += (route.includes('?') ? '&' : '?') + qs;

    return { safe: true, route, source };
  }

  return { safe: false, route: '', reason: 'unknown_path', source };
}
