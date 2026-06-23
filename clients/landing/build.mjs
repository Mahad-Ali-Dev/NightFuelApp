// Zeitra landing — build step. Wraps partial bodies + converts the legal
// markdown into a fully static dist/ folder (no runtime JS needed to read them).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { marked } from 'marked';

const OUT = 'dist';
// The canonical legal copy lives in the sibling web client; we read it at build
// time so the published pages always match the in-app Privacy/Terms.
const REPO_CONTENT = '../web/content';
const SITE = 'https://zeitra.app';

// Sitewide structured data — helps Google and AI search understand the app.
const BASE_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Zeitra',
      url: SITE,
      logo: `${SITE}/assets/favicon.svg`,
      email: 'hello@zeitra.app',
      description: 'Chrono-nutrition, training and sleep optimization for shift workers.',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'Zeitra',
      publisher: { '@id': `${SITE}/#org` },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Zeitra',
      operatingSystem: 'iOS, Android',
      applicationCategory: 'HealthApplication',
      description:
        'Zeitra times your meals, workouts, caffeine and sleep to your real shift schedule — chrono-nutrition for shift workers.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE}/#org` },
    },
  ],
};

// FAQ structured data (rich results + AI-search) for the home page.
const FAQ_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    ['Is Zeitra only for night-shift workers?', 'No. Zeitra is built for any non-standard schedule — fixed nights, rotating, 12-hour, split shifts, on-call and irregular. If you do not work a clean 9-to-5, Zeitra adapts to whatever you actually work.'],
    ['How is this different from MyFitnessPal or other trackers?', 'Regular trackers assume you eat breakfast, lunch and dinner against daylight. Zeitra times everything around your real sleep window using a circadian model, so the plan fits your body, not a 9-to-5 it was never designed for.'],
    ['Do I need wearables or a gym?', 'No. Zeitra works from your shift schedule alone. You can add sleep and body-metric data for sharper plans, and workouts include bodyweight and beginner-friendly options that need no equipment.'],
    ['Does it work offline?', 'Yes. A 760+ whole-food library and the full exercise demo set work offline, so you can log and train mid-shift even when signal is bad.'],
    ['What does it cost?', 'Zeitra is free forever for the core experience — logging, basic AI plans and the offline libraries. Pro and Premium add unlimited AI, weekly coach reports, advanced analytics and human coaches. Launch pricing is announced soon.'],
    ['When does it launch?', 'Zeitra is coming to iOS and Android. Join the waitlist and we will email you the moment it is live on the App Store and Google Play.'],
  ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
};

marked.setOptions({ gfm: true, breaks: false });

const read = (p) => readFileSync(p, 'utf8');

// Zeitra mark — a circadian "Z" in ink on the electric-lime brand tile.
const LOGO = `<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
  <defs><linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#C5E06B"/><stop offset="1" stop-color="#93B82E"/>
  </linearGradient></defs>
  <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#zg)"/>
  <path d="M10 11h12l-9 10h9" fill="none" stroke="#0a0c12" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="22.5" cy="9.5" r="2.1" fill="#0a0c12"/>
</svg>`;

function nav(active) {
  const link = (href, label, id) =>
    `<a href="${href}"${id && active === id ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="site-header">
  <div class="container nav">
    <a class="brand" href="/index.html" aria-label="Zeitra home">${LOGO}<span>Zeitra</span></a>
    <button class="nav-toggle" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="nav-links">
      ${link('/index.html#how', 'How it works', '')}
      ${link('/index.html#features', 'Features', '')}
      ${link('/index.html#pricing', 'Pricing', '')}
      ${link('/guide.html', 'Guide', 'guide')}
      ${link('/support.html', 'Support', 'support')}
      <a class="btn btn-primary btn-sm" href="/index.html#waitlist">Join the waitlist</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  const y = 2026;
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/index.html" aria-label="Zeitra home">${LOGO}<span>Zeitra</span></a>
      <p>Chrono-nutrition, training and sleep for the 1.8&nbsp;billion people who work while the world sleeps.</p>
    </div>
    <div class="footer-col">
      <h4>Product</h4>
      <a href="/index.html#how">How it works</a>
      <a href="/index.html#features">Features</a>
      <a href="/index.html#shifts">Shift types</a>
      <a href="/index.html#pricing">Pricing</a>
    </div>
    <div class="footer-col">
      <h4>Learn</h4>
      <a href="/guide.html">User guide</a>
      <a href="/index.html#science">The science</a>
      <a href="/index.html#faq">FAQ</a>
      <a href="/support.html">Support</a>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
      <a href="mailto:hello@zeitra.app">hello@zeitra.app</a>
    </div>
  </div>
  <div class="container footer-base">
    <span>&copy; ${y} Tase LLC. All rights reserved.</span>
    <span>Strong today. Better everyday.</span>
  </div>
</footer>`;
}

