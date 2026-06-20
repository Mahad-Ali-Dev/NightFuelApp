/**
 * linkify.test.ts
 *
 * Pins the prose tokenizer in `src/lib/linkify.ts` that the Ria chat bubble uses
 * to make real URLs tappable. The contract under test (the work-item acceptance):
 *
 *   - a normal https URL is linkified EXACTLY ONCE (one link span, right href);
 *   - a bare `www.<domain>` becomes ONE link whose href is `https://www.<domain>`
 *     — the scheme is prepended, a second `www.` is NEVER added;
 *   - the bare-'www.' FOOTGUN: a literal `www.` with no valid domain after it is
 *     left intact as plain text and never mangled into a broken link;
 *   - the whole thing is IDEMPOTENT under a second pass (tokens fed back in, or
 *     the rendered text re-tokenized, yield the same single link — no double-wrap).
 *
 * Pure module, no render — driven directly so every branch is covered.
 */

import { linkify, type LinkifySpan } from '@/lib/linkify';

/** Re-join the rendered text of all spans (what the user actually sees). */
function rendered(spans: LinkifySpan[]): string {
  return spans.map((s) => s.value).join('');
}

/** All link spans in tokenization order. */
function links(spans: LinkifySpan[]) {
  return spans.filter((s): s is Extract<LinkifySpan, { type: 'link' }> => s.type === 'link');
}

describe('linkify — normal URLs', () => {
  it('linkifies a plain https URL exactly once with the right href', () => {
    const spans = linkify('See https://example.com for details');
    const ls = links(spans);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.value).toBe('https://example.com');
    expect(ls[0]!.href).toBe('https://example.com');
    // Surrounding prose is preserved verbatim.
    expect(rendered(spans)).toBe('See https://example.com for details');
  });

  it('keeps a path/query and peels a trailing sentence period out of the link', () => {
    const spans = linkify('Read https://example.com/path?q=1 now.');
    const ls = links(spans);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.value).toBe('https://example.com/path?q=1');
    expect(ls[0]!.href).toBe('https://example.com/path?q=1');
    // The period is rendered as plain text after the link, not as part of it.
    expect(rendered(spans)).toBe('Read https://example.com/path?q=1 now.');
    const text = spans.filter((s) => s.type === 'text').map((s) => s.value).join('|');
    expect(text).toContain('.');
  });

  it('does not swallow a balanced wrapping paren into the link', () => {
    const spans = linkify('(https://example.com)');
    const ls = links(spans);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.value).toBe('https://example.com');
    expect(rendered(spans)).toBe('(https://example.com)');
  });

  it('returns a single plain-text span when there is no URL', () => {
    const spans = linkify('just some prose, nothing clickable');
    expect(links(spans)).toHaveLength(0);
    expect(spans).toEqual([{ type: 'text', value: 'just some prose, nothing clickable' }]);
  });
});

describe('linkify — bare www. host', () => {
  it('linkifies a bare www.domain.com to ONE link with href https://www.domain.com (no doubled www)', () => {
    const spans = linkify('go to www.domain.com now');
    const ls = links(spans);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.value).toBe('www.domain.com');
    expect(ls[0]!.href).toBe('https://www.domain.com');
    // Crucial: the href must not contain a doubled 'www'.
    expect(ls[0]!.href).not.toMatch(/www\.www\./);
    expect(ls[0]!.href.startsWith('https://www.domain')).toBe(true);
    expect(rendered(spans)).toBe('go to www.domain.com now');
  });

  it('does not split https://www.x.com — the scheme form is captured whole', () => {
    const spans = linkify('open https://www.zeitra.app/help here');
    const ls = links(spans);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.value).toBe('https://www.zeitra.app/help');
    expect(ls[0]!.href).toBe('https://www.zeitra.app/help');
    expect(ls[0]!.href).not.toMatch(/www\.www\./);
  });
});

describe('linkify — the bare-www. footgun', () => {
  it("leaves a bare 'www.' with no valid domain after it intact as plain text", () => {
    const spans = linkify('visit www. later please');
    expect(links(spans)).toHaveLength(0);
    expect(spans).toEqual([{ type: 'text', value: 'visit www. later please' }]);
    // Never mangled into a broken https://www. link.
    expect(rendered(spans)).not.toMatch(/https?:\/\//);
  });

  it("leaves a trailing 'www.' (end of string) intact", () => {
    const spans = linkify('the prefix is www.');
    expect(links(spans)).toHaveLength(0);
    expect(rendered(spans)).toBe('the prefix is www.');
  });

  it('linkifies only the real host in marketing copy and never the dangling label', () => {
    // Mirrors the MEMORY footgun: copy mentioning both `zeitra.app` and
    // `www.zeitra.app`. The scheme-less bare host www.zeitra.app links once;
    // a stray `www.` elsewhere must stay text.
    const spans = linkify('Reach us at www.zeitra.app or just type www. nothing');
    const ls = links(spans);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.value).toBe('www.zeitra.app');
    expect(ls[0]!.href).toBe('https://www.zeitra.app');
    // The dangling 'www.' survived as text.
    expect(rendered(spans)).toContain('type www. nothing');
  });
});

describe('linkify — idempotency under a second pass', () => {
  const samples = [
    'See https://example.com for details',
    'go to www.domain.com now',
    'visit www. later please', // footgun
    'mix https://a.dev/x and www.b.io done',
    'Read https://example.com/path?q=1 now.',
    'no links here at all',
  ];

  it('re-tokenizing the array output is a no-op (link spans pass through)', () => {
    for (const s of samples) {
      const first = linkify(s);
      const second = linkify(first);
      expect(second).toEqual(first);
    }
  });

  it('re-tokenizing the rendered text yields the same single tokenization (no double-wrap)', () => {
    for (const s of samples) {
      const first = linkify(s);
      const reTokenized = linkify(rendered(first));
      expect(reTokenized).toEqual(first);
      // The rendered text is exactly the original prose — nothing was lost.
      expect(rendered(first)).toBe(s);
    }
  });

  it('a bare www. footgun stays a single plain-text span across two passes', () => {
    const once = linkify('visit www. later');
    const twice = linkify(once);
    expect(once).toEqual([{ type: 'text', value: 'visit www. later' }]);
    expect(twice).toEqual(once);
    expect(links(twice)).toHaveLength(0);
  });

  it('an https URL stays a single link across two passes (never double-wrapped)', () => {
    const once = linkify('here https://example.com end');
    const twice = linkify(once);
    expect(links(once)).toHaveLength(1);
    expect(links(twice)).toHaveLength(1);
    expect(twice).toEqual(once);
  });
});
