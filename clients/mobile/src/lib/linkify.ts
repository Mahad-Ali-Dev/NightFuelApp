/**
 * linkify — a tiny, dependency-free prose tokenizer that splits a string into
 * plain-text and link spans so a renderer (e.g. the Ria chat bubble) can make
 * real URLs tappable without mangling the surrounding text.
 *
 * Why hand-rolled (no new dependency): the app ships no markdown/linkify lib and
 * we don't want to add one for a single chat surface. A small, well-anchored
 * RegExp over module-scope constants (js-hoist-intl: hoisted, never rebuilt per
 * call) is cheaper and fully under our control.
 *
 * Design contract (the acceptance criteria the tests pin):
 *   - A real URL — `http(s)://…` or a BARE `www.<domain>` — becomes EXACTLY ONE
 *     link span. For a bare `www.foo.com` the href is `https://www.foo.com`
 *     (we prepend the scheme; we NEVER prepend a second `www.`).
 *   - The bare-'www.' footgun: a literal `www.` that is NOT followed by a valid
 *     domain label (e.g. "visit www. later", or "www." at end of a sentence) is
 *     left untouched as plain text — never turned into a broken `https://www.`
 *     link. The marketing copy "zeitra.app / www.zeitra.app" therefore yields a
 *     single valid link for the real host and leaves a dangling `www.` alone.
 *   - Idempotent under a second pass: tokens already produced by linkify can be
 *     fed back in (see the array overload) and link spans pass through untouched;
 *     re-tokenizing the rendered text of a link yields the same single link with
 *     the same href. So linkify(linkify(x)) === linkify(x) in shape.
 */

export type LinkifySpan =
    | { type: 'text'; value: string }
    | { type: 'link'; value: string; href: string };

// ── Hoisted matchers (module scope — built once, never per call) ──────────────
//
// Two alternatives, tried left-to-right by the single combined RegExp:
//   1. An explicit scheme URL: http:// or https:// then a run of URL-ish chars.
//   2. A scheme-less host that STARTS with `www.` then at least one valid domain
//      label and a TLD (so a dangling `www.` with no host can't match → footgun
//      stays plain text).
// Both stop at whitespace and at trailing punctuation that is almost always
// sentence punctuation rather than part of the URL (cleaned via TRAILING_PUNCT).

// A domain is one-or-more `label.` groups followed by a 2+ letter TLD.
const DOMAIN = '(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}';

// Scheme URL: http(s):// + host + optional path/query/fragment (no whitespace).
const SCHEME_URL = `https?:\\/\\/${DOMAIN}(?:[\\/?#][^\\s]*)?`;

// Bare host that MUST begin with a `www.` label and be a full valid domain.
// `www\.` then the rest of a domain (label(s) + TLD) — guarantees the footgun
// (`www.` with nothing valid after it) does not match.
const WWW_URL = `www\\.${DOMAIN}(?:[\\/?#][^\\s]*)?`;

// Combined, case-insensitive, global. Scheme form first so `https://www.x.com`
// is captured whole by alternative 1 (not split at `www.`).
const URL_RE = new RegExp(`(${SCHEME_URL})|(${WWW_URL})`, 'gi');

// Trailing characters that are almost always sentence punctuation, not URL — we
// peel them back into the following text span so "see https://x.com." links
// `https://x.com` and renders the period as plain text. A closing bracket is
// only peeled when the URL contains no matching opener (so "(https://x.com)"
// links the URL, not "https://x.com)").
const TRAILING_PUNCT = /[.,;:!?'"”’)\]}]+$/;

/**
 * Strip trailing sentence punctuation from a matched URL, returning the cleaned
 * URL plus the peeled-off tail (to be re-emitted as plain text). Balanced
 * closing brackets that have a matching opener inside the URL are kept.
 */
function trimUrlPunctuation(raw: string): { url: string; trailing: string } {
    let url = raw;
    let trailing = '';
    // Iteratively peel one trailing punctuation run at a time so we can make the
    // bracket-balance decision per character.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const m = url.match(TRAILING_PUNCT);
        if (!m) break;
        const tail = m[0];
        let peeled = '';
        // Walk the tail right-to-left; keep a `)`/`]`/`}` if its opener appears
        // earlier in the (already-peeled) url, otherwise peel it.
        const remaining = url;
        for (let i = tail.length - 1; i >= 0; i--) {
            const ch = tail[i];
            const head = remaining.slice(0, remaining.length - (tail.length - i));
            if (ch === ')' && countChar(head, '(') > countChar(head, ')')) break;
            if (ch === ']' && countChar(head, '[') > countChar(head, ']')) break;
            if (ch === '}' && countChar(head, '{') > countChar(head, '}')) break;
            peeled = ch + peeled;
        }
        if (peeled.length === 0) break;
        trailing = peeled + trailing;
        url = url.slice(0, url.length - peeled.length);
    }
    return { url, trailing };
}

function countChar(s: string, ch: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
    return n;
}

/** Build the canonical href for a matched URL. Bare www → prepend https:// only. */
function hrefFor(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Tokenize a single string into text + link spans. Pure: same input → same
 * output, no side effects. Adjacent text is always coalesced so the output is
 * stable (idempotent) under a second pass.
 */
function linkifyString(text: string): LinkifySpan[] {
    if (!text) return [];
    const spans: LinkifySpan[] = [];
    let lastIndex = 0;

    // Fresh lastIndex per call (URL_RE is a shared /g RegExp).
    URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_RE.exec(text)) !== null) {
        const matched = match[0];
        const start = match.index;

        // Guard against a zero-length match (shouldn't happen, but never loop).
        if (matched.length === 0) {
            URL_RE.lastIndex += 1;
            continue;
        }

        const { url, trailing } = trimUrlPunctuation(matched);

        // If trimming peeled the WHOLE match away (e.g. it was all punctuation),
        // treat it as text and move on.
        if (url.length === 0) {
            pushText(spans, text.slice(lastIndex, start + matched.length));
            lastIndex = start + matched.length;
            continue;
        }

        // Leading plain text before this URL.
        if (start > lastIndex) pushText(spans, text.slice(lastIndex, start));

        spans.push({ type: 'link', value: url, href: hrefFor(url) });

        if (trailing) pushText(spans, trailing);
        lastIndex = start + matched.length;
    }

    if (lastIndex < text.length) pushText(spans, text.slice(lastIndex));
    return spans;
}

/** Append text, coalescing with a preceding text span for a stable shape. */
function pushText(spans: LinkifySpan[], value: string): void {
    if (!value) return;
    const last = spans[spans.length - 1];
    if (last && last.type === 'text') {
        last.value += value;
        return;
    }
    spans.push({ type: 'text', value });
}

/**
 * linkify — split prose into text/link spans.
 *
 * Accepts either a raw string OR an already-tokenized span array (so a second
 * pass is a no-op on link spans — idempotent). Passing the array form re-scans
 * only the `text` spans and leaves existing `link` spans exactly as they are.
 */
export function linkify(input: string | LinkifySpan[]): LinkifySpan[] {
    if (typeof input === 'string') return linkifyString(input);

    const out: LinkifySpan[] = [];
    for (const span of input) {
        if (span.type === 'link') {
            // Already a link — pass through untouched (idempotent).
            out.push(span);
            continue;
        }
        for (const s of linkifyString(span.value)) {
            if (s.type === 'text') pushText(out, s.value);
            else out.push(s);
        }
    }
    return out;
}
