'use client';

import { useEffect, useRef } from 'react';

/**
 * Site header / sticky top nav — ported from the legacy `build.mjs` `nav()`
 * markup (logo + links + CTA). The mobile menu toggle behavior comes from
 * `app.js`: clicking the hamburger toggles `.nav-open` on the header (and the
 * `aria-expanded` state); clicking any nav link closes the menu again.
 *
 * Links that pointed at the legacy `*.html` files are mapped to the App Router
 * routes (home is `/`, with in-page anchors like `/#how`).
 */

// Zeitra mark — a circadian "Z" in ink on the electric-lime brand tile.
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
        <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C5E06B" />
          <stop offset="1" stopColor="#93B82E" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#zg)" />
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

export default function Nav({ active }: { active?: string }) {
  const headerRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const header = headerRef.current;
    const toggle = toggleRef.current;
    if (!header || !toggle) return;

    const onToggle = () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const onLinkClick = () => {
      header.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', onToggle);
    const links = header.querySelectorAll<HTMLAnchorElement>('.nav-links a');
    links.forEach((a) => a.addEventListener('click', onLinkClick));

    return () => {
      toggle.removeEventListener('click', onToggle);
      links.forEach((a) => a.removeEventListener('click', onLinkClick));
    };
  }, []);

  const current = (id: string) =>
    active === id ? ({ 'aria-current': 'page' } as const) : {};

  return (
    <header className="site-header" ref={headerRef}>
      <div className="container nav">
        <a className="brand" href="/" aria-label="Zeitra home">
          <LogoMark />
          <span>Zeitra</span>
        </a>
        <button
          className="nav-toggle"
          aria-label="Menu"
          aria-expanded="false"
          ref={toggleRef}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <nav className="nav-links">
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#pricing">Pricing</a>
          <a href="/guide" {...current('guide')}>
            Guide
          </a>
          <a href="/support" {...current('support')}>
            Support
          </a>
          <a className="btn btn-primary btn-sm" href="/#waitlist">
            Join the waitlist
          </a>
        </nav>
      </div>
    </header>
  );
}
