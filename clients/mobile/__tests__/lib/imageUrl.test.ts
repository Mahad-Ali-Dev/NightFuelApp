/**
 * imageUrl.test.ts
 *
 * Tests for the client-side image-URL trust gate in src/lib/imageUrl.ts. Pure
 * functions — no React, no network — so every case is deterministic.
 *
 * Contract:
 *   - a well-formed https:// URL within the 2048-char budget passes through
 *   - http://, data:, javascript:, ftp:, protocol-relative and relative paths
 *     are all rejected (→ undefined)
 *   - strings longer than 2048 chars are rejected
 *   - null / undefined / empty / non-string → undefined
 */
import { safeImageUri, isHttpsUrl } from '@/lib/imageUrl';

describe('safeImageUri', () => {
  test('passes through a well-formed https URL', () => {
    const url = 'https://cdn.zeitra.app/uploads/post-123.jpg';
    expect(safeImageUri(url)).toBe(url);
  });

  test('accepts https URLs with ports, query strings and fragments', () => {
    const url = 'https://images.example.com:8443/a/b.png?w=400&h=300#frag';
    expect(safeImageUri(url)).toBe(url);
  });

  test('trims surrounding whitespace on an otherwise-valid https URL', () => {
    expect(safeImageUri('  https://cdn.example.com/x.jpg  ')).toBe(
      'https://cdn.example.com/x.jpg',
    );
  });

  test('rejects http:// (insecure scheme)', () => {
    expect(safeImageUri('http://cdn.example.com/x.jpg')).toBeUndefined();
  });

  test('rejects javascript: scheme (XSS pivot)', () => {
    expect(safeImageUri('javascript:alert(1)')).toBeUndefined();
  });

  test('rejects data: URIs', () => {
    expect(
      safeImageUri('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'),
    ).toBeUndefined();
  });

  test('rejects ftp: scheme', () => {
    expect(safeImageUri('ftp://files.example.com/x.jpg')).toBeUndefined();
  });

  test('rejects a relative path', () => {
    expect(safeImageUri('/uploads/post-123.jpg')).toBeUndefined();
  });

  test('rejects a protocol-relative URL', () => {
    expect(safeImageUri('//cdn.example.com/x.jpg')).toBeUndefined();
  });

  test('rejects an https scheme with no host', () => {
    expect(safeImageUri('https://')).toBeUndefined();
    expect(safeImageUri('https:///path-only')).toBeUndefined();
  });

  test('rejects a bare hostname with no scheme', () => {
    expect(safeImageUri('cdn.example.com/x.jpg')).toBeUndefined();
  });

  test('rejects strings longer than 2048 characters', () => {
    const longUrl = 'https://cdn.example.com/' + 'a'.repeat(2048) + '.jpg';
    expect(longUrl.length).toBeGreaterThan(2048);
    expect(safeImageUri(longUrl)).toBeUndefined();
  });

  test('accepts an https URL right at the 2048-char boundary', () => {
    const prefix = 'https://cdn.example.com/';
    const boundaryUrl = prefix + 'a'.repeat(2048 - prefix.length);
    expect(boundaryUrl.length).toBe(2048);
    expect(safeImageUri(boundaryUrl)).toBe(boundaryUrl);
  });

  test('returns undefined for null, undefined and empty/whitespace input', () => {
    expect(safeImageUri(null)).toBeUndefined();
    expect(safeImageUri(undefined)).toBeUndefined();
    expect(safeImageUri('')).toBeUndefined();
    expect(safeImageUri('   ')).toBeUndefined();
  });

  test('treats the scheme case-insensitively', () => {
    const url = 'HTTPS://cdn.example.com/x.jpg';
    expect(safeImageUri(url)).toBe(url);
  });
});

describe('isHttpsUrl', () => {
  test('true for a valid https URL', () => {
    expect(isHttpsUrl('https://cdn.example.com/x.jpg')).toBe(true);
  });

  test('false for http, data, javascript and relative inputs', () => {
    expect(isHttpsUrl('http://cdn.example.com/x.jpg')).toBe(false);
    expect(isHttpsUrl('data:text/plain,hi')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('/relative/path.png')).toBe(false);
  });

  test('false for null / undefined / non-string', () => {
    expect(isHttpsUrl(null)).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
    // @ts-expect-error — guarding the runtime type check
    expect(isHttpsUrl(42)).toBe(false);
  });
});
