/**
 * Site footer — ported from the legacy `build.mjs` `footer()` markup: a brand
 * blurb plus three link columns (Product / Learn / Company) and a copyright
 * base row. Legacy `*.html` links are mapped to the App Router routes.
 *
 * Plain server component — no interactivity.
 */

// Zeitra mark — same inline SVG used in the nav (kept local to avoid a shared
// client boundary; this is a server component).
function LogoMark() {
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="zg-footer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C5E06B" />
          <stop offset="1" stopColor="#93B82E" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#zg-footer)" />
      <path
        d="M10 11h12l-9 10h9"
        fill="none"
        stroke="#0a0c12"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="9.5" r="2.1" fill="#0a0c12" />
    </svg>
  );
}

export default function Footer() {
  const year = 2026;
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <a className="brand" href="/" aria-label="Zeitra home">
            <LogoMark />
            <span>Zeitra</span>
          </a>
          <p>
            Chrono-nutrition, training and sleep for the 1.8&nbsp;billion people
            who work while the world sleeps.
          </p>
        </div>
        <div className="footer-col">
          <h4>Product</h4>
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#shifts">Shift types</a>
          <a href="/#pricing">Pricing</a>
        </div>
        <div className="footer-col">
          <h4>Learn</h4>
          <a href="/guide">User guide</a>
          <a href="/#science">The science</a>
          <a href="/#faq">FAQ</a>
          <a href="/support">Support</a>
        </div>
        <div className="footer-col">
          <h4>Company</h4>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:hello@zeitra.app">hello@zeitra.app</a>
        </div>
      </div>
      <div className="container footer-base">
        <span>&copy; {year} Tase LLC. All rights reserved.</span>
        <span>Strong today. Better everyday.</span>
      </div>
    </footer>
  );
}
