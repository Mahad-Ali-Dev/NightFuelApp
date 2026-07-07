import { readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

/**
 * Build-time legal-markdown loader. Mirrors the legacy `build.mjs` `legal()`
 * helper: read the canonical markdown (copied into `content/`), drop the
 * internal "Legal review required" reviewer admonition line, then convert to
 * HTML with GFM enabled.
 *
 * Runs at module/build time inside server components — there is no server
 * runtime in this static export, so the HTML is baked into the page.
 */
marked.setOptions({ gfm: true, breaks: false });

export function renderLegal(file: 'privacy.md' | 'terms.md'): string {
  const md = readFileSync(join(process.cwd(), 'content', file), 'utf8')
    .split('\n')
    .filter((l) => !/Legal review required/i.test(l))
    .join('\n');
  return marked.parse(md) as string;
}
