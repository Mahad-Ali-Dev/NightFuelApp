import type { MetadataRoute } from 'next';

// Static-export compatible sitemap.xml (emitted at build time).
export const dynamic = 'force-static';

const BASE = 'https://zeitra.app';
// Deterministic lastModified — bump when content meaningfully changes.
const LAST_MODIFIED = '2026-07-02';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, lastModified: LAST_MODIFIED, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/pricing`, lastModified: LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/guide`, lastModified: LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/support`, lastModified: LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
