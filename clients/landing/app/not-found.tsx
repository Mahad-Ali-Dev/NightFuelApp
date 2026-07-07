import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';

/**
 * Branded 404 — ported from the legacy `build.mjs` 404 body (`.notfound`
 * section: eyebrow / heading / lede + a CTA pair). Nav + Footer wrap it for a
 * complete page.
 */
export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="notfound">
          <div className="container">
            <span className="eyebrow">404</span>
            <h1>This page slipped past the night shift.</h1>
            <p>
              The page you&apos;re looking for doesn&apos;t exist or has moved.
              Let&apos;s get you back on schedule.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="/">
                Back to home
              </a>
              <a className="btn btn-ghost" href="/guide">
                Read the guide
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
