import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

/**
 * Build-time blog loader (static export — everything is baked at build).
 *
 * Posts live in `content/blog/<slug>.md` with a minimal frontmatter block:
 *
 *   ---
 *   title: Night Shift Meal Plan …
 *   description: One-sentence meta description.
 *   date: 2026-07-02
 *   minutes: 6
 *   ---
 *   …markdown body…
 *
 * The body intentionally has NO h1 — pages render the frontmatter title as the
 * single h1 for clean SEO.
 */
marked.setOptions({ gfm: true, breaks: false });

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  minutes: number;
  html: string;
}

const BLOG_DIR = join(process.cwd(), 'content', 'blog');

function parse(slug: string, raw: string): BlogPost {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? '',
    date: meta.date ?? '2026-07-02',
    minutes: Number(meta.minutes ?? 5),
    html: marked.parse(body) as string,
  };
}

export function getAllPosts(): BlogPost[] {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parse(f.replace(/\.md$/, ''), readFileSync(join(BLOG_DIR, f), 'utf8')))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): BlogPost {
  return parse(slug, readFileSync(join(BLOG_DIR, `${slug}.md`), 'utf8'));
}

export function getAllSlugs(): string[] {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}
