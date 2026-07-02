import type { MetadataRoute } from 'next';

// Static-export compatible robots.txt (emitted at build time).
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: 'https://zeitra.app/sitemap.xml',
  };
}
