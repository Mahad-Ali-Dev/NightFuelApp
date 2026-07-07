/**
 * imageUrl.ts
 *
 * Client-side trust gate for user-generated image URLs (community post images,
 * author / comment avatars).
 *
 * The server validates `imageUrl` with `z.string().url().max(2048)`
 * (community routes.ts), but a passing-the-URL-validator string can still be a
 * non-`https` scheme (e.g. `http://`, `data:`, `javascript:`) that we do not
 * want to feed into `<Image source={{ uri }}>`. This module is the on-device
 * defense-in-depth: it only lets through a well-formed `https://` URL within
 * the length budget, and otherwise returns `undefined` so the caller can
 * render its existing placeholder (a tinted background / person icon) instead.
 *
 * Pure and dependency-free on purpose — no `expo-linking`, no React, no
 * network — so it is deterministic and trivially unit-testable. The scheme
 * gate mirrors the approach in deepLinks.ts (extract the scheme, allowlist it)
 * rather than relying on a native URL parser that differs across platforms.
 */

/** Upper bound shared with the server-side validator (`.max(2048)`). */
const MAX_URL_LENGTH = 2048;

/**
 * True only if `raw` is a syntactically valid absolute URL whose scheme is
 * exactly `https` and whose length is within {@link MAX_URL_LENGTH}.
 *
 * `http://`, `data:`, `javascript:`, `ftp:`, app schemes, protocol-relative
 * (`//host`) and relative paths all return `false`.
 */
export function isHttpsUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false;

  const url = raw.trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return false;

  // Scheme must be present and exactly `https` (case-insensitive). Checking the
  // raw scheme first rejects `javascript:`/`data:` before any parser runs.
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme !== 'https') return false;

  // Require a non-empty authority directly after `https://` on the raw string.
  // The WHATWG `URL` parser collapses `https:///path-only` to host `path-only`,
  // so a post-parse `hostname` check is not enough — gate on the raw form first.
  const authority = url.match(/^https:\/\/([^/?#]*)/i)?.[1];
  if (!authority || authority.length === 0) return false;

  // Confirm it parses as a real URL and survived as https (guards against
  // malformed authorities like `https:///` or `https://` with no host).
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Sanitize a user-supplied image URL for use as an `<Image>` `uri`.
 *
 * @returns the original URL when it is a trusted `https` URL, otherwise
 *          `undefined` so the caller falls back to its placeholder. Never
 *          throws.
 */
export function safeImageUri(raw: string | null | undefined): string | undefined {
  return isHttpsUrl(raw) ? (raw as string).trim() : undefined;
}