function shell({ title, description, body, active = '', wide = false, canonical = '/', extraLd = null }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#0a0c12">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="canonical" href="${SITE}${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Zeitra">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${SITE}${canonical}">
  <meta property="og:image" content="${SITE}/assets/og.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify(BASE_LD)}</script>
  ${extraLd ? `<script type="application/ld+json">${JSON.stringify(extraLd)}</script>` : ''}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>
  ${nav(active)}
  <main id="main"${wide ? ' class="main-prose"' : ''}>
${body}
  </main>
  ${footer()}
  <script src="/app.js" defer></script>
</body>
</html>`;
}

// Convert the legal markdown -> HTML, dropping the internal reviewer admonition.
function legal(mdPath) {
  const md = read(mdPath)
    .split('\n')
    .filter((l) => !/Legal review required/i.test(l))
    .join('\n');
  return marked.parse(md);
}

// ---- build -------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/assets`, { recursive: true });

writeFileSync(
  `${OUT}/index.html`,
  shell({
    title: 'Zeitra — Meals, Workouts & Sleep on Your Shift, Not a 9-to-5',
    description:
      'Zeitra is chrono-nutrition, training and sleep optimization for shift workers. It times your meals, workouts, caffeine and sleep to your real schedule. Coming soon to iOS and Android.',
    body: read('partials/landing.html'),
    active: 'home',
    canonical: '/',
    extraLd: FAQ_LD,
  }),
);

writeFileSync(
  `${OUT}/guide.html`,
  shell({
    title: 'User Guide — How to Use Zeitra',
    description:
      'The complete Zeitra guide: set your shift, read your daily fuel plan, log meals, time caffeine, train around fatigue, optimize sleep, and work with Ria, your AI coach.',
    body: read('partials/guide.html'),
    active: 'guide',
    canonical: '/guide.html',
  }),
);

writeFileSync(
  `${OUT}/support.html`,
  shell({
    title: 'Support — Zeitra',
    description: 'Get help with Zeitra: FAQs, contact, account and subscription help.',
    body: read('partials/support.html'),
    active: 'support',
    canonical: '/support.html',
  }),
);

writeFileSync(
  `${OUT}/privacy.html`,
  shell({
    title: 'Privacy Policy — Zeitra',
    description: 'How Zeitra collects, uses and protects your personal and health data.',
    body: `<article class="prose container">${legal(`${REPO_CONTENT}/privacy.md`)}</article>`,
    wide: true,
    canonical: '/privacy.html',
  }),
);

writeFileSync(
  `${OUT}/terms.html`,
  shell({
    title: 'Terms of Service — Zeitra',
    description: 'The terms that govern your use of Zeitra.',
    body: `<article class="prose container">${legal(`${REPO_CONTENT}/terms.md`)}</article>`,
    wide: true,
    canonical: '/terms.html',
  }),
);

writeFileSync(
  `${OUT}/404.html`,
  shell({
    title: 'Page not found — Zeitra',
    description: "The page you were looking for couldn't be found.",
    body: `<section class="notfound"><div class="container">
      <span class="eyebrow">404</span>
      <h1>This page slipped past the night shift.</h1>
      <p>The page you're looking for doesn't exist or has moved. Let's get you back on schedule.</p>
      <div class="hero-cta"><a class="btn btn-primary" href="/index.html">Back to home</a><a class="btn btn-ghost" href="/guide.html">Read the guide</a></div>
    </div></section>`,
    canonical: '/404.html',
  }),
);

copyFileSync('styles.css', `${OUT}/styles.css`);
copyFileSync('app.js', `${OUT}/app.js`);
copyFileSync('assets/favicon.svg', `${OUT}/assets/favicon.svg`);
copyFileSync('assets/og.svg', `${OUT}/assets/og.svg`);

writeFileSync(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(
  `${OUT}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ['/', '/guide.html', '/support.html', '/privacy.html', '/terms.html']
      .map((u) => `  <url><loc>${SITE}${u}</loc></url>`)
      .join('\n') +
    `\n</urlset>\n`,
);

console.log('Built dist/ — index, guide, support, privacy, terms, 404, robots, sitemap.');
